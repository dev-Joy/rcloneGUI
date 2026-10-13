// Claude Code PreToolUse(PowerShell|Bash) 훅: 에이전트가 셸에서 rclone으로 파일을 직접 바꾸지 못하게 막는다.
// --dry-run 없는 sync/copy/move/delete 계열만 거부한다. 검사 규칙은 scripts/harness/lib.mjs에 있다. AGENTS.md 1.2, 1.4 참고.
import { findBlockedRclone, rcloneReason, readHookInput } from "../../scripts/harness/lib.mjs";

const command = readHookInput()?.tool_input?.command;
const blocked = typeof command === "string" ? findBlockedRclone(command) : null;

if (blocked) {
    console.log(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: rcloneReason(blocked),
            },
        }),
    );
}
process.exit(0);
