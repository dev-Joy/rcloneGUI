/**
 *  Wsl
 *
 *  @author dev-Joy    2026-10-16
 *  @description
 *      - 설치된 WSL 배포판 목록 (F24 WSL 경로 선택)
 *      - wsl.exe -l -q는 UTF-16LE로 출력한다 (docs/specs/2026-10-16-wsl-path-picker.md)
 */

/**
 *  External imports
 */
import { execFile } from "node:child_process";
import { join } from "node:path";

/**
 *  Types 정의
 */
const LIST_TIMEOUT_MS = 5000;

/** wsl.exe는 이름만으로 부르면 현재 폴더의 같은 이름 파일이 먼저 잡힐 수 있어 System32의 절대 경로로 부른다 */
const WSL_EXE = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wsl.exe");

/**
 *  메인 클래스 / export 함수
 */
/** wsl.exe -l -q 출력(UTF-16LE 바이트)을 배포판 이름 목록으로. 빈 줄 · NUL · 앞뒤 공백은 뺀다. */
export function parseWslList(output: Buffer): string[] {
    return output
        .toString("utf16le")
        .replace(/\0/g, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

/** 설치된 WSL 배포판. WSL이 없거나 실패하면 빈 목록 (오류로 다루지 않는다). */
export function listWslDistros(): Promise<string[]> {
    return new Promise((resolve) => {
        execFile(
            WSL_EXE,
            ["-l", "-q"],
            { shell: false, windowsHide: true, encoding: "buffer", timeout: LIST_TIMEOUT_MS },
            (error, stdout) => resolve(error ? [] : parseWslList(stdout)),
        );
    });
}

/** 배포판의 맨 위 폴더 (UNC). 백업 위치 규칙 · 경로 겹침 검사가 아는 \\wsl.localhost 형식을 쓴다. */
export function wslRoot(distro: string): string {
    return `\\\\wsl.localhost\\${distro}\\`;
}
