// 에이전트 하네스 훅의 공통 로직. Claude Code(.claude/hooks)와 Antigravity(.agents/scripts)의 훅이 함께 쓴다.
// 도구마다 다른 것은 입력 JSON의 모양과 판정 출력 형식뿐이고, 무엇을 막고 무엇을 기록하는지는 여기 한 곳에 둔다.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const usageLog = join(root, ".claude", "usage-metrics.log");

/** 표준 입력의 훅 JSON을 읽는다. 비었거나 깨졌으면 null. */
export function readHookInput() {
    try {
        return JSON.parse(readFileSync(0, "utf8") || "null");
    } catch {
        return null;
    }
}

/** 값 안의 모든 문자열을 (키, 값) 쌍으로 훑는다. 입력 모양을 모르는 도구의 훅에서 쓴다. */
export function collectStrings(value, key = "", out = []) {
    if (typeof value === "string") out.push([key, value]);
    else if (Array.isArray(value)) for (const item of value) collectStrings(item, key, out);
    else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) collectStrings(v, k, out);
    return out;
}

// ---------------------------------------------------------------------------------------------
// 비밀값 검사
// ---------------------------------------------------------------------------------------------

// 자리표시자처럼 보이는 값은 비밀값으로 보지 않는다.
const PLACEHOLDER =
    /^(x+|\*+|\.+|<.*>|\$\{.*\}|your[-_].*|example.*|placeholder.*|dummy.*|test.*|changeme.*)$/i;

const SECRET_RULES = [
    {
        name: "비밀번호·토큰 대입",
        pattern:
            /\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
        value: 2,
    },
    // rclone.conf 형식 (INI): token = {...}, client_secret = xxxx
    {
        name: "rclone.conf 항목",
        pattern:
            /^[ \t]*(token|client_secret|client_id|pass|password|service_account_credentials)[ \t]*=[ \t]*(\S{8,}.*)$/gim,
        value: 2,
    },
    { name: "OAuth 토큰 JSON", pattern: /"(access_token|refresh_token)"\s*:\s*"([^"]{8,})"/g, value: 2 },
    { name: "API 키 (sk-)", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
    { name: "GitHub 토큰", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
    { name: "Google API 키", pattern: /\bAIza[0-9A-Za-z_-]{30,}/g },
    { name: "개인 키", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/** 비밀값으로 보이는 것이 있으면 규칙 이름을, 없으면 null을 돌려준다. 값 자체는 돌려주지 않는다. */
export function findSecret(text) {
    for (const rule of SECRET_RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of text.matchAll(rule.pattern)) {
            const value = rule.value ? match[rule.value].trim() : match[0];
            if (!PLACEHOLDER.test(value)) return rule.name;
        }
    }
    return null;
}

export const secretReason = (found) =>
    `비밀값으로 보이는 내용(${found})을 파일에 적으려 했다. 토큰·비밀번호·rclone.conf 내용은 코드·테스트·문서에 넣지 않는다 ` +
    "(AGENTS.md 1.4, 1.6). 예시가 필요하면 <token> 같은 자리표시자를 쓴다.";

// ---------------------------------------------------------------------------------------------
// rclone 쓰기 명령 검사
// ---------------------------------------------------------------------------------------------

const RCLONE_WRITING = [
    "sync",
    "copy",
    "copyto",
    "move",
    "moveto",
    "delete",
    "deletefile",
    "purge",
    "rmdir",
    "rmdirs",
    "dedupe",
    "cleanup",
    "bisync",
];

/**
 * 셸 명령에 --dry-run 없는 rclone 쓰기 명령이 있으면 그 조각을, 없으면 null을 돌려준다.
 * 읽기 전용 명령(version, lsjson, check …)과 스크립트를 거치는 실행(vitest, scripts/probes)은 대상이 아니다.
 */
export function findBlockedRclone(command) {
    // 한 줄에 여러 명령이 이어질 수 있으므로 조각마다 따로 본다.
    const blocked = command
        .split(/[;\n|&]+/)
        .map((part) => part.trim())
        .find((part) => {
            const match = /(?:^|[\s"'&(\\/])rclone(?:\.exe)?["']?\s+(.*)$/i.exec(part);
            if (!match) return false;
            const words = match[1].split(/\s+/);
            const writes = words.some((word) => RCLONE_WRITING.includes(word.toLowerCase()));
            const dryRun = words.some((word) => word === "--dry-run" || word === "-n");
            return writes && !dryRun;
        });
    return blocked ?? null;
}

export const rcloneReason = (blocked) =>
    "--dry-run 없는 rclone 쓰기 명령은 셸에서 직접 실행하지 않는다 (AGENTS.md 1.2, 1.4). " +
    "미리 보려면 --dry-run을 붙이고, 실제 동작 확인은 pnpm run test:int(임시 폴더)나 앱의 확인 절차로 한다. " +
    `막힌 부분: ${blocked.slice(0, 200)}`;

// ---------------------------------------------------------------------------------------------
// 편집한 파일 포맷
// ---------------------------------------------------------------------------------------------

const FORMATTED = new Set([
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".js",
    ".css",
    ".json",
    ".md",
    ".html",
    ".yaml",
    ".yml",
]);

/** 프로젝트 안의 포맷 대상 파일이면 oxfmt로 포맷한다. 포맷했으면 true. 무시 목록은 .oxfmtrc.json이 다시 걸러 준다. */
export function formatFile(raw) {
    if (typeof raw !== "string" || raw === "") return false;
    const file = isAbsolute(raw) ? raw : resolve(root, raw);
    const rel = relative(root, file);
    if (rel.startsWith("..") || isAbsolute(rel)) return false;
    if (!FORMATTED.has(extname(file).toLowerCase()) || !existsSync(file)) return false;
    const bin = join(root, "node_modules", "oxfmt", "bin", "oxfmt");
    if (!existsSync(bin)) return false;
    spawnSync(process.execPath, [bin, "--no-error-on-unmatched-pattern", rel], {
        cwd: root,
        stdio: "ignore",
    });
    return true;
}

// ---------------------------------------------------------------------------------------------
// 스킬·에이전트 사용 기록
// ---------------------------------------------------------------------------------------------

/** "<시각>\t<SKILL|AGENT>\t<이름>\t<도구>" 한 줄을 남긴다. 입력 내용은 남기지 않는다. */
export function recordUsage(category, name, harness) {
    if (typeof name !== "string" || name === "") return;
    const clean = name.replace(/[\t\r\n]/g, " ").slice(0, 80);
    try {
        appendFileSync(usageLog, `${new Date().toISOString()}\t${category}\t${clean}\t${harness}\n`, "utf8");
    } catch {
        // 기록 실패가 작업을 막아서는 안 된다.
    }
}

/** 종류·이름별 횟수를 마크다운 표로 만든다. 한 번도 안 쓰인 스킬·에이전트도 0으로 넣는다. */
export function usageSummary() {
    const counts = new Map();
    const list = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
    for (const name of list(join(root, ".claude", "skills"))) counts.set(`SKILL\t${name}`, 0);
    for (const file of list(join(root, ".claude", "agents")))
        counts.set(`AGENT\t${file.replace(/\.md$/, "")}`, 0);
    for (const file of list(join(root, ".agents", "agents")))
        counts.set(`AGENT\t${file.replace(/\.md$/, "")}`, 0);

    const lines = existsSync(usageLog) ? readFileSync(usageLog, "utf8").split("\n").filter(Boolean) : [];
    for (const line of lines) {
        const [, category, name] = line.split("\t");
        if (!category || !name) continue;
        const key = `${category}\t${name}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const out = [];
    if (lines.length === 0)
        out.push("기록된 메트릭이 없습니다 (.claude/usage-metrics.log 없음 또는 비어 있음)", "");
    out.push("| CATEGORY | COMPONENT NAME | COUNT |", "| :--- | :--- | :--- |");
    for (const [key, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
        const [category, name] = key.split("\t");
        out.push(`| ${category} | ${name} | ${count} |`);
    }
    if (lines.length > 0) out.push("", `기간: ${lines[0].split("\t")[0]} ~ ${lines.at(-1).split("\t")[0]}`);
    return out.join("\n");
}
