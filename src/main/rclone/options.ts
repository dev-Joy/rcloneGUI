/**
 *  Options
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 작업별 rclone 옵션 파일을 읽어 검사한다 (F27 · SR-15). 형식 · 허용 목록은 shared/options-file.ts
 *      - 미리보기 · 실행 · 저장 때마다 다시 읽는다 (파일은 언제든 바뀔 수 있다)
 */

/**
 *  External imports
 */
import { readFile, stat } from "node:fs/promises";

/**
 *  Internal imports
 */
import { clsOptionsError, OPTIONS_FILE_MAX_BYTES, parseOptionsText } from "@/shared/options-file";
import type { typJobInput } from "@/shared/types";

/**
 *  메인 클래스 / export 함수
 */
/** 작업의 옵션 파일을 읽어 rclone 인자로. 파일이 없으면 []. 없거나 틀리면 OPTIONS_INVALID로 던진다 */
export async function loadJobOptions(job: Pick<typJobInput, "optionsFile">): Promise<string[]> {
    if (!job.optionsFile) return [];
    let size: number;
    try {
        size = (await stat(job.optionsFile)).size;
    } catch {
        throw new clsOptionsError(`옵션 파일을 찾을 수 없습니다: ${job.optionsFile}`);
    }
    if (size > OPTIONS_FILE_MAX_BYTES) {
        throw new clsOptionsError(`옵션 파일이 ${OPTIONS_FILE_MAX_BYTES / 1024} KiB를 넘습니다`);
    }
    const text = await readFile(job.optionsFile, "utf8");
    try {
        return parseOptionsText(text);
    } catch (error) {
        throw new clsOptionsError(`옵션 파일 ${error instanceof Error ? error.message : String(error)}`);
    }
}
