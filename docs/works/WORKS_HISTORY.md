# WORKS_HISTORY

형식: `[TASK_NNN] : (YYYY-MM-DD) [변경 요약]`. 같은 기능을 다시 고치면 이전 기록을 갱신한다.

## 작업

### [TASK_001] : (2026-10-11) [rcloneGUI P0 구현]

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
- `.claude/skills/`: `run-rclonegui`(앱을 띄워 화면 확인), `rclone-probe`(rclone 동작 재확인), `new-ui-file`(컴포넌트 추가 절차)
- `scripts/dev/drive-app.mjs`: 빌드본을 임시 프로필로 띄워 CDP로 조작 (launch · seed · click · text · eval · shot · stop · clean)
- 확인: 훅 스크립트는 가짜 입력으로 14개 경우를 테스트, drive-app은 실행 → 비교 → 확인 → 동기화 → 정리까지 실제로 돌림
- 남은 것: 훅은 `.claude/`가 없던 세션에서는 발동하지 않아 새 세션에서 확인 필요

### [TASK_007] : (2026-10-11) [멀티 에이전트 하네스 참고해 보강]

- 참고: Antigravity용 멀티 에이전트 하네스 프롬프트 (architect → implementer → reviewer + browser, 루프 최대 3회, secret-guard, metrics)
- 가져온 것 (rcloneGUI · Claude Code에 맞게 고침)
    - `.claude/agents/reviewer.md`: 안전장치 · 비밀값 · 명세 충족 · 정확성 · 규칙 순으로 감사, 검사를 직접 돌림
    - `.claude/agents/app-verifier.md`: `run-rclonegui` 절차로 앱을 띄워 기본 흐름과 명세 동작 확인 (원본의 browser 역할)
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
- 주의: `.codegraph/`는 Windows와 WSL이 함께 쓰면 안 된다. rcloneGUI 작업의 제외 패턴에는 `.codegraph/daemon.sock`만이 아니라 `.codegraph/**`를 넣는다

### [TASK_010] : (2026-10-12) [intent.md · prd.md 작성]

- `docs/intent.md`: 배경, 풀려는 문제와 순서, 만드는 방식, 판단 기준 6가지, 하지 않는 것, 잘 됐다는 것
- `docs/prd.md`: 목표, 시나리오 S1~S6, 기능 F01~F18과 상태, 화면, 안전 요구사항 SR-01~SR-11, 비기능, 완료 기준(무엇으로 확인했는지 표시), 남은 위험, 로드맵
- `docs/plan.md`는 내용을 두 문서로 옮긴 뒤 삭제 (상태 표를 두 곳에 두지 않기 위해. 안내만 남겼다가 이름이 내용과 맞지 않아 지움)
- `feature-pipeline` 스킬, `reviewer`, `senior-architect`가 `plan.md` 대신 두 문서를 읽고 `prd.md`의 상태를 갱신하도록 고침
- 실제 사용자 경로는 문서에 적지 않음 ("WSL 작업 폴더 → 로컬 드라이브 → Google Drive"로만 표기)

### [TASK_011] : (2026-10-13) [GitHub 공개와 앱 이름 변경 (Baton → rcloneGUI)]

- 저장소: https://github.com/dev-Joy/rcloneGUI (공개). 그때까지의 상태를 영역별 커밋 6개로 올림 — git 없이 작업해 작업 번호별 중간 상태는 남아 있지 않음
- 올리기 전 전체 파일을 비밀값 · PC 경로 · 계정 이름으로 검사. 테스트의 프로젝트 이름 하나를 중립적인 이름으로 바꿈
- 앱 이름을 저장소 이름에 맞춤. 이 기록의 앞 항목들도 새 이름으로 고쳐 적혀 있다 (이전 이름: Baton)
    - `package.json` name `rclonegui`, productName `rcloneGUI` → 프로필 폴더가 `%APPDATA%\rcloneGUI`로 바뀜
    - 화면 API `window.rclonegui`, 타입 `itfRcloneGuiApi`
    - 백업 폴더 `.rclonegui-backup` (이전 실행의 백업은 `.baton-backup`에 그대로 있고, 실행 기록의 링크는 기록된 절대 경로라 계속 열림)
    - 스킬 `run-rclonegui`, 환경 변수 `RCLONEGUI_DEV_DIR` · `RCLONEGUI_DEV_PORT` · `RCLONEGUI_TEST_RCLONE`
- 기존 프로필(`%APPDATA%\Baton`)의 `jobs.json`과 `runs`를 새 프로필로 복사 (원본은 그대로 둠)
- 확인: check · 통합 테스트 · 빌드 통과, 빌드본을 띄워 창 제목 · `window.rclonegui` · 비교 → 동기화 흐름과 새 백업 경로 확인

### [TASK_012] : (2026-10-14) [GoodSync 참고 요구사항을 PRD에 반영]

- GoodSync 12.11 화면(비교 트리 · 좌우 크기/날짜 · 용량 · 작업 그룹 · 기타 필터 · 항목별 방향)을 배치와 정보 구성만 참고. 바이너리 디컴파일은 하지 않음(EULA)
- 사용자 선택: 화면 요소 전부, 항목별 동작은 표시 · 제외 · bisync 전부, 표기는 rcloneGUI의 "일어날 일" 원칙 유지
- 사용자 메모 반영: 스케줄(cron · Windows 작업 스케줄러 · 앱 시작 시 등록) → F10 확장, WSL 경로 선택 UI → F24, 동기화 범위(전체 · 파일만 · 폴더 구조만) → F25, SQLite 저장 → F26, exe → F12, 작업별 옵션 파일 → F27, 옵션값 글자 수 제한 → F28, Google Drive 동기화 확인 → 9장
- 안전 요구사항 SR-12(bisync) · SR-13(항목 선택 실행) · SR-14(스케줄 실행) · SR-15(옵션 파일) 추가
- intent.md "하지 않는 것": 양방향 동기화 → "사람 확인 없는 충돌 해결"로 좁힘
- 로드맵 v0.2 ~ v0.4 재편

### [TASK_013] : (2026-10-14) [F26 SQLite 저장]

- 명세: `docs/specs/2026-10-14-sqlite-store.md`, 결정: ADR 0005 (0004는 일부 대체)
- `src/main/store/app-database.ts`: `rclonegui.db`(node:sqlite, WAL), 스키마 v1(`user_version`), 새 버전 DB 거부, 처음 열 때 예전 JSON을 한 트랜잭션으로 가져옴(원본 파일 유지, jobs.json이 깨지면 아무것도 넣지 않음)
- 작업 · 설정 · 실행 저장소를 DB로. 실행 폴더의 combined.txt · rclone.jsonl · filter.txt는 그대로
- 실행 목록은 기록 순번(seq) 역순. SR-01 최신 판단은 메타를 파싱하지 않는 `latestRunId`로 (reviewer R1 지적 반영)
- `index.ts`: DB를 열지 못하면 오류 창 후 종료, `will-quit`에서 닫음
- 테스트: `tests/unit/app-database.test.ts` 추가, 기존 저장소 · 통합 테스트를 새 생성자로
- 검증: Round 2에서 reviewer · app-verifier 모두 APPROVED (R1 reviewer REJECTED: 설정 파싱 예외, 포맷, 문서)
- 남은 확인 필요: 종료(will-quit) 중 끝나는 실행 기록은 running으로 남을 수 있음, `commands()`의 최신 판단은 아직 `list()[0]`

### [TASK_014] : (2026-10-14) [F28 입력 글자 수 제한]

- 명세: `docs/specs/2026-10-14-input-length-limits.md`
- `src/shared/limits.ts`: `INPUT_LIMITS`(이름 100 · 경로 1024 · 제외 패턴 512자 · 200줄, 기존 값 유지)와 `findExcludeProblem`
- `schemas.ts`: 상한을 `INPUT_LIMITS`로, 칸 이름이 든 한국어 메시지
- 작업 편집 · 설정 창: 입력에 `maxLength`, 제외 패턴 칸에 줄 수 안내와 첫 문제 줄, 문제가 있으면 [저장] 끔
- 테스트: 상한 경계와 메시지, 화면 검사 함수
- 검증: Round 1에서 reviewer · app-verifier 모두 APPROVED

### [TASK_015] : (2026-10-14) [F29 기본 폴더 위치]

- 명세: `docs/specs/2026-10-14-default-folders.md` (사용자 요청)
- 설정에 `defaultSource` · `defaultDest`(예전 설정 행은 `default(null)`로 읽음), 설정 창에 두 칸과 [폴더 선택]
- `newJob(settings)`가 원본 · 대상을 채움. 복제는 그대로
- `app:pickFolder`가 `"source" | "dest" | "settings"`를 받고 시작 위치는 main이 설정에서 정함(로컬에 있는 폴더일 때만). 화면이 경로를 넘기지 않음
- 테스트: 예전 설정 행 읽기, `newJob` 채우기
- 검증: Round 1에서 reviewer · app-verifier 모두 APPROVED. 사용자 판단 필요: 기존 작업 편집의 [폴더 선택]도 설정의 기본 폴더에서 열림

### [TASK_016] : (2026-10-14) [F11 파일 상세]

- 명세: `docs/specs/2026-10-14-file-details.md`. 실험: `rclone-probes.ps1` L 단계를 양쪽 lsjson으로, fixture `lsjson-l-src.json` · `lsjson-l-dst.json`, rclone-notes 2026-10-14
- 작업 옵션 `readDetails`(기본 켬). 성공한 미리보기 뒤 원본 · 대상 `lsjson`을 동시에 실행해 실행 폴더에 저장, 메타 `details`(read · failed · off)
- `buildListArgs`(읽기 전용, 차단 목록 검사), `parseLsjson`, `readItems`가 상세를 합침, `isDestNewer`
- 화면: 비교 목록에 크기 · 수정 시각과 "대상이 더 최신", 실행 확인 창에 그 수와 목록, 상세 실패 안내, 작업 편집 체크박스
- 검증: R1 · R2 모두 reviewer · app-verifier APPROVED. 확인 필요: SR-01 30분 기준점이 목록 읽기 끝난 시각(리모트에서 길어질 수 있음)
- R1 뒤 후속(R2): 출력 스트림 오류 처리, 배너에 "크기 · 수정 시각 읽는 중", 취소 배너의 "(종료 코드 0) 취소" 중복 제거, `readItems` 단위 테스트, 명세에 `--skip-links`
- 오류: lsjson 출력 파일 close가 프로세스 close보다 먼저 와 종료 코드를 null로 판정 → 두 이벤트를 모두 기다리게 고침 (통합 테스트로 발견)

### [TASK_017] : (2026-10-14) [F19 비교 트리 보기]

- 명세: `docs/specs/2026-10-14-compare-tree.md`
- `src/lib/file-tree.ts`: `buildFileTree`(경로로 폴더, 폴더별 건수 · 크기 합 · 대상이 더 최신 수), `flattenTree`, `folderIds`, `initialCollapsed`(5,000줄 넘으면 모두 접음). 이름 순서는 `Intl.Collator("en", numeric)`로 고정(시스템 로캘에 따라 한글/영문 순서가 달라지는 것을 테스트로 발견)
- 공용 `ZBCTreeTable`(가상 스크롤, 펼침 단추 · 더블클릭, treegrid 역할), 페이지 `JobFileTree`(6열, 폴더 요약), `JobPage`에 [트리 | 평면]
- 테스트: `tests/unit/file-tree.test.ts`
- R1: reviewer APPROVED, app-verifier REJECTED(950px에서 항목 열 폭 0, 폴더 요약 잘림). R2 수정: 열 폭(항목 minmax(160px, 3fr) · 일어날 일 minmax(150px, 1.6fr) · 크기 · 시각은 줄어듦), 요약 줄임표 + title, 머리글 scrollbar-gutter, 포커스 링, 줄 ID에 종류(d:/f:) 접두사, flattenTree useMemo, 펼침 단추 더블클릭 전파 막음, prd 6열
- R2: reviewer APPROVED, app-verifier REJECTED(900 ~ 1266px에서 파일 줄의 "원본으로 덮어씀" + "대상이 더 최신"이 150px 칸을 넘쳐 양쪽 잘림). R3: reviewer · app-verifier 모두 APPROVED (900 ~ 1600px 측정, 배지 · 경고 잘림 없음). 남은 확인 필요: 트리 줄 user-select: none이라 이름을 드래그로 복사할 수 없음. R3 수정: 일어날 일 열 최소 190px, 배지만 줄임표로 줄고 경고는 남김, 칸 title, 줄 user-select: none

### [TASK_018] : (2026-10-16) [F25 동기화 범위와 폴더 작업 미리보기]

- 명세: `docs/specs/2026-10-14-sync-scope.md`. 실험: `rclone-probes.ps1` P1 ~ P5, fixture `log-p3d.jsonl` · `log-p5.jsonl`(경로 중립화), rclone-notes 2026-10-14
- 발견: sync는 지금도 대상에만 있는 빈 폴더를 지우는데 combined에 나오지 않아 미리보기에 안 보였다
- 작업 옵션 `scope`(files 기본 · all · folders), `--create-empty-src-dirs`, 폴더 구조만은 필터 끝에 `+ */` · `- *`
- JSON 로그에서 폴더 작업(`dirOpOf`) → 실행 폴더 `dirs.txt`, 메타 `dirs`, `readItems`에 폴더 항목(isDir). `countItems`는 폴더를 세지 않음(삭제 수 · --max-delete는 파일 기준)
- 화면: 편집 창 범위 라디오와 sync 빈 폴더 안내, 목록 · 트리의 폴더 배지, 칩 옆 폴더 작업 문구, 확인 창 폴더 목록, [동기화]는 폴더 작업만 있어도 켜짐(`hasChanges`), 실행 결과 배너
- 결정(2026-10-16 사용자 확인): "폴더 구조만"에서만 SR-06 파일 수 검사 제외, ADR 0006. prd SR-06 문구 갱신
- 테스트: 파서(실제 로그), 빌더(범위별 인자 · 필터), 트리(폴더 작업), 통합(빈 폴더 삭제 표시, 전체 범위, 폴더 구조만은 파일 불변)
- R1: app-verifier APPROVED, reviewer REJECTED(필터에 걸린 파일만 든 대상 폴더를 "빈 폴더 지움"이라고 표시하지만 실제로는 남음 — 실험 P6로 재현). R2 수정: 미리보기는 "대상에만 있음 · 비어 있으면 지움", 로컬 대상 실행 뒤 실제 확인(remove/kept/verified, dirs.txt `=`), 리모트는 "지우기 시도", 확인 창 설명은 지울 폴더가 있을 때만, 실행 기록 건수에 폴더 작업, ADR 0006 근거 2 수정, rclone-notes P6, 통합 테스트 추가
- R2: reviewer · app-verifier 모두 APPROVED. 남은 관찰: 평면 목록에서 남은 폴더(same)의 원본 칸에 경로가 보임, 필터에 걸린 파일만 든 대상 폴더가 있으면 비교마다 [동기화]가 켜짐, 파일 백업이 없는 실행에도 [백업] 링크가 보임(이전부터), 리모트 대상 문구 미확인

### [TASK_019] : (2026-10-16) [F24 WSL 경로 선택]

- 명세: `docs/specs/2026-10-16-wsl-path-picker.md`. 이 PC 확인: `wsl -l -q`는 UTF-16LE · CRLF, 멈춘 배포판은 경로 접근 시 켜짐
- `src/main/system/wsl.ts`: `parseWslList`(UTF-16LE), `listWslDistros`(execFile wsl.exe, shell: false, 5초, 실패 시 빈 목록), `wslRoot`
- IPC `app:wsl-distros`, `app:pickFolder` 입력 확장(`{ target, wslDistro }`). main이 배포판 이름을 실제 목록과 대조하고 경로는 main이 만듦
- 작업 편집: 원본 · 대상 칸에 [WSL] 단추(배포판마다), 여는 동안 "WSL 여는 중…"과 비활성
- 테스트: `tests/unit/wsl.test.ts`(실제 출력 바이트, 여러 배포판, 이름 · 입력 스키마)
- R1: reviewer APPROVED. 후속(R2): wsl.exe를 `%SystemRoot%\System32` 절대 경로로(현재 폴더의 같은 이름 파일 방지), WSL 여는 동안 [폴더 선택]도 비활성(창 두 개 방지), prd F24 경로 표기, 단추 묶음이 줄바꿈되어 입력 칸이 커지던 것(app-verifier R1 관찰) → 한 줄 고정. R1 · R2 모두 reviewer · app-verifier APPROVED. 확인 못 함: 배포판이 둘 이상인 화면, WSL이 없는 PC, 실제 창 크기 조절(에뮬레이션으로 대신)

### [TASK_020] : (2026-10-16) [F12 설치본]

- 명세: `docs/specs/2026-10-16-installer.md`. 결정은 추천안(NSIS 사용자 단위, 자동 시작 기본 끔, 서명 없음), 사용자 "진행" 승인 후 `electron-builder` 26.15.3(MIT) 개발 의존성 추가
- `electron-builder.yml`, `pnpm run dist` → `dist/rcloneGUI-Setup-0.1.0.exe`(약 113MB). app.asar에는 `out/` · `package.json` · 운영 의존성 8개만(소스 · 테스트 · 문서 · 하네스 0개 확인). 서명 상태 NotSigned
- pnpm이 `electron-winstaller`(Squirrel용) 빌드 스크립트를 무시했다고 알림 — NSIS와 무관해 허용하지 않음
- 설정 `launchAtLogin`(default false), 저장 시 설치본에서만 `app.setLoginItemSettings`, 앱 시작 때는 바꾸지 않음. IPC `app:info`(버전 · 설치본 여부 · 실제 등록 값), 설정 창 체크박스 · 차이 안내 · 버전
- R1: reviewer REJECTED — 실제 값을 openAtLogin(Run 키만)으로 읽어 작업 관리자에서 끈 것이 안 보이고, 다른 설정 저장 때 setLoginItemSettings가 다시 켬. R2 수정: executableWillLaunchAtLogin으로 읽기, 체크박스를 바꿔 저장할 때만 반영(enabled 함께), 안내 문구, 명세
- R2: reviewer · app-verifier 모두 APPROVED(풀린 설치본을 임시 프로필로: app.info, 다른 설정 저장 뒤 Run · StartupApproved 항목 0건, 기본 흐름). 확인 못 함: Setup.exe 설치 · 제거, 제거 뒤 데이터 보존, 자동 시작을 켜 저장 · 작업 관리자에서 끈 뒤 차이 안내 · 다시 켜기 — 사용자 PC 변경이라 승인 대기
- 문서: README(명령, 데이터 위치를 SQLite로 갱신 — F26 때 빠졌던 것, 설치본 절), AGENTS.md 명령, THIRD_PARTY_NOTICES, CHANGELOG

### [TASK_021] : (2026-10-16) [F10 1단계 앱 안 자동 실행 · SR-10]

- 명세: `docs/specs/2026-10-16-schedule-in-app.md`. 사용자 "진행": 앱 안 스케줄 먼저, Windows 작업 스케줄러(SR-14)는 2단계
- `src/shared/cron.ts`: 5필드 cron 파서(외부 라이브러리 없음), `nextScheduleTime`(간격 · cron), `cronProblem`(한국어 메시지)
- `schedule.cron` · `schedule.paused`(default null), 실행 메타 `trigger`(manual · schedule)
- `src/main/schedule/scheduler.ts`: 30초마다 확인, 켠 뒤부터 셈(놓친 차례 따라잡지 않음), 미리보기 → `autoStopReason`(실패 · 빈 원본 · 읽기 오류 · 자동 한도 초과) → 바뀔 것 없으면 끝 → `runner.execute()`(같은 검사) → 실패면 멈춤. 예외도 멈춤. 멈춤은 `jobs.setPaused` + Windows 알림 + `jobs:changed`
- IPC `jobs:resume-schedule` · `jobs:changed`, `runner.isActive`, 작업 저장 시 다음 시각 재계산
- 트레이: 자동 실행 작업이 있으면 창을 닫아도 숨김, 메뉴 [열기] [자동 실행 모두 멈추기] [종료], 첫 숨김 알림. 아이콘 `resources/icon.png`(`scripts/dev/make-icon.mjs`로 생성), 설치본 extraResources · win.icon
- 화면: 작업 편집 "자동 실행" 칸(간격 · cron, 다음 예정 3개, 자동 삭제 한도, 틀린 cron이면 저장 막음), 작업 목록 "자동" · "자동 멈춤", 작업 화면 멈춤 배너와 [다시 켜기], 실행 기록 "자동"
- 테스트: cron 15, 스케줄러 15(가짜 runner · 시계), 통합 2(실제 rclone 자동 실행, 한도 초과 멈춤)
- R1: reviewer REJECTED — (1) 편집 창이 열려 있는 동안 멈춘 작업을 다른 칸만 고쳐 저장하면 paused가 null로 덮여 다시 돎, (2) 미리보기 중에 끄거나 멈춰도 미리보기 뒤 execute. R2 수정: save()는 paused를 저장된 값으로 유지(setPaused · resume으로만 바뀜), 실행 직전 작업을 다시 읽어 enabled · paused · 지금 자동 한도로 다시 판단, 작업 저장 · 삭제 시 트레이 상태 즉시 갱신. 테스트 3개 추가
- R2: reviewer · app-verifier 모두 APPROVED. 확인 못 함: 트레이 메뉴 조작 · Windows 알림 표시, 미리보기 중 끄기(단위 테스트로만). 후속 후보: 자동 실행을 끈 채 틀린 cron이면 화면은 저장 허용 · main 거부, pause 중 예외 재발생 시 처리되지 않는 rejection, resume 뒤 트레이 갱신 5초 지연, 편집 창에 멈춤 표시 없음

### [TASK_022] : (2026-10-16) [F09 체인 실행 · SR-11, F10 후속 정리]

- 명세: `docs/specs/2026-10-16-chain-run.md`
- 저장 검증 `assertChain`: 없는 작업 · 고리(A → B → A) 거부
- 스케줄러: 앞 작업이 executed · nothing이면 chainNext를 같은 자동 흐름으로(뒤 작업의 자동 한도, enabled가 꺼져 있어도 체인으로 돎, paused는 존중), 방문 집합 · 최대 10, 멈춤 알림에 "(A에 이어서)", `chainSteps`
- 화면: 작업 편집 "이 작업이 성공하면 이어서" 선택, 수동 실행 성공 뒤 [이어서: … 비교](실행은 사람이 확인 창에서)
- F10 후속: 자동 실행을 끈 채 틀린 cron이면 화면도 저장 막음, 멈추는 중 재실패 시 던지지 않음(테스트), [다시 켜기] 뒤 트레이 즉시 갱신, 편집 창 멈춤 안내
- 테스트: `tests/unit/chain.test.ts` 9, 스케줄러 1, 통합 1(실제 rclone 두 작업 체인과 앞 멈춤)
- R1: reviewer REJECTED — 자동 실행이 꺼진 체인 대상이 멈추면 멈춤 배너 · [다시 켜기] · 목록 배지가 안 보임, 체인 대상의 자동 삭제 한도 칸이 안 보임, prd SR-11 미갱신. R2 수정: 멈춤 표시는 enabled와 무관하게, 자동 한도 칸은 자동 실행을 켰거나 다른 작업의 체인 대상이면 보이고 안내 한 줄, 고리 오류 문구, prd SR-11
- R2: reviewer · app-verifier 모두 APPROVED. 후속 후보: 오류 알림이 저절로 닫히지 않고 편집 창 단추를 가림(기존), rclone을 못 쓸 때도 [이어서] 단추가 눌림

### [TASK_023] : (2026-10-16) [커밋 정리와 화면 후속 정리]

- 브랜치 `feat/v0.2`에 커밋 4개(build 설치본 · test rclone 실험 · feat v0.2 기능 · docs). 여러 기능이 같은 파일을 바꿔 코드는 한 커밋. `docs/DESIGN.md`(사용자 파일)는 커밋하지 않음. `pnpm-workspace.yaml`의 electron-winstaller 자리표시를 false로
- 알림을 위쪽(top 12px, z-index 1000)으로 옮겨 대화상자 [저장] · [취소]를 가리지 않게, 오류 알림도 10초 뒤 자동으로 닫힘
- 앱을 켤 때 고르지 않은 작업의 실행 기록도 읽어 목록에 마지막 실행 시각 표시
- rclone을 쓸 수 없으면 [이어서: … 비교] 비활성

### [TASK_024] : (2026-10-16) [F20 용량 표시]

- 명세: `docs/specs/2026-10-16-capacity.md`. 실험 Q(about), fixture `about-q.json`, rclone-notes 2026-10-16
- `aboutRoot`(드라이브 · UNC · WSL · 리모트 맨 위), `buildAboutArgs`(읽기 전용, 차단 목록 검사), `parseAbout`
- 성공한 미리보기 뒤 원본 · 대상 about을 동시에(30초 제한, 취소 시 함께 끝냄), 미리보기 통계 totalBytes를 옮길 크기로. 메타 `space`
- 화면: 작업 화면 경로 아래 "비교 시점 · 원본 여유/전체 · 대상 여유/전체 · 옮길 크기", 대상 여유 < 옮길 크기면 경고(확인 창에도, 실행은 막지 않음)
- 테스트: aboutRoot · buildAboutArgs · parseAbout · isDestTooSmall · describeSpace, 통합 1
- R1: reviewer REJECTED — buildAboutArgs의 차단 목록 테스트 없음. R2 수정: 쓰기 옵션 없음 · 차단 값이면 던짐 테스트, f_RunCapture · f_RunList가 띄우기 직전 assertSafeArgs, rclone-notes에 앱이 묻는 뿌리 형태. app-verifier R1 APPROVED, 관찰 반영: 용량 줄을 항목별로 묶어 "옮길 크기 29 B"처럼 중간에서 끊기지 않게
- R2: reviewer · app-verifier 모두 APPROVED. 확인 못 함: 리모트(Drive) 용량, about을 지원하지 않는 백엔드의 "용량 확인 불가" 화면

### [TASK_025] : (2026-10-16) [F21 작업 그룹]

- 명세: `docs/specs/2026-10-16-job-groups.md`
- DB 스키마 v2(`groups` 표, v1에서 표만 더함), 작업 `groupId`(없으면 null, 없는 그룹이면 GROUP_NOT_FOUND), `clsGroupStore`(목록 · 저장 · 지우기, 이름은 대소문자 무시 중복 거부). 지우면 그 그룹 작업을 한 트랜잭션에서 그룹 없음으로
- IPC `groups:list/save/delete`, 저장 · 지우기 뒤 `jobs:changed`. 그룹은 실행 설정 지문에 들어가지 않음
- 화면: 그룹이 있으면 "모든 작업 (N)" 아래 그룹별 접기(▾/▸), 머리에 마우스를 올리면 [이름 바꾸기][지우기](인라인 확인), [+ 새 그룹] · GroupNameDialog, 편집 창 "그룹" 선택
- 테스트: groups.test.ts 6개(마이그레이션, 저장 · 중복 · 이름 바꾸기, 지우기, 없는 그룹, 지문, 화면의 미리보기 무효 판단)
- R1: reviewer REJECTED — 화면 saveJob이 그룹만 바꿔도 미리보기를 무효로 함(명세 위반), `.sub` 클래스 중복으로 그룹 안 작업이 가로 배치, 개수 괄호 없음, import 블록. app-verifier R1은 사용량 한도로 끊김
- R2 수정: `runSettingsOf` · `sameRunSettings`(shared)로 jobHash와 화면 판단을 한 곳에, 명령 값이 바뀔 때만 무효. `.members`, "(N)", External imports 분리, 없는 그룹을 가리키는 작업은 그룹 없음에 표시
- R2: reviewer · app-verifier 모두 APPROVED. 남은 것: job-store save의 그룹 확인과 쓰기 사이에 그룹 지우기가 끼는 경합(모달이라 화면에선 어려움, 생겨도 그룹 없음에 보임), 잘린 그룹 이름 툴팁 없음, 실제 창 크기 조절은 흉내로만 확인

### [TASK_026] : (2026-10-16) [F22 비교 결과 "기타" 보기]

- 명세: `docs/specs/2026-10-16-list-views.md`. rclone-notes 2026-10-16(실행 combined, 필터 없는 lsjson)
- 칩 줄의 "기타" 선택: 포함됨(전체) · 제외됨 · 새로 생김 · 아직 실행되지 않음. 다른 실행을 열면 칩 보기로
- 제외됨: `runs:excluded` → `readExcluded`(성공한 미리보기만, 설정 지문이 다르면 RUN_STALE, 필터 없는 lsjson 양쪽, `diffExcluded`, excluded.json에 남김, 동시 요청은 한 번)
- 새로 생김: 미리보기보다 먼저 끝난 마지막 성공한 실제 동기화의 미리보기와 비교(`baselineExecute` · `newSince`). 아직 실행되지 않음: 실행의 미리보기 할 일 − 실행 combined(`pendingAfter`)
- 화면: `itfFileItem.note`(excluded · pending), `itemActionLabel`, 트리 폴더 "제외 N"
- 테스트: list-views.test.ts, 필터 없는 lsjson 인자, 통합 2(제외됨 · 거부, 성공한 실행은 처리 안 됨 0)
- R1: reviewer REJECTED — 제외됨 실패를 알림으로 보이지 않음. app-verifier REJECTED — 최소 폭(886px)에서 기타 선택 상자 때문에 칩 · [트리|평면] 글자가 접힘
- R2 수정: 실패 시 알림 + 목록 문구, 칩 줄 flex-wrap · 글자 nowrap, 아직 실행되지 않음은 실행이 끝난 뒤에만, 칩 aria-pressed는 칩 보기에서만, 명세에 캐시 순서 기록
- R2: reviewer · app-verifier 모두 APPROVED. 남은 것: 실패한 보기에 머물면 오류 알림이 다시 뜰 수 있음, 제외됨 lsjson은 취소 · 시간 제한 없음, 실패 · 중지된 실행의 처리 안 됨 항목은 화면에서 못 봄, 720px은 흉내로만

### [TASK_027] : (2026-10-16) [F23 항목별 동작 · SR-13]

- 명세: `docs/specs/2026-10-16-item-actions.md`. rclone-notes 2026-10-16 실험 F(필터 이스케이프 · 뿌리 고정)
- 작업 `skip`(상대 경로, 폴더는 끝 /, 200개), `jobs:set-skip`, 편집 창 저장은 skip을 지킴, 필터 맨 앞 `- /<경로>`(폴더는 `/` · `/**` 두 줄), `escapeGlob`
- `runSettingsOf`에 skip(비어 있으면 넣지 않음) → 빼면 그 전 미리보기는 PREVIEW_STALE. 성공한 실제 동기화 뒤 시작 때 목록 그대로면 비우고 jobs:changed
- 화면: 방향 기호(`actionArrow`), 줄 메뉴 `ItemMenu`(오른쪽 클릭 · 메뉴 키 · Shift+F10, 화살표 · Esc), 뺀 항목 안내(항목별 되돌리기 · 모두 되돌리기)
- 테스트: 필터 줄 · 이스케이프 · 지문, skip 스키마, 저장소, 방향 기호, 통합 2(빼면 실행 거부 → 다시 비교 → 그 파일은 그대로 → 성공 뒤 비움, 실패하면 그대로)
- R1: reviewer · app-verifier 모두 APPROVED. 남은 것: 이름이 공백으로 끝나는 리모트 파일은 필터 줄 공백 처리 미확인, 목록 줄마다 Tab이 멈춤 · 메뉴를 닫으면 초점이 줄로 돌아가지 않음, 트리의 일어날 일 칸에서 기호 때문에 긴 배지가 잘림, 빼기 직후 [동기화] title 문구가 실제 이유와 다름, 취소 · 자동 실행 · 체인 · 200개 한도는 화면에서 못 봄

### [TASK_028] : (2026-10-16) [Google Drive 실사용 확인과 수정 2건]

- 사용자가 테스트 폴더로 리모트를 만듦(root_folder_id 지정). 읽기 확인(lsjson · about) → 앱에서 로컬 → Drive 비교 · 동기화 · 재비교(같음만)
- 수정 1: 리모트 대상 폴더가 없을 때 lsjson exit 3을 빈 목록으로(readDetails · computeExcluded). 통합 테스트는 환경 변수 local 백엔드 리모트로 재현(고치기 전 실패 확인)
- 수정 2: `clsRunStore.closeInterrupted` — 앱이 켜질 때 대기 · 실행 중 기록을 실패로 닫음(실제 동기화는 "일부 파일만 바뀌었을 수 있음"). 사용자가 누른 Drive 동기화 도중 빌드하려고 앱을 꺼서 드러남
- 수정 3: 사용자가 대상 칸에 Drive 웹 주소를 넣어 rclone이 "https" 리모트를 찾지 못함 → pathSchema가 웹 주소를 거부, describeExit가 "설정에 없는 리모트"를 풀어 씀
- 사용자 지적(".claude · AGENTS.md 참고하는 거 아니었어?")으로 수정 1~3을 검증 루프에 올림. R1: reviewer REJECTED — 웹 주소 거부를 읽기용 pathSchema에 넣어 예전에 웹 주소로 저장된 작업이 하나라도 있으면 목록 전체가 열리지 않음. app-verifier REJECTED — rclone은 설정에 없는 리모트를 critical로 남기는데 errors는 error만 모아 안내가 나오지 않음, 앱이 꺼져도 rclone이 남아 계속 돌 수 있음
- R2 수정: 웹 주소 확인을 저장 때(validateJobPaths, PATH_IS_WEB_ADDRESS)로 옮기고 http · https · ftp · file만 막음(예전 작업 목록 테스트), errors에 critical 포함, 앱이 끝날 때 runner.cancelAll()
- R2: app-verifier APPROVED(설정에 없는 리모트 안내, 창 닫기 · 강제 종료 모두 rclone이 남지 않음, 웹 주소 저장 거부, 회귀 없음). reviewer R2 REJECTED — rclone-notes(critical 줄) · CHANGELOG(앱 종료 시 rclone 멈춤) 누락 → R3 채움 + 통합 테스트가 빈 임시 rclone.conf 사용 → reviewer R3 APPROVED
- 남은 것: 공용 client_id 종료 예고(자기 client_id로 리모트 재생성 필요), 중단된 실행이 대상에 *.partial을 남겨 다음 비교에서 삭제 대상으로 보임, jobs.save 동시 호출 시 나중 쓰기가 덮음(화면에서는 안 생김), 알림 영역 [종료] 경로는 화면으로 못 봄, Drive 쪽 백업 폴더 · fast-list 미확인, 실패 · 중단된 실행 목록이 모든 항목을 과거형("복사함")으로 보임(이전부터), 중단 기록의 걸린 시간은 다시 켠 시각까지

### [TASK_029] : (2026-10-17) [진행 표시 평균 속도 · 남은 시간]

- 명세: `docs/specs/2026-10-17-average-progress.md`. 사용자 Drive 동기화에서 "5.7 KB/s · 남은 시간 16시간"을 보고 질문
- 원인: rclone stats.speed · eta는 최근 몇 초 기준. Drive가 큰 파일을 100%에서 마무리하는 동안 bytes가 멈춰 0에 가깝게 떨어짐(실제 로그 확인, 평균은 0.7~2.3 MB/s, 오류 · rate limit 없음)
- 파서가 elapsedTime · transferring[].percentage를 읽어 `elapsed` · `finishing`, `averageRate`(순수 함수), 진행 줄 "평균 … /s · 남은 시간 약 … · 리모트가 파일 N개를 마무리하는 중"
- fixture `log-d-drive-stats.jsonl`: 사용자 실제 실행 로그의 stats 3줄, 파일 이름 · srcFs · dstFs를 지움
- 테스트: 파서(log-d · log-a), averageRate 경계값
- R1: reviewer REJECTED — WORKS.md 줄이 스크립트 실수로 깨짐(+ fixture 시각을 손으로 바꿈, 출처 주석). app-verifier R1은 사용량 한도로 끊김(남은 시험 파일 4.8GB 정리). R2: reviewer REJECTED — WORKS.md 꼬리가 남음. R3: reviewer APPROVED. app-verifier R2 APPROVED(25MB/s 제한에서 평균 25 MB/s, 남은 시간이 실제와 1초 단위로 맞음, 끝날 때 값이 튀지 않음, 886 · 720 · 600px 잘림 없음)
- 남은 것: 미리보기(dry-run)도 bytes를 보고해 1초 넘게 걸리는 미리보기(리모트 등)에서 '평균 … /s · 남은 시간'이 보일 수 있음(재현 못 함), 좁은 창에서 '남은 시간 약' / '25초'처럼 묶음 중간에서 줄이 바뀜, '마무리하는 중' 안내는 화면에서 못 봄(로컬은 100% 파일이 생기지 않음, fixture로만 확인)

### [TASK_030] : (2026-10-17) [새 Drive 폴더로 동기화 · 백업 확인]

- 사용자가 준 새 Drive 폴더를 리모트를 새로 만들지 않고 `gdrive-test,root_folder_id=<ID>:rclonegui-test`로 씀(맨 위가 아니라 하위 폴더 — sync가 기존 파일을 지우지 않게)
- 앱(임시 프로필)에서 비교(추가 3, 크기 · 시각 읽음, 용량) → 동기화 → 원본 1개 고치고 1개 지움 → 비교(변경 1 · 삭제 1) → 삭제 확인 후 동기화 → Drive `.rclonegui-backup/drive/<실행>`에 이전 changed.txt("version 2 longer")와 only-src.txt → 재비교 같음 2 · "바뀔 것 없음"
- 코드 변경 없음(문서만). 남은 것: fast-list
- 참고: 사용자가 리모트를 자기 GCP client_id로 다시 만듦(공용 client_id 종료 문제 해소). 이전 테스트 폴더는 비어 있었음(휴지통 증가, 원인 미확인)

### [TASK_031] : (2026-10-17) [Google Drive 폴더 주소 붙여 넣기 · 미리보기 진행 줄]

- 명세: `docs/specs/2026-10-17-drive-folder-url.md`. 사용자 "이런 파싱 기능이 있어야 할 것 같다"
- `src/shared/drive-url.ts`: `parseDriveFolderUrl`(folders · u/N/folders · open?id · folderview?id, 파일 주소 · 다른 도메인 제외), `driveFolderLocation`, `parseDriveLocation`
- `listRemotes`가 `listremotes --long --json` → `{ name, type }[]`(`parseRemoteList`, fixture listremotes-json.json)
- 편집 창: Drive 폴더 주소면 drive 리모트 단추(없으면 만드는 방법 안내), 연결 문자열이면 "Google Drive 폴더 · 연결 X"와 맨 위 sync 경고
- 진행 줄: 미리보기(kind preview)에서는 평균 속도 · 남은 시간 · 마무리 안내를 쓰지 않음(TASK_029 남은 것). 마무리 안내 문구를 "다 보낸 파일 N개를 마무리하는 중"으로(로컬에서도 뜸)
- 테스트: drive-url(주소 7종 · 아닌 것 8종 · 연결 문자열), parseRemoteList, 통합 listRemotes(빈 설정 · 환경 변수 리모트)
- R1: reviewer REJECTED — 맨 위 sync 경고가 "(백업 폴더로 옮김)"이라 했지만 백업 켬이면 저장이 거부되고 백업 끔이면 백업이 없음, 테스트 이스케이프, JSDoc 위치. app-verifier R1 APPROVED(수정 전 빌드). R2: 경고를 백업 설정별로, 리모트 목록 읽는 중 · 실패 구분, 한계(SR-07 · SR-08이 폴더 ID 사이를 못 봄) 명세에 기록, 마무리 안내 문구 "다 보낸 파일 N개" → reviewer · app-verifier R2 모두 APPROVED
- 남은 것: SR-07 · SR-08 폴더 ID 한계, 파일 ID를 root_folder_id로 넣을 때 동작 미확인, 백업 끔 + copy 맨 위는 경고 없음(덮어쓴 파일은 백업 없음), 남은 시간이 바이트 기준이라 작은 파일이 많으면 "약 0초", "리모트:" 뒤 공백 없음(이전부터)

### [TASK_032] : (2026-10-17) [실행 스냅샷 · 작업별 rclone.conf 칸 안내]

- 명세: `docs/specs/2026-10-17-run-snapshot.md`. 사용자 "conf 파일은 언제든지 바뀔 수 있으니 그 시점 스냅샷을 남겨야", "1+2번까지 해봐"
- 처음 제안한 SHA-256 해시는 파일 내용을 읽어야 해 안전 규칙 6에 걸려 뺌(사용자에게 정정). 지문은 stat(경로 · 크기 · 수정 시각)만
- 실행 메타 `snapshot`: filter.txt 내용(64K자 넘으면 자름) · rclone.conf 지문(출처 job · settings · default. 기본 위치는 `rclone config file`을 rclone 실행 파일마다 물어 두고, 실패는 남기지 않음)
- `runs:config-check`(실행 ID만 받음) → same · changed · missing · unknown. 실행 기록 [정보] → RunInfoDialog
- 편집 창 rclone.conf 칸: [파일 선택] · 안내
- 테스트: snapshot.test.ts(자르기 · config file 파서 · stat · 비교), 통합 2(작업 지정 conf · skip 필터 · 바뀜 · 없음 · 기본 위치)
- R1: reviewer REJECTED — 필터 한도가 명세(64K)의 8배, 기본 위치 캐시가 rclone 실행 파일별이 아니고 실패도 저장. app-verifier REJECTED — 실행 정보 창 오른쪽 잘림(모달 520px보다 넓은 고정 폭), 좁은 창에서 기록 표 [백업] 잘림
- R2 수정: 64K자, clsDefaultConfigCache(exe별 · 실패 안 남김) + 테스트, 예전 메타 파싱 테스트, 정보 창 wide 모달 · 고정 폭 제거, 기록 표 내용 칸이 먼저 줄어들고 머리글 줄바꿈 없음
- R2: reviewer APPROVED. app-verifier REJECTED — 최소 폭(886)에서 기록 표가 604px 상자보다 넓어 단추가 모두 밖으로 밀림(내용 칸만 줄여서는 모자람). R3 수정: 단추 칸을 오른쪽에 고정(sticky), 건수 칸 줄바꿈, 내용 칸 최소 80px
- R3: reviewer · app-verifier 모두 APPROVED(최소 폭 886에서 단추 모두 보이고 실제 클릭으로 눌림, 밝은 · 어두운 테마 배경). 남은 것: 넓은 창에서도 건수 칸이 두 줄로 접힘, "스냅샷 남기기 전 버전" · "그때 파일이 없었음" · 실행 파일별 기본 위치 구별은 화면으로 못 봄, 첫 실행 때 rclone config file 대기(최대 30초) 동안 기록이 늦게 써짐

### [TASK_033] : (2026-10-17) [작업 목록: 최근 동기화 · 주기 · 다음 실행]

- 명세: `docs/specs/2026-10-17-job-list-status.md`. 사용자 "goodsync처럼 왼쪽에 최근동기일시, 자동화여부, 주기 보이나?" → "해줘"
- `src/lib/schedule-text.ts`: `describeSchedule`(간격 · 흔한 cron 모양, 그 밖은 식 그대로), `lastRunText`(실제 동기화 우선 · 실패 · 취소 · 뒤의 비교), `nextRunText`
- `jobs:next-runs`(입력 없음) → 자동 실행기 `nextRunAt` 값. 목록이 30초마다 · 작업 목록이 바뀌면 다시 물음
- 목록 한 줄을 이름 아래 두 줄로(최근 실행 / 자동 · 주기 · 다음), 말줄임 + 줄 툴팁
- 테스트: schedule-text.test.ts(주기 21종, 최근 실행, 다음 시각)
- R1: reviewer REJECTED — `*/45`를 "45분마다"로 표시했지만 cron은 0 ~ 59분 안에서 건너뛰어 실제로 :00 · :45(번갈아 45 · 15분). R2 수정: 60을 나눠 떨어지는 N만 "N분마다", 29 ~ 31일은 식 그대로, 반례 테스트
- R2: reviewer · app-verifier 모두 APPROVED(cron 7종 문구와 다음 시각이 규칙과 맞음, */20 자동 실행이 실제로 돌고 다음 시각이 넘어감, 좁은 창 · 어두운 테마 말줄임). 남은 것: 실행 기록 100개만 읽어 동기화 뒤 비교가 100번 넘으면 동기화 시각이 빠짐, 시각이 지난 뒤 최대 약 60초 동안 지난 "다음"이 보임, 멈춤 툴팁에 주기 없음, 툴팁이 실제로 뜨는 모습은 title 값으로만 확인

### [TASK_034] : (2026-10-17) [F27 작업별 옵션 파일 · SR-15]

- 명세: `docs/specs/2026-10-17-options-file.md`. 사용자 "남은거랑 다음후보 다해줘"
- `src/shared/options-file.ts` `parseOptionsText`: 한 줄에 옵션 하나(띄어 쓰기 · =, 큰따옴표 값), # 주석 · 빈 줄 · BOM, 200줄 · 512자, 긴 이름만, 허용 목록(전송 · 비교 방식 · 크기 날짜 거르기 · 백엔드 접두사) 밖은 줄 번호와 이유로 거부
- `src/main/rclone/options.ts` `loadJobOptions`(64 KiB, 없으면 OPTIONS_INVALID). 저장 · 미리보기 · 실행 검사 · 명령 · 제외됨에서 다시 읽음
- `buildArgs` · `buildListArgs` · `buildAboutArgs`에 `extraArgs`(앱 옵션 뒤 · 안전 옵션 앞), `jobHash(job, config, options)`, `runSettingsOf`에 optionsFile · options(없으면 예전 지문)
- 편집 창 "rclone 옵션 파일" 칸 · [파일 선택] · 안내
- 테스트: options-file.test.ts(형식 · 거부 20종 · 한도), 인자 위치 · 차단 · 지문, 통합 2(명령에 들어가 동작 · 파일이 바뀌면 PREVIEW_STALE, 틀리면 저장 · 미리보기 거부)
- R1: reviewer REJECTED — 값 없는 옵션 뒤 낱말을 검사 없이 받아 `--checksum --ignore-errors` · `--checksum --config=…`로 허용 · 차단 목록을 우회(rclone이 다른 옵션으로 읽음, 실험 확인), execute 검사와 start가 옵션 파일을 따로 읽어 사이에 바뀐 옵션이 검사 없이 돌 수 있음. 확인 필요: 백엔드 접두사 통째 허용(휴지통 건너뛰기 · 위치 바꾸기 · 비밀값). app-verifier R1은 한도로 끊김
- R2 수정: 값 없는/있는 옵션 구분 · 백엔드는 =로만 · 값이 -로 시작하면 거부 · 백엔드 위험 이름 거부, assertSafeArgs에 앱 옵션 중복 · 백업 없는 --ignore-errors(실제 동기화) 거부, execute에서 읽은 옵션을 start에 넘김 + 경쟁 재현 통합 테스트(고치기 전 실패 확인), 거부 17종 테스트 추가
- R2: reviewer REJECTED — 백엔드 설정을 이름만(`--s3-storage-class`) 쓰면 rclone이 다음 인자 `--dry-run`을 값으로 가져가 비교가 실제 동기화로 돌고 대상 파일이 지워짐(재현), 편집 창 예시가 거부되는 형식. R3 수정: 백엔드 설정은 `=값`만(값 없는 것도 =true), 옵션 위치를 원본 · 대상 바로 뒤로(먹혀도 --filter-from이라 rclone이 exit 2로 멈춤, 실험 확인), 예시 문구, 거부 4종 테스트 · 위치 테스트
- R3: reviewer APPROVED. app-verifier(R2 빌드로 마지막 코드 확인) APPROVED — 저장 거부 문구 · 허용 형식 · 파일만 바꾼 뒤 동기화 거부 · 파일 삭제 뒤 비교 거부(기록 안 생김) · --min-size로 비교 · 제외됨 · 동기화가 같은 기준.
- 승인 뒤 더한 것(검증 없음, 거부만 늘림): reviewer 권고로 명령을 실행하는 백엔드 설정(ssh · command · shell) 거부 + 테스트 3개, 거부 문구 조사("--checksum는" → "--checksum 옵션은").
- 남은 것: BACKEND_REFUSED가 이름 일부 일치라 정상 옵션도 막을 수 있음(host · user · url · key), --local-links 같은 파일 집합을 바꾸는 백엔드 설정은 허용(비교 · 동기화에 같은 인자), 네트워크 리모트에서 백엔드 설정 실제 동작은 못 봄, 실행이 PREVIEW_STALE로 거부돼도 화면의 [동기화]가 켜진 채(이전부터)

### [TASK_035] : (2026-10-22) [intent/ 계획 · 화면 용어 통일 · 작업 화면 단추 정리]

- 사용자 수정 요구(작업 목록 원본 · 대상, 리모트 등록 · 폴더 고르기, 제외 패턴 저장 · 골라 넣기, --ignore-errors 단독, 동기화 상태 글, 용어, 단추 묶음)를 `intent/NNN-*.md`로(AI-native SDLC playbook 형식: 문제 · 바라는 결과 · 영향 · 제약 · 미해결 질문 · 계획). 사용자 "진행해 확인했어": 용어표 확인, 004는 A(안전장치 그대로)
- 명세: `docs/specs/2026-10-22-wording-and-toolbar.md`. 용어표대로 55곳 + 표 밖 몇 곳, 작업 화면 [⋯] 메뉴(명령 복사) · 할 일 줄 · 밑줄 탭, 가운데 열 "할 일/한 일", --ignore-errors 안내
- 테스트: wording.test.ts(옛 문구 20개가 화면 코드에 없음), format · list-views 문자열 갱신
- R1: reviewer REJECTED — 표의 "연결(리모트)" 미반영, 체인 안내의 [이어서] 단추 이름 · aria, 목록 "실행 기록 없음", 확인 창 단추 "실행", 뺄 수 한도 알림 "이번 실행에서", 목록 툴팁 "자동 멈춤:". R2 수정: 모두 고침 + 확인 필요 반영("업로드 확인 중" → "전송 마무리 중"(로컬에도 뜸), 체인 이름표 "이어서 돌릴 작업"(동기화까지 함), main 알림 · 멈춤 사유의 "미리보기" → "비교", "칩을 눌러" → "상태 단추를 눌러", [⋯]에 aria-haspopup · aria-expanded), 문구 점검 테스트에 옛 문구 7개 더하고 주석은 빼고 검사
- R2: reviewer APPROVED. app-verifier REJECTED — [⋯] 메뉴를 닫으면 초점이 BODY로 감, 비교 뒤 바뀔 것 없음인데 상태 줄이 "동기화할 수 있습니다", "비교 결과" 탭에 동기화 결과 · "동기화 기록" 탭에 비교 기록이 나와 이름이 내용과 다름. R3 수정: ItemMenu가 닫힐 때 연 곳으로 초점 반환, 상태 줄에 바뀔 것 없음 문구, 탭을 "파일 목록 | 기록"으로, 남은 "실행" 문구(확인 창 체크 · 편집 창 sync 설명 · 옵션 안내 · CHAIN_MISSING), 꺼진 사유 "동기화 결과를 열었을 때만", "처리 못 한 파일이 없습니다", 빈 화면 안내
- R3: reviewer · app-verifier 모두 APPROVED(초점 반환 · 상태 줄 3가지 · 탭 "파일 목록 | 기록" · 남은 문구, 886px, 화면 · title · aria에 옛 낱말 없음). 승인 뒤 더한 것(문구만, 검증 없음): 진행 배너 "동기화를 막았습니다" · "이 상태로 동기화하면", 목록 보기 "이 목록의 파일 전체"
- 사용자가 확인한 용어표에서 구현 중 바뀐 것(다시 확인 필요): "업로드 확인 중" → "전송 마무리 중", 체인 칸 "이어서 돌릴 작업", 탭 "파일 목록 | 기록"
- 남은 것: 탭 화살표 키 · tabpanel 없음, 886px에서 수정 시각 열 머리 "원." · "대." 잘림(이전부터), "전송 마무리 중" · 자동 실행 멈춤 띠 · Drive 안내는 화면으로 못 봄

### [TASK_036] : (2026-10-22) [제외 패턴 저장 · 골라 넣기 (intent/002)]

- 명세: `docs/specs/2026-10-22-exclude-patterns.md`. DB 스키마 v3 `exclude_patterns`(패턴 · 처음/마지막 쓴 시각 · 쓴 횟수). v2 → v3 이전과 예전 JSON 가져오기 때 기존 작업의 패턴을 모음
- `pattern-store.ts`: `rememberPatterns`(excludeSchema 통과한 줄만, trim 기준 중복 없음, 대소문자 구분), `clsPatternStore.list`(쓴 횟수 → 최근 순) · `delete`(목록에서만). `clsJobStore.save`가 작업 행과 패턴을 한 트랜잭션으로 씀
- IPC `patterns:list` · `patterns:delete`(excludeSchema 검증). 편집 창 [저장된 패턴에서 추가] → `PatternPickerDialog`(체크박스 · 찾기 · 이미 있는 줄 잠금 · [추가: N개] · [목록에서 지우기])
- `ZBCModal`: 대화상자 위 대화상자에서 Esc는 맨 위 것만 닫음(OPEN_MODALS)
- 테스트: patterns.test.ts(이전 · 손상 행 건너뜀 · 중복과 횟수 · 거부된 저장 롤백 · 지운 뒤 다시 저장 · 예전 JSON), groups.test.ts user_version 3
- R1: reviewer REJECTED — docs/works 미갱신(코드 결함 없음). app-verifier REJECTED — 패턴 창 내용(560px)이 대화상자(520px)보다 넓어 잘리고 가로 스크롤, 초점이 body로 감 · Tab이 아래 편집 창으로 샘. R2 수정: 패턴 창을 넓은 대화상자로 · 고정 폭 제거, ZBCModal이 Tab을 맨 위 대화상자 안에서 돌리고 닫히면 연 단추로 초점 반환, 목록에서 지우면 찾기 칸으로 초점, 이전 때도 excludeSchema로 거름(손상 행 테스트)
- R2: reviewer APPROVED(확인 필요: autoFocus 대화상자에서 연 곳을 effect에서 잡으면 안쪽 칸이 잡힘). app-verifier REJECTED — 같은 원인으로 편집 창 · 패턴 창 · 그룹 이름 창을 닫으면 초점이 body로 감(레이아웃 · Tab 가두기 · Esc는 통과). R3 수정: 연 곳을 처음 그릴 때(useState 초기값) 잡음, autoFocus 칸이 없는 대화상자는 열릴 때 상자로 초점(tabIndex -1)
- R3: reviewer · app-verifier 모두 APPROVED(초점 반환: 편집 · 패턴 · 그룹 · 설정 · 동기화 확인 · 기록 정보, 동기화 확인 창은 Enter · Space로 실행 안 됨, 886 · 1266px 넘침 없음)
- 남은 것: 열린 직후 상자에 초점이 있을 때 Shift+Tab 한 번이 뒤 화면으로 빠질 수 있음(정적 의견), v2 → v3 이전은 단위 테스트로만 확인. 작업 간 패턴 묶음 · 이름 붙이기는 하지 않음

## Error

### [ERR_001] : (2026-10-11) oxlint `no-restricted-imports`의 `group: ["../*"]`가 `../lib/format`을 못 잡음 → TASK_003

- 해결: 패턴을 `regex: "^\\.\\./"`로 바꿈. 임시 파일로 위반이 잡히는 것을 확인

### [ERR_002] : (2026-10-11) 이름 일괄 변경 뒤 `args.map(quote)`처럼 괄호 없이 넘기는 참조가 남음 → TASK_002

- 해결: `f_Quote`로 고침. 타입 검사로 발견
