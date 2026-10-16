/**
 *  Chain test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 체인 실행 (F09 · SR-11): 저장 검증과 자동 실행에서 이어 돌리기
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { clsScheduler, type itfSchedulerDeps } from "@/main/schedule/scheduler";
import { assertChain, clsJobError } from "@/main/store/job-store";
import { emptyCounts, type itfRunMeta, type typJob } from "@/shared/types";
import { makeJob } from "./helpers";

/**
 *  내부 함수
 */
function f_Job(id: string, patch: Partial<typJob["schedule"]> = {}, autoMaxDelete = 5): typJob {
    const base = makeJob({ id, name: id.toUpperCase() });
    return {
        ...base,
        schedule: { ...base.schedule, enabled: true, ...patch },
        safety: { ...base.safety, autoMaxDelete },
    };
}

function f_Meta(jobId: string, patch: Partial<itfRunMeta> = {}): itfRunMeta {
    return {
        runId: `${jobId}-run`,
        jobId,
        kind: "preview",
        status: "success",
        exitCode: 0,
        counts: { ...emptyCounts(), add: 1 },
        startedAt: "2026-10-16T01:00:00.000Z",
        endedAt: "2026-10-16T01:00:01.000Z",
        jobHash: "h",
        command: "rclone",
        mode: "sync",
        backupDir: null,
        previewRunId: null,
        blocked: null,
        message: "성공",
        errors: [],
        details: null,
        dirs: null,
        trigger: "schedule",
        ...patch,
    };
}

/** 여러 작업용 가짜 의존성. 작업마다 미리보기 결과를 정해 둔다 */
function f_Setup(jobs: typJob[], previews: Record<string, itfRunMeta>) {
    const store = new Map(jobs.map((j) => [j.id, j]));
    const calls: string[] = [];
    const notes: string[] = [];
    const deps: itfSchedulerDeps = {
        jobs: {
            list: async () => [...store.values()],
            get: async (id) => {
                const job = store.get(id);
                if (!job) throw new Error("작업을 찾을 수 없습니다");
                return job;
            },
            setPaused: async (id, paused) => {
                const job = store.get(id)!;
                const next = { ...job, schedule: { ...job.schedule, paused } };
                store.set(id, next);
                calls.push(`paused:${id}`);
                return next;
            },
        },
        runner: {
            preview: async (id) => {
                calls.push(`preview:${id}`);
                return `p:${id}`;
            },
            execute: async (input) => {
                calls.push(`execute:${input.jobId}:${input.confirmedDeletes}`);
                return `e:${input.jobId}`;
            },
            wait: async (runId) =>
                runId.startsWith("p:")
                    ? previews[runId.slice(2)]
                    : f_Meta(runId.slice(2), { kind: "execute" }),
            isActive: () => false,
        },
        notify: (_t, body) => notes.push(body),
        onJobsChanged: () => undefined,
    };
    return { scheduler: new clsScheduler(deps), calls, notes, store };
}

describe("assertChain (저장 검증)", () => {
    const f_Code = (fn: () => void): string => {
        try {
            fn();
            return "OK";
        } catch (error) {
            return error instanceof clsJobError ? error.code : "OTHER";
        }
    };

    it("없는 작업에는 이을 수 없다", () => {
        expect(f_Code(() => assertChain(f_Job("a", { chainNext: "zzz" }), [f_Job("a")]))).toBe(
            "CHAIN_MISSING",
        );
    });

    it("A → B가 있을 때 B → A는 고리라 거부한다", () => {
        const a = f_Job("a", { chainNext: "b" });
        const b = f_Job("b", { chainNext: "a" });
        expect(f_Code(() => assertChain(b, [a, b]))).toBe("CHAIN_LOOP");
    });

    it("A → B → C처럼 한 방향이면 된다", () => {
        const a = f_Job("a", { chainNext: "b" });
        const b = f_Job("b", { chainNext: "c" });
        const c = f_Job("c");
        expect(f_Code(() => assertChain(a, [a, b, c]))).toBe("OK");
        expect(f_Code(() => assertChain(f_Job("a"), [a, b, c]))).toBe("OK");
    });
});

describe("체인 자동 실행 (F09 · SR-11)", () => {
    it("앞이 성공하면 뒤를 같은 흐름으로 돌린다. 뒤는 자동 실행이 꺼져 있어도 체인으로 돈다", async () => {
        const t = f_Setup([f_Job("a", { chainNext: "b" }), f_Job("b", { enabled: false })], {
            a: f_Meta("a"),
            b: f_Meta("b", { counts: { ...emptyCounts(), delete: 2 } }),
        });
        expect(await t.scheduler.runJob("a")).toMatchObject({ action: "executed" });
        expect(t.calls).toEqual(["preview:a", "execute:a:0", "preview:b", "execute:b:2"]);
        expect(t.scheduler.chainSteps).toEqual([
            { jobId: "b", outcome: expect.objectContaining({ action: "executed" }) },
        ]);
    });

    it("앞이 바뀔 것 없음이어도 뒤로 간다", async () => {
        const t = f_Setup([f_Job("a", { chainNext: "b" }), f_Job("b")], {
            a: f_Meta("a", { counts: { ...emptyCounts(), same: 3 } }),
            b: f_Meta("b"),
        });
        await t.scheduler.runJob("a");
        expect(t.calls).toEqual(["preview:a", "preview:b", "execute:b:0"]);
    });

    it("앞이 멈추면 뒤는 돌리지 않는다", async () => {
        const t = f_Setup([f_Job("a", { chainNext: "b" }, 1), f_Job("b")], {
            a: f_Meta("a", { counts: { ...emptyCounts(), delete: 3 } }),
            b: f_Meta("b"),
        });
        expect(await t.scheduler.runJob("a")).toMatchObject({ action: "paused" });
        expect(t.calls).toEqual(["preview:a", "paused:a"]);
    });

    it("뒤가 멈춰 있으면 존중한다", async () => {
        const t = f_Setup(
            [f_Job("a", { chainNext: "b" }), f_Job("b", { paused: { at: "x", reason: "사람이 멈춤" } })],
            { a: f_Meta("a"), b: f_Meta("b") },
        );
        await t.scheduler.runJob("a");
        expect(t.calls).toEqual(["preview:a", "execute:a:0"]);
        expect(t.scheduler.chainSteps[0]?.outcome).toMatchObject({ action: "skipped" });
    });

    it("뒤는 뒤 작업의 자동 한도로 판단하고, 멈추면 앞 작업 이름을 붙여 알린다", async () => {
        const t = f_Setup([f_Job("a", { chainNext: "b" }, 50), f_Job("b", {}, 1)], {
            a: f_Meta("a", { counts: { ...emptyCounts(), delete: 2 } }),
            b: f_Meta("b", { counts: { ...emptyCounts(), delete: 2 } }),
        });
        await t.scheduler.runJob("a");
        expect(t.calls).toEqual(["preview:a", "execute:a:2", "preview:b", "paused:b"]);
        expect(t.notes[0]).toContain("삭제 2개가 자동 한도 1개를 넘습니다 (A에 이어서)");
    });

    it("저장 검증을 피한 고리가 있어도 같은 작업을 두 번 돌리지 않는다", async () => {
        const t = f_Setup([f_Job("a", { chainNext: "b" }), f_Job("b", { chainNext: "a" })], {
            a: f_Meta("a"),
            b: f_Meta("b"),
        });
        await t.scheduler.runJob("a");
        expect(t.calls).toEqual(["preview:a", "execute:a:0", "preview:b", "execute:b:0"]);
    });
});
