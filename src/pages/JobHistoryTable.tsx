/**
 *  Job history table
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업별 실행 기록 표
 *      - 그때의 파일 목록, 로그 폴더, 백업 폴더로 갈 수 있다
 */

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCDot from "@/components/ZBCDot";
import { countsLine, describeDirs, formatDateTime, formatDuration, RUN_STATUS_NAMES } from "@/lib/format";
import type { itfRunMeta } from "@/shared/types";
import styles from "./JobHistoryTable.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobHistoryTableProps {
    runs: itfRunMeta[];
    /** 지금 비교 화면에 보여주고 있는 실행 */
    shownId: string | null;
    onShow: (run: itfRunMeta) => void;
    onOpen: (run: itfRunMeta, target: "runDir" | "backupDir") => void;
    /** 실행 정보(명령 · 필터 · rclone.conf 지문)를 연다 */
    onInfo: (run: itfRunMeta) => void;
}

const propsDefault = {} satisfies Partial<itfJobHistoryTableProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function JobHistoryTable(iProps: itfJobHistoryTableProps) {
    const { runs, shownId, onShow, onOpen, onInfo } = { ...propsDefault, ...iProps };

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
        /** 표 머리글. 마지막 칸은 링크 자리라 비운다 */
        columns: ["시작", "종류", "결과", "건수", "걸린 시간", "내용", ""],
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    return (
        <div className={styles.JobHistoryTable}>
            {runs.length === 0 ? (
                <div className={styles.empty}>아직 실행 기록이 없습니다.</div>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {_V.columns.map((title, index) => (
                                <th
                                    key={index}
                                    className={
                                        index === _V.columns.length - 1
                                            ? `${styles.th} ${styles.actions}`
                                            : styles.th
                                    }
                                >
                                    {title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => (
                            <tr
                                key={run.runId}
                                className={run.runId === shownId ? styles.selected : undefined}
                            >
                                <td className={styles.td}>{formatDateTime(run.startedAt)}</td>
                                <td className={styles.td}>
                                    {run.trigger === "schedule" ? "자동 " : ""}
                                    {run.kind === "preview" ? "미리보기" : "실행"}
                                </td>
                                <td className={styles.td}>
                                    <ZBCDot tone={run.status} /> {RUN_STATUS_NAMES[run.status]}
                                </td>
                                <td className={`${styles.td} ${styles.counts}`}>
                                    {[countsLine(run.counts, run.mode), describeDirs(run)]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </td>
                                <td className={styles.td}>{formatDuration(run)}</td>
                                <td className={`${styles.td} ${styles.message}`} title={run.message}>
                                    {run.message}
                                </td>
                                <td className={`${styles.td} ${styles.actions}`}>
                                    <ZBCButton variant="link" onClick={() => onShow(run)}>
                                        목록
                                    </ZBCButton>
                                    <ZBCButton variant="link" onClick={() => onInfo(run)}>
                                        정보
                                    </ZBCButton>
                                    <ZBCButton variant="link" onClick={() => onOpen(run, "runDir")}>
                                        로그
                                    </ZBCButton>
                                    {run.backupDir && (
                                        <ZBCButton variant="link" onClick={() => onOpen(run, "backupDir")}>
                                            백업
                                        </ZBCButton>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
