/**
 *  Groups test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 작업 그룹 (F21): DB 스키마 v1 → v2, 그룹 저장 · 이름 중복 · 지우기, 작업의 groupId 검증
 */

/**
 *  External imports
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { jobHash } from "@/main/rclone/command-builder";
import { DB_FILE_NAME, openAppDatabase, type clsAppDatabase } from "@/main/store/app-database";
import { clsGroupStore } from "@/main/store/group-store";
import { clsJobStore } from "@/main/store/job-store";
import { sameRunSettings, type typJobInput } from "@/shared/types";
import { makeJob } from "./helpers";

describe("작업 그룹 (F21)", () => {
    let dir: string;
    let db: clsAppDatabase | null;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-groups-"));
        await mkdir(join(dir, "src"));
        db = null;
    });
    afterEach(async () => {
        db?.close();
        await rm(dir, { recursive: true, force: true });
    });

    const f_Input = (patch: Partial<typJobInput> = {}): typJobInput => ({
        ...makeJob({ name: "Group Job", source: join(dir, "src"), dest: join(dir, "dst") }),
        id: "",
        ...patch,
    });

    async function f_Open() {
        db = await openAppDatabase(dir);
        const jobs = new clsJobStore(db);
        return { jobs, groups: new clsGroupStore(db, jobs) };
    }

    it("v1 DB를 열면 groups 표만 더하고 기존 작업은 그대로(그룹 없음)", async () => {
        const raw = new DatabaseSync(join(dir, DB_FILE_NAME));
        raw.exec(`
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE jobs (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE runs (seq INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, run_id TEXT NOT NULL, data TEXT NOT NULL, UNIQUE (job_id, run_id));
INSERT INTO app_meta (key, value) VALUES ('json_imported_at', '2026-10-14T00:00:00.000Z');
PRAGMA user_version = 1;`);
        const legacy = { ...makeJob({ id: "old-job" }) } as Record<string, unknown>;
        delete legacy["groupId"];
        raw.prepare("INSERT INTO jobs (id, position, data) VALUES (?, 0, ?)").run(
            "old-job",
            JSON.stringify(legacy),
        );
        raw.close();

        const { jobs, groups } = await f_Open();
        expect((db!.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
            2,
        );
        expect(await groups.list()).toEqual([]);
        expect((await jobs.get("old-job")).groupId).toBeNull();
    });

    it("그룹을 만들고 이름을 바꾸며, 같은 이름(대소문자 무시)은 거부한다", async () => {
        const { groups } = await f_Open();
        const backup = await groups.save({ name: "  Backup  " }, new Date(2026, 9, 16));
        expect(backup.name).toBe("Backup");
        expect(backup.id).toMatch(/^g-[a-z0-9-]+$/);
        const project = await groups.save({ name: "프로젝트" }, new Date(2026, 9, 16));
        expect(project.id).not.toBe(backup.id);
        await expect(groups.save({ name: "backup" })).rejects.toMatchObject({ code: "GROUP_DUPLICATE" });
        expect(await groups.save({ id: backup.id, name: "백업" })).toEqual({ id: backup.id, name: "백업" });
        expect((await groups.list()).map((g) => g.name)).toEqual(["백업", "프로젝트"]);
        await expect(groups.save({ id: "g-nope", name: "x" })).rejects.toMatchObject({
            code: "GROUP_NOT_FOUND",
        });
    });

    it("그룹을 지우면 그 그룹의 작업은 그룹 없음으로 옮기고 작업은 남긴다", async () => {
        const { jobs, groups } = await f_Open();
        const g = await groups.save({ name: "Backup" });
        const a = await jobs.save(f_Input({ name: "A", groupId: g.id }));
        const b = await jobs.save(f_Input({ name: "B", dest: join(dir, "dst-b") }));
        await groups.delete(g.id);
        expect(await groups.list()).toEqual([]);
        expect((await jobs.get(a.id)).groupId).toBeNull();
        expect((await jobs.get(b.id)).groupId).toBeNull();
        // 다시 열어도 그대로
        db!.close();
        const reopened = await f_Open();
        expect((await reopened.jobs.list()).map((j) => [j.name, j.groupId])).toEqual([
            ["A", null],
            ["B", null],
        ]);
    });

    it("없는 그룹으로 작업을 저장하면 거부한다", async () => {
        const { jobs } = await f_Open();
        await expect(jobs.save(f_Input({ groupId: "g-missing" }))).rejects.toMatchObject({
            code: "GROUP_NOT_FOUND",
        });
    });

    it("그룹은 실행 설정 지문에 들어가지 않는다 (그룹을 바꿔도 미리보기가 무효가 되지 않음)", () => {
        const job = makeJob();
        expect(jobHash({ ...job, groupId: "g-a" }, null)).toBe(jobHash({ ...job, groupId: null }, null));
    });

    it("화면의 미리보기 무효 판단: 이름 · 그룹만 바뀌면 같고, 명령에 들어가는 값이 바뀌면 다르다", () => {
        const job = makeJob();
        expect(sameRunSettings(job, { ...job, name: "다른 이름", groupId: "g-a" })).toBe(true);
        expect(
            sameRunSettings(job, { ...job, schedule: { ...job.schedule, enabled: !job.schedule.enabled } }),
        ).toBe(true);
        expect(sameRunSettings(job, { ...job, mode: job.mode === "sync" ? "copy" : "sync" })).toBe(false);
        expect(sameRunSettings(job, { ...job, source: `${job.source}-x` })).toBe(false);
        expect(sameRunSettings(job, { ...job, dest: `${job.dest}-x` })).toBe(false);
        expect(sameRunSettings(job, { ...job, excludes: [...job.excludes, "*.tmp"] })).toBe(false);
        expect(
            sameRunSettings(job, {
                ...job,
                options: { ...job.options, transfers: job.options.transfers + 1 },
            }),
        ).toBe(false);
        expect(sameRunSettings(job, { ...job, safety: { ...job.safety, backup: !job.safety.backup } })).toBe(
            false,
        );
        expect(
            sameRunSettings(job, {
                ...job,
                safety: { ...job.safety, allowIgnoreErrors: !job.safety.allowIgnoreErrors },
            }),
        ).toBe(false);
        expect(sameRunSettings(job, { ...job, rcloneConfig: "other.conf" })).toBe(false);
    });
});
