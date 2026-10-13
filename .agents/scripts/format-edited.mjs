// Antigravity PostToolUse(write_to_file|replace_file_content|multi_replace_file_content) 훅:
// 방금 고친 파일을 oxfmt로 포맷한다. 실패해도 작업을 막지 않는다 (항상 exit 0).
// 입력 JSON에서 경로가 담긴 키 이름을 확신할 수 없어, 경로처럼 보이는 키의 값을 모두 시도한다.
// formatFile이 프로젝트 안의 실제 파일이고 포맷 대상 확장자일 때만 포맷한다.
import { collectStrings, formatFile, readHookInput } from "../../scripts/harness/lib.mjs";

const PATH_KEY = /(file|path|target|uri)/i;

for (const [key, value] of collectStrings(readHookInput())) {
    if (PATH_KEY.test(key) && value.length < 1024 && !value.includes("\n"))
        formatFile(value.replace(/^file:\/\/\/?/, ""));
}
process.exit(0);
