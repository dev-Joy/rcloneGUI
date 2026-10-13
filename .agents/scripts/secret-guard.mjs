// Antigravity PreToolUse(write_to_file|replace_file_content|multi_replace_file_content) 훅:
// 파일에 비밀값(토큰, 비밀번호, rclone.conf 내용, 개인 키)을 적으려 하면 막는다.
// 검사 규칙은 scripts/harness/lib.mjs에 있고 Claude Code 훅(.claude/hooks/secret-guard.mjs)과 같다.
// 입력 JSON의 모양에 기대지 않도록 모든 문자열 값을 검사한다.
import { collectStrings, findSecret, readHookInput, secretReason } from "../../scripts/harness/lib.mjs";

const found = collectStrings(readHookInput())
    .map(([, value]) => findSecret(value))
    .find(Boolean);

console.log(
    JSON.stringify(found ? { decision: "deny", reason: secretReason(found) } : { decision: "allow" }),
);
process.exit(0);
