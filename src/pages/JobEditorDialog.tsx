/**
 *  Job editor dialog
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업 편집 대화상자
 *      - 원본 · 대상, 모드, 제외 패턴, 옵션, 안전장치를 고친다
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
import ZBCTextarea from "@/components/ZBCTextarea";
import { unwrap, useApp } from "@/stores/app-store";
import type { typJobInput } from "@/shared/types";
import styles from "./JobEditorDialog.module.css";

/**
 *  Props & Types 정의
 */
export interface itfJobEditorDialogProps {
    /** 고칠 작업. id가 빈 문자열이면 새 작업(또는 복제)이다. */
    initial: typJobInput;
    onClose: () => void;
}

const propsDefault = {} satisfies Partial<itfJobEditorDialogProps>;

/**
 *  내부 함수
 */

/** 숫자 입력을 정수로 읽는다. 읽을 수 없으면 fallback */
function f_ToNumber(text: string, fallback: number) {
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) ? value : fallback;
}

/**
 *  메인 컴포넌트
 */
export default function JobEditorDialog(iProps: itfJobEditorDialogProps) {
    const { initial, onClose } = { ...propsDefault, ...iProps };

    //
    // hook & state 변수 선언
    //

    /** 저장 액션 */
    const saveJob = useApp((s) => s.saveJob);

    /** 편집 중인 작업 */
    const [job, setJob] = useState<typJobInput>(initial);
    /** 제외 패턴 입력 (줄당 하나) */
    const [excludes, setExcludes] = useState(initial.excludes.join("\n"));
    /** rclone 리모트 이름 목록 */
    const [remotes, setRemotes] = useState<string[]>([]);
    /** 저장 요청 중 여부 */
    const [saving, setSaving] = useState(false);

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        // 리모트가 없거나 rclone이 없어도 편집은 할 수 있어야 하므로 실패는 조용히 넘긴다.
        unwrap(window.rclonegui.rclone.remotes()).then(setRemotes, () => setRemotes([]));
    }, []);

    //
    // 내부 변수
    //
    const _V = {
        title: initial.id ? "작업 편집" : "새 작업",
        pathPlaceholder: "폴더 경로 또는 리모트:경로",
    };

    //
    // 이벤트 핸들러 및 내부 함수
    //

    /** 작업의 일부 값을 바꾼다 */
    function f_Patch(value: Partial<typJobInput>) {
        setJob((current) => ({ ...current, ...value }));
    }

    /** rclone 옵션의 일부 값을 바꾼다 */
    function f_PatchOptions(value: Partial<typJobInput["options"]>) {
        setJob((current) => ({ ...current, options: { ...current.options, ...value } }));
    }

    /** 안전장치의 일부 값을 바꾼다 */
    function f_PatchSafety(value: Partial<typJobInput["safety"]>) {
        setJob((current) => ({ ...current, safety: { ...current.safety, ...value } }));
    }

    /** 폴더 선택 창을 띄워 원본 또는 대상에 넣는다 */
    async function h_PickFolder(field: "source" | "dest") {
        const folder = await unwrap(window.rclonegui.app.pickFolder()).catch(() => null);
        if (folder) f_Patch({ [field]: folder });
    }

    /** 백업을 끄면 --ignore-errors 허용도 함께 끈다 */
    function h_ChangeBackup(backup: boolean) {
        f_PatchSafety({ backup, allowIgnoreErrors: backup && job.safety.allowIgnoreErrors });
    }

    /** 저장하고, 성공하면 닫는다 */
    async function h_Submit() {
        setSaving(true);
        const saved = await saveJob({
            ...job,
            excludes: excludes
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
        });
        setSaving(false);
        if (saved) onClose();
    }

    return (
        <ZBCModal
            title={_V.title}
            onClose={onClose}
            wide
            footer={
                <>
                    <ZBCButton onClick={onClose}>취소</ZBCButton>
                    <ZBCButton variant="primary" onClick={() => void h_Submit()} disabled={saving}>
                        저장
                    </ZBCButton>
                </>
            }
        >
            <div className={styles.JobEditorDialog}>
                <ZBCField label="이름">
                    <ZBCInput
                        aria-label="이름"
                        value={job.name}
                        onChange={(name) => f_Patch({ name })}
                        placeholder="예: 프로젝트: WSL → E"
                        autoFocus
                    />
                </ZBCField>

                <ZBCField
                    label="원본"
                    action={<ZBCButton onClick={() => void h_PickFolder("source")}>폴더 선택</ZBCButton>}
                >
                    <ZBCInput
                        aria-label="원본"
                        value={job.source}
                        onChange={(source) => f_Patch({ source })}
                        placeholder={_V.pathPlaceholder}
                    />
                </ZBCField>

                <ZBCField
                    label="대상"
                    action={<ZBCButton onClick={() => void h_PickFolder("dest")}>폴더 선택</ZBCButton>}
                    hint={
                        remotes.length > 0 && (
                            <span className={styles.remotes}>
                                리모트:
                                {remotes.map((remote) => (
                                    <ZBCButton
                                        key={remote}
                                        variant="link"
                                        onClick={() => f_Patch({ dest: remote })}
                                    >
                                        {remote}
                                    </ZBCButton>
                                ))}
                            </span>
                        )
                    }
                >
                    <ZBCInput
                        aria-label="대상"
                        value={job.dest}
                        onChange={(dest) => f_Patch({ dest })}
                        placeholder={_V.pathPlaceholder}
                    />
                </ZBCField>

                <ZBCField label="모드">
                    <div className={styles.modes}>
                        <ZBCCheck
                            type="radio"
                            checked={job.mode === "copy"}
                            onChange={() => f_Patch({ mode: "copy" })}
                        >
                            copy — 대상에만 있는 파일은 그대로 둠
                        </ZBCCheck>
                        <ZBCCheck
                            type="radio"
                            checked={job.mode === "sync"}
                            onChange={() => f_Patch({ mode: "sync" })}
                        >
                            sync — 대상을 원본과 같게 맞춤
                        </ZBCCheck>
                    </div>
                    {job.mode === "sync" && (
                        <div className={styles.warning}>
                            sync는 원본에 없는 파일을 대상에서 지웁니다. 실행 전에 지울 파일 목록을 확인하게
                            됩니다.
                        </div>
                    )}
                </ZBCField>

                <ZBCField label="제외 패턴 (한 줄에 하나)">
                    <ZBCTextarea aria-label="제외 패턴" value={excludes} onChange={setExcludes} />
                </ZBCField>

                <div className={styles.grid}>
                    <ZBCField label="checkers">
                        <ZBCInput
                            aria-label="checkers"
                            type="number"
                            min={1}
                            max={64}
                            value={job.options.checkers}
                            onChange={(text) => f_PatchOptions({ checkers: f_ToNumber(text, 4) })}
                        />
                    </ZBCField>
                    <ZBCField label="transfers">
                        <ZBCInput
                            aria-label="transfers"
                            type="number"
                            min={1}
                            max={64}
                            value={job.options.transfers}
                            onChange={(text) => f_PatchOptions({ transfers: f_ToNumber(text, 4) })}
                        />
                    </ZBCField>
                    <ZBCCheck
                        checked={job.options.fastList}
                        onChange={(fastList) => f_PatchOptions({ fastList })}
                    >
                        --fast-list (리모트일 때만 적용)
                    </ZBCCheck>
                    <ZBCCheck
                        checked={job.options.skipLinks}
                        onChange={(skipLinks) => f_PatchOptions({ skipLinks })}
                    >
                        --skip-links (심볼릭 링크 경고 숨김)
                    </ZBCCheck>
                </div>

                <fieldset className={styles.safety}>
                    <legend className={styles.safetyTitle}>안전장치</legend>
                    <ZBCCheck checked={job.safety.backup} onChange={h_ChangeBackup}>
                        지우거나 덮어쓸 파일을 백업 폴더(대상 드라이브의 .rclonegui-backup)로 옮김
                    </ZBCCheck>
                    {!job.safety.backup && (
                        <div className={styles.warning}>
                            백업을 끄면 지우거나 덮어쓴 파일을 되돌릴 수 없습니다.
                        </div>
                    )}
                    <ZBCCheck
                        checked={job.safety.allowIgnoreErrors}
                        disabled={!job.safety.backup}
                        onChange={(allowIgnoreErrors) => f_PatchSafety({ allowIgnoreErrors })}
                    >
                        --ignore-errors 허용 (고급, 백업이 켜져 있을 때만)
                    </ZBCCheck>
                    {job.safety.allowIgnoreErrors && (
                        <div className={styles.warning}>
                            원본 폴더를 읽지 못해도 삭제를 진행합니다. 읽기 실패가 대상 파일 삭제로 이어질 수
                            있습니다.
                        </div>
                    )}
                </fieldset>

                <ZBCField label="이 작업만 쓰는 rclone.conf (비워 두면 설정의 기본값)">
                    <ZBCInput
                        aria-label="작업 전용 rclone.conf"
                        value={job.rcloneConfig ?? ""}
                        onChange={(text) => f_Patch({ rcloneConfig: text.trim() === "" ? null : text })}
                        placeholder="비워 둠"
                    />
                </ZBCField>
            </div>
        </ZBCModal>
    );
}
