/**
 *  Ipc contract
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - IPC 채널 이름과 window.rclonegui API 계약
 */

/**
 *  Internal imports
 */
import type {
    itfExcludedItem,
    itfRemote,
    typConfigCheck,
    itfFileItem,
    typJob,
    itfJobCommands,
    typJobInput,
    itfRcloneStatus,
    typResult,
    typRunEvent,
    itfRunMeta,
    typPickFolderInput,
    itfAppInfo,
    itfGroup,
    typSettings,
} from "./types";

/**
 *  Types 정의
 */
export interface itfExecuteInput {
    jobId: string;
    previewRunId: string;
    confirmedDeletes: number;
}

export interface itfRunRef {
    jobId: string;
    runId: string;
}

export interface itfRcloneGuiApi {
    jobs: {
        list(): Promise<typResult<typJob[]>>;
        save(job: typJobInput): Promise<typResult<typJob>>;
        delete(jobId: string): Promise<typResult<null>>;
        /** 스스로 멈춘 자동 실행을 다시 켠다 (F10) */
        resumeSchedule(jobId: string): Promise<typResult<typJob>>;
        /** 자동 실행기가 센 작업별 다음 실행 시각(ISO). 아직 모르면 null */
        nextRuns(): Promise<typResult<Record<string, string | null>>>;
        /** 이번 실행에서 뺀 항목을 바꾼다 (F23). 바꾸면 그 전 미리보기로는 실행할 수 없다 (SR-13) */
        setSkip(input: { jobId: string; skip: string[] }): Promise<typResult<typJob>>;
        /** main이 작업을 바꿨을 때 (자동 실행 멈춤 등). 화면은 목록을 다시 읽는다 */
        onChanged(listener: () => void): () => void;
    };
    groups: {
        list(): Promise<typResult<itfGroup[]>>;
        /** id가 없으면 새로 만들고, 있으면 이름을 바꾼다 */
        save(input: { id?: string; name: string }): Promise<typResult<itfGroup>>;
        /** 그룹을 지우고 그 그룹의 작업은 "그룹 없음"으로 옮긴다 */
        delete(groupId: string): Promise<typResult<null>>;
    };
    rclone: {
        status(): Promise<typResult<itfRcloneStatus>>;
        /** 리모트 이름과 종류. Drive 폴더 주소를 연결 문자열로 바꿀 때 drive 종류를 고른다 */
        remotes(): Promise<typResult<itfRemote[]>>;
    };
    run: {
        /** 시작 즉시 실행 ID를 돌려주고, 진행은 onEvent로 알린다. */
        preview(jobId: string): Promise<typResult<string>>;
        /** 미리보기 실행 ID와 확인한 삭제 수 없이는 실제 동기화를 시작할 수 없다. */
        execute(input: itfExecuteInput): Promise<typResult<string>>;
        cancel(runId: string): Promise<typResult<null>>;
        command(jobId: string): Promise<typResult<itfJobCommands>>;
        onEvent(listener: (event: typRunEvent) => void): () => void;
    };
    runs: {
        list(jobId: string): Promise<typResult<itfRunMeta[]>>;
        items(ref: itfRunRef): Promise<typResult<itfFileItem[]>>;
        /** 성공한 미리보기에서 필터에 걸려 빠진 파일 (F22). 요청할 때만 계산하고 실행 폴더에 남긴다 */
        excluded(ref: itfRunRef): Promise<typResult<itfExcludedItem[]>>;
        /** 기록의 rclone.conf 지문과 지금 파일 비교. 경로는 기록에서 꺼낸다 */
        configCheck(ref: itfRunRef): Promise<typResult<typConfigCheck>>;
    };
    settings: {
        get(): Promise<typResult<typSettings>>;
        save(settings: typSettings): Promise<typResult<typSettings>>;
    };
    app: {
        pickFolder(input: typPickFolderInput): Promise<typResult<string | null>>;
        /** 설치된 WSL 배포판 (F24). WSL이 없으면 빈 목록 */
        wslDistros(): Promise<typResult<string[]>>;
        pickFile(): Promise<typResult<string | null>>;
        copyText(text: string): Promise<typResult<null>>;
        /** 버전 · 설치본 여부 · 로그인 시 시작 실제 값 (F12) */
        info(): Promise<typResult<itfAppInfo>>;
        open(ref: itfRunRef & { target: "runDir" | "backupDir" }): Promise<typResult<null>>;
    };
}

/**
 *  메인 클래스 / export 함수
 */
// IPC 채널과 타입은 이 파일에만 정의한다. preload가 가져다 쓰므로 런타임 의존성을 두지 않는다.
export const CHANNELS = {
    jobsList: "jobs:list",
    jobsSave: "jobs:save",
    jobsDelete: "jobs:delete",
    jobsResumeSchedule: "jobs:resume-schedule",
    jobsNextRuns: "jobs:next-runs",
    jobsSetSkip: "jobs:set-skip",
    jobsChanged: "jobs:changed",
    groupsList: "groups:list",
    groupsSave: "groups:save",
    groupsDelete: "groups:delete",
    rcloneStatus: "rclone:status",
    rcloneRemotes: "rclone:remotes",
    runPreview: "run:preview",
    runExecute: "run:execute",
    runCancel: "run:cancel",
    runCommand: "run:command",
    runsList: "runs:list",
    runsItems: "runs:items",
    runsExcluded: "runs:excluded",
    runsConfigCheck: "runs:config-check",
    settingsGet: "settings:get",
    settingsSave: "settings:save",
    appPickFolder: "app:pick-folder",
    appPickFile: "app:pick-file",
    appWslDistros: "app:wsl-distros",
    appInfo: "app:info",
    appCopyText: "app:copy-text",
    appOpen: "app:open",
    runEvent: "run:event",
} as const;
