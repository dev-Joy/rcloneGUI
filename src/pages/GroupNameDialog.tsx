/**
 *  Group name dialog
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 작업 그룹 이름을 넣는 대화상자 (F21). 새 그룹과 이름 바꾸기에 함께 쓴다
 */

/**
 *  External imports
 */
import { useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCField from "@/components/ZBCField";
import ZBCInput from "@/components/ZBCInput";
import ZBCModal from "@/components/ZBCModal";
import { useApp } from "@/stores/app-store";
import { INPUT_LIMITS } from "@/shared/limits";
import type { itfGroup } from "@/shared/types";
import styles from "./GroupNameDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfGroupNameDialogProps {
    /** 이름을 바꿀 그룹. 없으면 새 그룹 */
    group?: itfGroup;
    onClose: () => void;
}

const propsDefault = {} satisfies Partial<itfGroupNameDialogProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function GroupNameDialog(iProps: itfGroupNameDialogProps) {
    const { group, onClose } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 그룹 저장 */
    const saveGroup = useApp((s) => s.saveGroup);

    /** 그룹 이름 입력 */
    const [name, setName] = useState(group?.name ?? "");
    /** 저장 요청 중 여부 */
    const [saving, setSaving] = useState(false);

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        title: group ? "그룹 이름 바꾸기" : "새 그룹",
        empty: name.trim() === "",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 저장하고, 성공하면 닫는다 (이름 중복 등은 main이 거부하고 알림으로 보인다) */
    async function h_Save() {
        setSaving(true);
        const ok = await saveGroup({ id: group?.id, name });
        setSaving(false);
        if (ok) onClose();
    }

    return (
        <ZBCModal
            title={_V.title}
            onClose={onClose}
            footer={
                <>
                    <ZBCButton onClick={onClose}>취소</ZBCButton>
                    <ZBCButton variant="primary" onClick={() => void h_Save()} disabled={saving || _V.empty}>
                        저장
                    </ZBCButton>
                </>
            }
        >
            <div className={styles.GroupNameDialog}>
                <ZBCField
                    label="그룹 이름"
                    hint="작업 목록을 묶어 보는 이름입니다. 실행에는 영향이 없습니다."
                >
                    <ZBCInput
                        aria-label="그룹 이름"
                        value={name}
                        onChange={setName}
                        maxLength={INPUT_LIMITS.groupName}
                        placeholder="예: 백업"
                        autoFocus
                    />
                </ZBCField>
            </div>
        </ZBCModal>
    );
}
