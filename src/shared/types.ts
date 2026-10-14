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
import type { jobInputSchema, jobSchema, settingsSchema } from "./schemas";

/**
 *  Types 정의
 */
export type typJob = z.infer<typeof jobSchema>;

export type typJobInput = z.infer<typeof jobInputSchema>;

export type typSettings = z.infer<typeof settingsSchema>;

/** combined 파일의 기호를 뜻으로 옮긴 것. add(+) change(*) delete(-) same(=) error(!) */
export type typItemStatus = "add" | "change" | "delete" | "same" | "error";

export interface itfFileItem {
    path: string;
    status: typItemStatus;
}

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
}

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

/** 미리보기가 유효한 시간 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;
