/**
 *  Lsjson
 *
 *  @author dev-Joy    2026-10-14
 *  @description
 *      - rclone lsjson -R --files-only 출력 파서 (F11 파일 상세)
 *      - 형식은 docs/knowhow/rclone-notes.md 2026-10-14 항목, fixture는 tests/fixtures/lsjson-l-*.json
 */

/**
 *  External imports
 */
import { z } from "zod";

/**
 *  Internal imports
 */
import type { itfFileSide } from "@/shared/types";

/**
 *  Types 정의
 */
const entrySchema = z.object({
    Path: z.string().min(1),
    Size: z.number(),
    ModTime: z.string(),
    IsDir: z.boolean(),
});

/**
 *  메인 클래스 / export 함수
 */
/** lsjson 출력을 경로 → 크기 · 수정 시각으로. 폴더는 뺀다. 형식이 맞지 않으면 던진다. */
export function parseLsjson(text: string): Map<string, itfFileSide> {
    const entries = z.array(entrySchema).parse(JSON.parse(text) as unknown);
    const byPath = new Map<string, itfFileSide>();
    for (const entry of entries) {
        if (entry.IsDir) continue;
        byPath.set(entry.Path, { size: entry.Size, modTime: entry.ModTime });
    }
    return byPath;
}
