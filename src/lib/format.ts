/**
 *  Format
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 화면에 쓰는 숫자·시각·상태 문구 변환
 */

/**
 *  Internal imports
 */
import {
    plannedDeletes,
    type itfFileItem,
    type itfRunMeta,
    type itfSpace,
    type typCounts,
    type typItemStatus,
    type typJob,
} from "@/shared/types";

/**
 *  메인 클래스 / export 함수
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatSeconds(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s}초`;
    if (s < 3600) return `${Math.floor(s / 60)}분 ${s % 60}초`;
    return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}

export function formatDateTime(iso: string): string {
    const d = new Date(iso);
    const f_Pad = (n: number): string => String(n).padStart(2, "0");
    return (
        `${f_Pad(d.getMonth() + 1)}-${f_Pad(d.getDate())} ` +
        `${f_Pad(d.getHours())}:${f_Pad(d.getMinutes())}:${f_Pad(d.getSeconds())}`
    );
}

export function formatDuration(run: itfRunMeta): string {
    if (!run.endedAt) return "";
    return formatSeconds((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
}

export const STATUS_NAMES: Record<typItemStatus, string> = {
    add: "추가",
    change: "변경",
    delete: "삭제",
    same: "같음",
    error: "오류",
};

/** 상태 칩에 쓰는 이름. copy에서 대상에만 있는 파일은 지워지지 않으므로 다르게 부른다. */
export function chipName(status: typItemStatus, mode: typJob["mode"]): string {
    return status === "delete" && mode === "copy" ? "대상에만" : STATUS_NAMES[status];
}

/** 목록 가운데 열: 이 파일에 무슨 일이 일어나는지(미리보기) 또는 일어났는지(실행) */
export function actionLabel(
    status: typItemStatus,
    run: Pick<itfRunMeta, "kind" | "mode" | "backupDir">,
    backup: boolean,
): string {
    const done = run.kind === "execute";
    switch (status) {
        case "add":
            return done ? "복사함" : "새로 복사";
        case "change":
            return done ? "덮어씀" : "원본으로 덮어씀";
        case "delete":
            if (run.mode === "copy") return "그대로 둠";
            if (done) return run.backupDir ? "백업으로 옮김" : "삭제함";
            return backup ? "삭제 → 백업" : "삭제";
        case "same":
            return "같음";
        case "error":
            return done ? "실패" : "읽기 오류";
    }
}

/** 실행하면 대상에서 바뀌는 파일 수 */
export function changeTotal(run: Pick<itfRunMeta, "mode" | "counts">): number {
    return run.counts.add + run.counts.change + plannedDeletes(run);
}

/** 폴더 작업 수 (F25). 예전 기록은 0 */
export function dirTotal(run: Pick<itfRunMeta, "dirs">): number {
    return run.dirs ? run.dirs.make + run.dirs.remove : 0;
}

/** 실행하면 대상에서 바뀌는 것이 있는지 (파일 또는 폴더) */
export function hasChanges(run: Pick<itfRunMeta, "mode" | "counts" | "dirs">): boolean {
    return changeTotal(run) + dirTotal(run) > 0;
}

/**
 * 폴더 작업 한 줄. 없으면 빈 문자열.
 * rclone은 대상에만 있는 폴더를 "지우기 시도"하고 비어 있지 않으면 남긴다(rclone-notes P6). 확인한 실행만 "지움"이라고 쓴다.
 */
export function describeDirs(run: Pick<itfRunMeta, "dirs">): string {
    if (!run.dirs) return "";
    const parts: string[] = [];
    if (run.dirs.make > 0) parts.push(`폴더 ${run.dirs.make}개 만듦`);
    if (run.dirs.verified) {
        if (run.dirs.remove > 0) parts.push(`빈 폴더 ${run.dirs.remove}개 지움`);
        if (run.dirs.kept > 0) parts.push(`폴더 ${run.dirs.kept}개 남김(파일이 있음)`);
    } else if (run.dirs.remove > 0) {
        parts.push(`대상에만 있는 폴더 ${run.dirs.remove}개(비어 있으면 지움)`);
    }
    return parts.join(", ");
}

/** "대상에 12개 복사, 3개 덮어씀, 1개 삭제, 폴더 2개 만듦"처럼 일어날 일을 적는다. */
export function describeChanges(run: Pick<itfRunMeta, "mode" | "counts" | "dirs">): string {
    const parts: string[] = [];
    if (run.counts.add > 0) parts.push(`${run.counts.add}개 복사`);
    if (run.counts.change > 0) parts.push(`${run.counts.change}개 덮어씀`);
    const deletes = plannedDeletes(run);
    if (deletes > 0) parts.push(`${deletes}개 삭제`);
    const dirs = describeDirs(run);
    if (dirs) parts.push(dirs);
    return parts.length > 0 ? `대상에 ${parts.join(", ")}` : "바뀔 것 없음";
}

/** 목록 가운데 열 문구. 폴더 작업(F25)과 기타 보기의 표시(F22)까지 다룬다 */
export function itemActionLabel(
    item: Pick<itfFileItem, "status" | "isDir" | "note">,
    run: Pick<itfRunMeta, "kind" | "mode" | "backupDir" | "dirs">,
    backup: boolean,
): string {
    if (item.note === "excluded") return "제외됨 · 건드리지 않음";
    const label = item.isDir ? dirActionLabel(item.status, run) : actionLabel(item.status, run, backup);
    return item.note === "pending" ? `${label} · 처리 안 됨` : label;
}

/** 폴더 항목의 일어날 일 (F25). 확인하지 못한 지우기는 "비어 있으면"을 붙인다 */
export function dirActionLabel(status: typItemStatus, run: Pick<itfRunMeta, "kind" | "dirs">): string {
    const done = run.kind === "execute";
    if (status === "add") return done ? "폴더 만듦" : "폴더 만들기";
    if (status === "same") return "남김 (파일이 있음)";
    if (!done) return "대상에만 있음 · 비어 있으면 지움";
    return run.dirs?.verified ? "빈 폴더 지움" : "지우기 시도 (비어 있을 때만)";
}

export function countsLine(counts: typCounts, mode: typJob["mode"]): string {
    return (["add", "change", "delete", "same", "error"] as const)
        .filter((s) => counts[s] > 0)
        .map((s) => `${chipName(s, mode)} ${counts[s]}`)
        .join(" · ");
}

export const RUN_STATUS_NAMES: Record<itfRunMeta["status"], string> = {
    queued: "대기",
    running: "실행 중",
    success: "성공",
    failed: "실패",
    canceled: "취소",
};

/** 예외를 화면에 보여줄 한 줄로 */
export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** 한쪽 용량 한 줄 (F20). "여유 468 GB / 전체 512 GB". 모르면 "용량 확인 불가" */
export function describeSpace(space: itfSpace | null): string {
    if (!space || (space.free === null && space.total === null)) return "용량 확인 불가";
    const parts: string[] = [];
    if (space.free !== null) parts.push(`여유 ${formatBytes(space.free)}`);
    if (space.total !== null) parts.push(`전체 ${formatBytes(space.total)}`);
    return parts.join(" / ");
}
