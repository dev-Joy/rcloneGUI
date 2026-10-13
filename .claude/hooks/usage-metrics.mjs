// Claude Code PostToolUse(Skill|Agent|Task) 훅: 어떤 스킬과 서브에이전트가 실제로 쓰이는지 한 줄씩 남긴다.
// 쓰이지 않는 하네스 부품을 찾아 정리하기 위한 기록이다. 도구 입력 내용은 남기지 않는다.
//
//   훅으로:  .claude/usage-metrics.log 에 한 줄을 덧붙인다
//   직접:    node .claude/hooks/usage-metrics.mjs --summary   종류·이름별 횟수를 표로 출력한다 (Antigravity 기록 포함)
import { readHookInput, recordUsage, usageSummary } from "../../scripts/harness/lib.mjs";

if (process.argv[2] === "--summary") {
    console.log(usageSummary());
    process.exit(0);
}

const input = readHookInput();
const toolInput = input?.tool_input ?? {};
if (input?.tool_name === "Skill") recordUsage("SKILL", toolInput.skill, "claude");
else if (input)
    recordUsage("AGENT", toolInput.subagent_type ?? toolInput.agent_type ?? "general-purpose", "claude");
process.exit(0);
