/**
 *  Run store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 실행 기록 저장소 (runs/<jobId>/<runId>)
 */

/**
 *  External imports
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 *  Internal imports
 */
import type { itfFileItem, itfRunMeta } from "@/shared/types";
import { parseCombined } from "@/main/parsers/combined";
import { readJson, writeJson } from "./json-file";

/**
 *  Types 정의
 */
const MAX_LISTED_RUNS = 100;

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

/** 실행별 폴더(runs/<jobId>/<runId>)에 run.json, combined.txt, rclone.jsonl, filter.txt를 둔다. */
export class clsRunStore {
    private readonly root: string;

    constructor(baseDir: string) {
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

    async write(meta: itfRunMeta): Promise<void> {
        await writeJson(join(this.runDir(meta.jobId, meta.runId), "run.json"), meta);
    }

    async read(jobId: string, runId: string): Promise<itfRunMeta | null> {
        // run.json은 이 앱만 쓰는 파일이라 형태를 믿는다.
        return (await readJson(join(this.runDir(jobId, runId), "run.json"))) as itfRunMeta | null;
    }

    /** 최근 실행부터. 실행 ID가 시각이라 이름 역순이 곧 최신순이다. */
    async list(jobId: string): Promise<itfRunMeta[]> {
        let names: string[];
        try {
            names = await readdir(join(this.root, jobId));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
        const recent = names.sort().reverse().slice(0, MAX_LISTED_RUNS);
        const metas = await Promise.all(recent.map((runId) => this.read(jobId, runId).catch(() => null)));
        return metas.filter((meta): meta is itfRunMeta => meta !== null);
    }

    async readItems(jobId: string, runId: string): Promise<itfFileItem[]> {
        try {
            return parseCombined(await readFile(join(this.runDir(jobId, runId), "combined.txt"), "utf8"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
    }
}
