/**
 *  App layout
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 앱 전체 틀이자 메인 윈도우의 최상위 컴포넌트
 *      - 상단 바, 작업 목록, 작업 화면, 안내와 대화상자를 놓는다
 */

/**
 *  External imports
 */
import { useEffect, useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import { newJob } from "@/lib/job-defaults";
import { useApp } from "@/stores/app-store";
import type { typJobInput } from "@/shared/types";
import styles from "./AppLayout.module.css";
import JobEditorDialog from "./JobEditorDialog";
import JobListPane from "./JobListPane";
import JobPage from "./JobPage";
import SettingsDialog from "./SettingsDialog";

/**
 *  Props & Types 정의
 */
export interface itfAppLayoutProps {
    /** 정보 안내가 스스로 사라지기까지의 시간 (ms) */
    noticeMs?: number;
}

const propsDefault: itfAppLayoutProps = {
    noticeMs: 3000,
};

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function AppLayout(iProps: itfAppLayoutProps = propsDefault) {
    const { noticeMs } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 전역 상태 */
    const ready = useApp((s) => s.ready);
    const jobs = useApp((s) => s.jobs);
    const selectedId = useApp((s) => s.selectedId);
    const rclone = useApp((s) => s.rclone);
    const notice = useApp((s) => s.notice);
    const init = useApp((s) => s.init);
    const handleEvent = useApp((s) => s.handleEvent);
    const clearNotice = useApp((s) => s.clearNotice);

    /** 편집 대화상자에 올린 작업. null이면 닫힌 상태 */
    const [editing, setEditing] = useState<typJobInput | null>(null);
    /** 설정 대화상자 열림 여부 */
    const [settingsOpen, setSettingsOpen] = useState(false);

    //
    // Effect (부수 효과)
    //

    // 처음 한 번 불러오고, main이 보내는 실행 이벤트를 구독한다.
    useEffect(() => {
        void init();
        return window.rclonegui.run.onEvent((event) => void handleEvent(event));
    }, [init, handleEvent]);

    // 정보 안내는 잠시 뒤 스스로 사라지고, 오류는 닫을 때까지 남긴다.
    useEffect(() => {
        if (!notice || notice.kind === "error") return;
        const timer = window.setTimeout(clearNotice, noticeMs);
        return () => window.clearTimeout(timer);
    }, [notice, clearNotice, noticeMs]);

    //
    // 내부 변수
    //
    const _V = {
        /** 지금 고른 작업 */
        selected: jobs.find((job) => job.id === selectedId) ?? null,
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 설정 대화상자를 연다 */
    function h_OpenSettings() {
        setSettingsOpen(true);
    }

    /** 새 작업 편집을 시작한다 */
    function h_NewJob() {
        setEditing(newJob());
    }

    return (
        <div className={styles.AppLayout}>
            <header className={styles.topbar}>
                <span className={styles.brand}>rcloneGUI</span>
                {rclone && (
                    <button
                        type="button"
                        className={rclone.problem ? `${styles.rclone} ${styles.rcloneBad}` : styles.rclone}
                        onClick={h_OpenSettings}
                        title={rclone.problem ?? rclone.path ?? undefined}
                    >
                        {rclone.problem ? "rclone 확인 필요" : `rclone ${rclone.version ?? ""}`}
                    </button>
                )}
                <ZBCButton small onClick={h_OpenSettings}>
                    설정
                </ZBCButton>
            </header>

            <div className={styles.body}>
                <JobListPane onNew={h_NewJob} />
                {_V.selected ? (
                    <JobPage
                        key={_V.selected.id}
                        job={_V.selected}
                        onEdit={setEditing}
                        onClone={setEditing}
                    />
                ) : (
                    <div className={styles.empty}>
                        {ready
                            ? "왼쪽의 [+ 새 작업]으로 첫 작업을 만드세요. 원본과 대상 폴더만 정하면 됩니다."
                            : "불러오는 중…"}
                    </div>
                )}
            </div>

            {notice && (
                <div
                    className={
                        notice.kind === "error" ? `${styles.notice} ${styles.noticeError}` : styles.notice
                    }
                    role="status"
                >
                    <span>{notice.text}</span>
                    <ZBCButton variant="icon" onClick={clearNotice} aria-label="닫기">
                        ✕
                    </ZBCButton>
                </div>
            )}

            {editing && <JobEditorDialog initial={editing} onClose={() => setEditing(null)} />}
            {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        </div>
    );
}
