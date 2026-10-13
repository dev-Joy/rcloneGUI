---
name: metrics-summary
description: 이 프로젝트의 스킬과 서브에이전트가 얼마나 쓰였는지 표로 보여준다. "하네스 사용 통계", "어떤 스킬이 쓰이고 있어", "안 쓰는 스킬 정리" 요청에 쓴다.
---

<!-- 생성 파일: .claude/skills/metrics-summary/SKILL.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

# 하네스 사용 통계

스킬이나 서브에이전트를 부를 때마다 훅(`.claude/hooks/usage-metrics.mjs`)이 `.claude/usage-metrics.log`에 한 줄을 남긴다
(시각, 종류, 이름만. 입력 내용은 남기지 않는다). 이 파일은 git에 올리지 않는다.

1. 집계를 출력한다.

    ```
    node .claude/hooks/usage-metrics.mjs --summary
    ```

2. 나온 표를 그대로 보여준다. 이 프로젝트의 스킬(`.claude/skills`)과 에이전트(`.claude/agents`)는 한 번도 안 쓰였어도 0으로 나온다.
3. 기록이 없으면 없다고 알린다. 훅은 `.claude/settings.json`이 있는 상태로 시작한 세션에서만 돈다.
4. 정리를 요청받았다면: 기간이 충분한데(예: 2주 이상) 0인 항목을 후보로 제안만 한다. 지우는 것은 사용자가 정한다.

경로별 규칙(`.claude/rules`)은 읽힌 횟수를 기록하지 않는다.
