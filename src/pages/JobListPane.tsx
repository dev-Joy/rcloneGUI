/**
 *  Job list pane
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 왼쪽 작업 목록
 *      - 이름, 모드, 마지막 실행 결과를 보여준다
 */

/**
 *  Internal imports
 */
import ZBCBadge from "@/components/ZBCBadge";
import ZBCButton from "@/components/ZBCButton";
import ZBCDot from "@/components/ZBCDot";
import { formatDateTime } from "@/lib/format";
import { useApp } from "@/stores/app-store";
import type { typJob } from "@/shared/types";
import styles from "./JobListPane.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobListPaneProps {
    onNew: () => void;
}

const propsDefault = {} satisfies Partial<itfJobListPaneProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function JobListPane(iProps: itfJobListPaneProps) {
    const { onNew } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 전역 상태 */
    const jobs = useApp((s) => s.jobs);
    const selectedId = useApp((s) => s.selectedId);
    const views = useApp((s) => s.views);
    const select = useApp((s) => s.select);

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        /** 실행 기록이 없을 때 보여줄 문구 */
        neverRan: "실행 기록 없음",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 작업의 마지막 실행 시각 또는 진행 상태 */
    function f_SubText(job: typJob) {
        const view = views[job.id];
        if (view?.active) return "실행 중";
        const last = view?.history[0];
        return last ? formatDateTime(last.startedAt) : _V.neverRan;
    }

    /** 작업의 상태 점 색 */
    function f_DotTone(job: typJob) {
        const view = views[job.id];
        return view?.active ? "running" : (view?.history[0]?.status ?? "none");
    }

    /** 작업을 고른다 */
    function h_Select(jobId: string) {
        void select(jobId);
    }

    return (
        <aside className={styles.JobListPane}>
            <div className={styles.title}>작업</div>
            <ul className={styles.list}>
                {jobs.map((job) => (
                    <li key={job.id}>
                        <button
                            type="button"
                            className={
                                job.id === selectedId ? `${styles.item} ${styles.selected}` : styles.item
                            }
                            onClick={() => h_Select(job.id)}
                        >
                            <ZBCDot tone={f_DotTone(job)} />
                            <span className={styles.text}>
                                <span className={styles.name}>{job.name}</span>
                                <span className={styles.sub}>
                                    <ZBCBadge tone={job.mode === "sync" ? "change" : "add"}>
                                        {job.mode}
                                    </ZBCBadge>
                                    {f_SubText(job)}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            <ZBCButton className={styles.add} onClick={onNew}>
                + 새 작업
            </ZBCButton>
        </aside>
    );
}
