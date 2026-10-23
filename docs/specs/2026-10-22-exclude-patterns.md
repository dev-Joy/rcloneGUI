# 제외 패턴 저장 · 골라 넣기

- 날짜: 2026-10-22
- 의도: [intent/002 제외 패턴 저장](../../intent/002-제외패턴-저장.md)
- 사용자: "1줄씩 입력한 패턴을 로컬 db화 하고 새작업이나 작업편집시 패턴추가 버튼 클릭해서 패턴을 선택", "새로 입력한 패턴은 유니크하게 db로 저장"

## 목적

작업마다 같은 제외 패턴을 다시 치지 않게, 한 번 쓴 패턴을 앱 DB에 하나씩(중복 없이) 모아 두고 편집 창에서 체크박스로 골라 넣는다.

## 동작

- DB 스키마 v3: `exclude_patterns(pattern TEXT PRIMARY KEY, first_used TEXT, last_used TEXT, use_count INTEGER)`.
    - v2 → v3 이전 때 이미 저장된 작업들의 `excludes`를 모아 넣는다(같은 트랜잭션). 예전 JSON을 가져올 때도 모은다.
- 작업을 저장하면 그 작업의 패턴을 같은 트랜잭션에서 기억한다. 새 패턴은 넣고, 있던 패턴은 쓴 횟수 +1 · 마지막 쓴 시각을 바꾼다. 앞뒤 공백을 뗀 문자열이 같으면 같은 패턴이다(대소문자는 구분 — rclone 필터가 구분한다).
- IPC `patterns:list`(쓴 횟수 많은 순 → 최근 순), `patterns:delete(pattern)`. 지워도 작업의 패턴은 바뀌지 않는다(목록에서만 빠진다). 같은 패턴을 다시 저장하면 다시 생긴다.
- 편집 창 제외 패턴 칸 아래 [저장된 패턴에서 추가] → 대화상자:
    - 체크박스 목록(패턴 · "작업 N번 저장에 씀"), 검색 칸, 지금 칸에 이미 있는 패턴은 체크된 채 잠김("이미 있음").
    - [추가: N개] → 고른 패턴을 칸 끝에 한 줄씩 덧붙인다(이미 있는 줄은 빼고). [취소].
    - 줄마다 [목록에서 지우기] (확인 없이 목록에서만 뺌 — 작업에는 영향 없음, 문구로 알림).
    - 저장된 패턴이 없으면 "아직 저장된 패턴이 없습니다. 작업을 저장하면 그 작업의 제외 패턴이 여기에 모입니다."

## 안전

- 패턴은 작업 저장 때와 같은 검사(`excludeSchema`)를 거친 값만 들어간다. 실행 경로 · 필터 파일 · 지문은 그대로(대화상자는 편집 칸 글만 바꾼다. 저장해야 작업이 바뀐다).
- 화면이 임의 SQL · 경로를 넘기는 채널은 없다. delete는 패턴 문자열 하나만 받는다.

## 바꿀 파일

`src/main/store/app-database.ts`(v3), `src/main/store/pattern-store.ts`(새), `job-store.ts`(저장 때 기억), `src/shared/ipc-contract.ts` · `schemas.ts` · `types.ts`, `src/preload/index.ts`, `src/main/ipc/register.ts`, `src/main/index.ts`, `src/pages/JobEditorDialog.tsx`, `src/pages/PatternPickerDialog.tsx`(+css, 새), 테스트 `tests/unit/patterns.test.ts`.

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`, `pnpm run build`
2. 화면: 작업 A에 패턴 2개 저장 → 새 작업 편집 창 [저장된 패턴에서 추가] → 체크 · 검색 · 추가 → 칸에 덧붙음 · 중복 없음 → 목록에서 지우기 → 작업 A 패턴은 그대로. 키보드(Tab · Space · Esc), 886px.

## 하지 않는 것

- 패턴 묶음(세트) 이름 붙이기, 패턴 이름 바꾸기, 작업 간 패턴 동기화(한 곳 바꾸면 모두 바뀜)
