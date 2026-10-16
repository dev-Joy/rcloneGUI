/**
 *  App database test
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - SQLite 저장소의 스키마 생성 · 버전 확인 · 예전 JSON 가져오기 테스트 (임시 폴더만 쓴다)
 */

/**
 *  External imports
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { DB_FILE_NAME, openAppDatabase, type clsAppDatabase } from "@/main/store/app-database";
import { clsJobStore } from "@/main/store/job-store";
import { clsRunStore } from "@/main/store/run-store";
import { clsSettingsStore } from "@/main/store/settings-store";
import type { itfRunMeta } from "@/shared/types";
import { makeJob } from "./helpers";

/**
 *  Types 정의
 */
const EMPTY_SETTINGS = {
    rclonePath: null,
    rcloneConfig: null,
    defaultSource: null,
    defaultDest: null,
    launchAtLogin: false,
};

/**
 *  내부 함수
 */
function f_RunMeta(patch: Partial<itfRunMeta> = {}): itfRunMeta {
    return {
        runId: "20261012-153005",
        jobId: "job-a",
        kind: "preview",
        status: "success",
        exitCode: 0,
        counts: { add: 1, change: 0, delete: 0, same: 2, error: 0 },
        startedAt: "2026-10-12T06:30:05.000Z",
        endedAt: "2026-10-12T06:30:06.000Z",
        jobHash: "hash",
        command: "rclone sync src dst --dry-run",
        mode: "sync",
        backupDir: null,
        previewRunId: null,
        blocked: null,
        message: "추가 1",
        errors: [],
        details: null,
        dirs: null,
        trigger: "manual",
        space: null,
        ...patch,
    };
}

async function f_PutJson(file: string, value: unknown): Promise<void> {
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, JSON.stringify(value), "utf8");
}

describe("openAppDatabase", () => {
    let dir: string;
    let db: clsAppDatabase | null;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-db-"));
        db = null;
    });
    afterEach(async () => {
        db?.close();
        await rm(dir, { recursive: true, force: true });
    });

    it("새 폴더에서는 빈 저장소를 만들고 가져오기 표시를 남긴다", async () => {
        db = await openAppDatabase(join(dir, "profile"));
        expect(await new clsJobStore(db).list()).toEqual([]);
        expect(await new clsSettingsStore(db).get()).toEqual(EMPTY_SETTINGS);
        expect(db.getMeta("json_imported_at")).not.toBeNull();
        expect(db.getMeta("json_import_skipped_runs")).toBe("0");
    });

    it("앱보다 새 스키마 버전의 DB는 열지 않는다", async () => {
        const raw = new DatabaseSync(join(dir, DB_FILE_NAME));
        raw.exec("PRAGMA user_version = 99");
        raw.close();
        await expect(openAppDatabase(dir)).rejects.toMatchObject({ code: "DB_NEWER_VERSION" });
    });

    it("예전 JSON의 작업 · 설정 · 실행 기록을 가져오고 원본 파일은 그대로 둔다", async () => {
        const jobA = makeJob({ id: "job-a", name: "A" });
        const jobB = makeJob({ id: "job-b", name: "B" });
        await f_PutJson(join(dir, "jobs.json"), [jobA, jobB]);
        await f_PutJson(join(dir, "settings.json"), {
            rclonePath: "C:\\tools\\rclone.exe",
            rcloneConfig: null,
        });
        const older = f_RunMeta();
        const newer = f_RunMeta({ runId: "20261012-153005-2", kind: "execute", previewRunId: older.runId });
        await f_PutJson(join(dir, "runs", "job-a", older.runId, "run.json"), older);
        await f_PutJson(join(dir, "runs", "job-a", newer.runId, "run.json"), newer);
        const before = await readFile(join(dir, "jobs.json"), "utf8");
        const beforeTime = (await stat(join(dir, "jobs.json"))).mtimeMs;

        db = await openAppDatabase(dir);

        expect(await new clsJobStore(db).list()).toEqual([jobA, jobB]);
        expect((await new clsSettingsStore(db).get()).rclonePath).toBe("C:\\tools\\rclone.exe");
        const runs = new clsRunStore(db, dir);
        expect((await runs.list("job-a")).map((m) => m.runId)).toEqual([newer.runId, older.runId]);
        expect(await runs.read("job-a", older.runId)).toEqual(older);
        expect(await readFile(join(dir, "jobs.json"), "utf8")).toBe(before);
        expect((await stat(join(dir, "jobs.json"))).mtimeMs).toBe(beforeTime);
    });

    it("가져오기는 한 번만 한다", async () => {
        await f_PutJson(join(dir, "jobs.json"), [makeJob({ id: "job-a" })]);
        db = await openAppDatabase(dir);
        await new clsJobStore(db).delete("job-a");
        db.close();

        db = await openAppDatabase(dir);
        expect(await new clsJobStore(db).list()).toEqual([]);
    });

    it("jobs.json이 깨져 있으면 아무것도 가져오지 않고 다음에 다시 시도한다", async () => {
        await writeFile(join(dir, "jobs.json"), "[{ broken", "utf8");
        await f_PutJson(join(dir, "settings.json"), { rclonePath: null, rcloneConfig: null });
        await expect(openAppDatabase(dir)).rejects.toMatchObject({ code: "JSON_IMPORT_FAILED" });

        await f_PutJson(join(dir, "jobs.json"), [makeJob({ id: "job-a" })]);
        db = await openAppDatabase(dir);
        expect((await new clsJobStore(db).list()).map((j) => j.id)).toEqual(["job-a"]);
    });

    it("예전 실행 기록은 같은 초의 번호를 숫자 순서로 가져온다", async () => {
        for (const runId of ["20261012-153005", "20261012-153005-9", "20261012-153005-10"]) {
            await f_PutJson(join(dir, "runs", "job-a", runId, "run.json"), f_RunMeta({ runId }));
        }
        db = await openAppDatabase(dir);
        expect((await new clsRunStore(db, dir).list("job-a")).map((m) => m.runId)).toEqual([
            "20261012-153005-10",
            "20261012-153005-9",
            "20261012-153005",
        ]);
    });

    it("읽지 못하거나 폴더 이름과 다른 run.json은 건너뛰고 수를 남긴다", async () => {
        await f_PutJson(join(dir, "runs", "job-a", "20261012-153005", "run.json"), f_RunMeta());
        await f_PutJson(join(dir, "runs", "job-a", "20261012-153006", "run.json"), f_RunMeta());
        await f_PutJson(join(dir, "runs", "job-a", "20261012-153007", "run.json"), { runId: "x" });
        await mkdir(join(dir, "runs", "job-a", "20261012-153008"), { recursive: true });
        await writeFile(join(dir, "runs", "job-a", "20261012-153008", "run.json"), "{", "utf8");
        // run.json이 없는 폴더는 건너뛴 수에 넣지 않는다.
        await mkdir(join(dir, "runs", "job-a", "20261012-153009"), { recursive: true });

        db = await openAppDatabase(dir);
        expect((await new clsRunStore(db, dir).list("job-a")).map((m) => m.runId)).toEqual([
            "20261012-153005",
        ]);
        expect(db.getMeta("json_import_skipped_runs")).toBe("3");
    });
});

describe("실행 항목에 상세 합치기 (F11)", () => {
    let dir: string;
    let db: clsAppDatabase;
    const runId = "20261014-160000";
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-db-"));
        db = await openAppDatabase(dir);
    });
    afterEach(async () => {
        db.close();
        await rm(dir, { recursive: true, force: true });
    });

    // lsjson 파일은 rclone-probes.ps1로 받은 실제 출력(tests/fixtures)을 쓴다.
    async function f_PrepareRun(details: itfRunMeta["details"], destText?: string): Promise<clsRunStore> {
        const runs = new clsRunStore(db, dir);
        const runDir = runs.runDir("job-a", runId);
        await mkdir(runDir, { recursive: true });
        await writeFile(
            join(runDir, "combined.txt"),
            "* changed.txt\n+ only-src.txt\n- only-dst.txt\n",
            "utf8",
        );
        const fixtures = join(__dirname, "../fixtures");
        await writeFile(
            join(runDir, "lsjson-src.json"),
            await readFile(join(fixtures, "lsjson-l-src.json"), "utf8"),
        );
        await writeFile(
            join(runDir, "lsjson-dst.json"),
            destText ?? (await readFile(join(fixtures, "lsjson-l-dst.json"), "utf8")),
        );
        await runs.write(f_RunMeta({ runId, details }));
        return runs;
    }

    it("details가 read면 양쪽 크기 · 시각을 붙이고, 없는 쪽은 null", async () => {
        const runs = await f_PrepareRun("read");
        const items = await runs.readItems("job-a", runId);
        expect(items.find((i) => i.path === "changed.txt")).toMatchObject({
            source: { size: 16 },
            dest: { size: 9 },
        });
        expect(items.find((i) => i.path === "only-src.txt")?.dest).toBeNull();
        expect(items.find((i) => i.path === "only-dst.txt")?.source).toBeNull();
    });

    it("details가 read가 아니면 파일이 있어도 합치지 않는다", async () => {
        for (const details of ["failed", "off", null] as const) {
            const runs = await f_PrepareRun(details);
            const items = await runs.readItems("job-a", runId);
            expect(items.every((i) => !("source" in i) && !("dest" in i))).toBe(true);
        }
    });

    it("상세 파일이 깨졌으면 경로와 상태만 돌려준다", async () => {
        const runs = await f_PrepareRun("read", "[{ broken");
        const items = await runs.readItems("job-a", runId);
        expect(items).toHaveLength(3);
        expect(items.every((i) => !("source" in i))).toBe(true);
    });
});

describe("DB 저장소 동작", () => {
    let dir: string;
    let db: clsAppDatabase;
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "rclonegui-db-"));
        db = await openAppDatabase(dir);
    });
    afterEach(async () => {
        db.close();
        await rm(dir, { recursive: true, force: true });
    });

    it("실행 메타를 다시 써도 순서는 처음 기록한 순서다", async () => {
        const runs = new clsRunStore(db, dir);
        // 같은 초에 10번 넘게 실행해도 기록 순서대로 최신을 고른다.
        await runs.write(f_RunMeta({ runId: "20261012-153005-9" }));
        await runs.write(f_RunMeta({ runId: "20261012-153005-10" }));
        await runs.write(f_RunMeta({ runId: "20261012-153005-9", status: "failed" }));
        const list = await runs.list("job-a");
        expect(list.map((m) => m.runId)).toEqual(["20261012-153005-10", "20261012-153005-9"]);
        expect(list[1]?.status).toBe("failed");
    });

    it("가장 최근 실행 ID는 메타를 읽지 못하는 행이어도 그 행을 가리킨다 (SR-01)", async () => {
        const runs = new clsRunStore(db, dir);
        await runs.write(f_RunMeta({ runId: "20261012-153005" }));
        db.db
            .prepare("INSERT INTO runs (job_id, run_id, data) VALUES (?, ?, ?)")
            .run("job-a", "20261012-153006", "{ broken");
        expect(await runs.latestRunId("job-a")).toBe("20261012-153006");
        expect((await runs.list("job-a")).map((m) => m.runId)).toEqual(["20261012-153005"]);
        expect(await runs.latestRunId("no-such-job")).toBeNull();
    });

    it("설정 행이 JSON이 아니면 기본값을 쓴다", async () => {
        db.db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run("not json");
        expect(await new clsSettingsStore(db).get()).toEqual(EMPTY_SETTINGS);
    });

    it("설정은 한 행으로 덮어쓴다", async () => {
        const settings = new clsSettingsStore(db);
        await settings.save({ ...EMPTY_SETTINGS, rclonePath: "C:\\a\\rclone.exe" });
        await settings.save({
            ...EMPTY_SETTINGS,
            rcloneConfig: "C:\\a\\rclone.conf",
            defaultDest: "C:\\a\\dst",
        });
        expect(await new clsSettingsStore(db).get()).toEqual({
            ...EMPTY_SETTINGS,
            rcloneConfig: "C:\\a\\rclone.conf",
            defaultDest: "C:\\a\\dst",
        });
    });

    it("기본 폴더가 없는 예전 설정 행은 rclone 경로를 지키고 기본 폴더만 null로 읽는다 (F29)", async () => {
        db.db
            .prepare("INSERT INTO settings (id, data) VALUES (1, ?)")
            .run(JSON.stringify({ rclonePath: "C:\\a\\rclone.exe", rcloneConfig: null }));
        expect(await new clsSettingsStore(db).get()).toEqual({
            ...EMPTY_SETTINGS,
            rclonePath: "C:\\a\\rclone.exe",
        });
    });

    it("작업은 처음 저장한 순서를 지키고, 고쳐도 자리가 바뀌지 않는다", async () => {
        await mkdir(join(dir, "src"));
        const f_Input = (name: string) => ({
            ...makeJob({ name, source: join(dir, "src"), dest: join(dir, `dst-${name}`) }),
            id: "",
        });
        const store = new clsJobStore(db);
        const a = await store.save(f_Input("a"));
        const b = await store.save(f_Input("b"));
        await store.save({ ...a, name: "a2" });
        expect((await new clsJobStore(db).list()).map((j) => j.name)).toEqual(["a2", "b"]);
        expect(b.id).toBe("b");
    });
});
