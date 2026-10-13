/**
 *  Job page
 *
 *  @author Bruce.Cheong    2026-10-11
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
    changeTotal,
    chipName,
    describeChanges,
    formatDateTime,
    formatDuration,
    messageOf,
} from "@/lib/format";
import { cloneJob } from "@/lib/job-defaults";
import { unwrap, usablePreview, useApp } from "@/stores/app-store";
import type { itfRunMeta, typItemStatus, typJob, typJobInput } from "@/shared/types";
import JobFileList from "./JobFileList";
import JobHistoryTable from "./JobHistoryTable";
import styles from "./JobPage.module.css";
import JobRunBanner from "./JobRunBanner";
import RunConfirmDialog from "./RunConfirmDialog";

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

/**
 *  내부 함수
 */

/** [동기화] 버튼 문구. 일어날 일을 적는다 */
function f_SyncLabel(preview: itfRunMeta | null) {
    if (!preview) return "동기화 (먼저 비교)";
    return changeTotal(preview) > 0 ? `동기화: ${describeChanges(preview)}` : "동기화: 바뀔 것 없음";
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
    const execute = useApp((s) => s.execute);
    const cancel = useApp((s) => s.cancel);
    const deleteJob = useApp((s) => s.deleteJob);
    const showRun = useApp((s) => s.showRun);
    const notify = useApp((s) => s.notify);

    /** 비교 결과 / 실행 기록 탭 */
    const [tab, setTab] = useState<typJobPageTab>("compare");
    /** 상태 칩 필터 */
    const [filter, setFilter] = useState(DEFAULT_FILTER);
    /** 확인 창을 연 미리보기. 그 미리보기가 무효가 되면 창도 닫힌다 */
    const [confirmingRunId, setConfirmingRunId] = useState<string | null>(null);
    /** 작업 삭제를 한 번 더 묻는 중인지 */
    const [confirmDelete, setConfirmDelete] = useState(false);
    /** 미리보기 만료 판단에 쓰는 현재 시각 */
    const [now, setNow] = useState(() => Date.now());

    /** 필터를 통과한 파일 목록 */
    const allItems = view?.items;
    const items = useMemo(() => (allItems ?? []).filter((item) => filter[item.status]), [allItems, filter]);

    //
    // Effect (부수 효과)
    //

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
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 지금 실행에 쓸 수 있는 미리보기를 찾는다 */
    function f_Preview() {
        // 방금 끝난 실행 직후에도 바로 맞게 보이도록, 주기 갱신 값과 마지막 실행 시각 중 늦은 쪽을 쓴다.
        const latestEnd = view?.history[0]?.endedAt ? new Date(view.history[0].endedAt).getTime() : 0;
        return usablePreview(view, Math.max(now, latestEnd));
    }

    /** 상태 칩의 className. 건수가 0이면 꺼진 모양으로 둔다 */
    function f_ChipClass(status: typItemStatus) {
        return filter[status] && (_V.shown?.counts[status] ?? 0) > 0
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
        setFilter((current) => ({ ...current, [status]: !current[status] }));
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
            </header>

            <div className={styles.toolbar}>
                <ZBCButton onClick={h_Preview} disabled={!_V.canRun || _V.active !== null}>
                    비교
                </ZBCButton>
                <ZBCButton
                    variant="primary"
                    onClick={h_Sync}
                    disabled={!_V.canRun || _V.preview === null || changeTotal(_V.preview) === 0}
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

            <JobRunBanner active={_V.active} progress={view?.progress ?? null} shown={_V.shown} />

            {tab === "compare" ? (
                <>
                    <div className={styles.chips}>
                        {STATUSES.map((status) => (
                            <button
                                type="button"
                                key={status}
                                className={f_ChipClass(status)}
                                onClick={() => h_ToggleFilter(status)}
                                aria-pressed={filter[status]}
                            >
                                {chipName(status, _V.shown?.mode ?? job.mode)} {_V.shown?.counts[status] ?? 0}
                            </button>
                        ))}
                    </div>
                    {_V.shown ? (
                        <JobFileList
                            items={items}
                            run={_V.shown}
                            backup={job.safety.backup}
                            emptyText={
                                _V.total === 0
                                    ? "표시할 파일이 없습니다"
                                    : "선택한 상태의 파일이 없습니다. 위의 칩을 눌러 다른 상태를 보세요"
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
