/**
 *  Pattern store
 *
 *  @author dev-Joy    2026-10-22
 *  @description
 *      - 저장된 제외 패턴 (rclonegui.db의 exclude_patterns 표, intent/002)
 *      - 작업을 저장할 때 그 작업의 패턴을 중복 없이 모아 두고, 편집 창이 골라 넣을 수 있게 목록을 준다
 */

/**
 *  External imports
 */
import type { DatabaseSync } from "node:sqlite";

/**
 *  Internal imports
 */
import { excludeSchema } from "@/shared/schemas";
import type { itfSavedPattern } from "@/shared/types";
import type { clsAppDatabase } from "./app-database";

/**
 *  메인 클래스 / export 함수
 */
/**
 * 패턴들을 기억한다. 새 패턴은 넣고, 있던 패턴은 쓴 횟수 +1 · 마지막 쓴 시각을 바꾼다.
 * 바깥 트랜잭션 안에서 부른다 (작업 저장 · 스키마 이전 · 예전 JSON 가져오기).
 * 작업 저장과 같은 검사(excludeSchema)를 통과한 줄만 넣는다. 손상된 행에서 온 값은 건너뛴다.
 */
export function rememberPatterns(db: DatabaseSync, patterns: readonly string[], now = new Date()): void {
    const at = now.toISOString();
    const upsert = db.prepare(
        `INSERT INTO exclude_patterns (pattern, first_used, last_used, use_count) VALUES (?, ?, ?, 1)
         ON CONFLICT (pattern) DO UPDATE SET last_used = excluded.last_used, use_count = use_count + 1`,
    );
    const valid = patterns.flatMap((p) => {
        const parsed = excludeSchema.safeParse(p);
        return parsed.success ? [parsed.data] : [];
    });
    for (const pattern of new Set(valid)) upsert.run(pattern, at, at);
}

export class clsPatternStore {
    constructor(private readonly app: clsAppDatabase) {}

    /** 쓴 횟수 많은 순, 같으면 최근에 쓴 순 */
    async list(): Promise<itfSavedPattern[]> {
        const rows = this.app.db
            .prepare(
                `SELECT pattern, last_used, use_count FROM exclude_patterns
                 ORDER BY use_count DESC, last_used DESC, pattern`,
            )
            .all() as { pattern: string; last_used: string; use_count: number }[];
        return rows.map((r) => ({ pattern: r.pattern, lastUsed: r.last_used, useCount: r.use_count }));
    }

    /** 목록에서만 뺀다. 작업에 들어 있는 패턴은 바꾸지 않는다 */
    async delete(pattern: string): Promise<void> {
        this.app.db.prepare("DELETE FROM exclude_patterns WHERE pattern = ?").run(pattern);
    }
}
