/**
 *  Locate
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - rclone 실행 파일 탐지, 버전·필수 기능 확인, 리모트 목록
 */

/**
 *  External imports
 */
import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";

/**
 *  Internal imports
 */
import type { itfRcloneStatus } from "@/shared/types";

/**
 *  Types 정의
 */
const EXE = process.platform === "win32" ? "rclone.exe" : "rclone";

/**
 *  내부 함수
 */
/** rclone을 한 번 실행하고 표준 출력을 돌려준다. 셸을 거치지 않는다. */
function f_Run(exe: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(exe, args, { shell: false, windowsHide: true, timeout: 30_000 }, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
}

async function f_Exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * winget은 rclone을 패키지 폴더에 풀고 그 폴더를 사용자 PATH에 넣는다. 설치 전에 열려 있던
 * 터미널에서 앱을 띄우면 PATH에 아직 없으므로 패키지 폴더를 직접 찾아본다.
 */
async function f_FindInWingetPackages(): Promise<string | null> {
    if (!process.env.LOCALAPPDATA) return null;
    const packages = join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    const f_List = (dir: string): Promise<string[]> => readdir(dir).catch(() => []);
    for (const pkg of (await f_List(packages)).filter((name) => name.startsWith("Rclone.Rclone"))) {
        const root = join(packages, pkg);
        // 최신 버전 폴더부터 본다.
        for (const sub of ["", ...(await f_List(root)).sort().reverse()]) {
            const candidate = join(root, sub, EXE);
            if (await f_Exists(candidate)) return candidate;
        }
    }
    return null;
}

/**
 *  메인 클래스 / export 함수
 */
/** 설정에 지정된 경로, PATH, winget 링크·패키지 폴더 순서로 rclone 실행 파일을 찾는다. */
export async function findRclone(configured: string | null): Promise<string | null> {
    if (configured) return (await f_Exists(configured)) ? configured : null;
    const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
    if (process.env.LOCALAPPDATA) {
        dirs.push(join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"));
    }
    for (const dir of dirs) {
        const candidate = join(dir, EXE);
        if (await f_Exists(candidate)) return candidate;
    }
    return f_FindInWingetPackages();
}

/** 위치·버전과 필수 기능(sync --combined) 지원 여부. 버전 번호 대신 도움말에서 플래그를 찾는다. */
export async function getRcloneStatus(configured: string | null): Promise<itfRcloneStatus> {
    const path = await findRclone(configured);
    if (path === null) {
        return {
            path: null,
            version: null,
            hasCombined: false,
            problem: configured
                ? `설정한 경로에 rclone이 없습니다: ${configured}`
                : "rclone을 찾지 못했습니다. 설치하거나 설정에서 rclone.exe 위치를 지정하세요",
        };
    }
    try {
        const version = /^rclone\s+(v\S+)/m.exec(await f_Run(path, ["version"]))?.[1] ?? null;
        const hasCombined = (await f_Run(path, ["sync", "--help"])).includes("--combined");
        return {
            path,
            version,
            hasCombined,
            problem: hasCombined
                ? null
                : "rclone이 오래되어 sync --combined를 지원하지 않습니다. rclone selfupdate로 올려 주세요",
        };
    } catch (error) {
        return {
            path,
            version: null,
            hasCombined: false,
            problem: `rclone을 실행할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/** 리모트 이름 목록 (`name:` 형식). rclone.conf 내용은 읽지 않고 rclone에게 묻는다. */
export async function listRemotes(exe: string, config: string | null): Promise<string[]> {
    const args = config ? ["listremotes", "--config", config] : ["listremotes"];
    const out = await f_Run(exe, args);
    return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.endsWith(":"));
}
