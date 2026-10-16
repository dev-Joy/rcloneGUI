/**
 *  Run store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 실행 기록 저장소: 메타는 rclonegui.db의 runs 표, 실행 파일은 runs/<jobId>/<runId> 폴더
 */

/**
 *  External imports
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 *  Internal imports
 */
import { runMetaSchema } from "@/shared/schemas";
import type { itfFileItem, itfRunMeta } from "@/shared/types";
import { parseCombined, parseDirOps } from "@/main/parsers/combined";
import { parseLsjson } from "@/main/parsers/lsjson";
import type { clsAppDatabase } from "./app-database";

/**
 *  Types 정의
 */
const MAX_LISTED_RUNS = 100;

/**
 *  내부 함수
 */
/** 실행 폴더의 dirs.txt (F25). 없으면 빈 목록 */
async function f_ReadDirOps(dir: string): Promise<itfFileItem[]> {
    try {
        return parseDirOps(await readFile(join(dir, "dirs.txt"), "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
}

/** DB 행을 실행 메타로. 형태가 맞지 않는 행은 없는 것으로 본다. */
function f_ParseRow(row: { data: string } | undefined): itfRunMeta | null {
    if (row === undefined) return null;
    try {
        const parsed = runMetaSchema.safeParse(JSON.parse(row.data));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

/**
 *  메인 클래스 / export 함수
 */
export function formatRunId(date: Date): string {
    const f_Pad = (n: number): string => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}${f_Pad(date.getMonth() + 1)}${f_Pad(date.getDate())}` +
        `-${f_Pad(date.getHours())}${f_Pad(date.getMinutes())}${f_Pad(date.getSeconds())}`
    );
}

/** 실행 메타는 DB에, 실행별 폴더(runs/<jobId>/<runId>)에는 combined.txt, rclone.jsonl, filter.txt를 둔다. */
export class clsRunStore {
    private readonly root: string;

    constructor(
        private readonly app: clsAppDatabase,
        baseDir: string,
    ) {
        this.root = join(baseDir, "runs");
    }

    runDir(jobId: string, runId: string): string {
        return join(this.root, jobId, runId);
    }

    /** 새 실행 폴더를 만들고 ID를 돌려준다. 같은 초에 두 번 시작하면 뒤에 번호를 붙인다. */
    async create(jobId: string, now = new Date()): Promise<string> {
        await mkdir(join(this.root, jobId), { recursive: true });
        const base = formatRunId(now);
        for (let n = 1; ; n += 1) {
            const runId = n === 1 ? base : `${base}-${n}`;
            try {
                await mkdir(this.runDir(jobId, runId));
                return runId;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            }
        }
    }

    /** 처음 쓸 때 정해진 순번(seq)은 다시 써도 유지된다. list()의 최신순이 이 순번이다. */
    async write(meta: itfRunMeta): Promise<void> {
        this.app.db
            .prepare(
                `INSERT INTO runs (job_id, run_id, data) VALUES (?, ?, ?)
                 ON CONFLICT (job_id, run_id) DO UPDATE SET data = excluded.data`,
            )
            .run(meta.jobId, meta.runId, JSON.stringify(meta));
    }

    async read(jobId: string, runId: string): Promise<itfRunMeta | null> {
        const row = this.app.db
            .prepare("SELECT data FROM runs WHERE job_id = ? AND run_id = ?")
            .get(jobId, runId) as { data: string } | undefined;
        return f_ParseRow(row);
    }

    /** 가장 최근에 기록한 실행의 ID. 메타를 파싱하지 않으므로 읽지 못하는 행도 "가장 최근"에서 빠지지 않는다 (SR-01). */
    async latestRunId(jobId: string): Promise<string | null> {
        const row = this.app.db
            .prepare("SELECT run_id FROM runs WHERE job_id = ? ORDER BY seq DESC LIMIT 1")
            .get(jobId) as { run_id: string } | undefined;
        return row?.run_id ?? null;
    }

    /** 최근 실행부터. 실행을 기록한 순서(seq)의 역순이다. */
    async list(jobId: string): Promise<itfRunMeta[]> {
        const rows = this.app.db
            .prepare("SELECT data FROM runs WHERE job_id = ? ORDER BY seq DESC LIMIT ?")
            .all(jobId, MAX_LISTED_RUNS) as { data: string }[];
        return rows.map(f_ParseRow).filter((meta): meta is itfRunMeta => meta !== null);
    }

    /**
     * combined 목록. 크기 · 수정 시각을 읽은 미리보기(details = read)면 양쪽 상세를 붙인다 (F11).
     * dirs.txt가 있으면 폴더 작업 항목(isDir)을 뒤에 더한다 (F25).
     */
    async readItems(jobId: string, runId: string): Promise<itfFileItem[]> {
        const dir = this.runDir(jobId, runId);
        let items: itfFileItem[];
        try {
            items = parseCombined(await readFile(join(dir, "combined.txt"), "utf8"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
        const files = await this.withDetails(jobId, runId, dir, items);
        return [...files, ...(await f_ReadDirOps(dir))];
    }

    private async withDetails(
        jobId: string,
        runId: string,
        dir: string,
        items: itfFileItem[],
    ): Promise<itfFileItem[]> {
        if ((await this.read(jobId, runId))?.details !== "read") return items;
        try {
            const source = parseLsjson(await readFile(join(dir, "lsjson-src.json"), "utf8"));
            const dest = parseLsjson(await readFile(join(dir, "lsjson-dst.json"), "utf8"));
            return items.map((item) => ({
                ...item,
                source: source.get(item.path) ?? null,
                dest: dest.get(item.path) ?? null,
            }));
        } catch {
            // 상세 파일이 없거나 깨졌으면 경로와 상태만 보여준다.
            return items;
        }
    }
}
