/**
 *  Scheduler
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 앱이 켜져 있는 동안 작업을 정해진 때에 자동으로 비교하고, 안전하면 동기화한다 (F10 1단계)
 *      - SR-10: 미리보기 → 검사(실패 · 빈 원본 · 읽기 오류 · 자동 삭제 한도) → execute(). 의심스러우면 실행하지 않고 그 작업의 자동 실행을 멈춘다
 *      - 명세: docs/specs/2026-10-16-schedule-in-app.md
 */

/**
 *  Internal imports
 */
import { nextScheduleTime } from "@/shared/cron";
import { plannedDeletes, type itfRunMeta, type typJob } from "@/shared/types";

/**
 *  Types 정의
 */
const TICK_MS = 30_000;

/** 한 번의 체인에서 돌릴 최대 작업 수 (F09). 저장 검증이 고리를 막지만 한 번 더 막는다 */
const CHAIN_LIMIT = 10;

export interface itfSchedulerDeps {
    jobs: {
        list(): Promise<typJob[]>;
        get(jobId: string): Promise<typJob>;
        setPaused(jobId: string, paused: typJob["schedule"]["paused"]): Promise<typJob>;
    };
    runner: {
        preview(jobId: string, trigger: "schedule"): Promise<string>;
        execute(input: {
            jobId: string;
            previewRunId: string;
            confirmedDeletes: number;
            trigger: "schedule";
        }): Promise<string>;
        wait(runId: string): Promise<itfRunMeta | null>;
        isActive(jobId: string): boolean;
    };
    /** Windows 알림 */
    notify: (title: string, body: string) => void;
    /** main이 작업을 바꿨다 (화면이 목록을 다시 읽게) */
    onJobsChanged: () => void;
    now?: () => Date;
}

/** 한 번 돌린 결과 (테스트 · 기록용) */
export type typScheduleOutcome =
    | { action: "executed"; previewRunId: string; executeRunId: string }
    | { action: "nothing"; previewRunId: string }
    | { action: "paused"; reason: string }
    | { action: "skipped"; reason: string };

/**
 *  내부 함수
 */
/** 실행하면 대상에서 바뀌는 것이 있는지 (파일 · 폴더) */
function f_HasChanges(meta: itfRunMeta): boolean {
    const dirs = meta.dirs ? meta.dirs.make + meta.dirs.remove : 0;
    return meta.counts.add + meta.counts.change + plannedDeletes(meta) + dirs > 0;
}

/** 미리보기 결과에서 자동 실행을 멈춰야 하는 이유. 괜찮으면 null (SR-10) */
export function autoStopReason(job: typJob, preview: itfRunMeta | null): string | null {
    if (!preview || preview.status !== "success") {
        return `비교가 끝나지 않았습니다${preview ? `: ${preview.message}` : ""}`;
    }
    if (preview.blocked === "EMPTY_SOURCE") return "원본에 파일이 없습니다. 경로를 확인하세요";
    if (preview.counts.error > 0) return `읽기 오류가 ${preview.counts.error}개 있습니다`;
    const deletes = plannedDeletes(preview);
    if (deletes > job.safety.autoMaxDelete) {
        return `삭제 ${deletes}개가 자동 한도 ${job.safety.autoMaxDelete}개를 넘습니다`;
    }
    return null;
}

/**
 *  메인 클래스 / export 함수
 */
export class clsScheduler {
    /** 작업마다 다음 실행 시각 (ms). 앱을 켠 뒤부터 센다 — 꺼져 있던 동안 놓친 실행은 따라잡지 않는다 */
    private readonly next = new Map<string, number>();
    /** 자동 실행 흐름이 도는 중인 작업 */
    private readonly running = new Set<string>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly now: () => Date;

    constructor(private readonly deps: itfSchedulerDeps) {
        this.now = deps.now ?? (() => new Date());
    }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => void this.tick(), TICK_MS);
        void this.tick();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** 작업을 저장했거나 다시 켰을 때 다음 시각을 지금부터 다시 센다. 인자가 없으면 전부 */
    refresh(jobId?: string): void {
        if (jobId === undefined) this.next.clear();
        else this.next.delete(jobId);
    }

    /** 다음 실행 시각 (화면 · 테스트용). 아직 계산 전이면 null */
    nextRunAt(jobId: string): Date | null {
        const at = this.next.get(jobId);
        return at === undefined ? null : new Date(at);
    }

    /** 자동 실행이 켜져 있고 멈추지 않은 작업이 있는지 (창을 닫을 때 트레이에 남을지) */
    async hasActiveSchedules(): Promise<boolean> {
        return (await this.deps.jobs.list()).some(
            (job) => job.schedule.enabled && job.schedule.paused === null,
        );
    }

    /** 30초마다: 때가 된 작업을 하나씩 돌린다. 끝까지 기다리지 않는다 (작업끼리는 runner의 대상별 큐가 순서를 지킨다) */
    async tick(): Promise<void> {
        const now = this.now().getTime();
        for (const job of await this.deps.jobs.list()) {
            if (!job.schedule.enabled || job.schedule.paused !== null) {
                this.next.delete(job.id);
                continue;
            }
            const due = this.next.get(job.id);
            if (due === undefined) {
                this.setNextRun(job, now);
                continue;
            }
            if (now < due) continue;
            this.setNextRun(job, now);
            void this.runJob(job.id);
        }
    }

    /**
     * 자동 실행 한 번 (SR-10). 성공하거나 바뀔 것이 없으면 이어지는 작업(chainNext)을 같은 흐름으로 돌린다 (F09 · SR-11).
     * 결과는 첫 작업의 것이고, 이어서 돈 작업들은 chainSteps로 볼 수 있다.
     */
    async runJob(jobId: string): Promise<typScheduleOutcome> {
        this.chainSteps = [];
        const first = await this.runOne(jobId, null);
        let outcome = first;
        let current = jobId;
        const visited = new Set([jobId]);
        while (
            (outcome.action === "executed" || outcome.action === "nothing") &&
            visited.size < CHAIN_LIMIT
        ) {
            const next = (await this.deps.jobs.get(current).catch(() => null))?.schedule.chainNext ?? null;
            if (next === null || visited.has(next)) break;
            visited.add(next);
            const from = (await this.deps.jobs.get(current).catch(() => null))?.name ?? current;
            outcome = await this.runOne(next, from);
            this.chainSteps.push({ jobId: next, outcome });
            current = next;
        }
        return first;
    }

    /** 마지막 runJob에서 이어서 돈 작업과 결과 (테스트 · 기록용) */
    chainSteps: { jobId: string; outcome: typScheduleOutcome }[] = [];

    /** 작업 하나의 자동 흐름. chainFrom이 있으면 체인으로 이어서 도는 것 (enabled가 꺼져 있어도 돌고, 멈춤은 존중) */
    private async runOne(jobId: string, chainFrom: string | null): Promise<typScheduleOutcome> {
        if (this.running.has(jobId) || this.deps.runner.isActive(jobId)) {
            return { action: "skipped", reason: "이미 실행 중입니다" };
        }
        this.running.add(jobId);
        const f_Allowed = (j: typJob): boolean =>
            j.schedule.paused === null && (chainFrom !== null || j.schedule.enabled);
        const f_Reason = (reason: string): string =>
            chainFrom === null ? reason : `${reason} (${chainFrom}에 이어서)`;
        try {
            const job = await this.deps.jobs.get(jobId);
            if (!f_Allowed(job)) {
                return { action: "skipped", reason: "자동 실행이 꺼져 있거나 멈춰 있습니다" };
            }
            const previewRunId = await this.deps.runner.preview(jobId, "schedule");
            const preview = await this.deps.runner.wait(previewRunId);
            const stop = autoStopReason(job, preview);
            if (stop !== null) return await this.pause(job, f_Reason(stop));
            if (!preview || !f_HasChanges(preview)) return { action: "nothing", previewRunId };

            // 미리보기가 도는 동안 사람이 자동 실행을 끄거나 멈췄으면 실행하지 않는다. 한도도 지금 값으로 다시 본다.
            const latest = await this.deps.jobs.get(jobId);
            if (!f_Allowed(latest)) {
                return { action: "skipped", reason: "비교하는 중에 자동 실행이 꺼지거나 멈췄습니다" };
            }
            const latestStop = autoStopReason(latest, preview);
            if (latestStop !== null) return await this.pause(latest, f_Reason(latestStop));

            // 사람이 [실행]을 누를 때와 같은 execute()와 같은 검사를 거친다. 확인한 삭제 수 대신 자동 한도 이하인 삭제 수를 넘긴다.
            const executeRunId = await this.deps.runner.execute({
                jobId,
                previewRunId,
                confirmedDeletes: plannedDeletes(preview),
                trigger: "schedule",
            });
            const done = await this.deps.runner.wait(executeRunId);
            if (!done || done.status !== "success") {
                return await this.pause(
                    job,
                    f_Reason(`동기화가 끝나지 않았습니다${done ? `: ${done.message}` : ""}`),
                );
            }
            return { action: "executed", previewRunId, executeRunId };
        } catch (error) {
            // rclone을 못 찾음, 원본 폴더 없음, 미리보기가 무효 같은 경우도 멈춘다 (의심스러우면 멈춘다).
            const job = await this.deps.jobs.get(jobId).catch(() => null);
            const reason = error instanceof Error ? error.message : String(error);
            if (!job) return { action: "skipped", reason };
            // 멈추는 중에 또 실패하면(그 사이 작업이 지워짐 등) 던지지 않고 건너뛴다. tick()이 기다리지 않으므로 처리되지 않는 오류가 되지 않게.
            return await this.pause(job, f_Reason(reason)).catch(() => ({
                action: "skipped" as const,
                reason,
            }));
        } finally {
            this.running.delete(jobId);
        }
    }

    private setNextRun(job: typJob, now: number): void {
        try {
            const at = nextScheduleTime(job.schedule, new Date(now));
            if (at) this.next.set(job.id, at.getTime());
            else this.next.delete(job.id);
        } catch {
            this.next.delete(job.id);
        }
    }

    private async pause(job: typJob, reason: string): Promise<typScheduleOutcome> {
        await this.deps.jobs.setPaused(job.id, { at: this.now().toISOString(), reason });
        this.next.delete(job.id);
        this.deps.notify("rcloneGUI", `${job.name} 자동 실행을 멈췄습니다: ${reason}`);
        this.deps.onJobsChanged();
        return { action: "paused", reason };
    }
}
