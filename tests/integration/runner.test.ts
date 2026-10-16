/**
 *  Runner test
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 실제 rclone과 임시 폴더로 하는 실행기 통합 테스트
 */

/**
 *  External imports
 */
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { pendingAfter } from "@/lib/list-views";
import { findRclone } from "@/main/rclone/locate";
import { clsRcloneRunner } from "@/main/rclone/runner";
import { clsScheduler } from "@/main/schedule/scheduler";
import { openAppDatabase, type clsAppDatabase } from "@/main/store/app-database";
import { clsJobStore } from "@/main/store/job-store";
import { clsRunStore } from "@/main/store/run-store";
import type { typJob, typJobInput, typRunEvent, itfRunMeta } from "@/shared/types";

// 실제 rclone으로 임시 폴더만 동기화한다. rclone이 없으면 이유를 남기고 건너뛴다.
const rclone = await findRclone(process.env.RCLONEGUI_TEST_RCLONE ?? null);

if (rclone === null) {
    console.warn(
        "[rclonegui] rclone을 찾지 못해 통합 테스트를 건너뜁니다. PATH에 넣거나 RCLONEGUI_TEST_RCLONE을 지정하세요.",
    );
}

let work: string;
/** main이 작업을 바꿨다고 알린 작업 ID (F23) */
let jobChanges: string[];

let src: string;

let dst: string;

let jobs: clsJobStore;

let runs: clsRunStore;

let database: clsAppDatabase;

let runner: clsRcloneRunner;

let events: typRunEvent[];

let clock: () => Date;

async function f_Put(file: string, text: string, mtime?: Date): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    if (mtime) await utimes(file, mtime, mtime);
}

/** 폴더 아래 모든 파일의 상대 경로 → 내용 */
async function f_Snapshot(root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    let entries;
    try {
        entries = await readdir(root, { recursive: true, withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = join(entry.parentPath, entry.name);
        out[relative(root, full).replace(/\\/g, "/")] = await readFile(full, "utf8");
    }
    return out;
}

function f_Options(): typJob["options"] {
    return { checkers: 4, transfers: 4, fastList: false, skipLinks: true, readDetails: true, scope: "files" };
}

async function f_SaveJob(patch: Partial<typJobInput> = {}): Promise<typJob> {
    return jobs.save({
        id: "",
        name: "Integration Job",
        mode: "sync",
        source: src,
        dest: dst,
        excludes: ["node_modules/**"],
        options: {
            checkers: 4,
            transfers: 4,
            fastList: false,
            skipLinks: true,
            readDetails: true,
            scope: "files",
        },
        safety: { backup: true, autoMaxDelete: 50, allowIgnoreErrors: false },
        schedule: { enabled: false, everyMinutes: 30, chainNext: null, cron: null, paused: null },
        rcloneConfig: null,
        groupId: null,
        skip: [],
        ...patch,
    });
}

async function f_Preview(jobId: string): Promise<itfRunMeta> {
    const meta = await runner.wait(await runner.preview(jobId));
    if (!meta) throw new Error("미리보기 결과가 없습니다");
    return meta;
}

async function f_Execute(jobId: string, previewRunId: string, confirmedDeletes: number): Promise<itfRunMeta> {
    const meta = await runner.wait(await runner.execute({ jobId, previewRunId, confirmedDeletes }));
    if (!meta) throw new Error("실행 결과가 없습니다");
    return meta;
}

describe.skipIf(rclone === null)("RcloneRunner + 실제 rclone", () => {
    beforeEach(async () => {
        work = await mkdtemp(join(tmpdir(), "rclonegui-int-"));
        src = join(work, "원본 src");
        dst = join(work, "대상 dst");
        const old = new Date("2026-10-01T10:00:00+09:00");
        await f_Put(join(src, "same.txt"), "hello", old);
        await f_Put(join(dst, "same.txt"), "hello", old);
        await f_Put(join(src, "sub", "deep.txt"), "deep", old);
        await f_Put(join(dst, "sub", "deep.txt"), "deep", old);
        await f_Put(join(src, "only-src.txt"), "new file");
        await f_Put(join(dst, "only-dst.txt"), "old file");
        await f_Put(join(src, "changed.txt"), "version 2 longer");
        await f_Put(join(dst, "changed.txt"), "version 1");
        await f_Put(join(src, "node_modules", "pkg", "index.js"), "x");
        await f_Put(join(dst, "node_modules", "pkg", "old.js"), "y");

        const appDir = join(work, "app");
        database = await openAppDatabase(appDir);
        jobs = new clsJobStore(database);
        runs = new clsRunStore(database, appDir);
        events = [];
        jobChanges = [];
        clock = () => new Date();
        runner = new clsRcloneRunner({
            jobs,
            runs,
            manualDir: join(appDir, "manual"),
            resolveRclone: async () => rclone!,
            defaultConfig: async () => null,
            emit: (event) => events.push(event),
            now: () => clock(),
            // 실제 규칙은 드라이브 최상위에 쓰므로, 테스트는 임시 폴더 안으로 돌린다.
            backupDirFor: (_dest, jobId, runId) => join(work, "backup", jobId, runId),
            onJobChanged: (jobId) => jobChanges.push(jobId),
        });
    });

    afterEach(async () => {
        database.close();
        await rm(work, { recursive: true, force: true });
    });

    it("미리보기는 대상을 바꾸지 않고 추가·변경·삭제·같음을 센다", async () => {
        const job = await f_SaveJob();
        const before = await f_Snapshot(dst);
        const meta = await f_Preview(job.id);

        expect(meta).toMatchObject({ kind: "preview", status: "success", exitCode: 0, blocked: null });
        expect(meta.counts).toEqual({ add: 1, change: 1, delete: 1, same: 2, error: 0 });
        expect(await f_Snapshot(dst)).toEqual(before);
        expect(meta.command).toContain("--dry-run");

        const items = await runs.readItems(job.id, meta.runId);
        expect(items).toContainEqual(expect.objectContaining({ path: "only-src.txt", status: "add" }));
        expect(items).toContainEqual(expect.objectContaining({ path: "changed.txt", status: "change" }));
        expect(items).toContainEqual(expect.objectContaining({ path: "only-dst.txt", status: "delete" }));
        expect(items.some((i) => i.path.startsWith("node_modules/"))).toBe(false);

        expect(events.filter((e) => e.runId === meta.runId).at(-1)?.type).toBe("done");
        expect((await runs.list(job.id))[0]).toEqual(meta);
    });

    it("제외된 파일: 필터에 걸린 양쪽 파일만, 결과를 남기고, 설정이 바뀌면 · 실행 기록이면 거부 (F22)", async () => {
        const job = await f_SaveJob();
        const preview = await f_Preview(job.id);
        const excluded = await runner.readExcluded(job.id, preview.runId);
        expect(excluded.map((i) => [i.path, i.source !== null, i.dest !== null])).toEqual([
            ["node_modules/pkg/index.js", true, false],
            ["node_modules/pkg/old.js", false, true],
        ]);
        const dir = runs.runDir(job.id, preview.runId);
        expect(JSON.parse(await readFile(join(dir, "excluded.json"), "utf8"))).toEqual(excluded);
        expect(await readdir(dir)).not.toContain("lsjson-src-all.json");
        // 결과가 남았으니 설정이 바뀐 뒤에도 그 미리보기의 결과는 그대로 읽는다
        await jobs.save({ ...job, excludes: [] });
        expect(await runner.readExcluded(job.id, preview.runId)).toEqual(excluded);

        const again = await f_Preview(job.id);
        await jobs.save({ ...job, excludes: ["*.txt"] });
        await expect(runner.readExcluded(job.id, again.runId)).rejects.toMatchObject({ code: "RUN_STALE" });

        await jobs.save(job);
        const fresh = await f_Preview(job.id);
        const done = await f_Execute(job.id, fresh.runId, 1);
        await expect(runner.readExcluded(job.id, done.runId)).rejects.toMatchObject({
            code: "EXCLUDED_UNAVAILABLE",
        });
    });

    it("실제 동기화가 성공하면 미리보기의 할 일이 모두 실행 목록에 같은 상태로 남는다 (F22 아직 실행되지 않음)", async () => {
        const job = await f_SaveJob();
        const preview = await f_Preview(job.id);
        const done = await f_Execute(job.id, preview.runId, 1);
        const planned = await runs.readItems(job.id, preview.runId);
        const executed = await runs.readItems(job.id, done.runId);
        expect(pendingAfter(planned, executed, "sync")).toEqual([]);
        expect(
            pendingAfter(planned, [], "sync")
                .map((i) => i.path)
                .sort(),
        ).toEqual(["changed.txt", "only-dst.txt", "only-src.txt"]);
    });

    it("리모트 대상 폴더가 아직 없어도(첫 실행) 크기 · 수정 시각과 제외됨을 읽는다", async () => {
        // 네트워크 없이 리모트 경로를 흉내 낸다: 환경 변수로 만든 local 백엔드 리모트 (설정 파일 없음)
        process.env.RCLONE_CONFIG_RGTEST_TYPE = "local";
        try {
            const job = await f_SaveJob({ dest: `rgtest:${join(work, "remote-dst")}` });
            const preview = await f_Preview(job.id);
            expect(preview.status).toBe("success");
            expect(preview.details).toBe("read");
            const items = await runs.readItems(job.id, preview.runId);
            expect(items.find((i) => i.path === "only-src.txt")?.dest).toBeNull();
            expect((await runner.readExcluded(job.id, preview.runId)).map((i) => i.path)).toEqual([
                "node_modules/pkg/index.js",
            ]);
        } finally {
            delete process.env.RCLONE_CONFIG_RGTEST_TYPE;
        }
    });

    it("설정에 없는 리모트로 비교하면 rclone의 critical 줄을 읽어 그 이름을 알려 준다", async () => {
        // 사용자의 rclone.conf를 읽지 않도록 빈 설정 파일을 쓴다
        const emptyConfig = join(work, "empty.conf");
        await writeFile(emptyConfig, "", "utf8");
        const job = await f_SaveJob({ dest: "nosuchremote:폴더", rcloneConfig: emptyConfig });
        const preview = await f_Preview(job.id);
        expect(preview.status).toBe("failed");
        expect(preview.message).toBe(
            'rclone 설정에 "nosuchremote" 리모트가 없습니다. rclone config로 만든 리모트 이름을 쓰세요',
        );
    });

    it("cancelAll은 대기 · 실행 중인 rclone을 모두 멈춘다 (앱이 끝날 때)", async () => {
        const a = await f_SaveJob();
        const runId = await runner.preview(a.id);
        runner.cancelAll();
        expect(await runner.wait(runId)).toMatchObject({ status: "canceled" });
        runner.cancelAll(); // 도는 것이 없어도 문제없다
    });

    it("미리보기 뒤 양쪽 크기 · 수정 시각을 붙인다 (F11)", async () => {
        const job = await f_SaveJob();
        const meta = await f_Preview(job.id);
        expect(meta.details).toBe("read");
        const items = await runs.readItems(job.id, meta.runId);
        const changed = items.find((i) => i.path === "changed.txt");
        expect(changed?.source?.size).toBe(Buffer.byteLength("version 2 longer"));
        expect(changed?.dest?.size).toBe(Buffer.byteLength("version 1"));
        expect(items.find((i) => i.path === "only-src.txt")?.dest).toBeNull();
        expect(items.find((i) => i.path === "only-dst.txt")?.source).toBeNull();
        expect(Number.isNaN(Date.parse(changed?.source?.modTime ?? ""))).toBe(false);
    });

    it("미리보기 뒤 원본 · 대상 용량과 옮길 크기를 남긴다 (F20)", async () => {
        const job = await f_SaveJob();
        const meta = await f_Preview(job.id);
        expect(meta.space?.dest?.free).toBeGreaterThan(0);
        expect(meta.space?.source?.total).toBeGreaterThan(0);
        // 옮길 파일: only-src.txt(8) + changed.txt(16)
        expect(meta.space?.transferBytes).toBe(
            Buffer.byteLength("new file") + Buffer.byteLength("version 2 longer"),
        );
        const done = await f_Execute(job.id, meta.runId, 1);
        expect(done.space).toBeNull();
    });

    it("상세 읽기를 끈 작업은 크기 · 시각 없이 지금처럼 (F11)", async () => {
        const job = await f_SaveJob({
            options: {
                checkers: 4,
                transfers: 4,
                fastList: false,
                skipLinks: true,
                readDetails: false,
                scope: "files",
            },
        });
        const meta = await f_Preview(job.id);
        expect(meta.details).toBe("off");
        const items = await runs.readItems(job.id, meta.runId);
        expect(items.every((i) => i.source === undefined && i.dest === undefined)).toBe(true);
    });

    it("대상 폴더가 아직 없으면 대상 목록을 비어 있는 것으로 읽는다 (F11)", async () => {
        const job = await f_SaveJob({ dest: join(work, "new-dest") });
        const meta = await f_Preview(job.id);
        expect(meta).toMatchObject({ status: "success", details: "read" });
        const items = await runs.readItems(job.id, meta.runId);
        expect(items.length).toBeGreaterThan(0);
        expect(items.every((i) => i.status === "add" && i.dest === null && i.source !== null)).toBe(true);
    });

    it("실제 실행 기록에는 상세가 없다 (F11)", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        const done = await f_Execute(job.id, first.runId, 1);
        expect(done.details).toBeNull();
    });

    it("sync는 대상에만 있는 빈 폴더를 지우고, 미리보기에 그 폴더가 보인다 (F25)", async () => {
        await mkdir(join(dst, "dst-empty"), { recursive: true });
        const job = await f_SaveJob();
        const preview = await f_Preview(job.id);
        expect(preview.dirs).toEqual({ make: 0, remove: 1, kept: 0, verified: false });
        expect(preview.counts.delete).toBe(1);
        const items = await runs.readItems(job.id, preview.runId);
        expect(items).toContainEqual({ path: "dst-empty", status: "delete", isDir: true });

        const done = await f_Execute(job.id, preview.runId, 1);
        expect(done).toMatchObject({
            status: "success",
            dirs: { make: 0, remove: 1, kept: 0, verified: true },
        });
        await expect(stat(join(dst, "dst-empty"))).rejects.toThrow();
    });

    it("필터에 걸린 파일만 든 대상 폴더는 지우기 시도로 보이고, 실행 뒤 남은 것으로 기록된다 (F25, rclone-notes P6)", async () => {
        // 폴더 구조만은 모든 파일을 걸러 내므로 대상에만 있는 폴더 안의 파일도 필터에 걸린다
        await f_Put(join(dst, "dstonly-withfile", "x.txt"), "kept");
        const job = await f_SaveJob({ options: { ...f_Options(), scope: "folders" } });
        const preview = await f_Preview(job.id);
        expect(preview.dirs).toMatchObject({ remove: 1, verified: false });
        expect(await runs.readItems(job.id, preview.runId)).toContainEqual({
            path: "dstonly-withfile",
            status: "delete",
            isDir: true,
        });

        const done = await f_Execute(job.id, preview.runId, 0);
        expect(done.dirs).toMatchObject({ remove: 0, kept: 1, verified: true });
        expect(await runs.readItems(job.id, done.runId)).toContainEqual({
            path: "dstonly-withfile",
            status: "same",
            isDir: true,
        });
        expect(await readFile(join(dst, "dstonly-withfile", "x.txt"), "utf8")).toBe("kept");
    });

    it("전체 범위는 원본의 빈 폴더까지 만든다 (F25)", async () => {
        await mkdir(join(src, "empty", "inner"), { recursive: true });
        const job = await f_SaveJob({ options: { ...f_Options(), scope: "all" } });
        const preview = await f_Preview(job.id);
        const made = (await runs.readItems(job.id, preview.runId)).filter(
            (i) => i.isDir && i.status === "add",
        );
        expect(made.map((i) => i.path)).toEqual(expect.arrayContaining(["empty", "empty/inner"]));

        await f_Execute(job.id, preview.runId, 1);
        expect((await stat(join(dst, "empty", "inner"))).isDirectory()).toBe(true);
    });

    it("폴더 구조만은 파일을 하나도 바꾸지 않고 폴더만 만든다 (F25)", async () => {
        await mkdir(join(src, "empty"), { recursive: true });
        const before = await f_Snapshot(dst);
        const job = await f_SaveJob({ options: { ...f_Options(), scope: "folders" } });
        const preview = await f_Preview(job.id);
        // 파일은 모두 걸러지므로 빈 원본 차단(SR-06)에 걸리지 않고, 삭제할 파일도 없다
        expect(preview).toMatchObject({ status: "success", blocked: null });
        expect(preview.counts).toEqual({ add: 0, change: 0, delete: 0, same: 0, error: 0 });
        expect(preview.dirs?.make).toBeGreaterThan(0);

        await f_Execute(job.id, preview.runId, 0);
        expect(await f_Snapshot(dst)).toEqual(before);
        expect((await stat(join(dst, "empty"))).isDirectory()).toBe(true);
        expect((await stat(join(dst, "sub"))).isDirectory()).toBe(true);
    });

    it("자동 실행: 삭제가 자동 한도 이하면 미리보기 뒤 실행하고 기록에 자동으로 남는다 (F10 · SR-10)", async () => {
        const job = await f_SaveJob({
            schedule: { enabled: true, everyMinutes: 30, chainNext: null, cron: null, paused: null },
            safety: { backup: true, autoMaxDelete: 1, allowIgnoreErrors: false },
        });
        const notes: string[] = [];
        const scheduler = new clsScheduler({
            jobs,
            runner,
            notify: (_t, body) => notes.push(body),
            onJobsChanged: () => undefined,
        });
        const outcome = await scheduler.runJob(job.id);
        expect(outcome.action).toBe("executed");
        const [executed, preview] = await runs.list(job.id);
        expect(preview).toMatchObject({ kind: "preview", trigger: "schedule" });
        expect(executed).toMatchObject({ kind: "execute", trigger: "schedule", status: "success" });
        // 제외 패턴(node_modules)은 양쪽 모두 비교에서 뺀다
        const f_Files = async (root: string) =>
            Object.keys(await f_Snapshot(root))
                .filter((f) => !f.startsWith("node_modules/"))
                .sort();
        expect(await f_Files(dst)).toEqual(await f_Files(src));
        expect(notes).toEqual([]);
    });

    it("자동 실행: 삭제가 자동 한도를 넘으면 실행하지 않고 멈춘다 (F10 · SR-10)", async () => {
        await f_Put(join(dst, "extra-1.txt"), "x");
        await f_Put(join(dst, "extra-2.txt"), "y");
        const job = await f_SaveJob({
            schedule: { enabled: true, everyMinutes: 30, chainNext: null, cron: null, paused: null },
            safety: { backup: true, autoMaxDelete: 1, allowIgnoreErrors: false },
        });
        const before = await f_Snapshot(dst);
        const notes: string[] = [];
        const scheduler = new clsScheduler({
            jobs,
            runner,
            notify: (_t, body) => notes.push(body),
            onJobsChanged: () => undefined,
        });
        const outcome = await scheduler.runJob(job.id);
        expect(outcome).toEqual({ action: "paused", reason: "삭제 3개가 자동 한도 1개를 넘습니다" });
        expect(await f_Snapshot(dst)).toEqual(before);
        expect((await jobs.get(job.id)).schedule.paused?.reason).toBe("삭제 3개가 자동 한도 1개를 넘습니다");
        expect((await runs.list(job.id)).map((r) => r.kind)).toEqual(["preview"]);
        expect(notes[0]).toContain("자동 실행을 멈췄습니다");
    });

    it("체인: 앞 작업이 성공하면 뒤 작업이 이어서 돌고, 앞이 멈추면 뒤는 돌지 않는다 (F09 · SR-11)", async () => {
        const second = join(work, "second");
        await mkdir(second, { recursive: true });
        const b = await f_SaveJob({ name: "Chain B", source: dst, dest: second });
        const a = await f_SaveJob({
            name: "Chain A",
            schedule: { enabled: true, everyMinutes: 30, chainNext: b.id, cron: null, paused: null },
            safety: { backup: true, autoMaxDelete: 5, allowIgnoreErrors: false },
        });
        const scheduler = new clsScheduler({
            jobs,
            runner,
            notify: () => undefined,
            onJobsChanged: () => undefined,
        });
        expect(await scheduler.runJob(a.id)).toMatchObject({ action: "executed" });
        expect(scheduler.chainSteps).toEqual([
            { jobId: b.id, outcome: expect.objectContaining({ action: "executed" }) },
        ]);
        // A가 src를 dst로, 이어서 B가 dst를 second로 맞췄다
        expect(await readFile(join(second, "only-src.txt"), "utf8")).toBe("new file");
        expect((await runs.list(b.id))[0]).toMatchObject({ kind: "execute", trigger: "schedule" });

        // A의 대상에 한도를 넘는 삭제를 만들면 A가 멈추고 B는 돌지 않는다
        await jobs.save({ ...a, safety: { ...a.safety, autoMaxDelete: 0 } });
        await f_Put(join(dst, "extra.txt"), "x");
        const bRunsBefore = (await runs.list(b.id)).length;
        expect(await scheduler.runJob(a.id)).toMatchObject({ action: "paused" });
        expect(scheduler.chainSteps).toEqual([]);
        expect((await runs.list(b.id)).length).toBe(bRunsBefore);
    });

    it("실행하면 대상이 원본과 같아지고, 다시 비교하면 같음만 남는다", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        const done = await f_Execute(job.id, first.runId, 1);

        expect(done).toMatchObject({
            kind: "execute",
            status: "success",
            exitCode: 0,
            previewRunId: first.runId,
        });
        expect(done.command).not.toContain("--dry-run");
        expect(done.command).toContain("--max-delete 1");

        const after = await f_Snapshot(dst);
        expect(after["only-src.txt"]).toBe("new file");
        expect(after["changed.txt"]).toBe("version 2 longer");
        expect(after["only-dst.txt"]).toBeUndefined();
        // 제외한 폴더는 원본에서 복사하지도, 대상에서 지우지도 않는다.
        expect(after["node_modules/pkg/old.js"]).toBe("y");
        expect(after["node_modules/pkg/index.js"]).toBeUndefined();

        const again = await f_Preview(job.id);
        expect(again.counts).toEqual({ add: 0, change: 0, delete: 0, same: 4, error: 0 });
    });

    it("지우거나 덮어쓴 파일은 백업 폴더에 원래 구조로 남는다", async () => {
        await f_Put(join(dst, "sub", "gone.txt"), "will be deleted");
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        const done = await f_Execute(job.id, first.runId, 2);

        expect(done.backupDir).toBe(join(work, "backup", job.id, done.runId));
        expect(await f_Snapshot(done.backupDir!)).toEqual({
            "changed.txt": "version 1",
            "only-dst.txt": "old file",
            "sub/gone.txt": "will be deleted",
        });
    });

    it("미리보기 뒤에 지울 파일이 늘면 삭제 한도에 걸려 멈춘다", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        await f_Put(join(dst, "extra1.txt"), "1");
        await f_Put(join(dst, "extra2.txt"), "2");

        const done = await f_Execute(job.id, first.runId, 1);
        expect(done.status).toBe("failed");
        expect(done.exitCode).toBe(7);
        expect(done.message).toContain("삭제 한도");

        const after = await f_Snapshot(dst);
        const survivors = ["only-dst.txt", "extra1.txt", "extra2.txt"].filter((name) => name in after);
        expect(survivors).toHaveLength(2);
    });

    it("삭제 0개로 확인한 실행은 나중에 생긴 삭제 대상을 하나도 지우지 않는다", async () => {
        await rm(join(dst, "only-dst.txt"));
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        expect(first.counts.delete).toBe(0);
        await f_Put(join(dst, "appeared.txt"), "keep me");

        const done = await f_Execute(job.id, first.runId, 0);
        expect(done.command).toContain("--max-delete 0");
        expect(done.status).toBe("failed");
        expect((await f_Snapshot(dst))["appeared.txt"]).toBe("keep me");
    });

    it("copy는 대상에만 있는 파일을 그대로 둔다", async () => {
        const job = await f_SaveJob({ mode: "copy" });
        const first = await f_Preview(job.id);
        expect(first.counts.delete).toBe(1);

        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 1 }),
        ).rejects.toMatchObject({ code: "CONFIRM_MISMATCH" });
        const done = await f_Execute(job.id, first.runId, 0);
        expect(done.status).toBe("success");
        expect(done.command).not.toContain("--max-delete");

        const after = await f_Snapshot(dst);
        expect(after["only-dst.txt"]).toBe("old file");
        expect(after["only-src.txt"]).toBe("new file");
        expect(after["changed.txt"]).toBe("version 2 longer");
    });

    it("미리보기 없이, 또는 확인한 삭제 수가 다르면 실행을 거부한다", async () => {
        const job = await f_SaveJob();
        const before = await f_Snapshot(dst);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: "20200101-000000", confirmedDeletes: 0 }),
        ).rejects.toMatchObject({ code: "PREVIEW_INVALID" });

        const first = await f_Preview(job.id);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 0 }),
        ).rejects.toMatchObject({ code: "CONFIRM_MISMATCH" });
        expect(await f_Snapshot(dst)).toEqual(before);
    });

    it("미리보기가 30분을 넘으면 실행을 거부한다", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        const later = Date.now() + 31 * 60 * 1000;
        clock = () => new Date(later);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 1 }),
        ).rejects.toMatchObject({ code: "PREVIEW_EXPIRED" });
    });

    it("미리보기 뒤에 작업 설정이 바뀌면 실행을 거부한다", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        await jobs.save({ ...job, excludes: [] });
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 1 }),
        ).rejects.toMatchObject({ code: "PREVIEW_STALE" });
    });

    it("이번 실행에서 빼면 그 전 미리보기로는 실행할 수 없고, 다시 비교한 뒤 그 항목만 두고 동기화한다 (F23 · SR-13)", async () => {
        await f_Put(join(src, "sub", "b [1].txt"), "bracket");
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        expect(first.counts).toMatchObject({ add: 2, change: 1, delete: 1 });

        await jobs.setSkip(job.id, ["changed.txt", "only-dst.txt", "sub/b [1].txt"]);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 1 }),
        ).rejects.toMatchObject({ code: "PREVIEW_STALE" });

        const again = await f_Preview(job.id);
        expect(again.counts).toMatchObject({ add: 1, change: 0, delete: 0 });
        const paths = (await runs.readItems(job.id, again.runId)).map((i) => i.path);
        expect(paths).not.toContain("changed.txt");
        expect(paths).not.toContain("sub/b [1].txt");
        expect(paths).toContain("only-src.txt");
        // 뺀 항목은 제외됨에 나온다 (F22)
        expect((await runner.readExcluded(job.id, again.runId)).map((i) => i.path)).toEqual(
            expect.arrayContaining(["changed.txt", "only-dst.txt", "sub/b [1].txt"]),
        );

        const done = await f_Execute(job.id, again.runId, 0);
        expect(done.status).toBe("success");
        const after = await f_Snapshot(dst);
        expect(after["only-src.txt"]).toBe("new file");
        expect(after["changed.txt"]).toBe("version 1");
        expect(after["only-dst.txt"]).toBe("old file");
        expect(after["sub/b [1].txt"]).toBeUndefined();
        // 성공했으니 비우고 화면에 알린다
        expect((await jobs.get(job.id)).skip).toEqual([]);
        expect(jobChanges).toEqual([job.id]);
    });

    it("실행이 성공하지 않으면 뺀 항목을 그대로 둔다 (F23)", async () => {
        const job = await f_SaveJob();
        await jobs.setSkip(job.id, ["changed.txt"]);
        const preview = await f_Preview(job.id);
        // 미리보기 뒤 대상에만 있는 파일을 더 두면 삭제 한도(확인한 1개)에 걸려 실패한다
        await f_Put(join(dst, "extra-1.txt"), "x");
        await f_Put(join(dst, "extra-2.txt"), "x");
        const done = await f_Execute(job.id, preview.runId, 1);
        expect(done.status).toBe("failed");
        expect((await jobs.get(job.id)).skip).toEqual(["changed.txt"]);
        expect(jobChanges).toEqual([]);
    });

    it("같은 미리보기로 두 번 실행할 수 없다", async () => {
        const job = await f_SaveJob();
        const first = await f_Preview(job.id);
        await f_Execute(job.id, first.runId, 1);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 1 }),
        ).rejects.toMatchObject({ code: "PREVIEW_STALE" });
    });

    it("원본 폴더가 사라지면 미리보기부터 막는다", async () => {
        const job = await f_SaveJob();
        await rm(src, { recursive: true });
        await expect(runner.preview(job.id)).rejects.toMatchObject({ code: "SOURCE_MISSING" });
        expect(await runs.list(job.id)).toEqual([]);
    });

    it("원본이 비어 있으면 미리보기는 되지만 실행은 막는다", async () => {
        const job = await f_SaveJob();
        await rm(src, { recursive: true });
        await mkdir(src);
        const before = await f_Snapshot(dst);

        const first = await f_Preview(job.id);
        expect(first).toMatchObject({ status: "success", blocked: "EMPTY_SOURCE" });
        expect(first.counts.delete).toBe(4);
        await expect(
            runner.execute({ jobId: job.id, previewRunId: first.runId, confirmedDeletes: 4 }),
        ).rejects.toMatchObject({ code: "EMPTY_SOURCE" });
        expect(await f_Snapshot(dst)).toEqual(before);
    });

    it("같은 대상의 두 번째 실행은 대기하고, 대기 중 취소하면 rclone을 띄우지 않는다", async () => {
        const job = await f_SaveJob();
        const firstId = await runner.preview(job.id);
        const secondId = await runner.preview(job.id);
        runner.cancel(secondId);

        const [first, second] = await Promise.all([runner.wait(firstId), runner.wait(secondId)]);
        expect(first?.status).toBe("success");
        expect(second).toMatchObject({ status: "canceled", exitCode: null, message: "취소" });
        expect(new Date(second!.endedAt!).getTime()).toBeGreaterThanOrEqual(
            new Date(first!.endedAt!).getTime(),
        );
    });

    it("복사용 명령은 실제로 있는 필터 파일을 가리킨다", async () => {
        const job = await f_SaveJob();
        const commands = await runner.commands(job.id);
        expect(commands.preview).toContain("--dry-run");
        expect(commands.execute).not.toContain("--dry-run");
        expect(commands.execute).toContain("--max-delete 0");
        expect(await readFile(join(work, "app", "manual", job.id, "filter.txt"), "utf8")).toBe(
            "- node_modules/**\n",
        );

        await f_Preview(job.id);
        expect((await runner.commands(job.id)).execute).toContain("--max-delete 1");
    });
});
