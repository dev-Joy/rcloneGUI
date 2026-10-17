# 실행 스냅샷 (필터 · rclone.conf 지문) · 작업별 rclone.conf 칸 안내

- 날짜: 2026-10-17
- 요구사항: [prd.md](../prd.md) F04(실행 기록) 보강. 사용자(2026-10-17): "conf 파일은 언제든지 바뀔 수 있으니 그 시점의 snapshot을 남겨 어느 부분에서 실패했는지 알 수 있어야 하지 않나, filter 쪽도", "이 작업만 쓰는 rclone.conf 칸은 경로를 찾아서 넣어야 한다고 설명이 필요하지 않나". 사용자 "1+2번까지 해봐"

## 목적

실행 기록을 열었을 때, 그 실행이 **어떤 필터**로 돌았는지와 **어느 rclone.conf를 썼고 그 뒤에 바뀌었는지**를 알 수 있게 한다.
작업 편집 창의 rclone.conf 칸이 파일 경로를 넣는 칸이라는 것을 알려 주고 파일 선택 창을 준다.

## 동작

### 저장 (실행 메타 `snapshot`)

- 미리보기 · 실행을 시작할 때 실행 메타에 `snapshot`을 넣는다(SQLite에 저장).
    - `filter`: 그때 만든 `filter.txt` 내용 그대로(제외 패턴 · 이번 실행에서 뺀 항목 · 범위 규칙). 64K자(글자 수)가 넘으면 앞부분만 넣고 `filterTruncated: true`(실행 기록 100건을 한 번에 화면에 넘기므로 크게 두지 않는다. 전체는 실행 폴더의 filter.txt에 남는다).
    - `config`: 그 실행이 쓴 rclone.conf
        - `path`: 작업 지정 → 설정 → rclone 기본 위치 순으로 정해진 실제 파일 경로. 기본 위치는 `rclone config file`의 마지막 줄(`defaultConfigPath`). rclone은 실행 파일 옆의 rclone.conf를 먼저 쓰므로 rclone 실행 파일마다 한 번 물어 두고, 실패하거나 경로가 없으면 남기지 않고 다음 실행에서 다시 묻는다.
        - `source`: `"job" | "settings" | "default"`
        - `size`, `modifiedAt`: 파일을 **열지 않고** `stat`으로 얻은 크기(바이트)와 수정 시각. 파일이 없으면 `exists: false`.
    - 예전 기록은 `snapshot: null`.
- rclone.conf **내용 · 해시는 저장하지 않는다**(안전 규칙 6: 열어 읽지 않는다. 해시도 내용을 읽어야 하므로 하지 않는다).

### 실행 정보 창

- 실행 기록 표의 줄마다 [정보] 단추. 누르면 "실행 정보" 대화상자:
    - 실행한 명령(지금도 기록에 있음, 복사 단추)
    - 필터: 그때의 `filter.txt` 내용(고정폭 글꼴, 줄 번호). 비어 있으면 "필터 없음(모든 파일)". 잘렸으면 그렇게 표시
    - rclone.conf: 출처(작업 지정 · 설정 · rclone 기본 위치), 경로, 크기, 수정 시각
    - 지금 같은 경로의 파일과 비교: "그때와 같음" / "그 뒤에 바뀜 (크기나 수정 시각이 다름)" / "지금은 파일이 없음" / "그때 파일이 없었음"
    - `snapshot`이 없으면 "이 실행은 스냅샷을 남기기 전 버전에서 돌았습니다"
- 비교는 main이 한다: 새 IPC `runs:config-check` `{ jobId, runId }` → `"same" | "changed" | "missing" | "unknown"`. 경로는 기록에서 꺼내 쓰고 화면에서 받지 않는다. `stat`만 한다.

### 작업 편집 창 rclone.conf 칸

- 이름표 "이 작업만 쓰는 rclone.conf 파일" + [파일 선택](기존 `app.pickFile`) 단추.
- 안내: "rclone.conf 파일 경로입니다(예: D:\설정\work.conf). 이 작업에서만 다른 리모트 설정을 쓸 때 지정합니다. 비워 두면 설정 창의 위치를, 그것도 비어 있으면 rclone 기본 위치를 씁니다. 앱은 이 파일을 열지 않고 경로만 rclone에 넘깁니다."

## 안전

- 실행 · 확인 창 · 삭제 수 · 차단 목록은 그대로다. 스냅샷은 기록에 더해질 뿐 실행 판단에 쓰지 않는다.
- rclone.conf는 계속 열지 않는다(`stat`만). 기록 · 화면 · 로그에 내용이 남지 않는다.
- 새 IPC는 실행 ID만 받는다(임의 경로를 받지 않음).
- `filter.txt`에는 사용자가 쓴 제외 패턴과 비교 목록의 상대 경로만 들어간다(지금도 실행 폴더에 같은 내용이 남는다).

## 바꿀 파일

| 파일                                                                           | 변경                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts` · `schemas.ts`                                           | `itfRunSnapshot`, 실행 메타 `snapshot`(예전 기록은 null)                                                   |
| `src/main/rclone/locate.ts`                                                    | `defaultConfigPath(exe)` (`rclone config file`, 순수 파서 분리)                                            |
| `src/main/rclone/runner.ts`                                                    | 시작할 때 스냅샷, `checkConfig`                                                                            |
| `src/shared/ipc-contract.ts`, preload, `register.ts`                           | `runs:config-check`                                                                                        |
| `src/pages/JobHistoryTable.tsx`, `RunInfoDialog.tsx` (새, +css), `JobPage.tsx` | [정보] · 실행 정보 창                                                                                      |
| `src/pages/JobEditorDialog.tsx`                                                | rclone.conf 칸 이름표 · 안내 · [파일 선택]                                                                 |
| 테스트                                                                         | config file 파서, 스냅샷(필터 내용 · 잘림 · conf 출처 · 없는 파일), config-check(같음 · 바뀜 · 없음), 통합 |

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면(임시 프로필, 임시 conf 파일): 작업에 임시 conf 지정 → 비교 → 실행 기록 [정보] → 필터 · conf(작업 지정, 크기 · 시각, "그때와 같음") → conf 파일 수정 → [정보] "그 뒤에 바뀜" → conf 지움 → "지금은 파일이 없음". 편집 창 rclone.conf 칸 안내 · [파일 선택].

## 하지 않는 것

- rclone.conf 내용 · 해시 · 가린 내용(`rclone config redacted`) 저장 — 안전 규칙 6 변경이 필요하다(사용자가 "3번"으로 따로 결정)
- 필터 스냅샷 사이 차이(diff) 보기
- 실행 폴더 정리(F18)
