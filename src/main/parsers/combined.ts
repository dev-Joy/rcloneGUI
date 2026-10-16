/**
 *  Combined
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - rclone --combined 출력 파서
 */

/**
 *  Internal imports
 */
import { emptyCounts, type typCounts, type itfFileItem, type typItemStatus } from "@/shared/types";

/**
 *  Types 정의
 */
const SYMBOLS: Record<string, typItemStatus> = {
    "+": "add",
    "*": "change",
    "-": "delete",
    "=": "same",
    "!": "error",
};

/**
 *  메인 클래스 / export 함수
 */
/** `+ path` 한 줄을 읽는다. 형식이 아니면 null. */
export function parseCombinedLine(line: string): itfFileItem | null {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (text.length < 3 || text[1] !== " ") return null;
    const status = SYMBOLS[text[0]];
    if (!status) return null;
    return { path: text.slice(2), status };
}

/**
 * rclone --combined 출력 전체를 파일 상태 목록으로 바꾼다.
 * 실제 실행에서는 삭제에 실패한 파일이 `- path` 뒤에 `! path`로 한 번 더 나오므로
 * 같은 경로는 한 줄로 합치고, 오류가 있으면 오류를 남긴다.
 */
export function parseCombined(text: string): itfFileItem[] {
    const byPath = new Map<string, typItemStatus>();
    for (const line of text.split("\n")) {
        const item = parseCombinedLine(line);
        if (!item) continue;
        const previous = byPath.get(item.path);
        if (previous === "error") continue;
        byPath.set(item.path, item.status);
    }
    return Array.from(byPath, ([path, status]) => ({ path, status }));
}

/** 상태별 파일 수. 폴더 작업 항목(isDir)은 세지 않는다 (삭제 수 · --max-delete는 파일 기준) */
export function countItems(items: readonly itfFileItem[]): typCounts {
    const counts = emptyCounts();
    for (const item of items) if (!item.isDir) counts[item.status] += 1;
    return counts;
}

const DIR_OP_SYMBOL = { make: "+", remove: "-", keep: "=" } as const;

/** 폴더 작업 목록을 dirs.txt 형식으로 (줄마다 "+ 경로" 만듦, "- 경로" 지움 · 지우기 시도, "= 경로" 지우려 했지만 남음) */
export function formatDirOps(ops: readonly { op: "make" | "remove" | "keep"; path: string }[]): string {
    return ops.map(({ op, path }) => `${DIR_OP_SYMBOL[op]} ${path}\n`).join("");
}

/** dirs.txt를 폴더 항목으로. 형식이 아닌 줄은 건너뛴다 */
export function parseDirOps(text: string): itfFileItem[] {
    const items: itfFileItem[] = [];
    for (const line of text.split("\n")) {
        const item = parseCombinedLine(line);
        if (item && (item.status === "add" || item.status === "delete" || item.status === "same")) {
            items.push({ ...item, isDir: true });
        }
    }
    return items;
}
