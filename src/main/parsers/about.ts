/**
 *  About
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - rclone about --json 출력 파서 (F20 용량 표시)
 *      - 형식은 docs/knowhow/rclone-notes.md 2026-10-16 about 항목, fixture는 tests/fixtures/about-q.json
 */

/**
 *  External imports
 */
import { z } from "zod";

/**
 *  Internal imports
 */
import type { itfSpace } from "@/shared/types";

/**
 *  Types 정의
 */
// 백엔드에 따라 빠지는 값이 있다 (예: free만 주는 리모트).
const aboutSchema = z.object({
    total: z.number().nonnegative().optional(),
    used: z.number().nonnegative().optional(),
    free: z.number().nonnegative().optional(),
});

/**
 *  메인 클래스 / export 함수
 */
/** about --json 출력을 용량으로. 형식이 아니면 던진다. 빠진 값은 null */
export function parseAbout(text: string): itfSpace {
    const parsed = aboutSchema.parse(JSON.parse(text) as unknown);
    return { total: parsed.total ?? null, used: parsed.used ?? null, free: parsed.free ?? null };
}
