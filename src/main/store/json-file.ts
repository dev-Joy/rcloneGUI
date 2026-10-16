/**
 *  Json file
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - JSON 파일 읽기 (예전 JSON 저장소를 DB로 가져올 때 쓴다)
 */

/**
 *  External imports
 */
import { readFile } from "node:fs/promises";

/**
 *  메인 클래스 / export 함수
 */
/** JSON 파일을 읽는다. 파일이 없으면 null. */
export async function readJson(file: string): Promise<unknown> {
    let text: string;
    try {
        text = await readFile(file, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
    return JSON.parse(text) as unknown;
}
