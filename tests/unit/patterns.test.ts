/**
 *  Patterns test
 *
 *  @author dev-Joy    2026-10-22
 *  @description
 *      - 저장된 제외 패턴 (intent/002): 스키마 v2 → v3 이전, 작업 저장 때 기억 · 중복 · 횟수, 지우기
 */

/**
 *  External imports
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { DB_FILE_NAME, openAppDatabase, type clsAppDatabase } from "@/main/store/app-database";
import { clsJobStore } from "@/main/store/job-store";
import { clsPatternStore } from "@/main/store/pattern-store";
import type { typJobInput } from "@/shared/types";
import { makeJob } from "./helpers";

describe("저장된 제외 패턴 (intent/002)", () => {
    let dir: string;
    let db: clsAppDatabase | null;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-patterns-"));
        await mkdir(join(dir, "src"));
        db = null;
    });
    afterEach(async () => {
        db?.close();
        await rm(dir, { recursive: true, force: true });
    });

    const f_Input = (patch: Partial<typJobInput> = {}): typJobInput => ({
        ...makeJob({ name: "Pattern Job", source: join(dir, "src"), dest: join(dir, "dst") }),
        id: "",
        ...patch,
    });

    async function f_Open() {
        db = await openAppDatabase(dir);
        return { jobs: new clsJobStore(db), patterns: new clsPatternStore(db) };
    }

    it("v2 DB를 열면 이미 저장된 작업들의 패턴을 중복 없이 모은다 (깨진 작업 행은 건너뜀)", async () => {
        const raw = new DatabaseSync(join(dir, DB_FILE_NAME));
        raw.exec(`
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE jobs (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE runs (seq INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, run_id TEXT NOT NULL, data TEXT NOT NULL, UNIQUE (job_id, run_id));
CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL);
INSERT INTO app_meta (key, value) VALUES ('json_imported_at', '2026-10-14T00:00:00.000Z');
PRAGMA user_version = 2;`);
        const insert = raw.prepare("INSERT INTO jobs (id, position, data) VALUES (?, ?, ?)");
        insert.run(
            "job-a",
            0,
            JSON.stringify(makeJob({ id: "job-a", excludes: ["*.tmp", "node_modules/**"] })),
        );
        insert.run("job-b", 1, JSON.stringify(makeJob({ id: "job-b", excludes: ["*.tmp", ".git/**"] })));
        insert.run("job-c", 2, "{ 깨진 JSON");
        // 손상된 행: 너무 긴 줄 · 줄바꿈이 든 줄은 모으지 않는다
        insert.run(
            "job-d",
            3,
            JSON.stringify(makeJob({ id: "job-d", excludes: ["x".repeat(600), "a\nb", "  .git/**  "] })),
        );
        raw.close();

        const { patterns } = await f_Open();
        expect((db!.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
            3,
        );
        const list = await patterns.list();
        expect(list.map((p) => [p.pattern, p.useCount])).toEqual([
            ["*.tmp", 2],
            [".git/**", 2],
            ["node_modules/**", 1],
        ]);
    });

    it("작업을 저장하면 패턴을 기억하고, 같은 패턴은 한 줄로 두고 쓴 횟수만 올린다", async () => {
        const { jobs, patterns } = await f_Open();
        await jobs.save(f_Input({ name: "A", excludes: ["*.tmp", "Thumbs.db"] }));
        await jobs.save(f_Input({ name: "B", excludes: ["*.tmp", "*.TMP"] }));
        const list = await patterns.list();
        // 대소문자는 rclone 필터처럼 구분한다
        expect(list.map((p) => p.pattern).sort()).toEqual(["*.TMP", "*.tmp", "Thumbs.db"]);
        expect(list[0]).toMatchObject({ pattern: "*.tmp", useCount: 2 });
        expect(new Set(list.map((p) => p.pattern)).size).toBe(list.length);
    });

    it("작업 저장이 거부되면 패턴도 남지 않는다", async () => {
        const { jobs, patterns } = await f_Open();
        await expect(
            jobs.save(f_Input({ source: join(dir, "없는 폴더"), excludes: ["*.bak"] })),
        ).rejects.toMatchObject({ code: "SOURCE_MISSING" });
        expect(await patterns.list()).toEqual([]);
    });

    it("목록에서 지워도 작업의 패턴은 그대로이고, 다시 저장하면 다시 모인다", async () => {
        const { jobs, patterns } = await f_Open();
        const saved = await jobs.save(f_Input({ excludes: ["*.log"] }));
        await patterns.delete("*.log");
        expect(await patterns.list()).toEqual([]);
        expect((await jobs.get(saved.id)).excludes).toEqual(["*.log"]);
        // 다시 열어도 작업의 패턴은 그대로
        db!.close();
        const reopened = await f_Open();
        expect((await reopened.jobs.get(saved.id)).excludes).toEqual(["*.log"]);
        expect(await reopened.patterns.list()).toEqual([]);
        await reopened.jobs.save({ ...saved });
        expect((await reopened.patterns.list()).map((p) => p.pattern)).toEqual(["*.log"]);
    });

    it("예전 JSON을 가져올 때 작업의 패턴도 모은다", async () => {
        await writeFile(
            join(dir, "jobs.json"),
            JSON.stringify([makeJob({ id: "legacy", excludes: ["~$*", "*.part"] })]),
        );
        const { patterns } = await f_Open();
        expect((await patterns.list()).map((p) => p.pattern).sort()).toEqual(["*.part", "~$*"]);
    });
});
