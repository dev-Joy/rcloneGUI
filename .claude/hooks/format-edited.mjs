// Claude Code PostToolUse(Edit|Write) 훅: 방금 고친 파일을 oxfmt로 포맷한다.
// 포맷 대상이 아니거나 실패해도 작업을 막지 않는다 (항상 exit 0). 포맷 로직은 scripts/harness/lib.mjs에 있다.
import { formatFile, readHookInput } from "../../scripts/harness/lib.mjs";

const input = readHookInput();
formatFile(input?.tool_response?.filePath ?? input?.tool_input?.file_path);
process.exit(0);
