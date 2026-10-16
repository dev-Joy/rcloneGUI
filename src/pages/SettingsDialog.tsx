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
import { useEffect, useState } from "react";

/**
 *  Internal imports
 */
import ZBCButton from "@/components/ZBCButton";
import ZBCCheck from "@/components/ZBCCheck";
import ZBCField from "@/components/ZBCField";
import ZBCInput from "@/components/ZBCInput";
import ZBCModal from "@/components/ZBCModal";
import { unwrap, useApp } from "@/stores/app-store";
import { INPUT_LIMITS } from "@/shared/limits";
import type { itfAppInfo } from "@/shared/types";
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
    /** 새 작업의 기본 원본 폴더 입력 */
    const [defaultSource, setDefaultSource] = useState(settings.defaultSource ?? "");
    /** 새 작업의 기본 대상 폴더 입력 */
    const [defaultDest, setDefaultDest] = useState(settings.defaultDest ?? "");
    /** 로그인 시 시작 (F12) */
    const [launchAtLogin, setLaunchAtLogin] = useState(settings.launchAtLogin);
    /** 버전 · 설치본 여부 · Windows에 등록된 실제 값 */
    const [info, setInfo] = useState<itfAppInfo | null>(null);

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        // 정보를 못 받아도 설정은 고칠 수 있어야 하므로 실패는 조용히 넘긴다.
        unwrap(window.rclonegui.app.info()).then(setInfo, () => setInfo(null));
    }, []);

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

    /** 폴더 선택 창을 띄워 고른 경로를 넘긴다 */
    async function h_PickFolder(apply: (path: string) => void) {
        const folder = await unwrap(window.rclonegui.app.pickFolder("settings")).catch(() => null);
        if (folder) apply(folder);
    }

    /** 저장하고, 성공하면 닫는다 */
    async function h_Save() {
        const ok = await saveSettings({
            rclonePath: rclonePath.trim() || null,
            rcloneConfig: rcloneConfig.trim() || null,
            defaultSource: defaultSource.trim() || null,
            defaultDest: defaultDest.trim() || null,
            launchAtLogin,
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
                        maxLength={INPUT_LIMITS.path}
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
                        maxLength={INPUT_LIMITS.path}
                        placeholder="%APPDATA%\rclone\rclone.conf"
                    />
                </ZBCField>
                <ZBCField
                    label="새 작업의 기본 원본 (비워 두면 빈 칸)"
                    action={
                        <ZBCButton onClick={() => void h_PickFolder(setDefaultSource)}>폴더 선택</ZBCButton>
                    }
                >
                    <ZBCInput
                        aria-label="새 작업의 기본 원본"
                        value={defaultSource}
                        onChange={setDefaultSource}
                        maxLength={INPUT_LIMITS.path}
                        placeholder="비워 둠"
                    />
                </ZBCField>
                <ZBCField
                    label="새 작업의 기본 대상 (비워 두면 빈 칸)"
                    action={
                        <ZBCButton onClick={() => void h_PickFolder(setDefaultDest)}>폴더 선택</ZBCButton>
                    }
                    hint="[+ 새 작업]의 원본 · 대상 칸을 이 값으로 채우고, 작업 편집의 [폴더 선택]도 여기서 엽니다. 대상은 리모트:경로도 됩니다."
                >
                    <ZBCInput
                        aria-label="새 작업의 기본 대상"
                        value={defaultDest}
                        onChange={setDefaultDest}
                        maxLength={INPUT_LIMITS.path}
                        placeholder="비워 둠"
                    />
                </ZBCField>
                <ZBCCheck
                    checked={launchAtLogin}
                    onChange={setLaunchAtLogin}
                    disabled={info !== null && !info.packaged}
                >
                    Windows에 로그인하면 rcloneGUI 시작 (앱만 켜고 동기화는 하지 않음)
                </ZBCCheck>
                {info && !info.packaged && (
                    <div className={styles.hint}>개발 실행에서는 설치본에서만 동작합니다.</div>
                )}
                {info && info.packaged && info.openAtLogin !== settings.launchAtLogin && (
                    <div className={styles.hint}>
                        Windows(작업 관리자 · 시작 앱)에서는 로그인 시 시작이{" "}
                        {info.openAtLogin ? "켜져" : "꺼져"} 있습니다. 위 체크를 바꿔 저장할 때만 Windows 값을
                        바꿉니다.
                    </div>
                )}
                {info && (
                    <div className={styles.hint}>
                        rcloneGUI {info.version} · {info.packaged ? "설치본" : "개발 실행"}
                    </div>
                )}
                <div className={styles.hint}>
                    백업 위치 규칙: 로컬 대상은 같은 드라이브의 <code>.rclonegui-backup\작업ID\실행ID</code>,
                    리모트 대상은 <code>리모트:.rclonegui-backup/작업ID/실행ID</code>
                </div>
            </div>
        </ZBCModal>
    );
}
