# F29 기본 폴더 위치

- 날짜: 2026-10-14
- 요구사항: [prd.md](../prd.md) F29 (P1, 2026-10-14 사용자 요청)

## 목적

설정에서 새 작업의 기본 원본 · 대상 폴더를 정해 둔다. [+ 새 작업]을 누르면 원본 · 대상 칸이 그 값으로 채워지고,
작업 편집 창의 [폴더 선택]도 그 위치에서 열린다. 같은 상위 폴더 아래로 작업을 자주 만드는 경우 입력을 줄인다.

## 동작

### 설정

- 설정 스키마에 `defaultSource`, `defaultDest`(경로 또는 `null`)를 더한다. 이전에 저장한 설정 행에는 이 필드가 없으므로
  `default(null)`로 읽는다(설정이 기본값으로 초기화되지 않게).
- 설정 창에 두 칸을 더한다: "새 작업의 기본 원본", "새 작업의 기본 대상". 각각 [폴더 선택] 버튼, `maxLength`는 F28의 경로 상한.
  비워 두면 `null`. 대상 칸은 `리모트:경로`도 받는다(직접 입력).
- 저장할 때 폴더가 실제로 있는지는 검사하지 않는다(외장 드라이브가 빠져 있을 수 있다). 작업을 저장할 때의 검사(원본 존재, SR-07 겹침)는 그대로다.

### 새 작업

- [+ 새 작업]: `newJob()`이 설정의 `defaultSource` · `defaultDest`로 원본 · 대상을 채운다. 없으면 지금처럼 빈 칸.
- 복제(`cloneJob`)는 원래 작업의 경로를 그대로 쓴다(바뀌지 않음).
- 기본값이 같은 폴더라도 그대로 채운다. 저장할 때 SR-07이 "원본과 대상이 같거나 서로 포함합니다"로 막으므로 사용자가 고친다.

### 폴더 선택 창

- `app:pickFolder`가 어느 칸을 위한 선택인지(`"source" | "dest" | "settings"`)를 받는다. 시작 위치는 **main이 설정에서 정한다**
  (`source` → `defaultSource`, `dest` → `defaultDest`, `settings` → 없음). 화면이 경로를 넘기지 않으므로 화면이 임의 경로를 지정하는 채널이 생기지 않는다.
- 시작 위치가 리모트(`리모트:경로`)이거나 없는 폴더면 `defaultPath`를 넘기지 않는다(운영체제 기본 위치).

## 안전

지우거나 덮어쓰는 경로는 생기지 않는다. 기본 폴더는 입력 칸의 초깃값일 뿐이고, 작업 저장 · 실행의 검사(SR-06, SR-07, SR-01 ~ SR-03)는 바뀌지 않는다.
`app:pickFolder`의 새 입력은 zod enum으로 검증한다.

## 바꿀 파일

| 파일                               | 변경                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/schemas.ts`            | `settingsSchema`에 `defaultSource` · `defaultDest`, `pickFolderSchema` |
| `src/shared/ipc-contract.ts`       | `pickFolder(target)`                                                   |
| `src/preload/index.ts`             | 인자 전달                                                              |
| `src/main/ipc/register.ts`         | 설정에서 시작 위치, 로컬 폴더일 때만 `defaultPath`                     |
| `src/main/store/settings-store.ts` | 기본값에 두 필드                                                       |
| `src/lib/job-defaults.ts`          | `newJob(settings)`                                                     |
| `src/stores/app-store.ts`          | 초기 설정 값에 두 필드                                                 |
| `src/pages/AppLayout.tsx`          | `newJob(settings)`                                                     |
| `src/pages/JobEditorDialog.tsx`    | `pickFolder(field)`                                                    |
| `src/pages/SettingsDialog.tsx`     | 두 칸과 [폴더 선택]                                                    |
| `tests/unit/*`                     | 이전 설정 행 읽기(필드 없음 → null), `newJob` 채우기                   |

## 확인 방법

1. `pnpm run check`
2. 화면: 설정에서 기본 원본 · 대상을 지정 → 저장 → 다시 켜도 유지 → [+ 새 작업]에 채워져 있음 → [폴더 선택]이 그 위치에서 열림(대화상자 시작 위치는 확인 가능한 범위에서) → 설정을 비우면 새 작업 칸도 빈 칸.
3. 예전 설정(두 필드 없는 행)이 있는 프로필에서 rclone 경로 설정이 그대로 남는다.

## 하지 않는 것

- 작업마다 다른 기본값, 최근 사용 폴더 기억
- 기본 폴더 아래 하위 폴더 이름 자동 생성
