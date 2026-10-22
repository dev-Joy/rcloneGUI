/**
 *  Options file
 *
 *  @author dev-Joy    2026-10-17
 *  @description
 *      - 작업별 rclone 옵션 파일 읽기 (F27 · SR-15). 한 줄에 옵션 하나, 허용 목록에 있는 옵션만 받는다
 *      - 순수 함수. 파일을 여는 것은 main(src/main/rclone/options.ts)
 */

/**
 *  Internal imports
 */
import { INPUT_LIMITS } from "./limits";

/**
 *  Types 정의
 */
/** 값을 받는 옵션 (허용 목록). "--이름 값" 또는 "--이름=값" */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
    // 전송 · 속도
    "--bwlimit",
    "--bwlimit-file",
    "--tpslimit",
    "--tpslimit-burst",
    "--buffer-size",
    "--multi-thread-cutoff",
    "--multi-thread-streams",
    "--max-backlog",
    "--order-by",
    "--low-level-retries",
    "--timeout",
    "--contimeout",
    "--user-agent",
    // 비교 방식
    "--modify-window",
    // 크기 · 날짜 거르기 (거른 파일은 양쪽에서 빠져 지워지지 않는다)
    "--max-size",
    "--min-size",
    "--max-age",
    "--min-age",
]);

/**
 * 값이 없는 옵션 (허용 목록). "--이름" 또는 "--이름=true|false"만 받는다.
 * rclone은 값 없는 옵션 뒤의 낱말을 값으로 가져가지 않고 다른 옵션으로 읽으므로 뒤에 낱말을 받지 않는다
 */
const BOOL_FLAGS: ReadonlySet<string> = new Set([
    "--check-first",
    "--no-traverse",
    "--checksum",
    "--size-only",
    "--ignore-size",
    "--ignore-checksum",
    "--update",
    "--no-update-modtime",
    "--use-server-modtime",
    "--ignore-case-sync",
]);

/**
 * 백엔드 옵션 중 받지 않는 이름: 비밀값(기록에 남음), 삭제 방식(휴지통 건너뛰기), 명령 실행(ssh · command · shell),
 * 실제 위치를 바꾸는 것(겹침 · 백업 위치 검사가 화면의 경로로만 판단하므로)
 */
const BACKEND_REFUSED =
    /(pass|token|secret|key|auth|client-id|service-account|trash|hard-delete|root-folder-id|team-drive|shared-with-me|impersonate|remote|endpoint|bucket|host|user|url|ssh|command|shell)/;

/** 이름이 --<백엔드>- 로 시작하면 그 백엔드 설정이다 */
const BACKEND_PREFIXES = [
    "drive",
    "s3",
    "sftp",
    "onedrive",
    "local",
    "b2",
    "dropbox",
    "box",
    "webdav",
    "ftp",
    "smb",
    "azureblob",
    "gcs",
    "pcloud",
    "mega",
    "crypt",
].map((name) => `--${name}-`);

/** 받지 않는 옵션의 이유 (앞부분이 맞으면 그 이유) */
const REFUSED: readonly [string, string][] = [
    ["--dry-run", "앱이 비교 · 실행을 정합니다"],
    ["--max-delete", "삭제 한도는 앱이 확인한 삭제 수로 정합니다"],
    ["--backup-dir", "백업 폴더는 앱이 정합니다"],
    ["--combined", "비교 결과 파일은 앱이 정합니다"],
    ["--config", "rclone.conf는 작업 · 설정의 칸으로 정합니다"],
    ["--filter", "제외는 편집 창의 제외 패턴으로 정합니다"],
    ["--include", "제외는 편집 창의 제외 패턴으로 정합니다"],
    ["--exclude", "제외는 편집 창의 제외 패턴으로 정합니다"],
    ["--files-from", "제외는 편집 창의 제외 패턴으로 정합니다"],
    ["--use-json-log", "로그 형식은 앱이 정합니다"],
    ["--log-", "로그 형식은 앱이 정합니다"],
    ["--stats", "진행 표시는 앱이 정합니다"],
    ["--retries", "다시 시도 횟수는 앱이 정합니다"],
    ["--ignore-errors", "편집 창의 안전 칸으로 정합니다"],
    ["--create-empty-src-dirs", "편집 창의 동기화 범위로 정합니다"],
    ["--fast-list", "편집 창의 칸으로 정합니다"],
    ["--skip-links", "편집 창의 칸으로 정합니다"],
    ["--checkers", "편집 창의 칸으로 정합니다"],
    ["--transfers", "편집 창의 칸으로 정합니다"],
    ["--delete-", "지우는 방식을 바꿉니다"],
    ["--track-renames", "지우는 방식을 바꿉니다"],
    ["--suffix", "지우는 방식을 바꿉니다"],
    ["--compare-dest", "지우는 방식을 바꿉니다"],
    ["--copy-dest", "지우는 방식을 바꿉니다"],
    ["--no-check-dest", "차단 목록에 있습니다"],
    ["--dump", "차단 목록에 있습니다(비밀값이 로그에 남을 수 있음)"],
];

export class clsOptionsError extends Error {
    readonly code = "OPTIONS_INVALID";
    constructor(message: string) {
        super(message);
        this.name = "clsOptionsError";
    }
}

/**
 *  내부 함수
 */
/** 한 줄을 낱말로 나눈다. 큰따옴표 안의 공백은 나누지 않는다. 따옴표가 닫히지 않으면 null */
function f_Split(line: string): string[] | null {
    const words: string[] = [];
    let current = "";
    let quoted = false;
    let started = false;
    for (const ch of line) {
        if (ch === '"') {
            quoted = !quoted;
            started = true;
        } else if (!quoted && /\s/.test(ch)) {
            if (started) words.push(current);
            current = "";
            started = false;
        } else {
            current += ch;
            started = true;
        }
    }
    if (quoted) return null;
    if (started) words.push(current);
    return words;
}

/** 옵션 이름이 허용되는지. 안 되면 이유 */
function f_Refusal(flag: string): string | null {
    const refused = REFUSED.find(([prefix]) => flag === prefix || flag.startsWith(prefix));
    if (refused) return refused[1];
    if (VALUE_FLAGS.has(flag) || BOOL_FLAGS.has(flag)) return null;
    if (BACKEND_PREFIXES.some((prefix) => flag.startsWith(prefix))) {
        return BACKEND_REFUSED.test(flag) ? "비밀값 · 삭제 방식 · 위치를 바꾸는 백엔드 설정입니다" : null;
    }
    return "허용 목록에 없습니다";
}

/**
 *  메인 클래스 / export 함수
 */
/** 옵션 파일 최대 크기 (바이트) */
export const OPTIONS_FILE_MAX_BYTES = 64 * 1024;

/**
 * 옵션 파일 내용을 rclone 인자로. 빈 줄 · #으로 시작하는 줄은 건너뛴다.
 * 형식이 틀리거나 허용 목록 밖이면 "N번째 줄: …"로 던진다
 */
export function parseOptionsText(text: string): string[] {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/);
    const args: string[] = [];
    let count = 0;
    for (const [index, raw] of lines.entries()) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;
        const at = `${index + 1}번째 줄`;
        count += 1;
        if (count > INPUT_LIMITS.optionCount) {
            throw new clsOptionsError(`옵션은 ${INPUT_LIMITS.optionCount}줄까지 쓸 수 있습니다`);
        }
        if (line.length > INPUT_LIMITS.optionLine) {
            throw new clsOptionsError(`${at}이 ${INPUT_LIMITS.optionLine}자를 넘습니다`);
        }
        if (/\0/.test(line)) throw new clsOptionsError(`${at}에 쓸 수 없는 글자가 있습니다`);
        const words = f_Split(line);
        if (words === null) throw new clsOptionsError(`${at}: 큰따옴표가 닫히지 않았습니다`);
        const [first, ...rest] = words;
        const eq = first.indexOf("=");
        const flag = eq === -1 ? first : first.slice(0, eq);
        if (!/^--[a-z0-9][a-z0-9-]*$/.test(flag)) {
            throw new clsOptionsError(`${at}: --로 시작하는 긴 옵션 이름이 아닙니다 (${first})`);
        }
        const refusal = f_Refusal(flag);
        if (refusal !== null) {
            throw new clsOptionsError(`${at}: ${flag} 옵션은 옵션 파일에서 쓸 수 없습니다 (${refusal})`);
        }
        const inline = eq === -1 ? null : first.slice(eq + 1);
        if (rest.length > 1) throw new clsOptionsError(`${at}: 한 줄에 옵션 하나만 씁니다`);
        if (BOOL_FLAGS.has(flag)) {
            // 값 없는 옵션: 뒤 낱말은 rclone이 다른 옵션으로 읽으므로 받지 않는다
            if (rest.length > 0 || (inline !== null && inline !== "true" && inline !== "false")) {
                throw new clsOptionsError(`${at}: ${flag} 옵션은 값 없이 씁니다 (한 줄에 옵션 하나만)`);
            }
        } else if (VALUE_FLAGS.has(flag)) {
            const value = inline ?? rest[0];
            if (value === undefined || value === "" || (inline !== null && rest.length > 0)) {
                throw new clsOptionsError(`${at}: ${flag} 옵션에 값이 하나 필요합니다`);
            }
            if (value.startsWith("-")) {
                throw new clsOptionsError(
                    `${at}: ${flag} 옵션의 값은 -로 시작할 수 없습니다 (다른 옵션으로 읽힐 수 있음)`,
                );
            }
        } else if (rest.length > 0 || inline === null || inline === "" || inline.startsWith("-")) {
            // 백엔드 설정은 늘 = 로 붙여 쓴다(값 없는 설정도 =true|false). 앱은 값을 받는 설정인지 모르므로
            // 이름만 쓰면 rclone이 다음 인자(앱의 --dry-run 등)를 값으로 가져갈 수 있다 (F27 R2 검토)
            throw new clsOptionsError(
                `${at}: 백엔드 설정은 ${flag}=값 처럼 = 로 붙여 씁니다 (값 없는 설정은 =true)`,
            );
        }
        args.push(first, ...rest);
    }
    return args;
}
