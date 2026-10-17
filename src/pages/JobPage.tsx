/**
 *  Job page
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업 하나의 화면
 *      - 비교 · 동기화 · 중지, 상태 칩 필터, 비교 목록과 실행 기록을 보여준다
 */

/**
 *  External imports
 */
import { useEffect, useMemo, useState } from "react";

/**
 *  Internal imports
 */
import ZBCBadge from "@/components/ZBCBadge";
import ZBCButton from "@/components/ZBCButton";
import {
    describeDirs,
    describeSpace,
    chipName,
    describeChanges,
    hasChanges,
    formatBytes,
    formatDateTime,
    formatDuration,
    messageOf,
} from "@/lib/format";
import { cloneJob } from "@/lib/job-defaults";
import { baselineExecute, excludedItems, newSince, pendingAfter, viewProblem } from "@/lib/list-views";
import { INPUT_LIMITS } from "@/shared/limits";
import { unwrap, usablePreview, useApp } from "@/stores/app-store";
import {
    isDestTooSmall,
    type itfFileItem,
    type itfRunMeta,
    type typItemStatus,
    type typListView,
    type typJob,
    type typJobInput,
} from "@/shared/types";
import ItemMenu, { type itfItemMenuEntry } from "./ItemMenu";
import JobFileList from "./JobFileList";
import JobFileTree from "./JobFileTree";
import JobHistoryTable from "./JobHistoryTable";
import styles from "./JobPage.module.css";
import JobRunBanner from "./JobRunBanner";
import RunConfirmDialog from "./RunConfirmDialog";
import RunInfoDialog from "./RunInfoDialog";

/**
 *  Props & Types 정의
 */
export interface itfJobPageProps {
    job: typJob;
    onEdit: (job: typJobInput) => void;
    onClone: (job: typJobInput) => void;
    /** 미리보기 만료를 화면에 반영하는 주기 (ms) */
    refreshMs?: number;
}

type typJobPageTab = "compare" | "history";

/** 비교 결과 보기: 폴더 트리(F19) 또는 평면 목록 */
type typCompareLayout = "tree" | "flat";

const propsDefault = {
    refreshMs: 30_000,
} satisfies Partial<itfJobPageProps>;

const STATUSES: typItemStatus[] = ["add", "change", "delete", "error", "same"];

const DEFAULT_FILTER: Record<typItemStatus, boolean> = {
    add: true,
    change: true,
    delete: true,
    error: true,
    same: false,
};

/** "기타" 보기 (F22). status는 상태 칩 필터 */
const LIST_VIEWS: { value: typListView; label: string }[] = [
    { value: "status", label: "기타: 상태 칩대로" },
    { value: "included", label: "포함됨 (비교에 든 모든 항목)" },
    { value: "excluded", label: "제외됨 (필터에 걸린 파일)" },
    { value: "new", label: "새로 생김 (지난 동기화 뒤)" },
    { value: "pending", label: "아직 실행되지 않음" },
];

/** 열린 줄 메뉴 (F23). path는 비교 목록의 상대 경로, 폴더는 끝에 / */
interface itfMenuTarget {
    path: string;
    item: itfFileItem | null;
    x: number;
    y: number;
}

/** 따로 읽어야 하는 보기의 목록 */
interface itfExtraItems {
    /** 보기 · 작업 · 실행 ID. 지금 보기와 다르면 읽는 중이다 */
    key: string;
    items: itfFileItem[];
    error: string | null;
}

/**
 *  내부 함수
 */

/** 제외됨 · 새로 생김 · 아직 실행되지 않음 목록을 읽는다 (F22) */
async function f_LoadView(
    listView: typListView,
    run: itfRunMeta,
    history: readonly itfRunMeta[],
    items: readonly itfFileItem[],
): Promise<itfFileItem[]> {
    const ref = (runId: string) => ({ jobId: run.jobId, runId });
    if (listView === "excluded") {
        return excludedItems(await unwrap(window.rclonegui.runs.excluded(ref(run.runId))));
    }
    if (listView === "new") {
        const baseline = baselineExecute(history, run);
        if (!baseline?.previewRunId) return [];
        return newSince(items, await unwrap(window.rclonegui.runs.items(ref(baseline.previewRunId))));
    }
    if (listView === "pending" && run.previewRunId) {
        return pendingAfter(
            await unwrap(window.rclonegui.runs.items(ref(run.previewRunId))),
            items,
            run.mode,
        );
    }
    return [];
}

/** [동기화] 버튼 문구. 일어날 일을 적는다 */
function f_SyncLabel(preview: itfRunMeta | null) {
    if (!preview) return "동기화 (먼저 비교)";
    return hasChanges(preview) ? `동기화: ${describeChanges(preview)}` : "동기화: 바뀔 것 없음";
}

/**
 *  메인 컴포넌트
 */
export default function JobPage(iProps: itfJobPageProps) {
    const { job, onEdit, onClone, refreshMs } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 전역 상태 */
    const view = useApp((s) => s.views[job.id]);
    const rclone = useApp((s) => s.rclone);
    const startPreview = useApp((s) => s.preview);
    const selectJob = useApp((s) => s.select);
    /** 이어서 실행할 작업 (F09) */
    const nextJob = useApp((s) => s.jobs.find((j) => j.id === job.schedule.chainNext) ?? null);
    const execute = useApp((s) => s.execute);
    const cancel = useApp((s) => s.cancel);
    const deleteJob = useApp((s) => s.deleteJob);
    const showRun = useApp((s) => s.showRun);
    const notify = useApp((s) => s.notify);
    const resumeSchedule = useApp((s) => s.resumeSchedule);

    /** 비교 결과 / 실행 기록 탭 */
    const [tab, setTab] = useState<typJobPageTab>("compare");
    /** 상태 칩 필터 */
    const [filter, setFilter] = useState(DEFAULT_FILTER);
    /** "기타" 보기와 그 보기를 고른 실행 (F22). 다른 실행을 열면 칩 보기로 돌아간다 */
    const [picked, setPicked] = useState<{ view: typListView; runId: string } | null>(null);
    /** 따로 읽은 보기 목록 */
    const [extra, setExtra] = useState<itfExtraItems | null>(null);
    /** 실행 정보 창을 연 실행 */
    const [infoRun, setInfoRun] = useState<itfRunMeta | null>(null);
    /** 열린 줄 메뉴 (F23) */
    const [menu, setMenu] = useState<itfMenuTarget | null>(null);
    const setSkip = useApp((s) => s.setSkip);
    /** 트리 / 평면 보기 */
    const [layout, setLayout] = useState<typCompareLayout>("tree");
    /** 확인 창을 연 미리보기. 그 미리보기가 무효가 되면 창도 닫힌다 */
    const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
    /** 작업 삭제를 한 번 더 묻는 중인지 */
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** 미리보기 만료 판단에 쓰는 현재 시각 */
    const [now, setNow] = useState(() => Date.now());

    /** 필터를 통과한 파일 목록 */
    const allItems = view?.items;
    const shownRun = view?.shown ?? null;
    const history = view?.history;
    const listView: typListView = picked && picked.runId === shownRun?.runId ? picked.view : "status";
    /** 따로 읽어야 하는 보기면 그 열쇠 */
    const extraKey =
        shownRun && (listView === "excluded" || listView === "new" || listView === "pending")
            ? `${listView}:${shownRun.jobId}:${shownRun.runId}`
            : null;
    const items = useMemo(() => {
        if (listView === "included") return allItems ?? [];
        if (listView === "status") return (allItems ?? []).filter((item) => filter[item.status]);
        return extra && extra.key === extraKey ? extra.items : [];
    }, [allItems, filter, listView, extra, extraKey]);

    //
    // Effect (부수 효과)
    //

    // 제외됨 · 새로 생김 · 아직 실행되지 않음은 고를 때 따로 읽는다 (F22)
    useEffect(() => {
        if (extraKey === null || shownRun === null) return;
        let alive = true;
        f_LoadView(listView, shownRun, history ?? [], allItems ?? []).then(
            (loaded) => {
                if (alive) setExtra({ key: extraKey, items: loaded, error: null });
            },
            (error: unknown) => {
                if (!alive) return;
                // 목록 자리에도 남기고, 놓치지 않게 알림으로도 보인다
                setExtra({ key: extraKey, items: [], error: messageOf(error) });
                notify("error", messageOf(error));
            },
        );
        return () => {
            alive = false;
        };
    }, [extraKey, listView, shownRun, history, allItems, notify]);

    // 주기적으로 현재 시각을 갱신해 미리보기 만료를 화면에 반영한다.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), refreshMs);
        return () => window.clearInterval(timer);
    }, [refreshMs]);

    //
    // 내부 변수
    //
    const _V = {
        /** 지금 목록에 보여주는 실행 */
        shown: view?.shown ?? null,
        /** 대기 중이거나 실행 중인 실행 */
        active: view?.active ?? null,
        /** [동기화]에 쓸 수 있는 미리보기 */
        preview: f_Preview(),
        /** rclone을 쓸 수 있는 상태인지 */
        canRun: rclone !== null && rclone.problem === null,
        /** 필터 전 파일 수 */
        total: allItems?.length ?? 0,
        /** 따로 읽는 보기를 읽는 중인지 */
        loading: extraKey !== null && extra?.key !== extraKey,
        /** 따로 읽은 보기의 오류 */
        extraError: extraKey !== null && extra?.key === extraKey ? extra.error : null,
        /** 목록이 비었을 때 안내 */
        emptyText: f_EmptyText(),
        /** 아직 실행되지 않음은 미리보기 문구로 보여 준다 */
        listRun:
            listView === "pending"
                ? (history?.find((run) => run.runId === shownRun?.previewRunId) ?? shownRun)
                : shownRun,
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 목록이 비었을 때 안내. 보기마다 다르다 */
    function f_EmptyText() {
        if (extraKey !== null && extra?.key !== extraKey) {
            return listView === "excluded" ? "제외된 파일을 읽는 중…" : "목록을 읽는 중…";
        }
        if (extraKey !== null && extra?.key === extraKey && extra.error) return extra.error;
        switch (listView) {
            case "excluded":
                return "제외된 파일이 없습니다";
            case "new":
                return "지난 동기화 뒤 원본에 새로 생긴 파일이 없습니다";
            case "pending":
                return "처리되지 않은 파일이 없습니다";
            default:
                return (allItems?.length ?? 0) === 0 || listView === "included"
                    ? "표시할 파일이 없습니다"
                    : "선택한 상태의 파일이 없습니다. 위의 칩을 눌러 다른 상태를 보세요";
        }
    }

    /** 체인의 다음 작업을 고르고 비교를 시작한다 (F09). 실행은 사람이 확인 창에서 한다 */
    async function h_ChainNext(nextId: string) {
        await selectJob(nextId);
        await startPreview(nextId);
    }

    /** 지금 실행에 쓸 수 있는 미리보기를 찾는다 */
    function f_Preview() {
        // 방금 끝난 실행 직후에도 바로 맞게 보이도록, 주기 갱신 값과 마지막 실행 시각 중 늦은 쪽을 쓴다.
        const latestEnd = view?.history[0]?.endedAt ? new Date(view.history[0].endedAt).getTime() : 0;
        return usablePreview(view, Math.max(now, latestEnd));
    }

    /** 상태 칩의 className. 건수가 0이면 꺼진 모양으로 둔다 */
    function f_ChipClass(status: typItemStatus) {
        return listView === "status" && filter[status] && (_V.shown?.counts[status] ?? 0) > 0
            ? `${styles.chip} ${styles.chipOn} ${styles[status]}`
            : styles.chip;
    }

    /** 탭의 className */
    function f_TabClass(name: typJobPageTab) {
        return tab === name ? `${styles.tab} ${styles.tabSelected}` : styles.tab;
    }

    /** 미리보기를 시작한다 */
    function h_Preview() {
        void startPreview(job.id);
    }

    /** 확인 창을 연다 */
    function h_Sync() {
        const preview = _V.preview;
        if (!preview) return;
        // 기록에서 다른 실행을 보고 있었더라도 확인 창에는 이 미리보기의 삭제 목록이 나와야 한다.
        if (_V.shown?.runId === preview.runId) setConfirmingRunId(preview.runId);
        else void showRun(preview).then(() => setConfirmingRunId(preview.runId));
    }

    /** 확인한 삭제 수로 실제 동기화를 시작한다 */
    function h_Confirm(confirmedDeletes: number) {
        const preview = _V.preview;
        if (!preview) return;
        setConfirmingRunId(null);
        void execute(job.id, preview.runId, confirmedDeletes);
    }

    /** 실행 중인 rclone을 멈춘다 */
    function h_Cancel() {
        void cancel(job.id);
    }

    /** 미리보기 또는 실행 명령을 클립보드에 복사한다 */
    async function h_CopyCommand(which: "preview" | "execute") {
        try {
            const commands = await unwrap(window.rclonegui.run.command(job.id));
            await unwrap(window.rclonegui.app.copyText(commands[which]));
            notify("info", which === "preview" ? "미리보기 명령을 복사했습니다" : "실행 명령을 복사했습니다");
        } catch (error) {
            notify("error", messageOf(error));
        }
    }

    /** 실행의 로그 폴더나 백업 폴더를 탐색기로 연다 */
    async function h_OpenFolder(run: itfRunMeta, target: "runDir" | "backupDir") {
        try {
            await unwrap(window.rclonegui.app.open({ jobId: run.jobId, runId: run.runId, target }));
        } catch (error) {
            notify("error", messageOf(error));
        }
    }

    /** 기록에서 고른 실행의 파일 목록을 비교 탭에 보여준다 */
    function h_ShowRun(run: itfRunMeta) {
        void showRun(run);
        setTab("compare");
    }

    /** 상태 칩을 켜고 끈다 */
    function h_ToggleFilter(status: typItemStatus) {
        // 다른 보기에서 칩을 누르면 칩 보기로 돌아가기만 한다
        if (listView !== "status") {
            setPicked(null);
            return;
        }
        setFilter((current) => ({ ...current, [status]: !current[status] }));
    }

    /** 이 줄을 이번 실행에서 뺄 수 있는지 (F23). 미리보기에서 할 일이 있는 파일과 폴더만 */
    function f_CanSkip(target: itfMenuTarget) {
        if (_V.shown?.kind !== "preview" || listView === "excluded" || listView === "pending") return false;
        const { item } = target;
        if (item === null || item.isDir) return true;
        if (item.note) return false;
        return (
            item.status === "add" ||
            item.status === "change" ||
            (item.status === "delete" && job.mode === "sync")
        );
    }

    /** 줄 메뉴의 항목 */
    function f_MenuEntries(target: itfMenuTarget): itfItemMenuEntry[] {
        const entries: itfItemMenuEntry[] = [];
        if (f_CanSkip(target) || job.skip.includes(target.path)) {
            const skipped = job.skip.includes(target.path);
            entries.push({
                label: skipped ? "다시 넣기 (빼기 취소)" : "이번 실행에서 빼기",
                onSelect: () => void h_ToggleSkip(target.path, skipped),
            });
        }
        entries.push({ label: "경로 복사", onSelect: () => void h_CopyPath(target.path) });
        return entries;
    }

    /** 줄 메뉴를 닫는다 */
    function h_CloseMenu() {
        setMenu(null);
    }

    /** 줄 메뉴를 연다 */
    function h_ItemMenu(path: string, item: itfFileItem | null, x: number, y: number) {
        setMenu({ path, item, x, y });
    }

    /** 이번 실행에서 빼거나 다시 넣는다 (F23 · SR-13) */
    async function h_ToggleSkip(path: string, skipped: boolean) {
        if (!skipped && job.skip.length >= INPUT_LIMITS.skipCount) {
            notify("error", `이번 실행에서 뺄 항목은 ${INPUT_LIMITS.skipCount}개까지입니다`);
            return;
        }
        await setSkip(job.id, skipped ? job.skip.filter((p) => p !== path) : [...job.skip, path]);
        notify(
            "info",
            skipped ? "다시 넣었습니다. 다시 비교하세요" : "이번 실행에서 뺐습니다. 다시 비교하세요",
        );
    }

    /** 경로를 클립보드에 복사한다 */
    async function h_CopyPath(path: string) {
        try {
            await unwrap(window.rclonegui.app.copyText(path));
            notify("info", "경로를 복사했습니다");
        } catch (error) {
            notify("error", messageOf(error));
        }
    }

    /** "기타" 보기를 고른다 (F22) */
    function h_PickView(value: string) {
        const option = LIST_VIEWS.find((candidate) => candidate.value === value);
        if (!option || !_V.shown) return;
        setPicked(option.value === "status" ? null : { view: option.value, runId: _V.shown.runId });
    }

    /** 작업을 지운다 */
    function h_DeleteJob() {
        void deleteJob(job.id);
    }

    return (
        <section className={styles.JobPage}>
            <header className={styles.header}>
                <div className={styles.heading}>
                    <h1 className={styles.title}>{job.name}</h1>
                    <ZBCBadge tone={job.mode === "sync" ? "change" : "add"}>{job.mode}</ZBCBadge>
                </div>
                <div className={styles.actions}>
                    <ZBCButton small onClick={() => onEdit(job)} disabled={_V.active !== null}>
                        편집
                    </ZBCButton>
                    <ZBCButton small onClick={() => onClone(cloneJob(job))}>
                        복제
                    </ZBCButton>
                    {confirmDelete ? (
                        <>
                            <ZBCButton small variant="danger" onClick={h_DeleteJob}>
                                작업 삭제 확인
                            </ZBCButton>
                            <ZBCButton small onClick={() => setConfirmDelete(false)}>
                                취소
                            </ZBCButton>
                        </>
                    ) : (
                        <ZBCButton small onClick={() => setConfirmDelete(true)} disabled={_V.active !== null}>
                            삭제
                        </ZBCButton>
                    )}
                </div>
                <div className={styles.paths} title={`${job.source} → ${job.dest}`}>
                    <span className={styles.path}>{job.source}</span>
                    <span className={styles.arrow}>→</span>
                    <span className={styles.path}>{job.dest}</span>
                </div>
                {_V.shown?.space && (
                    <div
                        className={
                            isDestTooSmall(_V.shown.space)
                                ? `${styles.space} ${styles.spaceWarn}`
                                : styles.space
                        }
                    >
                        {/* 항목마다 끊기지 않게 묶고, 좁으면 항목 사이에서만 줄을 바꾼다 */}
                        <span className={styles.spaceItem}>비교 시점</span>
                        <span className={styles.spaceItem}>원본 {describeSpace(_V.shown.space.source)}</span>
                        <span className={styles.spaceItem}>대상 {describeSpace(_V.shown.space.dest)}</span>
                        <span className={styles.spaceItem}>
                            옮길 크기 {formatBytes(_V.shown.space.transferBytes)}
                        </span>
                        {isDestTooSmall(_V.shown.space) && <b>대상 드라이브 여유가 옮길 크기보다 작습니다</b>}
                    </div>
                )}
            </header>

            <div className={styles.toolbar}>
                <ZBCButton onClick={h_Preview} disabled={!_V.canRun || _V.active !== null}>
                    비교
                </ZBCButton>
                <ZBCButton
                    variant="primary"
                    onClick={h_Sync}
                    disabled={!_V.canRun || _V.preview === null || !hasChanges(_V.preview)}
                    title={_V.preview ? undefined : "비교한 뒤 30분 안에만 실행할 수 있습니다"}
                >
                    {f_SyncLabel(_V.preview)}
                </ZBCButton>
                <ZBCButton onClick={h_Cancel} disabled={_V.active === null}>
                    중지
                </ZBCButton>
                <span className={styles.gap} />
                <ZBCButton small onClick={() => void h_CopyCommand("preview")}>
                    미리보기 명령 복사
                </ZBCButton>
                <ZBCButton small onClick={() => void h_CopyCommand("execute")}>
                    실행 명령 복사
                </ZBCButton>
                <div className={styles.tabs}>
                    <button type="button" className={f_TabClass("compare")} onClick={() => setTab("compare")}>
                        비교 결과
                    </button>
                    <button type="button" className={f_TabClass("history")} onClick={() => setTab("history")}>
                        실행 기록
                    </button>
                </div>
            </div>

            {job.schedule.paused && (
                <div className={styles.paused}>
                    <span>
                        <b>자동 실행 멈춤</b> ({formatDateTime(job.schedule.paused.at)}):{" "}
                        {job.schedule.paused.reason}. 확인한 뒤 다시 켜세요. 수동 비교 · 동기화는 그대로
                        됩니다.
                    </span>
                    <ZBCButton small onClick={() => void resumeSchedule(job.id)}>
                        다시 켜기
                    </ZBCButton>
                </div>
            )}
            {job.skip.length > 0 && (
                <div className={styles.skipped}>
                    <div className={styles.skippedHead}>
                        <span>
                            <b>이번 실행에서 뺀 항목 {job.skip.length}개</b> — 다시 비교한 목록으로만
                            동기화합니다. 실제 동기화가 성공하면 다시 넣습니다.
                        </span>
                        <ZBCButton small onClick={() => void setSkip(job.id, [])}>
                            모두 되돌리기
                        </ZBCButton>
                    </div>
                    <ul className={styles.skipList}>
                        {job.skip.map((path) => (
                            <li key={path} className={styles.skipItem}>
                                <span className={styles.skipPath} title={path}>
                                    {path}
                                </span>
                                <button
                                    type="button"
                                    className={styles.skipRemove}
                                    aria-label={`${path} 다시 넣기`}
                                    title="다시 넣기"
                                    onClick={() => void h_ToggleSkip(path, true)}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <JobRunBanner active={_V.active} progress={view?.progress ?? null} shown={_V.shown} />
            {nextJob &&
                _V.active === null &&
                _V.shown?.kind === "execute" &&
                _V.shown.status === "success" && (
                    <div className={styles.chain}>
                        <span>
                            이 작업에 이어서 <b>{nextJob.name}</b>을(를) 실행하도록 되어 있습니다. 비교 결과를
                            확인한 뒤 실행하세요.
                        </span>
                        <ZBCButton
                            small
                            onClick={() => void h_ChainNext(nextJob.id)}
                            disabled={!_V.canRun}
                            title={_V.canRun ? undefined : "rclone을 쓸 수 있어야 비교할 수 있습니다"}
                        >
                            이어서: {nextJob.name} 비교
                        </ZBCButton>
                    </div>
                )}

            {tab === "compare" ? (
                <>
                    <div className={styles.chips}>
                        {STATUSES.map((status) => (
                            <button
                                type="button"
                                key={status}
                                className={f_ChipClass(status)}
                                onClick={() => h_ToggleFilter(status)}
                                aria-pressed={listView === "status" && filter[status]}
                            >
                                {chipName(status, _V.shown?.mode ?? job.mode)} {_V.shown?.counts[status] ?? 0}
                            </button>
                        ))}
                        {_V.shown && describeDirs(_V.shown) && (
                            <span className={styles.dirs}>{describeDirs(_V.shown)}</span>
                        )}
                        {_V.shown && (
                            <select
                                className={styles.viewSelect}
                                aria-label="기타 보기"
                                value={listView}
                                onChange={(event) => h_PickView(event.target.value)}
                            >
                                {LIST_VIEWS.map((option) => {
                                    const problem = _V.shown
                                        ? viewProblem(option.value, _V.shown, history ?? [])
                                        : null;
                                    return (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                            disabled={problem !== null}
                                        >
                                            {problem ? `${option.label} — ${problem}` : option.label}
                                        </option>
                                    );
                                })}
                            </select>
                        )}
                        <span className={styles.gap} />
                        <div className={styles.layouts} role="group" aria-label="보기">
                            {(["tree", "flat"] as const).map((value) => (
                                <button
                                    type="button"
                                    key={value}
                                    className={
                                        layout === value
                                            ? `${styles.layout} ${styles.layoutOn}`
                                            : styles.layout
                                    }
                                    aria-pressed={layout === value}
                                    onClick={() => setLayout(value)}
                                >
                                    {value === "tree" ? "트리" : "평면"}
                                </button>
                            ))}
                        </div>
                    </div>
                    {_V.shown?.details === "failed" && (
                        <div className={styles.notice}>
                            크기 · 수정 시각을 읽지 못했습니다. 경로와 상태만 보여줍니다.
                        </div>
                    )}
                    {listView === "excluded" && !_V.loading && !_V.extraError && (
                        <div className={styles.notice}>
                            지금 읽은 원본 · 대상 목록 기준입니다. 비교 뒤 바뀐 파일은 다를 수 있습니다.
                        </div>
                    )}
                    {_V.shown && _V.listRun && layout === "tree" ? (
                        <JobFileTree
                            key={`${_V.shown.runId}:${listView}`}
                            items={items}
                            run={_V.listRun}
                            backup={job.safety.backup}
                            emptyText={_V.emptyText}
                            onItemMenu={(target, x, y) => h_ItemMenu(target.path, target.item, x, y)}
                        />
                    ) : _V.shown && _V.listRun ? (
                        <JobFileList
                            items={items}
                            run={_V.listRun}
                            backup={job.safety.backup}
                            emptyText={_V.emptyText}
                            onItemMenu={(item, x, y) =>
                                h_ItemMenu(item.isDir ? `${item.path}/` : item.path, item, x, y)
                            }
                        />
                    ) : (
                        <div className={styles.placeholder}>
                            [비교]를 누르면 추가·변경·삭제될 파일을 미리 보여줍니다. 대상은 바뀌지 않습니다.
                        </div>
                    )}
                </>
            ) : (
                <JobHistoryTable
                    runs={view?.history ?? []}
                    shownId={_V.shown?.runId ?? null}
                    onShow={h_ShowRun}
                    onOpen={(run, target) => void h_OpenFolder(run, target)}
                    onInfo={setInfoRun}
                />
            )}

            <footer className={styles.footer}>
                {_V.shown ? (
                    <>
                        <span className={styles.footerItem}>
                            {_V.shown.kind === "preview" ? "미리보기" : "실행"}{" "}
                            {formatDateTime(_V.shown.startedAt)}
                            {_V.shown.endedAt ? ` · ${formatDuration(_V.shown)}` : ""}
                        </span>
                        {_V.shown.kind === "preview" && !_V.active && (
                            <span className={styles.footerItem}>
                                {_V.preview?.runId === _V.shown.runId
                                    ? "이 미리보기로 실행할 수 있습니다"
                                    : "지난 미리보기 — 실행하려면 다시 비교"}
                            </span>
                        )}
                        {_V.shown.backupDir && (
                            <span className={styles.footerItem} title={_V.shown.backupDir}>
                                백업: {_V.shown.backupDir}
                            </span>
                        )}
                    </>
                ) : (
                    <span className={styles.footerItem}>아직 실행 기록이 없습니다</span>
                )}
            </footer>

            {infoRun && <RunInfoDialog run={infoRun} onClose={() => setInfoRun(null)} />}
            {menu && (
                <ItemMenu
                    x={menu.x}
                    y={menu.y}
                    title={menu.path}
                    entries={f_MenuEntries(menu)}
                    onClose={h_CloseMenu}
                />
            )}
            {_V.preview && confirmingRunId === _V.preview.runId && (
                <RunConfirmDialog
                    job={job}
                    preview={_V.preview}
                    items={_V.shown?.runId === _V.preview.runId ? (allItems ?? []) : []}
                    onCancel={() => setConfirmingRunId(null)}
                    onConfirm={h_Confirm}
                />
            )}
        </section>
    );
}
