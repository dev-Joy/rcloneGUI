/**
 *  Run info dialog
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 실행 기록 한 건의 정보: 실행한 명령, 그때의 필터, 그때 쓴 rclone.conf의 지문과 지금 파일과의 비교
 *      - rclone.conf 내용은 보여 주지 않는다(앱이 열지 않는다)
 */

/**
 *  External imports
 */
import { useEffect, useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCModal from "@/components/ZBCModal";
import { formatBytes, formatDateTime, messageOf } from "@/lib/format";
import { unwrap, useApp } from "@/stores/app-store";
import type { itfConfigSnapshot, itfRunMeta, typConfigCheck } from "@/shared/types";
import styles from "./RunInfoDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfRunInfoDialogProps {
    run: itfRunMeta;
    onClose: () => void;
}

const propsDefault = {} satisfies Partial<itfRunInfoDialogProps>;

/**
 *  내부 함수
 */
const SOURCE_NAMES: Record<itfConfigSnapshot["source"], string> = {
    job: "이 작업만 쓰는 rclone.conf",
    settings: "설정 창의 rclone.conf 위치",
    default: "rclone 기본 위치",
};

const CHECK_TEXT: Record<typConfigCheck, string> = {
    same: "그때와 같음",
    changed: "그 뒤에 바뀜 (크기나 수정 시각이 다름)",
    missing: "지금은 파일이 없음",
    unknown: "비교할 수 없음",
};

/**
 *  메인 컴포넌트
 */
export default function RunInfoDialog(iProps: itfRunInfoDialogProps) {
    const { run, onClose } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    const notify = useApp((s) => s.notify);
    /** 지금 파일과의 비교. null이면 비교하는 중 */
    const [check, setCheck] = useState<typConfigCheck | null>(null);

    //
    // Effect (부수 효과)
    //

    // 열 때 한 번 main에게 비교를 맡긴다 (경로는 main이 기록에서 꺼낸다)
    useEffect(() => {
        let alive = true;
        unwrap(window.rclonegui.runs.configCheck({ jobId: run.jobId, runId: run.runId })).then(
            (result) => {
                if (alive) setCheck(result);
            },
            () => {
                if (alive) setCheck("unknown");
            },
        );
        return () => {
            alive = false;
        };
    }, [run.jobId, run.runId]);

    //
    // 내부 변수
    //
    const _V = {
        snapshot: run.snapshot,
        config: run.snapshot?.config ?? null,
        filterLines: run.snapshot?.filter.split("\n").filter((line) => line !== "") ?? [],
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 실행한 명령을 클립보드에 복사한다 */
    async function h_CopyCommand() {
        try {
            await unwrap(window.rclonegui.app.copyText(run.command));
            notify("info", "명령을 복사했습니다");
        } catch (error) {
            notify("error", messageOf(error));
        }
    }

    /** rclone.conf 지문 칸 */
    function f_Config(config: itfConfigSnapshot) {
        return (
            <dl className={styles.facts}>
                <dt>출처</dt>
                <dd>{SOURCE_NAMES[config.source]}</dd>
                <dt>경로</dt>
                <dd className={styles.path} title={config.path}>
                    {config.path}
                </dd>
                <dt>그때</dt>
                <dd>
                    {config.exists && config.size !== null && config.modifiedAt !== null
                        ? `${formatBytes(config.size)} · 수정 ${formatDateTime(config.modifiedAt)}`
                        : "파일이 없었음"}
                </dd>
                <dt>지금</dt>
                <dd className={check === "same" ? undefined : styles.changed}>
                    {check === null ? "비교하는 중…" : CHECK_TEXT[check]}
                </dd>
            </dl>
        );
    }

    return (
        <ZBCModal
            title={`실행 정보 · ${formatDateTime(run.startedAt)} ${run.kind === "preview" ? "미리보기" : "실행"}`}
            onClose={onClose}
            wide
            footer={<ZBCButton onClick={onClose}>닫기</ZBCButton>}
        >
            <div className={styles.RunInfoDialog}>
                <section className={styles.section}>
                    <div className={styles.head}>
                        <h3 className={styles.title}>실행한 명령</h3>
                        <ZBCButton small onClick={() => void h_CopyCommand()}>
                            복사
                        </ZBCButton>
                    </div>
                    <pre className={styles.code}>{run.command}</pre>
                </section>

                {_V.snapshot === null ? (
                    <p className={styles.note}>
                        이 실행은 필터 · rclone.conf 기록을 남기기 전 버전에서 돌았습니다.
                    </p>
                ) : (
                    <>
                        <section className={styles.section}>
                            <h3 className={styles.title}>그때의 필터 (filter.txt)</h3>
                            {_V.filterLines.length === 0 ? (
                                <p className={styles.note}>필터 없음 — 모든 파일을 비교했습니다.</p>
                            ) : (
                                <ol className={styles.filter}>
                                    {_V.filterLines.map((line, index) => (
                                        <li key={index}>{line}</li>
                                    ))}
                                </ol>
                            )}
                            {_V.snapshot.filterTruncated && (
                                <p className={styles.changed}>너무 길어 앞부분만 남겼습니다.</p>
                            )}
                        </section>

                        <section className={styles.section}>
                            <h3 className={styles.title}>rclone.conf</h3>
                            {_V.config === null ? (
                                <p className={styles.note}>
                                    rclone 기본 위치를 알아내지 못해 기록하지 못했습니다.
                                </p>
                            ) : (
                                f_Config(_V.config)
                            )}
                            <p className={styles.note}>
                                앱은 rclone.conf를 열지 않습니다. 내용 대신 크기와 수정 시각으로 바뀌었는지만
                                봅니다.
                            </p>
                        </section>
                    </>
                )}
            </div>
        </ZBCModal>
    );
}
