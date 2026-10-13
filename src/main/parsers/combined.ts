/**
 *  Combined
 *
 *  @author Bruce.Cheong    2026-10-11
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

export function countItems(items: readonly itfFileItem[]): typCounts {
    const counts = emptyCounts();
    for (const item of items) counts[item.status] += 1;
    return counts;
}
