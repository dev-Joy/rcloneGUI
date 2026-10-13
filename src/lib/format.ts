/**
 *  Format
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - 화면에 쓰는 숫자·시각·상태 문구 변환
 */

/**
 *  Internal imports
 */
import {
    plannedDeletes,
    type itfRunMeta,
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

/** "대상에 12개 복사, 3개 덮어씀, 1개 삭제"처럼 일어날 일을 적는다. */
export function describeChanges(run: Pick<itfRunMeta, "mode" | "counts">): string {
    const parts: string[] = [];
    if (run.counts.add > 0) parts.push(`${run.counts.add}개 복사`);
    if (run.counts.change > 0) parts.push(`${run.counts.change}개 덮어씀`);
    const deletes = plannedDeletes(run);
    if (deletes > 0) parts.push(`${deletes}개 삭제`);
    return parts.length > 0 ? `대상에 ${parts.join(", ")}` : "바뀔 것 없음";
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
