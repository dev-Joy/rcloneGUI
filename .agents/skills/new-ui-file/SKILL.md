---
name: new-ui-file
description: rcloneGUI 화면에 새 공용 컴포넌트(ZBC*)나 페이지·레이아웃 컴포넌트를 추가한다. "버튼/입력/표 컴포넌트 만들어", "새 화면·대화상자 추가" 같은 요청에서 파일을 만들기 전에 쓴다.
---

<!-- 생성 파일: .claude/skills/new-ui-file/SKILL.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

# 화면 컴포넌트 추가

구조와 작성 스타일은 `docs/guide/File.tsx.guide`(3장)와 `docs/guide/File.module.css.guide`를 따른다. 만들기 전에 두 파일을 읽고,
가장 비슷한 기존 파일 하나를 본보기로 삼는다.

## 무엇을 만들지 먼저 정한다

| 종류            | 언제                                                           | 본보기                         |
| --------------- | -------------------------------------------------------------- | ------------------------------ |
| 공용 컴포넌트   | 두 곳 이상에서 쓰는 입력·표시 부품. 앱 상태(`useApp`)를 모른다 | `src/components/ZBCCheck.tsx`  |
| 페이지·레이아웃 | 화면 한 영역이나 대화상자. 앱 상태와 `window.rclonegui`을 쓴다 | `src/pages/SettingsDialog.tsx` |

한 화면에서만 쓰는 부품은 공용으로 만들지 않고 그 페이지 옆에 페이지 컴포넌트로 둔다.

## 공용 컴포넌트 (`src/components/ZBCXxx.tsx`)

1. `ZBCXxx.tsx`: `export default function ZBCXxx(iProps: itfZBCXxxProps)`, props 타입은 `itfZBCXxxProps`(export),
   기본값은 `propsDefault`. 최상단 요소에 `className="zbc zbcXxx"`, 내부 요소는 모두 `zbcXxx…` 접두사.
   감싸는 요소가 필요하면 `zbcXxxWrapper`.
2. `ZBCXxx.css`: `@layer components { … }` 안에 쓴다. 색은 `var(--zbc-*)`만.
3. `src/components/ZBC.css`에 `@import "./ZBCXxx.css";` 한 줄을 추가한다. 빠뜨리면 스타일이 적용되지 않는다.
4. 새 색이 필요하면 `src/components/themes/default.css`에 변수를 더한다 (밝은 테마와 어두운 테마 둘 다).

## 페이지·레이아웃 (`src/pages/Xxx.tsx`)

1. `Xxx.tsx`: `export default function Xxx(iProps: itfXxxProps)`. 섹션 주석 네 개
   (`hook & state 변수 선언`, `Effect (부수 효과)`, `내부 변수`, `이벤트 핸들러 및 내부 함수`)를 순서대로 둔다.
   내부 변수는 `_V` 객체에, 내부 함수는 `f_`, 핸들러는 `h_`.
2. `Xxx.module.css`: 페이지는 `@layer pages`, 레이아웃은 `@layer layouts`. 최상단 클래스는 `.Xxx`, 나머지는 그 아래에 중첩하고
   접두사 없이 쓴다. 공용 컴포넌트를 덮어쓸 때는 `:global(.zbcYyy)`.
3. main과의 통신은 `window.rclonegui.*`만. 응답은 `unwrap()`으로 풀고 실패는 `notify("error", messageOf(error))`.
   새 IPC가 필요하면 `src/shared/ipc-contract.ts` → `src/preload/index.ts` → `src/main/ipc/register.ts`(zod 검증) 순서로 더한다.

## 공통

- import: 상위 폴더는 `@/`, 같은 폴더는 `./`. 화면 코드에서 `node:*`, `electron`, `@/main/**`, `@/preload/**`는 가져오지 못한다.
- UI 문구는 한국어로, 일어날 일을 적는다 ("동기화" 대신 "대상에 12개 복사, 3개 삭제").
- 필수 props가 있으면 `propsDefault`를 `satisfies Partial<itfXxxProps>`로 두고 함수 첫 줄에서 `{ ...propsDefault, ...iProps }`로 합친다.
- 외부 라이브러리를 새로 들이면 `THIRD_PARTY_NOTICES.md`에 적는다.

## 끝내기 전에

1. `pnpm run check` (타입 · oxlint · eslint 접두사 검사 · 단위 테스트)
2. 화면에서 실제로 확인한다 — `run-rclonegui` 스킬.
3. 사용자에게 보이는 변경이면 `docs/CHANGELOG.md`에 한 줄, `docs/works/`에 작업 기록.
