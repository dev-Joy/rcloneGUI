# WORKS_HISTORY

형식: `[TASK_NNN] : (YYYY-MM-DD) [변경 요약]`. 같은 기능을 다시 고치면 이전 기록을 갱신한다.

## 작업

### [TASK_001] : (2026-10-11) [Baton P0 구현]

- 기획서 F01~F08: 작업 관리, rclone 탐지, 리모트 목록, 비교(미리보기), 실행·진행률·취소, 안전장치 1~9, 실행 기록, 명령 복사
- main: `command-builder`, `runner`(미리보기 없이는 실행 불가), `parsers`, `store`, IPC 핸들러
- 테스트: 단위 112개, 실제 rclone 통합 14개
- 문서: `docs/plan.md`, `docs/adr/0001~0004`, `docs/knowhow/rclone-notes.md`
- 남은 것: P1(체인·자동 실행·파일 상세·설치본), 실제 경로(WSL → E:, E: → Google Drive) 검증

### [TASK_002] : (2026-10-11) [AGENTS.md 개발 규칙 적용]

- 들여쓰기 공백 4칸, 문자열 큰따옴표
- 접두사: type `typ`, interface `itf`, class `cls`, 내부 함수 `f_`, 핸들러 `h_`
- import: 상위 폴더는 `@/`(= `src`), 같은 폴더·하위 폴더는 `./`
- 화면 구조: 공용 컴포넌트 `src/components/ZBC*`(+ `ZBC.css`, `themes/default.css`), 페이지·레이아웃 `src/pages/*`(+ `*.module.css`, `@layer`)
- 파일 머리말 JSDoc, `External imports`/`Internal imports` 구분, `propsDefault`, 컴포넌트 섹션 주석
- `THIRD_PARTY_NOTICES.md`, `docs/works/` 추가
- 판단한 것
    - `docs/guide/File.tsx.guide`, `File.module.css.guide`가 저장소에 없어 AGENTS.md에 적힌 항목만으로 구조를 정했다
    - `f_` 접두사는 파일·함수 안에서만 쓰는 함수에 붙였고, export하는 함수와 클래스 메서드에는 붙이지 않았다
    - React 훅과 컴포넌트는 React 규칙(`use*`, 대문자 시작) 때문에 접두사를 붙이지 않았다
    - "개발 참조"의 API swagger·테스트 계정은 이 앱에 해당하는 대상이 없어 쓰지 않았다

### [TASK_003] : (2026-10-11) [oxlint·oxfmt 전환]

- 포맷: Prettier → oxfmt (`.oxfmtrc.json`, `pnpm run format`, `pnpm run format:check`)
- 린트: oxlint (`.oxlintrc.json`)가 기본. react·typescript·oxc 플러그인, `no-explicit-any`, import 제한(상위 상대 경로, 화면의 Node·main import)
- ESLint는 oxlint에 없는 규칙 두 가지만 남김: `shell: true` 금지, `typ`/`itf`/`cls` 접두사 검사

### [TASK_004] : (2026-10-11) [가이드 파일 추가와 기존 코드 맞춤]

- `docs/guide/File.tsx.guide`(Electron용: 프로세스 경계, 화면 컴포넌트 템플릿, main·preload·shared 모듈 템플릿), `docs/guide/File.module.css.guide` 추가
- 포맷: 세미콜론 사용, 끝 쉼표 사용 (`.oxfmtrc.json`의 `semi`, `trailingComma`)
- 모든 `.ts`/`.tsx`: 머리말을 `제목 / @author / @description` 형식으로, import를 `External imports` / `Internal imports` 블록 주석으로
- `.ts` 모듈 20개: `Types 정의` → `내부 함수` → `메인 클래스 / export 함수` 순서로 재배치
- 화면 컴포넌트 17개: `export default function X(iProps)`, `//` 섹션 주석 4종, 내부 변수 `_V`, `f_`/`h_` 함수 선언문
- module.css 9개: 최상단 클래스 아래로 중첩, 머리말 추가. 색은 테마 변수만 사용(`--zbc-on-strong`, `--zbc-backdrop` 추가)
- 판단한 것
    - 필수 props가 있는 컴포넌트는 `iProps = propsDefault`를 쓸 수 없어 `propsDefault`를 `satisfies Partial<…>`로 두고 함수 첫 줄에서 병합한다. 가이드에도 이 규칙을 적었다
    - 테스트 파일과 `src/renderer/main.tsx`는 실행 순서가 뜻을 가지므로 머리말과 import 블록만 맞추고 섹션 재배치는 하지 않았다
    - TASK_002의 "가이드가 없어 AGENTS.md만으로 정했다"는 이 작업으로 해소됐다

### [TASK_005] : (2026-10-11) [패키지 매니저 pnpm 전환]

- `package-lock.json` → `pnpm-lock.yaml` (`pnpm import`로 같은 버전 유지), `packageManager: pnpm@12.5.1`
- `pnpm-workspace.yaml`의 `allowBuilds`에 esbuild만 허용
- `postinstall: install-electron` 추가. Electron 44는 설치 스크립트가 없어 실행 파일을 따로 받아야 한다
- `check` 스크립트와 문서의 명령을 pnpm으로 변경
- 확인: `node_modules`를 지우고 `pnpm install --frozen-lockfile` → check · 통합 테스트 · 빌드 · 앱 실행
- 남은 것: 설치본(F12)을 만들 때 electron-builder와 pnpm의 `node_modules` 구조가 맞는지 확인

### [TASK_006] : (2026-10-11) [Claude Code 하네스 추가]

- `.claude/settings.json`: PostToolUse(Edit|Write) → `hooks/format-edited.mjs`(oxfmt), PreToolUse(PowerShell|Bash) → `hooks/guard-rclone.mjs`(`--dry-run` 없는 rclone 쓰기 명령 거부), `pnpm run check` 등 검증 명령 허용
- `.claude/rules/`: `ui.md`, `main-process.md`, `tests.md` (경로별로만 읽힘)
- `.claude/skills/`: `run-baton`(앱을 띄워 화면 확인), `rclone-probe`(rclone 동작 재확인), `new-ui-file`(컴포넌트 추가 절차)
- `scripts/dev/drive-app.mjs`: 빌드본을 임시 프로필로 띄워 CDP로 조작 (launch · seed · click · text · eval · shot · stop · clean)
- 확인: 훅 스크립트는 가짜 입력으로 14개 경우를 테스트, drive-app은 실행 → 비교 → 확인 → 동기화 → 정리까지 실제로 돌림
- 남은 것: 훅은 `.claude/`가 없던 세션에서는 발동하지 않아 새 세션에서 확인 필요

### [TASK_007] : (2026-10-11) [멀티 에이전트 하네스 참고해 보강]

- 참고: Antigravity용 멀티 에이전트 하네스 프롬프트 (architect → implementer → reviewer + browser, 루프 최대 3회, secret-guard, metrics)
- 가져온 것 (Baton · Claude Code에 맞게 고침)
    - `.claude/agents/reviewer.md`: 안전장치 · 비밀값 · 명세 충족 · 정확성 · 규칙 순으로 감사, 검사를 직접 돌림
    - `.claude/agents/app-verifier.md`: `run-baton` 절차로 앱을 띄워 기본 흐름과 명세 동작 확인 (원본의 browser 역할)
    - `.claude/skills/feature-pipeline`: 명세(`docs/specs/`) → 구현 → 두 검증자 병렬 → 최대 3회 루프. 지휘와 구현은 주 세션이 맡음
    - `.claude/rules/loop-control.md`: 루프 3회 제한, 둘 다 APPROVED일 때만 성공
    - `.claude/hooks/secret-guard.mjs`: Edit/Write 전에 토큰 · 비밀번호 · rclone.conf 형식 · 개인 키 검사
    - `.claude/hooks/usage-metrics.mjs` + `metrics-summary` 스킬: 스킬 · 에이전트 호출만 기록, `--summary`로 집계
- 가져오지 않은 것: AGENTS.md 교체(프로젝트 규칙이 사라짐), `web-scaffold`(단일 HTML + Tailwind CDN — 이 앱의 구조와 CSP에 맞지 않음), 모든 도구 호출 기록(호출마다 프로세스가 뜸)
- 확인: secret-guard 14개 경우, usage-metrics 기록 · 집계, 저장소 전체 오탐 검사 0건

### [TASK_008] : (2026-10-11) [Antigravity용 .agents 하네스 추가]

- `.claude/`를 원본으로 두고 `.agents/`에 같은 구성을 Antigravity 형식으로 둠 (Claude Code와 Antigravity를 함께 씀)
- `scripts/harness/lib.mjs`: 훅 공통 로직 (비밀값 검사, rclone 쓰기 명령 검사, oxfmt 포맷, 사용 기록). `.claude/hooks`와 `.agents/scripts`는 입력·출력 형식만 맞추는 얇은 어댑터
- `scripts/harness/sync-agents.mjs`: 규칙 4 · 스킬 5 · 검증 에이전트 2개를 `.agents/`로 생성. `pnpm run harness:sync`, `pnpm run harness:check`(check에 포함)
- `.agents/hooks.json` + `.agents/scripts/*.mjs`: rclone-guard, secret-guard, format-edited, metrics-tracer
- `.agents/agents/senior-architect.md`(pro), `implementer.md`(flash): Antigravity에서는 지휘와 구현을 에이전트가 맡음. `reviewer`(pro), `app-verifier`(flash)는 생성 파일
- 확인: 어댑터를 추정한 입력 모양 여러 가지로 파이프 테스트(통과), 동기화 후 `harness:check` 일치
- 확인 못 함: Antigravity가 실제로 훅에 넘기는 JSON 모양, 판정 출력 형식(`{decision}`), 훅 작업 폴더, 도구 이름(matcher), 모델 이름(pro/flash), 규칙의 경로별 적용 — 사용자가 준 프롬프트의 형식을 따랐고 Antigravity에서 돌려 보지 못함

### [TASK_009] : (2026-10-12) [CodeGraph 설치와 색인]

- `npm i -g @colbymchenry/codegraph@1.6.2` (MIT, 로컬 SQLite 색인 + MCP 서버). 이름이 같은 `@optave/codegraph`와 구분
- `codegraph install --target=claude,antigravity --location=global --yes` → 설치기가 고친 파일:
    - `~/.claude.json` (MCP 서버 `codegraph` 등록), `~/.claude/settings.json` (새로 만듦: `mcp__codegraph__*` 자동 허용, UserPromptSubmit 훅 `codegraph.cmd prompt-hook`)
    - `~/.claude/CLAUDE.md` (새로 만듦: CodeGraph 사용 안내 구역), `~/.gemini/config/mcp_config.json` (비어 있던 파일에 서버 등록, 설치기가 `.backup`을 남김)
- 텔레메트리 끔 (`codegraph telemetry off`, 저장된 설정으로 확인)
- `codegraph init` → `.codegraph/codegraph.db` (60개 파일, 783 노드, 2,112 엣지). `.codegraph/.gitignore`가 DB를 git에서 제외
- 확인: `codegraph callers findBlockedRclone`, `codegraph explore` 가 이 저장소의 실제 심볼과 줄 번호를 돌려줌
- 확인 못 함: 에이전트 안에서의 MCP 도구 호출 (Claude Code · Antigravity 재시작 필요)
- 주의: `.codegraph/`는 Windows와 WSL이 함께 쓰면 안 된다. Baton 작업의 제외 패턴에는 `.codegraph/daemon.sock`만이 아니라 `.codegraph/**`를 넣는다

### [TASK_010] : (2026-10-12) [intent.md · prd.md 작성]

- `docs/intent.md`: 배경, 풀려는 문제와 순서, 만드는 방식, 판단 기준 6가지, 하지 않는 것, 잘 됐다는 것
- `docs/prd.md`: 목표, 시나리오 S1~S6, 기능 F01~F18과 상태, 화면, 안전 요구사항 SR-01~SR-11, 비기능, 완료 기준(무엇으로 확인했는지 표시), 남은 위험, 로드맵
- `docs/plan.md`는 내용을 두 문서로 옮긴 뒤 삭제 (상태 표를 두 곳에 두지 않기 위해. 안내만 남겼다가 이름이 내용과 맞지 않아 지움)
- `feature-pipeline` 스킬, `reviewer`, `senior-architect`가 `plan.md` 대신 두 문서를 읽고 `prd.md`의 상태를 갱신하도록 고침
- 실제 사용자 경로는 문서에 적지 않음 ("WSL 작업 폴더 → 로컬 드라이브 → Google Drive"로만 표기)

## Error

### [ERR_001] : (2026-10-11) oxlint `no-restricted-imports`의 `group: ["../*"]`가 `../lib/format`을 못 잡음 → TASK_003

- 해결: 패턴을 `regex: "^\\.\\./"`로 바꿈. 임시 파일로 위반이 잡히는 것을 확인

### [ERR_002] : (2026-10-11) 이름 일괄 변경 뒤 `args.map(quote)`처럼 괄호 없이 넘기는 참조가 남음 → TASK_002

- 해결: `f_Quote`로 고침. 타입 검사로 발견
