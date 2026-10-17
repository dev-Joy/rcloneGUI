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
import { formatDateTime } from "@/lib/format";
import { unwrap, useApp } from "@/stores/app-store";
import { cronProblem, nextScheduleTime } from "@/shared/cron";
import { driveFolderLocation, parseDriveFolderUrl, parseDriveLocation } from "@/shared/drive-url";
import { findExcludeProblem, INPUT_LIMITS } from "@/shared/limits";
import type { itfRemote, typJobInput } from "@/shared/types";
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

/** 동기화 범위 (F25) */
const SCOPES = [
    ["files", "파일만 — 원본의 빈 폴더는 만들지 않음"],
    ["all", "전체 — 파일과 원본의 빈 폴더까지"],
    ["folders", "폴더 구조만 — 파일은 그대로 두고 폴더만 만듦"],
] as const;

/**
 *  내부 함수
 */

/** 제외 패턴 입력을 줄 목록으로. 앞뒤 공백을 지우고 빈 줄은 뺀다 */
function f_SplitExcludes(text: string) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

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
    /** 이어서 실행할 작업을 고르는 목록 (F09) */
    const allJobs = useApp((s) => s.jobs);
    /** 작업 그룹 (F21) */
    const groups = useApp((s) => s.groups);

    /** 편집 중인 작업 */
    const [job, setJob] = useState<typJobInput>(initial);
    /** 제외 패턴 입력 (줄당 하나) */
    const [excludes, setExcludes] = useState(initial.excludes.join("\n"));
    /** rclone 리모트 이름과 종류 */
    const [remotes, setRemotes] = useState<itfRemote[]>([]);
    /** 리모트 목록을 받았는지. 받기 전이나 실패했을 때 "Drive 연결이 없습니다"라고 하지 않는다 */
    const [remotesState, setRemotesState] = useState<"loading" | "loaded" | "failed">("loading");
    /** 저장 요청 중 여부 */
    const [saving, setSaving] = useState(false);
    /** 다음 자동 실행 예정을 셀 기준 시각 (F10). 창을 오래 열어 둬도 지난 시각이 보이지 않게 30초마다 갱신한다 */
    const [openedAt, setOpenedAt] = useState(() => new Date());
    /** 설치된 WSL 배포판 (F24). 없으면 [WSL] 단추를 숨긴다 */
    const [wslDistros, setWslDistros] = useState<string[]>([]);
    /** WSL 폴더 선택 창을 여는 중인 칸. 배포판이 켜지는 동안 다시 누르지 못하게 한다 */
    const [wslOpening, setWslOpening] = useState<"source" | "dest" | null>(null);

    //
    // Effect (부수 효과)
    //
    useEffect(() => {
        const timer = window.setInterval(() => setOpenedAt(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        // 리모트가 없거나 rclone이 없어도 편집은 할 수 있어야 하므로 실패는 조용히 넘긴다.
        unwrap(window.rclonegui.rclone.remotes()).then(
            (list) => {
                setRemotes(list);
                setRemotesState("loaded");
            },
            () => setRemotesState("failed"),
        );
        // WSL이 없는 PC에서는 빈 목록이다.
        unwrap(window.rclonegui.app.wslDistros()).then(setWslDistros, () => setWslDistros([]));
    }, []);

    //
    // 내부 변수
    //
    const excludeLines = f_SplitExcludes(excludes);
    const _V = {
        title: initial.id ? "작업 편집" : "새 작업",
        pathPlaceholder: "폴더 경로 또는 리모트:경로",
        excludeProblem: findExcludeProblem(excludeLines),
        /** 이 작업을 체인으로 이어서 돌리는 작업 이름 (F09). 있으면 자동 실행이 꺼져 있어도 자동 한도가 쓰인다 */
        chainedFrom: allJobs
            .filter((other) => other.id !== job.id && other.schedule.chainNext === job.id)
            .map((other) => other.name),
        /** cron 식이 틀렸으면 그 이유 (F10). main도 같은 검사로 거부하므로 자동 실행을 껐어도 저장을 막는다 */
        cronProblem: job.schedule.cron !== null ? cronProblem(job.schedule.cron) : null,
        excludeCount: `${excludeLines.length} / ${INPUT_LIMITS.excludeCount}줄`,
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
        const folder = await unwrap(window.rclonegui.app.pickFolder(field)).catch(() => null);
        if (folder) f_Patch({ [field]: folder });
    }

    /** WSL 배포판의 맨 위 폴더에서 폴더 선택 창을 연다 (F24). 배포판이 멈춰 있으면 켜지는 동안 몇 초 걸린다 */
    async function h_PickWslFolder(field: "source" | "dest", distro: string) {
        setWslOpening(field);
        const folder = await unwrap(
            window.rclonegui.app.pickFolder({ target: field, wslDistro: distro }),
        ).catch(() => null);
        setWslOpening(null);
        if (folder) f_Patch({ [field]: folder });
    }

    /**
     * 경로 칸 아래 Google Drive 안내.
     * 폴더 웹 주소면 Drive 리모트로 바꾸는 단추, 바꾼 연결 문자열이면 어느 연결인지와 맨 위 sync 경고
     */
    function f_DriveHint(field: "source" | "dest") {
        const value = job[field];
        const folderId = parseDriveFolderUrl(value);
        if (folderId) {
            const drives = remotes.filter((remote) => remote.type === "drive");
            if (remotesState !== "loaded") {
                return (
                    <span className={styles.driveHint}>
                        Google Drive 폴더 주소입니다.{" "}
                        {remotesState === "loading"
                            ? "연결(리모트) 목록을 읽는 중…"
                            : "연결(리모트) 목록을 읽지 못했습니다. rclone 상태를 확인하세요."}
                    </span>
                );
            }
            if (drives.length === 0) {
                return (
                    <span className={styles.driveWarn}>
                        Google Drive 연결(rclone 리모트)이 없습니다. 터미널에서{" "}
                        <code>rclone config create 이름 drive</code>로 만든 뒤 이 창을 다시 여세요.
                    </span>
                );
            }
            return (
                <span className={styles.driveHint}>
                    Google Drive 폴더 주소입니다. 어느 연결로 쓸까요?
                    {drives.map((remote) => (
                        <ZBCButton
                            key={remote.name}
                            variant="link"
                            onClick={() => h_UseDrive(field, remote.name, folderId)}
                        >
                            {remote.name}
                        </ZBCButton>
                    ))}
                </span>
            );
        }
        const drive = parseDriveLocation(value);
        if (!drive) return null;
        return (
            <span className={styles.driveHint}>
                Google Drive 폴더 · 연결 {drive.remote}
                {field === "dest" && drive.subPath === "" && f_DriveRootWarning()}
            </span>
        );
    }

    /**
     * 대상이 Drive 폴더 맨 위일 때의 경고. 백업 설정에 따라 실제로 일어날 일을 쓴다.
     * 백업을 켜면 백업 폴더(.rclonegui-backup)가 대상 안에 생기므로 저장이 거부된다(SR-04 · SR-07)
     */
    function f_DriveRootWarning() {
        if (job.safety.backup) {
            return (
                <span className={styles.driveWarn}>
                    {" "}
                    — 폴더 맨 위는 백업 폴더가 대상 안에 생겨 저장할 수 없습니다. 끝에 하위 폴더 이름을
                    붙이세요 (예: …:백업)
                </span>
            );
        }
        if (job.mode !== "sync") return null;
        return (
            <span className={styles.driveWarn}>
                {" "}
                — 폴더 맨 위로 sync하면 원본에 없는 파일은 백업 없이 지워집니다. 하위 폴더를 쓰려면 끝에
                이름을 붙이세요
            </span>
        );
    }

    /** Drive 폴더 주소를 그 리모트의 연결 문자열로 바꾼다 */
    function h_UseDrive(field: "source" | "dest", remote: string, folderId: string) {
        const location = driveFolderLocation(remote, folderId);
        f_Patch(field === "source" ? { source: location } : { dest: location });
    }

    /** 이 작업만 쓰는 rclone.conf 파일을 고른다 */
    async function h_PickConfig() {
        const file = await unwrap(window.rclonegui.app.pickFile()).catch(() => null);
        if (file) f_Patch({ rcloneConfig: file });
    }

    /** 칸 오른쪽 단추들: [폴더 선택]과 배포판마다 [WSL] */
    function f_Pickers(field: "source" | "dest") {
        return (
            <span className={styles.pickers}>
                <ZBCButton onClick={() => void h_PickFolder(field)} disabled={wslOpening !== null}>
                    폴더 선택
                </ZBCButton>
                {wslDistros.map((distro) => (
                    <ZBCButton
                        key={distro}
                        onClick={() => void h_PickWslFolder(field, distro)}
                        disabled={wslOpening !== null}
                        title={`\\\\wsl.localhost\\${distro}\\ 에서 폴더 선택`}
                    >
                        {wslOpening === field
                            ? "WSL 여는 중…"
                            : wslDistros.length === 1
                              ? "WSL"
                              : `WSL: ${distro}`}
                    </ZBCButton>
                ))}
            </span>
        );
    }

    /** 자동 실행 설정의 일부 값을 바꾼다 (F10) */
    function f_PatchSchedule(value: Partial<typJobInput["schedule"]>) {
        setJob((current) => ({ ...current, schedule: { ...current.schedule, ...value } }));
    }

    /** 다음 자동 실행 예정 시각 3개 (미리 보기). 식이 틀리면 빈 목록 */
    function f_NextRuns() {
        const times: Date[] = [];
        let after = openedAt;
        try {
            for (let i = 0; i < 3; i += 1) {
                const at = nextScheduleTime(job.schedule, after);
                if (!at) break;
                times.push(at);
                after = at;
            }
        } catch {
            return [];
        }
        return times;
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
            excludes: excludeLines,
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
                    <ZBCButton
                        variant="primary"
                        onClick={() => void h_Submit()}
                        disabled={saving || _V.excludeProblem !== null || _V.cronProblem !== null}
                    >
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
                        maxLength={INPUT_LIMITS.jobName}
                        placeholder="예: 프로젝트: WSL → E"
                        autoFocus
                    />
                </ZBCField>
                {groups.length > 0 && (
                    <ZBCField label="그룹" hint="작업 목록에서 묶어 보는 곳입니다. 실행에는 영향이 없습니다.">
                        <select
                            className={styles.select}
                            aria-label="그룹"
                            value={job.groupId ?? ""}
                            onChange={(event) => f_Patch({ groupId: event.target.value || null })}
                        >
                            <option value="">그룹 없음</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </ZBCField>
                )}

                <ZBCField label="원본" action={f_Pickers("source")} hint={f_DriveHint("source")}>
                    <ZBCInput
                        aria-label="원본"
                        value={job.source}
                        onChange={(source) => f_Patch({ source })}
                        maxLength={INPUT_LIMITS.path}
                        placeholder={_V.pathPlaceholder}
                    />
                </ZBCField>

                <ZBCField
                    label="대상"
                    action={f_Pickers("dest")}
                    hint={
                        (f_DriveHint("dest") !== null || remotes.length > 0) && (
                            <>
                                {f_DriveHint("dest")}
                                {remotes.length > 0 && (
                                    <span className={styles.remotes}>
                                        리모트:
                                        {remotes.map((remote) => (
                                            <ZBCButton
                                                key={remote.name}
                                                variant="link"
                                                onClick={() => f_Patch({ dest: remote.name })}
                                            >
                                                {remote.name}
                                            </ZBCButton>
                                        ))}
                                    </span>
                                )}
                            </>
                        )
                    }
                >
                    <ZBCInput
                        aria-label="대상"
                        value={job.dest}
                        onChange={(dest) => f_Patch({ dest })}
                        maxLength={INPUT_LIMITS.path}
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

                <ZBCField label="동기화 범위">
                    <div className={styles.modes}>
                        {SCOPES.map(([scope, label]) => (
                            <ZBCCheck
                                key={scope}
                                type="radio"
                                checked={job.options.scope === scope}
                                onChange={() => f_PatchOptions({ scope })}
                            >
                                {label}
                            </ZBCCheck>
                        ))}
                    </div>
                    {job.mode === "sync" && (
                        <div className={styles.note}>
                            sync는 범위와 상관없이 대상에만 있는 폴더를 비어 있으면 지웁니다. 파일이 든 폴더는
                            남깁니다. 비교 결과에 미리 보여줍니다.
                        </div>
                    )}
                </ZBCField>

                <ZBCField
                    label="제외 패턴 (한 줄에 하나)"
                    hint={
                        _V.excludeProblem === null ? (
                            _V.excludeCount
                        ) : (
                            <span className={styles.warning}>{_V.excludeProblem}</span>
                        )
                    }
                >
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
                    <ZBCCheck
                        checked={job.options.readDetails}
                        onChange={(readDetails) => f_PatchOptions({ readDetails })}
                    >
                        비교할 때 크기 · 수정 시각 읽기 (리모트는 느려질 수 있음)
                    </ZBCCheck>
                </div>

                <fieldset className={styles.safety}>
                    <legend className={styles.safetyTitle}>자동 실행 (앱이 켜져 있는 동안)</legend>
                    <ZBCCheck
                        checked={job.schedule.enabled}
                        onChange={(enabled) => f_PatchSchedule({ enabled })}
                    >
                        정해진 때에 비교하고, 삭제가 자동 한도 이하일 때만 동기화
                    </ZBCCheck>
                    {initial.schedule.paused && (
                        <div className={styles.warning}>
                            자동 실행이 멈춰 있습니다: {initial.schedule.paused.reason}. 저장해도 풀리지
                            않습니다. 작업 화면의 [다시 켜기]로 다시 켭니다.
                        </div>
                    )}
                    {!job.schedule.enabled && _V.cronProblem !== null && (
                        <div className={styles.warning}>
                            cron 식이 틀려 저장할 수 없습니다: {_V.cronProblem}. 자동 실행을 켜서 고치거나
                            간격으로 바꾸세요.
                        </div>
                    )}
                    {job.schedule.enabled && (
                        <>
                            <div className={styles.modes}>
                                <ZBCCheck
                                    type="radio"
                                    checked={job.schedule.cron === null}
                                    onChange={() => f_PatchSchedule({ cron: null })}
                                >
                                    간격
                                </ZBCCheck>
                                <ZBCCheck
                                    type="radio"
                                    checked={job.schedule.cron !== null}
                                    onChange={() =>
                                        f_PatchSchedule({ cron: job.schedule.cron ?? "0 * * * *" })
                                    }
                                >
                                    cron 식 (분 시 일 월 요일)
                                </ZBCCheck>
                            </div>
                            {job.schedule.cron === null ? (
                                <ZBCField label="몇 분마다">
                                    <ZBCInput
                                        aria-label="자동 실행 간격(분)"
                                        type="number"
                                        min={1}
                                        max={10080}
                                        value={job.schedule.everyMinutes}
                                        onChange={(text) =>
                                            f_PatchSchedule({ everyMinutes: f_ToNumber(text, 30) })
                                        }
                                    />
                                </ZBCField>
                            ) : (
                                <ZBCField
                                    label="cron 식"
                                    hint={
                                        _V.cronProblem === null ? (
                                            "예: 0 * * * * (매시 정각), */30 9-18 * * 1-5 (평일 9~18시 30분마다)"
                                        ) : (
                                            <span className={styles.warning}>{_V.cronProblem}</span>
                                        )
                                    }
                                >
                                    <ZBCInput
                                        aria-label="cron 식"
                                        value={job.schedule.cron}
                                        maxLength={100}
                                        onChange={(cron) => f_PatchSchedule({ cron })}
                                    />
                                </ZBCField>
                            )}
                            <div className={styles.note}>
                                다음 예정:{" "}
                                {f_NextRuns()
                                    .map((at) => formatDateTime(at.toISOString()))
                                    .join(" · ") || "없음"}
                                . 앱이 꺼져 있던 동안의 차례는 건너뜁니다.
                            </div>
                        </>
                    )}
                    {(job.schedule.enabled || _V.chainedFrom.length > 0) && (
                        <>
                            {!job.schedule.enabled && (
                                <div className={styles.note}>
                                    자동 실행은 꺼져 있지만 {_V.chainedFrom.join(", ")}에 이어서 자동으로
                                    돕니다. 이때 아래 한도로 판단합니다.
                                </div>
                            )}
                            <ZBCField label="자동 실행의 삭제 한도 (넘으면 실행하지 않고 멈춤)">
                                <ZBCInput
                                    aria-label="자동 삭제 한도"
                                    type="number"
                                    min={0}
                                    max={1000000}
                                    value={job.safety.autoMaxDelete}
                                    onChange={(text) =>
                                        f_PatchSafety({ autoMaxDelete: f_ToNumber(text, 50) })
                                    }
                                />
                            </ZBCField>
                        </>
                    )}
                    <ZBCField
                        label="이 작업이 성공하면 이어서 (체인)"
                        hint="이 작업의 자동 실행이 성공하거나 바뀔 것이 없을 때만 이어서 돕니다. 실패하거나 멈추면 이어서 돌지 않습니다. 수동 실행 뒤에는 [이어서] 단추로 비교를 시작합니다."
                    >
                        <select
                            className={styles.select}
                            aria-label="이어서 실행할 작업"
                            value={job.schedule.chainNext ?? ""}
                            onChange={(event) => f_PatchSchedule({ chainNext: event.target.value || null })}
                        >
                            <option value="">없음</option>
                            {allJobs
                                .filter((other) => other.id !== job.id)
                                .map((other) => (
                                    <option key={other.id} value={other.id}>
                                        {other.name}
                                    </option>
                                ))}
                        </select>
                    </ZBCField>
                </fieldset>

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

                <ZBCField
                    label="이 작업만 쓰는 rclone.conf 파일"
                    action={<ZBCButton onClick={() => void h_PickConfig()}>파일 선택</ZBCButton>}
                    hint="rclone.conf 파일 경로입니다(예: D:\설정\work.conf). 이 작업에서만 다른 리모트 설정을 쓸 때 지정합니다. 비워 두면 설정 창의 위치를, 그것도 비어 있으면 rclone 기본 위치를 씁니다. 앱은 이 파일을 열지 않고 경로만 rclone에 넘깁니다."
                >
                    <ZBCInput
                        aria-label="작업 전용 rclone.conf"
                        value={job.rcloneConfig ?? ""}
                        onChange={(text) => f_Patch({ rcloneConfig: text.trim() === "" ? null : text })}
                        placeholder="비워 둠"
                        maxLength={INPUT_LIMITS.path}
                    />
                </ZBCField>
            </div>
        </ZBCModal>
    );
}
