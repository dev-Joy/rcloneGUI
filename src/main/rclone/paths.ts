/**
 *  Paths
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 경로 해석과 겹침 검사, 백업 폴더 규칙 (순수 함수)
 */

/**
 *  Types 정의
 */
// 경로 해석과 겹침 검사. 파일 시스템에 접근하지 않는 순수 함수만 둔다.

export type typLocation = { kind: "local"; path: string } | { kind: "remote"; remote: string; path: string };

/**
 *  내부 함수
 */
/** 비교용 키. Windows는 대소문자를 구분하지 않으므로 로컬 경로는 소문자로 맞춘다. */
function f_CompareKey(loc: typLocation): string {
    const f_Clean = (p: string): string => p.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
    if (loc.kind === "remote") return `${loc.remote}:/${f_Clean(loc.path).replace(/^\/+/, "")}`;
    const lower = loc.path.toLowerCase();
    const unc = /^[\\/]{2}/.test(lower);
    return (unc ? "//" : "") + f_Clean(lower).replace(/^\/+/, unc ? "" : "/");
}

/**
 *  메인 클래스 / export 함수
 */
/**
 * rclone 경로를 로컬과 리모트로 나눈다.
 * `E:\dir`, `E:dir`, `\\server\share`, 상대 경로는 로컬이고 `name:path`(이름 2글자 이상)는 리모트다.
 */
export function parseLocation(raw: string): typLocation {
    const value = raw.trim();
    const match = /^([^:\\/]{2,}):(.*)$/.exec(value);
    if (match) return { kind: "remote", remote: match[1], path: match[2] };
    return { kind: "local", path: value };
}

export function isRemote(raw: string): boolean {
    return parseLocation(raw).kind === "remote";
}

/** 두 경로가 같거나 한쪽이 다른 쪽을 포함하면 true */
export function pathsOverlap(a: string, b: string): boolean {
    const la = parseLocation(a);
    const lb = parseLocation(b);
    if (la.kind !== lb.kind) return false;
    const ka = f_CompareKey(la).replace(/\/+$/, "");
    const kb = f_CompareKey(lb).replace(/\/+$/, "");
    return ka === kb || ka.startsWith(`${kb}/`) || kb.startsWith(`${ka}/`);
}

/** 같은 대상에 동시에 하나만 실행하기 위한 키 */
export function destKey(dest: string): string {
    return f_CompareKey(parseLocation(dest));
}

/**
 * 백업 폴더가 들어갈 뿌리. 대상 밖이어야 하므로 드라이브(또는 공유·리모트) 최상위에 둔다.
 * 로컬 `E:\a\b` → `E:\.rclonegui-backup`, UNC `\\s\share\a` → `\\s\share\.rclonegui-backup`,
 * 리모트 `gd:a/b` → `gd:.rclonegui-backup`. 드라이브를 알 수 없는 상대 경로는 null.
 */
export function backupRoot(dest: string): string | null {
    const loc = parseLocation(dest);
    if (loc.kind === "remote") return `${loc.remote}:.rclonegui-backup`;
    const drive = /^([A-Za-z]:)[\\/]/.exec(loc.path);
    if (drive) return `${drive[1]}\\.rclonegui-backup`;
    const unc = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)/.exec(loc.path);
    if (unc) return `\\\\${unc[1]}\\${unc[2]}\\.rclonegui-backup`;
    return null;
}

export function backupDirFor(dest: string, jobId: string, runId: string): string | null {
    const root = backupRoot(dest);
    if (root === null) return null;
    return isRemote(dest) ? `${root}/${jobId}/${runId}` : `${root}\\${jobId}\\${runId}`;
}
