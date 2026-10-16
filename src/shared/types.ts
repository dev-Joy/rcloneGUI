/**
 *  Types
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - main과 renderer가 함께 쓰는 타입과 작은 계산 함수
 */

/**
 *  External imports
 */
import type { z } from "zod";

/**
 *  Internal imports
 */
import type {
    jobInputSchema,
    jobSchema,
    pickFolderInputSchema,
    pickFolderSchema,
    settingsSchema,
} from "./schemas";

/**
 *  Types 정의
 */
export type typJob = z.infer<typeof jobSchema>;

export type typJobInput = z.infer<typeof jobInputSchema>;

export type typSettings = z.infer<typeof settingsSchema>;

export type typPickFolderTarget = z.infer<typeof pickFolderSchema>;

export type typPickFolderInput = z.infer<typeof pickFolderInputSchema>;

/** 앱 정보 (F12) */
export interface itfAppInfo {
    version: string;
    /** 설치본으로 실행 중인지 (개발 실행이면 false) */
    packaged: boolean;
    /** Windows에 실제로 등록된 로그인 시 시작 여부 */
    openAtLogin: boolean;
}

/** combined 파일의 기호를 뜻으로 옮긴 것. add(+) change(*) delete(-) same(=) error(!) */
export type typItemStatus = "add" | "change" | "delete" | "same" | "error";

/** 작업 그룹 (F21) */
export interface itfGroup {
    id: string;
    name: string;
}

/** 한쪽 파일의 크기와 수정 시각 (rclone lsjson, F11) */
export interface itfFileSide {
    size: number;
    /** RFC 3339, rclone이 준 그대로 */
    modTime: string;
}

export interface itfFileItem {
    path: string;
    status: typItemStatus;
    /** 원본 쪽 상세. 필드가 없으면 모름(읽지 않았거나 실패), null이면 원본에 없음 */
    source?: itfFileSide | null;
    /** 대상 쪽 상세. 의미는 source와 같다 */
    dest?: itfFileSide | null;
    /**
     * 폴더 작업 항목 (F25). add = 폴더 만듦, delete = 대상에만 있는 폴더(비어 있으면 지움),
     * same = 실행 뒤에도 남은 폴더(파일이 들어 있었음). 파일 건수 · 삭제 수에 넣지 않는다
     */
    isDir?: boolean;
    /** 화면용 표시 (F22 기타 보기). excluded = 필터에 걸려 비교에서 빠짐, pending = 할 일이었는데 실행에서 처리되지 않음 */
    note?: "excluded" | "pending";
}

/** 제외된 파일 하나 (F22). 필터 없이 읽은 목록에만 있는 파일 */
export interface itfExcludedItem {
    path: string;
    /** 원본 쪽 크기 · 수정 시각. 원본에 없으면 null */
    source: itfFileSide | null;
    dest: itfFileSide | null;
}

/** 비교 결과 목록의 보기 (F22). status는 상태 칩 필터 */
export type typListView = "status" | "included" | "excluded" | "new" | "pending";

/** 동기화 범위 (F25). files 파일만, all 파일과 원본의 빈 폴더, folders 폴더 구조만 */
export type typSyncScope = "files" | "all" | "folders";

/**
 * 폴더 작업 수 (F25). rclone의 remove directory는 "지우기 시도"라 비어 있지 않은 폴더는 남는다 (rclone-notes P6).
 * 미리보기와 리모트 대상 실행은 verified = false (remove는 시도 수). 로컬 대상 실행은 실제로 사라졌는지 확인해 remove와 kept로 나눈다.
 */
export interface itfDirCounts {
    make: number;
    remove: number;
    /** 지우기를 시도했지만 남은 폴더 수 (verified일 때만 의미가 있다) */
    kept: number;
    /** remove · kept가 실제 확인 결과인지 */
    verified: boolean;
}

/** 미리보기 뒤 크기 · 수정 시각을 읽는 동안의 메타 메시지. 화면 배너가 이 단계를 알아본다 */
export const DETAILS_READING_MESSAGE = "크기 · 수정 시각 읽는 중";

/** 미리보기 뒤 크기 · 수정 시각 읽기 결과. read 읽음, failed 실패, off 옵션 꺼짐 */
export type typDetailsState = "read" | "failed" | "off";

export type typCounts = Record<typItemStatus, number>;

export type typRunKind = "preview" | "execute";

export type typRunStatus = "queued" | "running" | "success" | "failed" | "canceled";

/** 미리보기는 성공했지만 실행을 막아야 하는 이유 */
export type typBlockReason = "EMPTY_SOURCE";

export interface itfRunMeta {
    runId: string;
    jobId: string;
    kind: typRunKind;
    status: typRunStatus;
    exitCode: number | null;
    counts: typCounts;
    startedAt: string;
    endedAt: string | null;
    /** 미리보기 때의 작업 설정 지문. 설정이 바뀌면 미리보기는 무효다. */
    jobHash: string;
    /** 터미널에 그대로 붙여 넣을 수 있는 명령 */
    command: string;
    mode: typJob["mode"];
    backupDir: string | null;
    previewRunId: string | null;
    blocked: typBlockReason | null;
    /** 사람이 읽는 결과 한 줄 */
    message: string;
    /** rclone이 error 수준으로 남긴 줄 (앞에서부터 일부) */
    errors: string[];
    /** 크기 · 수정 시각 읽기 결과 (F11). 실행 기록과 예전 기록은 null */
    details: typDetailsState | null;
    /** 폴더 만듦 · 빈 폴더 지움 수 (F25). 예전 기록은 null */
    dirs: itfDirCounts | null;
    /** 누가 시작했는지 (F10). 예전 기록은 manual */
    trigger: typRunTrigger;
    /** 미리보기 때의 용량 (F20). 실행 기록 · 예전 기록 · 실패한 미리보기는 null */
    space: itfRunSpace | null;
}

/** 한쪽 드라이브(또는 리모트)의 용량 (F20, rclone about). 백엔드가 주지 않은 값은 null */
export interface itfSpace {
    total: number | null;
    used: number | null;
    free: number | null;
}

/** 미리보기 때의 용량 (F20). 읽지 못한 쪽은 null */
export interface itfRunSpace {
    source: itfSpace | null;
    dest: itfSpace | null;
    /** 옮길 파일 크기 합 (미리보기 통계 totalBytes) */
    transferBytes: number;
}

/** 대상 여유가 옮길 크기보다 작은지 (F20). 알 수 없으면 false */
export function isDestTooSmall(space: itfRunSpace | null): boolean {
    const free = space?.dest?.free;
    return space !== null && free !== null && free !== undefined && free < space.transferBytes;
}

/** 실행을 시작한 쪽. manual 사람이 누름, schedule 자동 실행 (F10) */
export type typRunTrigger = "manual" | "schedule";

export interface itfProgress {
    bytes: number;
    totalBytes: number;
    transfers: number;
    totalTransfers: number;
    checks: number;
    totalChecks: number;
    deletes: number;
    errors: number;
    /** 남은 초. 모르면 null */
    eta: number | null;
    /** 초당 바이트 */
    speed: number;
}

export type typRunEvent =
    | { runId: string; jobId: string; type: "started"; payload: itfRunMeta }
    | { runId: string; jobId: string; type: "progress"; payload: itfProgress }
    | { runId: string; jobId: string; type: "done"; payload: itfRunMeta };

export interface itfRcloneStatus {
    path: string | null;
    version: string | null;
    hasCombined: boolean;
    /** 쓸 수 없을 때의 안내 문구 */
    problem: string | null;
}

export interface itfJobCommands {
    preview: string;
    /** 실행 명령. 삭제 한도와 실행 ID는 실행 시점에 정해지므로 자리표시자로 보여준다. */
    execute: string;
}

export interface itfIpcError {
    code: string;
    message: string;
}

export type typResult<T> = { ok: true; data: T } | { ok: false; error: itfIpcError };

/**
 *  메인 클래스 / export 함수
 */
export const emptyCounts = (): typCounts => ({ add: 0, change: 0, delete: 0, same: 0, error: 0 });

/** 실행하면 대상에서 실제로 지워질 파일 수. copy는 대상에만 있는 파일을 그대로 둔다. */
export const plannedDeletes = (run: Pick<itfRunMeta, "mode" | "counts">): number =>
    run.mode === "sync" ? run.counts.delete : 0;

/** 원본으로 덮어쓸 파일인데 대상이 원본보다 나중에 고쳐졌는지 (F11). 상세가 없으면 false */
export function isDestNewer(item: itfFileItem): boolean {
    if (item.status !== "change" || !item.source || !item.dest) return false;
    return Date.parse(item.dest.modTime) > Date.parse(item.source.modTime);
}

/** 미리보기가 유효한 시간 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

/**
 *  실행 명령에 영향을 주는 작업 설정만 모은다. main의 설정 지문(jobHash)과 화면의 미리보기 무효 판단이 같은 값을 본다.
 *  이름 · 그룹 · 자동 실행처럼 명령을 바꾸지 않는 값은 넣지 않는다 (F21).
 */
export function runSettingsOf(job: typJobInput, defaultConfig: string | null): Record<string, unknown> {
    return {
        mode: job.mode,
        source: job.source,
        dest: job.dest,
        excludes: job.excludes,
        options: job.options,
        backup: job.safety.backup,
        allowIgnoreErrors: job.safety.allowIgnoreErrors,
        config: job.rcloneConfig ?? defaultConfig,
    };
}

/** 두 작업 설정이 같은 명령을 만드는지. 다르면 이전 미리보기로 실행할 수 없다 */
export function sameRunSettings(a: typJobInput, b: typJobInput): boolean {
    return JSON.stringify(runSettingsOf(a, null)) === JSON.stringify(runSettingsOf(b, null));
}
