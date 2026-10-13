// Antigravity PreToolUse(run_command) 훅: --dry-run 없는 rclone 쓰기 명령을 막는다.
// 검사 규칙은 scripts/harness/lib.mjs에 있고 Claude Code 훅(.claude/hooks/guard-rclone.mjs)과 같다.
// 입력 JSON의 모양에 기대지 않도록 모든 문자열 값을 검사한다.
import {
    collectStrings,
    findBlockedRclone,
    rcloneReason,
    readHookInput,
} from "../../scripts/harness/lib.mjs";

const blocked = collectStrings(readHookInput())
    .map(([, value]) => findBlockedRclone(value))
    .find(Boolean);

console.log(
    JSON.stringify(blocked ? { decision: "deny", reason: rcloneReason(blocked) } : { decision: "allow" }),
);
process.exit(0);
