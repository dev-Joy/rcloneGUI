---
name: feature-pipeline
description: 기능을 명세 → 구현 → 병렬 검증(정적 검토 + 실제 화면) → 수정 루프(최대 3회)로 진행한다. 새 기능(체인 실행, 자동 실행, 파일 상세, 설치본 등)이나 안전장치·실행기·IPC를 건드리는 변경을 맡았을 때 쓴다. 오타·문구·한 줄 수정에는 쓰지 않는다.
---

<!-- 생성 파일: .claude/skills/feature-pipeline/SKILL.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

> Antigravity에서는 아래의 "주 세션" 역할 중 지휘를 `senior-architect`가, 구현을 `implementer`가 맡는다 (`.agents/agents/`).

# 기능 작업 파이프라인

주 세션이 지휘자이자 구현자다. 검증은 서브에이전트 둘(`reviewer`, `app-verifier`)에게 맡긴다.
서브에이전트는 서브에이전트를 부를 수 없으므로 단계 전환은 모두 주 세션이 한다.

## 언제 쓰는가

- 쓴다: 새 기능, `src/main/rclone/**`·`src/main/ipc/**`·실행 버튼 조건을 바꾸는 변경, 여러 파일에 걸친 화면 변경
- 쓰지 않는다: 문구·주석·스타일 한두 줄, 문서만 고치는 일, 질문에 답하는 일. 이때는 고치고 `pnpm run check`만 돌린다

## 1. 분석과 명세

1. `docs/works/WORKS.md`, `docs/intent.md`(판단 기준), `docs/prd.md`(요구사항과 상태), 관련 코드를 읽는다.
2. `docs/specs/YYYY-MM-DD-{작업요약-kebab-case}.md`에 명세서를 쓴다. 들어갈 것:
    - 목적 (사용자가 무엇을 할 수 있게 되는가, `prd.md`의 어느 요구사항인가 — F·SR 번호)
    - 동작 (화면에서 보이는 것, 버튼이 켜지고 꺼지는 조건, 오류일 때)
    - 안전 (지우거나 덮어쓰는 경로가 생기는가. 생긴다면 어떤 확인을 거치는가)
    - 바꿀 파일과 새 IPC 채널
    - 확인 방법 (추가할 테스트, 화면에서 눌러 볼 순서)
    - 하지 않는 것
3. 요구가 모호하거나, 안전장치(`prd.md` 5장)를 바꿔야 하거나, `intent.md`의 "하지 않는 것"에 해당하면 여기서 사용자에게 묻는다. 구현을 시작한 뒤에 묻지 않는다.

## 2. 구현

1. 명세대로 구현한다. 화면 파일을 새로 만들면 `new-ui-file` 스킬을 따른다.
2. 빌더·파서·안전 로직을 바꿨으면 테스트를 함께 쓴다.
3. 넘기기 전에 스스로 확인한다: `pnpm run check`, main 쪽을 바꿨으면 `pnpm run test:int`. 실패한 채로 넘기지 않는다.

## 3. 병렬 검증

`reviewer`와 `app-verifier`를 **한 메시지에서 함께** 부른다 (Agent 도구 호출 두 개). 둘 다에게 넘길 것:

- 명세서 경로
- 바뀐 파일 목록
- 이번이 몇 번째 라운드인지, 직전 라운드에서 지적받아 고친 것

화면이나 실행 흐름에 영향이 없는 변경(예: 파서 내부, 문서)이면 `app-verifier`는 기본 흐름만 확인하게 한다. 생략하지는 않는다.

## 4. 판정과 루프

- 둘 다 `STATUS: APPROVED` → 5로 간다.
- 하나라도 `STATUS: REJECTED` → 지적된 것을 고치고(지적이 틀렸다고 판단되면 근거를 적어 다음 라운드에 넘긴다) 3으로 돌아간다.
- **수정-검토 루프는 최대 3회(Round 1~3).** Round 3에서도 REJECTED면 더 고치지 않는다. 남은 결함과 시도한 것을 정리해
  사용자에게 보고하고 멈춘다. 통과한 것처럼 마무리하지 않는다.
- 검증자가 낸 `확인 필요`·`확인 못 함`은 판정과 별개로 최종 보고에 그대로 옮긴다.

## 5. 마무리

1. `docs/CHANGELOG.md`(사용자에게 보이는 변경), `docs/works/WORKS.md`·`WORKS_HISTORY.md`를 갱신하고, `docs/prd.md`의 요구사항 상태와 완료 기준 체크를 고친다.
2. 새로 알게 된 rclone 동작은 `docs/knowhow/rclone-notes.md`에, 설계 결정은 `docs/adr/`에 적는다.
3. 사용자에게 보고한다: 무엇이 바뀌었는지, 몇 라운드 만에 통과했는지, 각 검증자가 무엇을 확인했는지, 확인하지 못한 것.

## 판정 형식

검증자는 마지막 줄 묶음을 아래 형식으로 낸다. 주 세션은 `STATUS:` 줄만 보고 판정하지 말고 근거도 읽는다.

```
STATUS: REJECTED
Critical Issues:
- …
Action Required: …
```

```
STATUS: APPROVED
Verification: …
```
