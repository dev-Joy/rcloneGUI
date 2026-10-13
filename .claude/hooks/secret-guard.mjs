// Claude Code PreToolUse(Edit|Write) 훅: 파일에 비밀값(토큰, 비밀번호, 개인 키)을 적으려 하면 막는다.
// Baton은 rclone.conf(OAuth 토큰이 든 파일)를 다루므로, 그 내용이 코드·테스트·문서에 옮겨 적히는 것을 막는 것이 목적이다.
// 검사 규칙은 scripts/harness/lib.mjs에 있다.
//
//   훅으로:  표준 입력의 훅 JSON에서 쓰려는 내용을 읽어 검사한다
//   직접:    node .claude/hooks/secret-guard.mjs --scan <파일…>   이미 있는 파일을 검사한다 (오탐 확인용)
import { readFileSync } from "node:fs";
import { findSecret, readHookInput, secretReason } from "../../scripts/harness/lib.mjs";

if (process.argv[2] === "--scan") {
    let hits = 0;
    for (const file of process.argv.slice(3)) {
        const found = findSecret(readFileSync(file, "utf8"));
        if (found) {
            hits += 1;
            console.log(`${file}: ${found}`);
        }
    }
    console.log(hits === 0 ? "비밀값으로 보이는 것이 없습니다" : `${hits}개 파일에서 발견`);
    process.exit(hits === 0 ? 0 : 1);
}

const toolInput = readHookInput()?.tool_input ?? {};
const texts = [
    toolInput.content,
    toolInput.new_string,
    ...(toolInput.edits ?? []).map((edit) => edit?.new_string),
];
const found = texts
    .filter((text) => typeof text === "string")
    .map(findSecret)
    .find(Boolean);

if (found) {
    console.log(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: secretReason(found),
            },
        }),
    );
}
process.exit(0);
