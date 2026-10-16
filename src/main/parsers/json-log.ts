/**
 *  Json log
 *
 *  @author dev-Joy    2026-10-11
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
    // 지난 초. 평균 속도 계산에 쓴다
    elapsedTime: z.number().catch(0),
    // 전송 중인 파일. 100%면 리모트가 마무리하는 중이다 (Drive는 업로드 뒤 서버 처리를 기다린다)
    transferring: z.array(z.object({ percentage: z.number().catch(0) })).catch([]),
});

const lineSchema = z.object({
    level: z.string().catch("info"),
    msg: z.string().catch(""),
    object: z.string().optional().catch(undefined),
    skipped: z.string().optional().catch(undefined),
    stats: statsSchema.optional().catch(undefined),
});

export interface itfLogLine {
    level: string;
    msg: string;
    object?: string;
    /** dry-run에서 건너뛴 작업 이름 (예: "copy", "make directory") */
    skipped?: string;
    progress?: itfProgress;
}

/** 폴더 작업 한 건 (F25) */
export interface itfDirOp {
    op: "make" | "remove";
    path: string;
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
    const { level, msg, object, skipped, stats } = parsed.data;
    if (!stats) return { level, msg, object, skipped, progress: undefined };
    const { elapsedTime, transferring, ...rest } = stats;
    const finishing = transferring.filter((file) => file.percentage >= 100).length;
    return { level, msg, object, skipped, progress: { ...rest, elapsed: elapsedTime, finishing } };
}

/**
 * 로그 한 줄이 폴더 작업이면 돌려준다 (F25). 형식은 rclone-notes 2026-10-14 P3 · P5.
 * 미리보기: skipped "make directory" / "remove directory". 실행: msg "Made directory…" / "Removing directory".
 */
export function dirOpOf(line: itfLogLine): itfDirOp | null {
    if (!line.object) return null;
    if (line.skipped === "make directory" || line.msg.startsWith("Made directory")) {
        return { op: "make", path: line.object };
    }
    if (line.skipped === "remove directory" || line.msg === "Removing directory") {
        return { op: "remove", path: line.object };
    }
    return null;
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
