/**
 *  App store
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 화면 전체 상태 (작업, 선택, 실행 진행, 안내). main과는 window.rclonegui로만 이야기한다.
 */

/**
 *  External imports
 */
import { create } from "zustand";

/**
 *  Internal imports
 */
import { messageOf } from "@/lib/format";
import {
    PREVIEW_TTL_MS,
    type itfFileItem,
    type itfProgress,
    type itfRcloneStatus,
    type itfRunMeta,
    type typJob,
    type typJobInput,
    type typResult,
    type typRunEvent,
    type typSettings,
} from "@/shared/types";

/**
 *  Types 정의
 */
/** 작업 하나의 화면 상태 */
export interface itfJobView {
    /** 최근 실행부터 */
    history: itfRunMeta[];
    /** 지금 목록에 보여주는 실행과 그 파일 목록 */
    shown: itfRunMeta | null;
    items: itfFileItem[];
    /** 대기 중이거나 실행 중인 rclone */
    active: itfRunMeta | null;
    progress: itfProgress | null;
    /** 이 시각 이전의 미리보기는 작업 설정이 바뀌어 쓸 수 없다 */
    invalidBefore: number;
}

export type typNotice = { kind: "error" | "info"; text: string };

interface itfAppState {
    ready: boolean;
    jobs: typJob[];
    selectedId: string | null;
    rclone: itfRcloneStatus | null;
    settings: typSettings;
    views: Record<string, itfJobView>;
    /** 화면 아래에 잠깐 보여주는 안내 */
    notice: typNotice | null;

    init(): Promise<void>;
    select(jobId: string): Promise<void>;
    saveJob(job: typJobInput): Promise<typJob | null>;
    deleteJob(jobId: string): Promise<void>;
    preview(jobId: string): Promise<void>;
    execute(jobId: string, previewRunId: string, confirmedDeletes: number): Promise<void>;
    cancel(jobId: string): Promise<void>;
    showRun(run: itfRunMeta): Promise<void>;
    saveSettings(settings: typSettings): Promise<boolean>;
    refreshRclone(): Promise<void>;
    handleEvent(event: typRunEvent): Promise<void>;
    notify(kind: typNotice["kind"], text: string): void;
    clearNotice(): void;
}

/**
 *  내부 함수
 */
const f_EmptyView = (): itfJobView => ({
    history: [],
    shown: null,
    items: [],
    active: null,
    progress: null,
    invalidBefore: 0,
});

/**
 *  메인 클래스 / export 함수
 */
/** typResult를 풀어 값만 돌려준다. 실패는 사람이 읽는 문구를 담아 던진다. */
export async function unwrap<T>(promise: Promise<typResult<T>>): Promise<T> {
    const result = await promise;
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
}

/** 지금 [동기화]에 쓸 수 있는 미리보기. 가장 최근 실행이 30분 안에 성공한 미리보기여야 한다. */
export function usablePreview(view: itfJobView | undefined, now: number): itfRunMeta | null {
    const latest = view?.history[0];
    if (!view || !latest || view.active) return null;
    if (latest.kind !== "preview" || latest.status !== "success" || latest.blocked || !latest.endedAt)
        return null;
    const endedAt = new Date(latest.endedAt).getTime();
    if (endedAt <= view.invalidBefore || now - endedAt > PREVIEW_TTL_MS) return null;
    return latest;
}

export const useApp = create<itfAppState>((set, get) => {
    const f_PatchView = (jobId: string, patch: Partial<itfJobView>): void =>
        set((state) => ({
            views: { ...state.views, [jobId]: { ...(state.views[jobId] ?? f_EmptyView()), ...patch } },
        }));

    /** 실패하면 안내로 띄우고 넘어간다. */
    const f_Guard = async (action: () => Promise<void>): Promise<void> => {
        try {
            await action();
        } catch (error) {
            get().notify("error", messageOf(error));
        }
    };

    return {
        ready: false,
        jobs: [],
        selectedId: null,
        rclone: null,
        settings: { rclonePath: null, rcloneConfig: null },
        views: {},
        notice: null,

        async init() {
            await f_Guard(async () => {
                const [jobs, settings, rclone] = await Promise.all([
                    unwrap(window.rclonegui.jobs.list()),
                    unwrap(window.rclonegui.settings.get()),
                    unwrap(window.rclonegui.rclone.status()),
                ]);
                set({ jobs, settings, rclone, ready: true });
                if (jobs[0]) await get().select(jobs[0].id);
            });
            set({ ready: true });
        },

        async select(jobId) {
            set({ selectedId: jobId });
            await f_Guard(async () => {
                const history = await unwrap(window.rclonegui.runs.list(jobId));
                f_PatchView(jobId, { history });
                const view = get().views[jobId];
                const latest = history[0];
                if (!view?.shown && latest && latest.endedAt) await get().showRun(latest);
            });
        },

        async saveJob(input) {
            try {
                const saved = await unwrap(window.rclonegui.jobs.save(input));
                const jobs = await unwrap(window.rclonegui.jobs.list());
                set({ jobs });
                // 설정이 바뀌었으니 이전 미리보기로는 실행할 수 없다.
                f_PatchView(saved.id, { invalidBefore: Date.now() });
                await get().select(saved.id);
                return saved;
            } catch (error) {
                get().notify("error", messageOf(error));
                return null;
            }
        },

        async deleteJob(jobId) {
            await f_Guard(async () => {
                await unwrap(window.rclonegui.jobs.delete(jobId));
                const jobs = await unwrap(window.rclonegui.jobs.list());
                set({
                    jobs,
                    selectedId: get().selectedId === jobId ? (jobs[0]?.id ?? null) : get().selectedId,
                });
                const next = get().selectedId;
                if (next) await get().select(next);
            });
        },

        async preview(jobId) {
            await f_Guard(async () => {
                await unwrap(window.rclonegui.run.preview(jobId));
            });
        },

        async execute(jobId, previewRunId, confirmedDeletes) {
            await f_Guard(async () => {
                await unwrap(window.rclonegui.run.execute({ jobId, previewRunId, confirmedDeletes }));
            });
        },

        async cancel(jobId) {
            const active = get().views[jobId]?.active;
            if (!active) return;
            await f_Guard(async () => {
                await unwrap(window.rclonegui.run.cancel(active.runId));
            });
        },

        async showRun(run) {
            await f_Guard(async () => {
                const items = await unwrap(
                    window.rclonegui.runs.items({ jobId: run.jobId, runId: run.runId }),
                );
                f_PatchView(run.jobId, { shown: run, items });
            });
        },

        async saveSettings(settings) {
            try {
                const saved = await unwrap(window.rclonegui.settings.save(settings));
                // rclone.conf가 바뀌면 명령이 달라지므로 모든 미리보기를 무효로 한다.
                const now = Date.now();
                set((state) => ({
                    settings: saved,
                    views: Object.fromEntries(
                        Object.entries(state.views).map(([id, view]) => [
                            id,
                            { ...view, invalidBefore: now },
                        ]),
                    ),
                }));
                await get().refreshRclone();
                return true;
            } catch (error) {
                get().notify("error", messageOf(error));
                return false;
            }
        },

        async refreshRclone() {
            await f_Guard(async () => {
                set({ rclone: await unwrap(window.rclonegui.rclone.status()) });
            });
        },

        async handleEvent(event) {
            const { jobId } = event;
            if (event.type === "progress") {
                if (get().views[jobId]?.active?.runId === event.runId)
                    f_PatchView(jobId, { progress: event.payload });
                return;
            }
            if (event.type === "started") {
                const current = get().views[jobId];
                f_PatchView(jobId, {
                    active: event.payload,
                    progress: current?.active?.runId === event.runId ? current.progress : null,
                });
                return;
            }
            // done
            if (get().views[jobId]?.active?.runId === event.runId) {
                f_PatchView(jobId, { active: null, progress: null });
            }
            await f_Guard(async () => {
                const [history, items] = await Promise.all([
                    unwrap(window.rclonegui.runs.list(jobId)),
                    unwrap(window.rclonegui.runs.items({ jobId, runId: event.runId })),
                ]);
                f_PatchView(jobId, { history, shown: event.payload, items });
            });
        },

        notify(kind, text) {
            set({ notice: { kind, text } });
        },

        clearNotice() {
            set({ notice: null });
        },
    };
});
