/**
 *  List views
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 비교 결과 목록의 "기타" 보기 계산 (F22): 새로 생김 · 아직 실행되지 않음 · 제외됨
 *      - DOM · React와 무관한 순수 함수
 */

/**
 *  Internal imports
 */
import type { itfExcludedItem, itfFileItem, itfRunMeta, typItemStatus, typListView } from "@/shared/types";

/**
 *  Types 정의
 */
/** 원본 쪽에 파일이 있다는 뜻의 상태. delete는 대상에만 있는 파일이다 */
const SOURCE_SIDE: ReadonlySet<typItemStatus> = new Set(["add", "change", "same", "error"]);

/**
 *  메인 클래스 / export 함수
 */
/**
 * "새로 생김"의 기준 실행: 이 미리보기보다 먼저 끝난 마지막 성공한 실제 동기화.
 * history는 최근 실행부터다. 없으면 null
 */
export function baselineExecute(history: readonly itfRunMeta[], preview: itfRunMeta): itfRunMeta | null {
    const startedAt = Date.parse(preview.startedAt);
    return (
        history.find(
            (run) =>
                run.kind === "execute" &&
                run.status === "success" &&
                run.previewRunId !== null &&
                run.endedAt !== null &&
                Date.parse(run.endedAt) <= startedAt,
        ) ?? null
    );
}

/** 이 미리보기의 추가 파일 중 기준 미리보기의 원본 쪽에 없던 파일. 대상에서 지워져 다시 복사되는 파일은 빠진다 */
export function newSince(items: readonly itfFileItem[], baseline: readonly itfFileItem[]): itfFileItem[] {
    const known = new Set(
        baseline.filter((item) => !item.isDir && SOURCE_SIDE.has(item.status)).map((item) => item.path),
    );
    return items.filter((item) => !item.isDir && item.status === "add" && !known.has(item.path));
}

/**
 * 미리보기에서 할 일(추가 · 변경, sync면 삭제)이었는데 실행 목록에 같은 상태로 나오지 않은 파일.
 * 미리보기의 상태를 그대로 두고 note: "pending"을 단다
 */
export function pendingAfter(
    preview: readonly itfFileItem[],
    executed: readonly itfFileItem[],
    mode: itfRunMeta["mode"],
): itfFileItem[] {
    const done = new Map(executed.filter((item) => !item.isDir).map((item) => [item.path, item.status]));
    return preview
        .filter(
            (item) =>
                !item.isDir &&
                (item.status === "add" ||
                    item.status === "change" ||
                    (item.status === "delete" && mode === "sync")) &&
                done.get(item.path) !== item.status,
        )
        .map((item) => ({ ...item, note: "pending" }));
}

/** 제외된 파일을 목록 · 트리에 그릴 항목으로. 상태는 회색(같음)으로 두고 note로 구분한다 */
export function excludedItems(excluded: readonly itfExcludedItem[]): itfFileItem[] {
    return excluded.map((item) => ({
        path: item.path,
        status: "same",
        source: item.source,
        dest: item.dest,
        note: "excluded",
    }));
}

/** 보기를 이 실행에서 쓸 수 없으면 그 이유, 쓸 수 있으면 null. status · included는 늘 쓸 수 있다 */
export function viewProblem(
    view: typListView,
    run: itfRunMeta,
    history: readonly itfRunMeta[],
): string | null {
    switch (view) {
        case "excluded":
            return run.kind === "preview" && run.status === "success" ? null : "성공한 미리보기에서만";
        case "new":
            if (run.kind !== "preview") return "미리보기에서만";
            return baselineExecute(history, run) ? null : "앞선 실제 동기화가 없음";
        case "pending":
            if (run.kind !== "execute" || run.previewRunId === null) return "실제 동기화 기록에서만";
            return run.status === "queued" || run.status === "running" ? "실행이 끝난 뒤" : null;
        default:
            return null;
    }
}
