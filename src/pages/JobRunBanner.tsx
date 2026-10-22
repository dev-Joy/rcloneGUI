/**
 *  Job run banner
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 실행 상태 띠
 *      - 실행 중에는 진행률을, 끝난 뒤에는 결과와 오류를 보여준다
 */

/**
 *  Internal imports
 */
import {
    averageRate,
    countsLine,
    describeDirs,
    formatBytes,
    formatSeconds,
    RUN_STATUS_NAMES,
} from "@/lib/format";
import { DETAILS_READING_MESSAGE, plannedDeletes, type itfProgress, type itfRunMeta } from "@/shared/types";
import styles from "./JobRunBanner.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobRunBannerProps {
    /** 대기 중이거나 실행 중인 실행. 없으면 shown의 결과를 보여준다. */
    active: itfRunMeta | null;
    progress: itfProgress | null;
    shown: itfRunMeta | null;
    /** 결과에서 보여줄 오류 줄 수 */
    maxErrors?: number;
}

const propsDefault = {
    maxErrors: 5,
} satisfies Partial<itfJobRunBannerProps>;

/**
 *  내부 함수
 */

/** 실행 중 제목 */
function f_ActiveTitle(run: itfRunMeta) {
    if (run.status === "queued") return "대기 중";
    if (run.message === DETAILS_READING_MESSAGE) return "비교하는 중 — 크기 · 수정 시각 읽는 중";
    return run.kind === "preview" ? "비교하는 중" : "동기화하는 중";
}

/** 진행률 한 줄. 속도와 남은 시간은 평균으로 쓴다. 미리보기는 아무것도 보내지 않으므로 쓰지 않는다 */
function f_ProgressText(progress: itfProgress, kind: itfRunMeta["kind"]) {
    const rate = kind === "execute" ? averageRate(progress) : { speed: null, eta: null };
    return [
        `비교 ${progress.checks}/${progress.totalChecks}`,
        `보냄 ${progress.transfers}/${progress.totalTransfers}`,
        `${formatBytes(progress.bytes)} / ${formatBytes(progress.totalBytes)}`,
        rate.speed !== null ? `평균 ${formatBytes(rate.speed)}/s` : "",
        rate.eta !== null ? `남은 시간 약 ${formatSeconds(rate.eta)}` : "",
        kind === "execute" && progress.finishing > 0 ? `전송 마무리 중 ${progress.finishing}개` : "",
        progress.deletes > 0 ? `삭제 ${progress.deletes}` : "",
        progress.errors > 0 ? `오류 ${progress.errors}` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

/**
 *  메인 컴포넌트
 */
export default function JobRunBanner(iProps: itfJobRunBannerProps) {
    const { active, progress, shown, maxErrors } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        /** 전송 비율 0~1. 전체 크기를 모르면 null (막대가 좌우로 움직인다) */
        ratio: progress && progress.totalBytes > 0 ? Math.min(1, progress.bytes / progress.totalBytes) : null,
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 실행 중 화면: 제목, 진행률, 막대 */
    function f_RenderProgress(run: itfRunMeta) {
        return (
            <div className={styles.JobRunBanner}>
                <div className={styles.line}>
                    <b>{f_ActiveTitle(run)}</b>
                    {progress && <span>{f_ProgressText(progress, run.kind)}</span>}
                </div>
                <div className={styles.track}>
                    <div
                        className={_V.ratio === null ? `${styles.bar} ${styles.indeterminate}` : styles.bar}
                        style={_V.ratio === null ? undefined : { width: `${_V.ratio * 100}%` }}
                    />
                </div>
            </div>
        );
    }

    /** 끝난 실행의 결과. 보여줄 것이 없으면 null */
    function f_RenderResult(run: itfRunMeta) {
        if (run.blocked === "EMPTY_SOURCE") {
            return (
                <div className={`${styles.JobRunBanner} ${styles.failed}`}>
                    <b>동기화를 막았습니다.</b> 원본에 파일이 하나도 없습니다. 이대로 sync하면 대상의{" "}
                    {run.counts.delete}개 파일이 모두 지워집니다. 원본 경로를 확인하세요.
                </div>
            );
        }
        if (run.status === "success" && run.kind === "preview") {
            if (run.counts.error === 0) return null;
            return (
                <div className={`${styles.JobRunBanner} ${styles.failed}`}>
                    읽기 오류가 {run.counts.error}개 있습니다. 이 상태로 동기화하면 rclone이 삭제를 모두
                    보류합니다.
                </div>
            );
        }
        if (run.status === "success") {
            return (
                <div className={`${styles.JobRunBanner} ${styles.success}`}>
                    <b>동기화를 마쳤습니다.</b>{" "}
                    {[countsLine(run.counts, run.mode), describeDirs(run)].filter(Boolean).join(" · ") ||
                        "바뀐 것 없음"}
                    {plannedDeletes(run) > 0 && run.backupDir ? " · 지운 파일은 백업 폴더에 있습니다" : ""}
                </div>
            );
        }
        return (
            <div
                className={`${styles.JobRunBanner} ${run.status === "canceled" ? styles.canceled : styles.failed}`}
            >
                <b>
                    {run.kind === "preview" ? "비교" : "동기화"} {RUN_STATUS_NAMES[run.status]}
                    {run.exitCode !== null && run.status !== "canceled" ? ` (종료 코드 ${run.exitCode})` : ""}
                </b>{" "}
                {run.status === "canceled" && run.message === "취소" ? "" : run.message}
                {run.kind === "execute" &&
                    run.status === "canceled" &&
                    " — 그때까지 바뀐 파일은 아래 목록과 백업 폴더에서 확인하세요."}
                {run.errors.length > 0 && (
                    <ul className={styles.errors}>
                        {run.errors.slice(0, maxErrors).map((line, index) => (
                            <li key={index}>{line}</li>
                        ))}
                        {run.errors.length > maxErrors && (
                            <li>… 외 {run.errors.length - maxErrors}줄 (기록 탭의 [로그] 참고)</li>
                        )}
                    </ul>
                )}
            </div>
        );
    }

    if (active) return f_RenderProgress(active);
    if (shown) return f_RenderResult(shown);
    return null;
}
