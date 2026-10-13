// Antigravity PostToolUse(.*) 훅: 어떤 스킬과 서브에이전트가 쓰이는지 .claude/usage-metrics.log 에 남긴다.
// Claude Code 훅과 같은 파일에 쌓이고, 집계는 `node .claude/hooks/usage-metrics.mjs --summary` 로 본다.
//
// Antigravity가 훅에 넘기는 JSON의 모양을 확인하지 못해 아래처럼 추정한다. 실제 모양을 확인하면 고친다.
//   - 스킬: 도구 입력 어딘가에 `skills/<이름>/SKILL.md` 경로가 있으면 그 스킬을 읽은 것으로 본다
//   - 에이전트: agent_name / agent / caller 값이 있으면 그 에이전트의 도구 호출로 센다 (호출 1번 = 1줄)
import { collectStrings, readHookInput, recordUsage } from "../../scripts/harness/lib.mjs";

const input = readHookInput();
if (input) {
    const skills = new Set();
    for (const [, value] of collectStrings(input)) {
        const match = /skills[\\/]([\w-]+)[\\/]SKILL\.md/i.exec(value);
        if (match) skills.add(match[1]);
    }
    for (const skill of skills) recordUsage("SKILL", skill, "antigravity");

    const agent = input.agent_name ?? input.agent ?? input.caller;
    if (typeof agent === "string" && agent !== "" && agent !== "system")
        recordUsage("AGENT", agent, "antigravity");
}
process.exit(0);
