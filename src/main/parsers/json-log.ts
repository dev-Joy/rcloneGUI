/**
 *  Json log
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - rclone --use-json-log 출력 파서
 */

/**
 *  External imports
 */
import { z } from "zod";

/**
 *  Internal imports
 */
import type { itfProgress } from "@/shared/types";

/**
 *  Types 정의
 */
const statsSchema = z.object({
    bytes: z.number().catch(0),
    totalBytes: z.number().catch(0),
    transfers: z.number().catch(0),
    totalTransfers: z.number().catch(0),
    checks: z.number().catch(0),
    totalChecks: z.number().catch(0),
    deletes: z.number().catch(0),
    errors: z.number().catch(0),
    eta: z.number().nullable().catch(null),
    speed: z.number().catch(0),
});

const lineSchema = z.object({
    level: z.string().catch("info"),
    msg: z.string().catch(""),
    object: z.string().optional().catch(undefined),
    stats: statsSchema.optional().catch(undefined),
});

export interface itfLogLine {
    level: string;
    msg: string;
    object?: string;
    progress?: itfProgress;
}

/**
 *  메인 클래스 / export 함수
 */
/** --use-json-log 한 줄을 읽는다. JSON이 아니면 null (rclone이 가끔 일반 텍스트를 섞는다). */
export function parseLogLine(line: string): itfLogLine | null {
    const text = line.trim();
    if (!text.startsWith("{")) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    const parsed = lineSchema.safeParse(raw);
    if (!parsed.success) return null;
    const { level, msg, object, stats } = parsed.data;
    return { level, msg, object, progress: stats };
}

/** error 수준 줄을 사람이 읽는 한 줄로 */
export function formatErrorLine(line: itfLogLine): string {
    return line.object ? `${line.object}: ${line.msg}` : line.msg;
}

/** 스트림 조각을 줄 단위로 끊는다. 마지막 미완성 줄은 다음 조각과 이어 붙인다. */
export function createLineSplitter(onLine: (line: string) => void): {
    push(chunk: string): void;
    flush(): void;
} {
    let rest = "";
    return {
        push(chunk) {
            const parts = (rest + chunk).split("\n");
            rest = parts.pop() ?? "";
            for (const part of parts) onLine(part);
        },
        flush() {
            if (rest !== "") onLine(rest);
            rest = "";
        },
    };
}
