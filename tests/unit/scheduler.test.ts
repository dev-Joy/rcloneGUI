/**
 *  Scheduler test
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 자동 실행 판단 (F10 · SR-10). 가짜 runner · 저장소 · 시계로 확인한다
 */

/**
 *  External imports
 */
import { describe, expect, it } from "vitest";

/**
 *  Internal imports
 */
import { autoStopReason, clsScheduler, type itfSchedulerDeps } from "@/main/schedule/scheduler";
import { emptyCounts, type itfRunMeta, type typJob } from "@/shared/types";
import { makeJob } from "./helpers";

/**
 *  내부 함수
 */
function f_Meta(patch: Partial<itfRunMeta> = {}): itfRunMeta {
    return {
        runId: "20261016-100000",
        jobId: "sample-job",
        kind: "preview",
        status: "success",
        exitCode: 0,
        counts: { ...emptyCounts(), add: 1 },
        startedAt: "2026-10-16T01:00:00.000Z",
        endedAt: "2026-10-16T01:00:01.000Z",
        jobHash: "h",
        command: "rclone sync a b --dry-run",
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

function f_Job(patch: Partial<typJob> = {}): typJob {
    const base = makeJob();
    return {
        ...base,
        schedule: { ...base.schedule, enabled: true, everyMinutes: 30 },
        safety: { ...base.safety, autoMaxDelete: 2 },
        ...patch,
    };
}

/** 가짜 의존성. preview 결과와 execute 결과를 정해 두고 무엇이 불렸는지 기록한다 */
function f_Setup(
    job: typJob,
    preview: itfRunMeta | null,
    executed: itfRunMeta | null = f_Meta({ kind: "execute" }),
) {
    const calls: string[] = [];
    const notes: string[] = [];
    let current = job;
    let clock = new Date(2026, 9, 16, 10, 0, 0);
    let active = false;
    const deps: itfSchedulerDeps = {
        jobs: {
            list: async () => [current],
            get: async () => current,
            setPaused: async (_id, paused) => {
                current = { ...current, schedule: { ...current.schedule, paused } };
                calls.push(`paused:${paused?.reason ?? "null"}`);
                return current;
            },
        },
        runner: {
            preview: async (_id, trigger) => {
                calls.push(`preview:${trigger}`);
                return "p1";
            },
            execute: async (input) => {
                calls.push(`execute:${input.confirmedDeletes}:${input.trigger}`);
                return "e1";
            },
            wait: async (runId) => (runId === "p1" ? preview : executed),
            isActive: () => active,
        },
        notify: (_title, body) => notes.push(body),
        onJobsChanged: () => calls.push("changed"),
        now: () => clock,
    };
    return {
        scheduler: new clsScheduler(deps),
        calls,
        notes,
        job: () => current,
        advance: (minutes: number) => {
            clock = new Date(clock.getTime() + minutes * 60_000);
        },
        setActive: (value: boolean) => {
            active = value;
        },
    };
}

describe("autoStopReason (SR-10)", () => {
    const job = f_Job();
    it.each([
        ["미리보기 결과 없음", null, "비교가 끝나지 않았습니다"],
        [
            "미리보기 실패",
            f_Meta({ status: "failed", message: "폴더를 찾을 수 없습니다" }),
            "비교가 끝나지 않았습니다: 폴더를 찾을 수 없습니다",
        ],
        ["빈 원본", f_Meta({ blocked: "EMPTY_SOURCE" }), "원본에 파일이 없습니다. 경로를 확인하세요"],
        ["읽기 오류", f_Meta({ counts: { ...emptyCounts(), error: 2 } }), "읽기 오류가 2개 있습니다"],
        [
            "삭제가 한도를 넘음",
            f_Meta({ counts: { ...emptyCounts(), delete: 3 } }),
            "삭제 3개가 자동 한도 2개를 넘습니다",
        ],
    ])("%s → 멈춘다", (_label, preview, reason) => {
        expect(autoStopReason(job, preview)).toBe(reason);
    });

    it("삭제가 한도 이하면 괜찮다. copy의 대상 전용 파일은 삭제가 아니다", () => {
        expect(autoStopReason(job, f_Meta({ counts: { ...emptyCounts(), delete: 2 } }))).toBeNull();
        expect(
            autoStopReason(job, f_Meta({ mode: "copy", counts: { ...emptyCounts(), delete: 9 } })),
        ).toBeNull();
    });

    it("자동 한도 0이면 삭제가 하나라도 있으면 멈춘다", () => {
        const zero = f_Job({ safety: { ...job.safety, autoMaxDelete: 0 } });
        expect(autoStopReason(zero, f_Meta({ counts: { ...emptyCounts(), delete: 1 } }))).toBe(
            "삭제 1개가 자동 한도 0개를 넘습니다",
        );
    });
});

describe("clsScheduler.runJob", () => {
    it("안전하면 미리보기 뒤 같은 삭제 수로 execute()를 부른다", async () => {
        const preview = f_Meta({ counts: { ...emptyCounts(), add: 1, delete: 2 } });
        const t = f_Setup(f_Job(), preview);
        expect(await t.scheduler.runJob("sample-job")).toEqual({
            action: "executed",
            previewRunId: "p1",
            executeRunId: "e1",
        });
        expect(t.calls).toEqual(["preview:schedule", "execute:2:schedule"]);
    });

    it("한도를 넘으면 실행하지 않고 멈추고 알린다", async () => {
        const t = f_Setup(f_Job(), f_Meta({ counts: { ...emptyCounts(), delete: 5 } }));
        expect(await t.scheduler.runJob("sample-job")).toEqual({
            action: "paused",
            reason: "삭제 5개가 자동 한도 2개를 넘습니다",
        });
        expect(t.calls).toEqual([
            "preview:schedule",
            "paused:삭제 5개가 자동 한도 2개를 넘습니다",
            "changed",
        ]);
        expect(t.notes[0]).toContain("자동 실행을 멈췄습니다");
        expect(t.job().schedule.paused?.reason).toBe("삭제 5개가 자동 한도 2개를 넘습니다");
    });

    it("바뀔 것이 없으면 실행하지 않고 멈추지도 않는다", async () => {
        const t = f_Setup(f_Job(), f_Meta({ counts: { ...emptyCounts(), same: 3 } }));
        expect(await t.scheduler.runJob("sample-job")).toEqual({ action: "nothing", previewRunId: "p1" });
        expect(t.calls).toEqual(["preview:schedule"]);
    });

    it("실행이 실패로 끝나면 멈춘다", async () => {
        const t = f_Setup(
            f_Job(),
            f_Meta(),
            f_Meta({ kind: "execute", status: "failed", message: "삭제 한도에 걸려 멈췄습니다" }),
        );
        expect(await t.scheduler.runJob("sample-job")).toMatchObject({ action: "paused" });
        expect(t.job().schedule.paused?.reason).toContain("삭제 한도에 걸려 멈췄습니다");
    });

    it("execute()가 거부하면(예외) 멈춘다", async () => {
        const t = f_Setup(f_Job(), f_Meta());
        const deps = (t.scheduler as unknown as { deps: itfSchedulerDeps }).deps;
        deps.runner.execute = async () => {
            throw new Error("미리보기 뒤에 작업 설정이나 실행 기록이 바뀌었습니다. 다시 비교하세요");
        };
        expect(await t.scheduler.runJob("sample-job")).toMatchObject({ action: "paused" });
    });

    it("미리보기 중에 자동 실행을 끄거나 멈추면 실행하지 않는다", async () => {
        const t = f_Setup(f_Job(), f_Meta());
        const deps = (t.scheduler as unknown as { deps: itfSchedulerDeps }).deps;
        const original = deps.runner.wait;
        deps.runner.wait = async (runId) => {
            // 미리보기가 끝나기 직전에 사람이 트레이에서 멈춘 경우
            await deps.jobs.setPaused("sample-job", { at: "x", reason: "알림 영역에서 모두 멈춤" });
            return original(runId);
        };
        expect(await t.scheduler.runJob("sample-job")).toMatchObject({ action: "skipped" });
        expect(t.calls).not.toContain("execute:0:schedule");
        expect(t.calls.some((c) => c.startsWith("execute"))).toBe(false);
    });

    it("미리보기 중에 자동 한도를 낮추면 낮춘 한도로 다시 판단한다", async () => {
        const t = f_Setup(f_Job(), f_Meta({ counts: { ...emptyCounts(), delete: 2 } }));
        const deps = (t.scheduler as unknown as { deps: itfSchedulerDeps }).deps;
        const get = deps.jobs.get;
        let calls = 0;
        deps.jobs.get = async (id) => {
            calls += 1;
            const job = await get(id);
            // 두 번째 읽기(실행 직전)에는 한도가 1로 낮아져 있다
            return calls >= 2 ? { ...job, safety: { ...job.safety, autoMaxDelete: 1 } } : job;
        };
        expect(await t.scheduler.runJob("sample-job")).toEqual({
            action: "paused",
            reason: "삭제 2개가 자동 한도 1개를 넘습니다",
        });
        expect(t.calls.some((c) => c.startsWith("execute"))).toBe(false);
    });

    it("멈추는 중에 또 실패해도 던지지 않고 건너뛴다 (처리되지 않는 오류 방지)", async () => {
        const t = f_Setup(f_Job(), f_Meta());
        const deps = (t.scheduler as unknown as { deps: itfSchedulerDeps }).deps;
        deps.runner.preview = async () => {
            throw new Error("rclone을 찾지 못했습니다");
        };
        deps.jobs.setPaused = async () => {
            throw new Error("작업을 찾을 수 없습니다");
        };
        await expect(t.scheduler.runJob("sample-job")).resolves.toEqual({
            action: "skipped",
            reason: "rclone을 찾지 못했습니다",
        });
    });

    it("이미 실행 중이거나 멈춘 작업은 건너뛴다", async () => {
        const busy = f_Setup(f_Job(), f_Meta());
        busy.setActive(true);
        expect(await busy.scheduler.runJob("sample-job")).toMatchObject({ action: "skipped" });
        expect(busy.calls).toEqual([]);

        const paused = f_Setup(
            f_Job({ schedule: { ...f_Job().schedule, paused: { at: "x", reason: "y" } } }),
            f_Meta(),
        );
        expect(await paused.scheduler.runJob("sample-job")).toMatchObject({ action: "skipped" });
        expect(paused.calls).toEqual([]);
    });
});

describe("clsScheduler.tick", () => {
    it("켠 뒤부터 세고(놓친 실행은 따라잡지 않음), 때가 되면 돌린다", async () => {
        const t = f_Setup(f_Job(), f_Meta({ counts: { ...emptyCounts(), same: 1 } }));
        await t.scheduler.tick();
        expect(t.calls).toEqual([]);
        expect(t.scheduler.nextRunAt("sample-job")).toEqual(new Date(2026, 9, 16, 10, 30, 0));
        t.advance(29);
        await t.scheduler.tick();
        expect(t.calls).toEqual([]);
        t.advance(1);
        await t.scheduler.tick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(t.calls).toEqual(["preview:schedule"]);
        expect(t.scheduler.nextRunAt("sample-job")).toEqual(new Date(2026, 9, 16, 11, 0, 0));
    });

    it("자동 실행이 꺼진 작업은 시각을 세지 않는다", async () => {
        const t = f_Setup(f_Job({ schedule: { ...f_Job().schedule, enabled: false } }), f_Meta());
        await t.scheduler.tick();
        expect(t.scheduler.nextRunAt("sample-job")).toBeNull();
        expect(await t.scheduler.hasActiveSchedules()).toBe(false);
    });
});
