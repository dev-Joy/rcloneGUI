/**
 *  Excluded
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 제외된 파일 목록 계산 (F22 "기타 → 제외됨")
 *      - 필터 없이 읽은 원본 · 대상 목록에서 미리보기 목록에 든 파일을 뺀다. 순수 함수
 */

/**
 *  Internal imports
 */
import type { itfExcludedItem, itfFileItem, itfFileSide } from "@/shared/types";

/**
 *  Types 정의
 */
const PATH_ORDER = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 *  메인 클래스 / export 함수
 */
/**
 * (원본 경로 ∪ 대상 경로) − 미리보기의 파일 경로. 폴더 작업 항목(isDir)은 비교에 쓰지 않는다.
 * 경로 순으로 돌려준다.
 */
export function diffExcluded(
    source: ReadonlyMap<string, itfFileSide>,
    dest: ReadonlyMap<string, itfFileSide>,
    items: readonly itfFileItem[],
): itfExcludedItem[] {
    const included = new Set(items.filter((item) => !item.isDir).map((item) => item.path));
    const paths = new Set<string>();
    for (const path of source.keys()) if (!included.has(path)) paths.add(path);
    for (const path of dest.keys()) if (!included.has(path)) paths.add(path);
    return [...paths]
        .sort((a, b) => PATH_ORDER.compare(a, b))
        .map((path) => ({ path, source: source.get(path) ?? null, dest: dest.get(path) ?? null }));
}
