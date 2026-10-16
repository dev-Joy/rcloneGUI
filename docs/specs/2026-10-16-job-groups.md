# F21 작업 그룹

- 날짜: 2026-10-16
- 요구사항: [prd.md](../prd.md) F21 (P2, v0.3). GoodSync 화면의 "모든 작업" 아래 그룹 트리와 [새 그룹]
- 사용자 "진행"(2026-10-16): v0.3을 F20부터 차례로

## 목적

작업이 늘어도 왼쪽 목록에서 묶어서 본다(예: "프로젝트", "백업"). 그룹은 보기용이다. 실행 · 체인 · 자동 실행과는 관계가 없다.

## 동작

### 저장 (DB 스키마 v2)

- 새 표 `groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL)`. `PRAGMA user_version = 2`. v1 DB는 열 때 표만 더한다(기존 행은 그대로).
- 작업 JSON에 `groupId: string | null`(`default(null)`). 예전 작업은 그룹 없음.
- 그룹 이름: 1 ~ 50자, 앞뒤 공백 제거, 줄바꿈 금지, 같은 이름 중복 금지(대소문자 무시). ID는 이름과 무관한 `g-<시각>-<번호>`.
- 그룹을 지우면 그 그룹의 작업은 "그룹 없음"으로 옮긴다(작업은 지우지 않는다). 한 트랜잭션.
- 없는 그룹 ID로 작업을 저장하면 거부한다.

### IPC

- `groups:list` → `itfGroup[]`(`{ id, name }`, position 순)
- `groups:save` `{ id?: string; name: string }` → 새로 만들거나 이름 바꾸기
- `groups:delete` 그룹 ID
- main이 그룹을 바꾸면 `jobs:changed`로 알린다(작업의 groupId가 바뀔 수 있으므로).

### 화면

- 왼쪽 목록 맨 위에 "모든 작업 (N)". 그 아래 그룹마다 접고 펼 수 있는 머리(▾ 이름 (N)), 그 아래 작업들. 그룹이 없는 작업은 맨 아래 "그룹 없음" 아래.
  그룹이 하나도 없으면 지금처럼 평평한 목록(머리 없음).
- 목록 아래 [+ 새 작업] 옆에 [+ 새 그룹]. 누르면 이름 입력 대화상자.
- 그룹 머리에 마우스를 올리면 [이름 바꾸기] [지우기]. 지우기는 "작업 N개는 그룹 없음으로 옮겨집니다" 확인을 거친다.
- 작업 편집 창 "그룹" 선택(그룹 없음 + 그룹들).
- 접힘 상태는 화면 상태에만 둔다.
- 목록은 지금처럼 단순한 목록이다(가상 스크롤 · ZBCTreeTable을 쓰지 않는다. 작업 수가 많지 않다).

## 안전

- 실행 · 삭제와 무관하다. 작업의 실행 설정 지문(`jobHash`)에 `groupId`를 넣지 않는다(그룹을 바꿔도 미리보기가 무효가 되지 않는다).
- DB 스키마 v1 → v2는 표 추가뿐이다. v2 DB를 v1 앱이 열면 지금 규칙대로 거부된다(`DB_NEWER_VERSION`).

## 바꿀 파일

| 파일                                                                                                | 변경                                                                                                           |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/main/store/app-database.ts`                                                                    | 스키마 v2 (groups 표)                                                                                          |
| `src/main/store/group-store.ts` (새)                                                                | list · save · delete(작업 옮기기)                                                                              |
| `src/main/store/job-store.ts`                                                                       | groupId 검증(없는 그룹 거부)                                                                                   |
| `src/shared/schemas.ts` · `types.ts` · `ipc-contract.ts`, `src/preload`, `src/main/ipc/register.ts` | 그룹 스키마 · IPC                                                                                              |
| `src/stores/app-store.ts`                                                                           | groups 상태, 저장 · 삭제                                                                                       |
| `src/pages/JobListPane.tsx` (+css), `GroupNameDialog.tsx` (새, +css), `JobEditorDialog.tsx`         | 그룹 목록 · 대화상자 · 선택                                                                                    |
| 테스트                                                                                              | v1 → v2 열기(기존 작업 유지), 그룹 저장 · 이름 중복 · 지우면 작업 옮김, 없는 그룹 거부, jobHash에 groupId 없음 |

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면: [+ 새 그룹] "백업" → 작업 편집에서 그룹 선택 → 목록에서 "백업" 아래로 → 접기 · 펴기 → 이름 바꾸기 → 지우기(작업은 그룹 없음으로) → 다시 켜도 유지. 그룹을 바꿔도 직전 미리보기로 [동기화]가 그대로 된다.

## 하지 않는 것

- 끌어다 놓기로 옮기기, 그룹 안의 그룹, 그룹 단위 실행
