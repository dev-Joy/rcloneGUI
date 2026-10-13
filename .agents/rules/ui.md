<!-- 생성 파일: .claude/rules/ui.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

> 적용 범위: `src/components/**`, `src/pages/**`, `src/stores/**`, `src/lib/**`, `src/renderer/**` 를 다룰 때만 따른다.

# 화면 코드를 고칠 때

- 새 파일이나 구조 변경은 `docs/guide/File.tsx.guide` 3장과 `docs/guide/File.module.css.guide`를 먼저 읽는다. 새 컴포넌트는 `new-ui-file` 스킬.
- 이 폴더들은 sandbox된 renderer에서 돈다. `node:*`, `electron`, `@/main/**`, `@/preload/**`를 가져오지 않는다. main과는 `window.baton.*`만.
- 공용 컴포넌트의 CSS를 새로 만들면 `src/components/ZBC.css`에 `@import`를 더한다.
- 색은 `var(--zbc-*)`만 쓴다. 새 색은 `src/components/themes/default.css`에 밝은·어두운 값을 함께 넣는다.
- 실행 버튼을 켜고 끄는 조건(`usablePreview`, 확인 창의 체크)은 안전장치다. 조건을 느슨하게 바꾸지 않는다. main도 같은 검사를 하지만 화면이 먼저 막아야 한다.
- 스타일·대화상자·버튼 상태는 테스트로 잡히지 않는다. 고친 뒤 `run-baton` 스킬로 실제 화면을 확인한다.
