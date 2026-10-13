/**
 *  Run confirm dialog
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 실행 전 확인 대화상자
 *      - 삭제가 있으면 목록을 보여주고 체크해야만 실행할 수 있다
 */

/**
 *  External imports
 */
import { useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCCheck from "@/components/ZBCCheck";
import ZBCModal from "@/components/ZBCModal";
import { changeTotal } from "@/lib/format";
import { plannedDeletes, type itfFileItem, type itfRunMeta, type typJob } from "@/shared/types";
import styles from "./RunConfirmDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfRunConfirmDialogProps {
    job: typJob;
    preview: itfRunMeta;
    items: itfFileItem[];
    onCancel: () => void;
    onConfirm: (confirmedDeletes: number) => void;
    /** 삭제 목록에 보여줄 최대 줄 수 */
    maxListed?: number;
}

const propsDefault = {
    maxListed: 500,
} satisfies Partial<itfRunConfirmDialogProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function RunConfirmDialog(iProps: itfRunConfirmDialogProps) {
    const { job, preview, items, onCancel, onConfirm, maxListed } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 삭제 목록을 확인했다는 체크 */
    const [checked, setChecked] = useState(false);

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        /** 실행하면 대상에서 지워질 파일 수 */
        deletes: plannedDeletes(preview),
        /** 지워질 파일 목록 (copy는 지우지 않으므로 빈 목록) */
        doomed: plannedDeletes(preview) > 0 ? items.filter((item) => item.status === "delete") : [],
        backupText: job.safety.backup
            ? "지우거나 덮어쓰는 파일은 대상 드라이브의 .baton-backup 폴더로 옮겨 둡니다."
            : "백업이 꺼져 있어 지우거나 덮어쓴 파일은 되돌릴 수 없습니다.",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 확인한 삭제 수와 함께 실행을 요청한다 */
    function h_Confirm() {
        onConfirm(_V.deletes);
    }

    return (
        <ZBCModal
            title="실행 확인"
            onClose={onCancel}
            footer={
                <>
                    <ZBCButton onClick={onCancel}>취소</ZBCButton>
                    <ZBCButton
                        variant={_V.deletes > 0 ? "danger" : "primary"}
                        disabled={_V.deletes > 0 && !checked}
                        onClick={h_Confirm}
                    >
                        실행
                    </ZBCButton>
                </>
            }
        >
            <div className={styles.RunConfirmDialog}>
                <p className={styles.lead}>
                    {_V.deletes > 0 ? `삭제 ${_V.deletes}개를 포함해 ` : ""}
                    <b>{changeTotal(preview)}개 파일</b>이 대상에서 바뀝니다.
                </p>
                <ul className={styles.summary}>
                    <li>새로 복사 {preview.counts.add}개</li>
                    <li>원본 내용으로 덮어씀 {preview.counts.change}개</li>
                    <li className={_V.deletes > 0 ? styles.danger : undefined}>
                        대상에서 삭제 {_V.deletes}개
                    </li>
                    {preview.counts.error > 0 && (
                        <li className={styles.danger}>
                            읽기 오류 {preview.counts.error}개 — rclone이 삭제를 모두 보류합니다
                        </li>
                    )}
                </ul>
                <p className={styles.path}>대상: {job.dest}</p>
                <p className={styles.path}>{_V.backupText}</p>

                {_V.deletes > 0 && (
                    <>
                        <div className={styles.list}>
                            {_V.doomed.slice(0, maxListed).map((item) => (
                                <div key={item.path}>{item.path}</div>
                            ))}
                            {_V.doomed.length > maxListed && (
                                <div>… 외 {_V.doomed.length - maxListed}개 (비교 화면에서 전체 확인)</div>
                            )}
                        </div>
                        <ZBCCheck checked={checked} onChange={setChecked}>
                            위 {_V.deletes}개 파일이 대상에서 지워지는 것을 확인했습니다. 실행 중 지울 파일이
                            더 늘면 멈춥니다.
                        </ZBCCheck>
                    </>
                )}
            </div>
        </ZBCModal>
    );
}
