/**
 *  Runner test
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 실제 rclone과 임시 폴더로 하는 실행기 통합 테스트
 */

/**
 *  External imports
 */
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { findRclone } from "@/main/rclone/locate";
import { clsRcloneRunner } from "@/main/rclone/runner";
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

let src: string;

let dst: string;

let jobs: clsJobStore;

let runs: clsRunStore;

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

async function f_SaveJob(patch: Partial<typJobInput> = {}): Promise<typJob> {
    return jobs.save({
        id: "",
        name: "Integration Job",
        mode: "sync",
        source: src,
        dest: dst,
        excludes: ["node_modules/**"],
        options: { checkers: 4, transfers: 4, fastList: false, skipLinks: true },
        safety: { backup: true, autoMaxDelete: 50, allowIgnoreErrors: false },
        schedule: { enabled: false, everyMinutes: 30, chainNext: null },
        rcloneConfig: null,
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
        jobs = new clsJobStore(appDir);
        runs = new clsRunStore(appDir);
        events = [];
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
        });
    });

    afterEach(async () => {
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
        expect(items).toContainEqual({ path: "only-src.txt", status: "add" });
        expect(items).toContainEqual({ path: "changed.txt", status: "change" });
        expect(items).toContainEqual({ path: "only-dst.txt", status: "delete" });
        expect(items.some((i) => i.path.startsWith("node_modules/"))).toBe(false);

        expect(events.filter((e) => e.runId === meta.runId).at(-1)?.type).toBe("done");
        expect((await runs.list(job.id))[0]).toEqual(meta);
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
