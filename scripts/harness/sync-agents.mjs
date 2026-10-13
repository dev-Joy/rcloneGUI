// .claude(원본)의 규칙·스킬·검증 에이전트를 Antigravity 형식(.agents)으로 옮긴다.
// 두 도구가 같은 내용을 보도록, .agents 쪽의 해당 파일은 손으로 고치지 않고 이 스크립트로만 만든다.
//
//   node scripts/harness/sync-agents.mjs           .agents 를 갱신한다
//   node scripts/harness/sync-agents.mjs --check   어긋난 파일이 있으면 목록을 내고 exit 1 (pnpm run check 에 포함)
//
// 옮기는 것:  .claude/rules/*.md → .agents/rules/,  .claude/skills/*/SKILL.md → .agents/skills/,  .claude/agents/*.md → .agents/agents/
// 옮기지 않는 것 (.agents 에서 직접 관리): hooks.json, scripts/, agents/senior-architect.md, agents/implementer.md
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { root } from "./lib.mjs";

const MARK = "<!-- 생성 파일:";
const notice = (source) =>
    `${MARK} ${source} 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->`;

// Antigravity 모델 등급. 안전장치를 감사하는 쪽은 높은 등급을 쓴다.
const AGENT_MODEL = { reviewer: "pro", "app-verifier": "flash" };

// 스킬 본문 앞에 붙이는 Antigravity용 안내
const SKILL_NOTE = {
    "feature-pipeline":
        '> Antigravity에서는 아래의 "주 세션" 역할 중 지휘를 `senior-architect`가, 구현을 `implementer`가 맡는다 (`.agents/agents/`).',
};

/** `---` 사이의 머리말을 { 키: 값 | 목록 } 으로 읽고 본문과 함께 돌려준다. */
function parse(text) {
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (!match) return { meta: {}, body: text };
    const meta = {};
    let current = null;
    for (const line of match[1].split("\n")) {
        const item = /^\s+-\s+(.*)$/.exec(line);
        const pair = /^([\w-]+):\s*(.*)$/.exec(line);
        if (item && current) meta[current].push(item[1].replace(/^["']|["']$/g, ""));
        else if (pair) {
            current = pair[1];
            meta[current] = pair[2] === "" ? [] : pair[2];
        }
    }
    return { meta, body: text.slice(match[0].length).replace(/^\n+/, "") };
}

function frontmatter(entries) {
    const lines = ["---"];
    for (const [key, value] of entries) {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
        if (Array.isArray(value)) lines.push(`${key}:`, ...value.map((item) => `    - ${item}`));
        else lines.push(`${key}: ${value}`);
    }
    lines.push("---");
    return lines.join("\n");
}

const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const list = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

/** 만들어야 할 파일: 상대 경로 → 내용 */
function build() {
    const out = new Map();

    for (const file of list(join(root, ".claude", "rules")).filter((name) => name.endsWith(".md"))) {
        const { meta, body } = parse(read(join(root, ".claude", "rules", file)));
        const paths = Array.isArray(meta.paths) ? meta.paths : [];
        const scope =
            paths.length > 0
                ? `> 적용 범위: ${paths.map((p) => `\`${p}\``).join(", ")} 를 다룰 때만 따른다.\n\n`
                : "";
        out.set(`.agents/rules/${file}`, `${notice(`.claude/rules/${file}`)}\n\n${scope}${body}`);
    }

    for (const name of list(join(root, ".claude", "skills"))) {
        const source = join(root, ".claude", "skills", name, "SKILL.md");
        if (!existsSync(source)) continue;
        const { meta, body } = parse(read(source));
        const head = frontmatter([
            ["name", meta.name ?? name],
            ["description", meta.description],
        ]);
        const note = SKILL_NOTE[name] ? `${SKILL_NOTE[name]}\n\n` : "";
        out.set(
            `.agents/skills/${name}/SKILL.md`,
            `${head}\n\n${notice(`.claude/skills/${name}/SKILL.md`)}\n\n${note}${body}`,
        );
    }

    for (const file of list(join(root, ".claude", "agents")).filter((name) => name.endsWith(".md"))) {
        const { meta, body } = parse(read(join(root, ".claude", "agents", file)));
        const name = meta.name ?? file.replace(/\.md$/, "");
        const head = frontmatter([
            ["name", name],
            ["model", AGENT_MODEL[name] ?? "flash"],
            ["description", meta.description],
            ["skills", Array.isArray(meta.skills) ? meta.skills : []],
        ]);
        out.set(`.agents/agents/${file}`, `${head}\n\n${notice(`.claude/agents/${file}`)}\n\n${body}`);
    }
    return out;
}

/** .agents 안에서 이 스크립트가 만든 파일들 (표시가 있는 것) */
function generatedFiles() {
    const found = [];
    const walk = (dir) => {
        for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(".md") && read(full).includes(MARK))
                found.push(relative(root, full).replace(/\\/g, "/"));
        }
    };
    walk(join(root, ".agents"));
    return found;
}

const expected = build();
const stale = generatedFiles().filter((file) => !expected.has(file));
const changed = [...expected].filter(
    ([file, content]) => !existsSync(join(root, file)) || read(join(root, file)) !== content,
);

if (process.argv[2] === "--check") {
    if (changed.length === 0 && stale.length === 0) {
        console.log(`.agents 는 .claude 와 같습니다 (${expected.size}개 파일)`);
        process.exit(0);
    }
    for (const [file] of changed) console.log(`어긋남: ${file}`);
    for (const file of stale) console.log(`원본 없음: ${file}`);
    console.log(
        "pnpm run harness:sync 로 맞추세요. .agents 의 생성 파일을 직접 고쳤다면 그 변경을 .claude 원본으로 옮기세요.",
    );
    process.exit(1);
}

for (const [file, content] of changed) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content, "utf8");
    console.log(`갱신: ${file}`);
}
for (const file of stale) {
    rmSync(join(root, file));
    console.log(`삭제 (원본 없음): ${file}`);
}
console.log(
    changed.length + stale.length === 0
        ? `바뀐 것 없음 (${expected.size}개 파일)`
        : `완료 (${expected.size}개 파일)`,
);
