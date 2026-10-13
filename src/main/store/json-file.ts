/**
 *  Json file
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - JSON 파일 읽기와 원자적 쓰기
 */

/**
 *  External imports
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

/** 임시 파일에 쓴 뒤 이름을 바꿔, 쓰는 도중 꺼져도 기존 파일이 깨지지 않게 한다. */
export async function writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temp, file);
}
