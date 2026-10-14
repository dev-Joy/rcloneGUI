/**
 *  Settings dialog
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 설정 대화상자
 *      - rclone.exe와 rclone.conf 위치를 정한다
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
import { unwrap, useApp } from "@/stores/app-store";
import styles from "./SettingsDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfSettingsDialogProps {
    onClose: () => void;
}

const propsDefault = {} satisfies Partial<itfSettingsDialogProps>;

/**
 *  내부 함수
 */

/**
 *  메인 컴포넌트
 */
export default function SettingsDialog(iProps: itfSettingsDialogProps) {
    const { onClose } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 전역 상태 */
    const settings = useApp((s) => s.settings);
    const rclone = useApp((s) => s.rclone);
    const saveSettings = useApp((s) => s.saveSettings);

    /** rclone.exe 위치 입력 */
    const [rclonePath, setRclonePath] = useState(settings.rclonePath ?? "");
    /** rclone.conf 위치 입력 */
    const [rcloneConfig, setRcloneConfig] = useState(settings.rcloneConfig ?? "");

    //
    // Effect (부수 효과)
    //

    //
    // 내부 변수
    //
    const _V = {
        /** rclone 상태 한 줄. 문제가 있으면 그 안내 */
        status: rclone?.problem ?? `rclone ${rclone?.version ?? ""} — ${rclone?.path ?? ""}`,
        statusClass: rclone?.problem ? `${styles.status} ${styles.statusBad}` : styles.status,
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 파일 선택 창을 띄워 고른 경로를 넘긴다 */
    async function h_PickFile(apply: (path: string) => void) {
        const file = await unwrap(window.rclonegui.app.pickFile()).catch(() => null);
        if (file) apply(file);
    }

    /** 저장하고, 성공하면 닫는다 */
    async function h_Save() {
        const ok = await saveSettings({
            rclonePath: rclonePath.trim() || null,
            rcloneConfig: rcloneConfig.trim() || null,
        });
        if (ok) onClose();
    }

    return (
        <ZBCModal
            title="설정"
            onClose={onClose}
            footer={
                <>
                    <ZBCButton onClick={onClose}>닫기</ZBCButton>
                    <ZBCButton variant="primary" onClick={() => void h_Save()}>
                        저장
                    </ZBCButton>
                </>
            }
        >
            <div className={styles.SettingsDialog}>
                <div className={_V.statusClass}>{_V.status}</div>
                <ZBCField
                    label="rclone.exe 위치 (비워 두면 PATH에서 찾음)"
                    action={<ZBCButton onClick={() => void h_PickFile(setRclonePath)}>파일 선택</ZBCButton>}
                >
                    <ZBCInput
                        aria-label="rclone.exe 위치"
                        value={rclonePath}
                        onChange={setRclonePath}
                        placeholder="자동 탐지"
                    />
                </ZBCField>
                <ZBCField
                    label="rclone.conf 위치 (비워 두면 rclone 기본값)"
                    action={<ZBCButton onClick={() => void h_PickFile(setRcloneConfig)}>파일 선택</ZBCButton>}
                    hint="rcloneGUI는 이 파일을 경로로만 넘기고 내용은 읽거나 기록하지 않습니다."
                >
                    <ZBCInput
                        aria-label="rclone.conf 위치"
                        value={rcloneConfig}
                        onChange={setRcloneConfig}
                        placeholder="%APPDATA%\rclone\rclone.conf"
                    />
                </ZBCField>
                <div className={styles.hint}>
                    백업 위치 규칙: 로컬 대상은 같은 드라이브의 <code>.rclonegui-backup\작업ID\실행ID</code>,
                    리모트 대상은 <code>리모트:.rclonegui-backup/작업ID/실행ID</code>
                </div>
            </div>
        </ZBCModal>
    );
}
