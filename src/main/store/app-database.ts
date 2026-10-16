/**
 *  App database
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - 작업 · 설정 · 실행 메타를 담는 SQLite 파일(rclonegui.db) 열기와 스키마
 *      - 처음 열 때 예전 JSON(jobs.json, settings.json, runs/*\/*\/run.json)을 한 번 가져온다 (ADR 0005)
 */

/**
 *  External imports
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

/**
 *  Internal imports
 */
import { jobSchema, runMetaSchema, settingsSchema } from "@/shared/schemas";
import type { itfRunMeta, typJob, typSettings } from "@/shared/types";
import { readJson } from "./json-file";

/**
 *  Types 정의
 */
export const DB_FILE_NAME = "rclonegui.db";

/** 이 앱이 아는 스키마 버전. 표를 바꿀 때 올리고 f_Migrate에 단계를 더한다. */
const SCHEMA_VERSION = 2;

const SCHEMA_V1 = `
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE jobs (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE runs (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    data TEXT NOT NULL,
    UNIQUE (job_id, run_id)
);
CREATE INDEX runs_by_job ON runs (job_id, seq DESC);
`;

// v2 (F21): 작업 그룹. 작업 JSON의 groupId가 이 표의 id를 가리킨다.
const SCHEMA_V2 = `
CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL);
`;

interface itfLegacyData {
    jobs: typJob[];
    settings: typSettings | null;
    runs: itfRunMeta[];
    skippedRuns: number;
}

/**
 *  내부 함수
 */
function f_Migrate(db: DatabaseSync): void {
    const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version > SCHEMA_VERSION) {
        throw new clsDatabaseError(
            "DB_NEWER_VERSION",
            `이 앱보다 새 버전이 만든 데이터 파일입니다 (스키마 ${version}). 앱을 업데이트하세요`,
        );
    }
    if (version === SCHEMA_VERSION) return;
    db.exec("BEGIN");
    try {
        if (version < 1) db.exec(SCHEMA_V1);
        if (version < 2) db.exec(SCHEMA_V2);
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

/** 실행 ID 순서. 같은 초의 번호(-2, -10)는 숫자로 비교한다. */
function f_CompareRunId(a: string, b: string): number {
    // 실행 ID는 YYYYMMDD-HHMMSS(15자) 뒤에 선택적으로 -N이 붙는다.
    const f_Split = (id: string): [string, number] => [id.slice(0, 15), Number(id.slice(16)) || 1];
    const [timeA, nA] = f_Split(a);
    const [timeB, nB] = f_Split(b);
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;
    return nA - nB;
}

/** runs/<jobId>/<runId>/run.json을 실행 ID 순서로 읽는다. 읽지 못하거나 폴더 이름과 다르면 건너뛴다. */
async function f_ReadLegacyRuns(baseDir: string): Promise<{ runs: itfRunMeta[]; skipped: number }> {
    const root = join(baseDir, "runs");
    const runs: itfRunMeta[] = [];
    let skipped = 0;
    let jobIds: string[];
    try {
        jobIds = await readdir(root);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { runs, skipped };
        throw error;
    }
    for (const jobId of jobIds.sort()) {
        let runIds: string[];
        try {
            runIds = await readdir(join(root, jobId));
        } catch {
            continue;
        }
        for (const runId of runIds.sort(f_CompareRunId)) {
            let raw: unknown;
            try {
                raw = await readJson(join(root, jobId, runId, "run.json"));
            } catch {
                skipped += 1;
                continue;
            }
            // run.json이 없는 폴더는 기록이 시작되기 전에 멈춘 실행이다. 예전에도 목록에 나오지 않았다.
            if (raw === null) continue;
            const parsed = runMetaSchema.safeParse(raw);
            if (!parsed.success || parsed.data.jobId !== jobId || parsed.data.runId !== runId) {
                skipped += 1;
                continue;
            }
            runs.push(parsed.data);
        }
    }
    return { runs, skipped };
}

async function f_ReadLegacy(baseDir: string): Promise<itfLegacyData> {
    let jobs: typJob[];
    try {
        const raw = await readJson(join(baseDir, "jobs.json"));
        jobs = raw === null ? [] : z.array(jobSchema).parse(raw);
    } catch (error) {
        throw new clsDatabaseError(
            "JSON_IMPORT_FAILED",
            `jobs.json을 읽지 못해 가져오지 않았습니다. 파일을 고친 뒤 다시 켜세요: ${(error as Error).message}`,
        );
    }
    let settings: typSettings | null = null;
    try {
        const parsed = settingsSchema.safeParse(await readJson(join(baseDir, "settings.json")));
        if (parsed.success) settings = parsed.data;
    } catch {
        // 예전에도 settings.json이 깨져 있으면 기본값을 썼다.
    }
    const { runs, skipped } = await f_ReadLegacyRuns(baseDir);
    return { jobs, settings, runs, skippedRuns: skipped };
}

/**
 *  메인 클래스 / export 함수
 */
export class clsDatabaseError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "clsDatabaseError";
    }
}

/** 저장소 셋이 함께 쓰는 DB 연결. 여러 문장을 묶을 때는 transaction()을 쓴다. */
export class clsAppDatabase {
    constructor(
        readonly db: DatabaseSync,
        readonly file: string,
    ) {}

    transaction<T>(fn: () => T): T {
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const result = fn();
            this.db.exec("COMMIT");
            return result;
        } catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }

    getMeta(key: string): string | null {
        const row = this.db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
            | { value: string }
            | undefined;
        return row?.value ?? null;
    }

    close(): void {
        if (this.db.isOpen) this.db.close();
    }
}

/** baseDir의 rclonegui.db를 열고(없으면 만들고) 스키마를 맞춘 뒤, 처음이면 예전 JSON을 가져온다. */
export async function openAppDatabase(baseDir: string, now = new Date()): Promise<clsAppDatabase> {
    await mkdir(baseDir, { recursive: true });
    const file = join(baseDir, DB_FILE_NAME);
    const db = new DatabaseSync(file);
    const app = new clsAppDatabase(db, file);
    try {
        db.exec("PRAGMA journal_mode = WAL");
        db.exec("PRAGMA busy_timeout = 5000");
        db.exec("PRAGMA foreign_keys = ON");
        f_Migrate(db);
        if (app.getMeta("json_imported_at") === null) await importLegacyJson(app, baseDir, now);
    } catch (error) {
        app.close();
        throw error;
    }
    return app;
}

/** 예전 JSON을 한 트랜잭션으로 넣는다. 원본 파일은 읽기만 한다. jobs.json이 깨져 있으면 아무것도 넣지 않는다. */
export async function importLegacyJson(
    app: clsAppDatabase,
    baseDir: string,
    now = new Date(),
): Promise<void> {
    const legacy = await f_ReadLegacy(baseDir);
    const { db } = app;
    app.transaction(() => {
        // DB에 이미 있는 행은 덮어쓰지 않는다 (OR IGNORE).
        const insertJob = db.prepare("INSERT OR IGNORE INTO jobs (id, position, data) VALUES (?, ?, ?)");
        legacy.jobs.forEach((job, index) => insertJob.run(job.id, index, JSON.stringify(job)));
        if (legacy.settings !== null) {
            db.prepare("INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)").run(
                JSON.stringify(legacy.settings),
            );
        }
        const insertRun = db.prepare("INSERT OR IGNORE INTO runs (job_id, run_id, data) VALUES (?, ?, ?)");
        for (const meta of legacy.runs) insertRun.run(meta.jobId, meta.runId, JSON.stringify(meta));
        const setMeta = db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)");
        setMeta.run("json_imported_at", now.toISOString());
        setMeta.run("json_import_skipped_runs", String(legacy.skippedRuns));
    });
}
