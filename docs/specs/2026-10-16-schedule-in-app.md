# F10 스케줄 실행 (1단계: 앱 안 스케줄) · SR-10

- 날짜: 2026-10-16
- 요구사항: [prd.md](../prd.md) F10 (P1, v0.2), SR-10. 사용자 메모 "스케줄 → 윈도우 스케쥴, cron 스케쥴 / 프로그램 스케쥴 띄울때 스케쥴링"
- 사용자 결정(2026-10-16 "진행"): 앱 안 스케줄을 먼저 만들고 통과시킨 뒤 Windows 작업 스케줄러(2단계, SR-14)를 붙인다. 자동 실행 보호는 SR-10 그대로.

## 목적

앱이 켜져 있는 동안 작업을 정해진 때에 자동으로 비교하고, 안전하면 동기화한다. 지우는 일이 한도를 넘거나 무언가 이상하면
**실행하지 않고 그 작업의 자동 실행을 멈추고 알린다**(판단 기준 1 · 2, intent "1~3이 믿을 만해진 뒤에 4").

## 동작

### 작업 설정

- `schedule`에 필드를 더한다(예전 작업은 기본값으로 읽음):
    - `cron: string | null` (`default(null)`). 있으면 cron 식, 없으면 지금의 `everyMinutes` 간격.
    - `paused: { at: string; reason: string } | null` (`default(null)`). 자동 실행이 스스로 멈춘 상태.
- cron은 5개 필드(분 시 일 월 요일), 각 필드에 `*`, 숫자, `a-b`, `a,b`, `*/n`, `a-b/n`. 요일 0 · 7 = 일요일. 로컬 시각 기준.
  순수 함수 `parseCron` · `nextCronTime`(`src/shared/cron.ts`)로 만들고 단위 테스트한다. 형식이 틀리면 저장을 거부한다(zod refine, 한국어 메시지).
- 작업 편집 창 "자동 실행" 칸: [사용] 체크, [N분마다] / [cron 식] 선택, 다음 실행 예정 시각 미리 보기(cron이면 다음 3번), 자동 삭제 한도(`safety.autoMaxDelete`, 기본 50).
- 스케줄은 명령에 영향을 주지 않으므로 작업 설정 지문(`jobHash`)에 넣지 않는다(지금과 같음).

### 스케줄러 (main, `src/main/schedule/scheduler.ts`)

- 앱이 켜질 때 시작하고 30초마다 확인한다. 작업마다 "다음 실행 시각"을 메모리에 둔다.
    - 앱을 켠 시각 이후의 첫 시각부터 센다. **앱이 꺼져 있던 동안 놓친 실행은 따라잡지 않는다**(켜자마자 몰아서 돌지 않게).
    - 작업을 저장하거나 스케줄을 다시 켜면 그 작업의 다음 시각을 새로 계산한다.
- 때가 된 작업에 대해(이미 그 작업이나 같은 대상의 실행이 진행 중이면 이번 차례는 건너뛰고 다음 시각으로):
    1. `runner.preview(jobId)` → 끝날 때까지 기다린다.
    2. 아래면 **실행하지 않고 멈춘다**(`schedule.paused` 기록 + 알림):
        - 미리보기가 성공이 아님(실패 · 취소)
        - 빈 원본 차단(`blocked`)
        - 읽기 오류(`counts.error > 0`)
        - 실행할 삭제 수(`plannedDeletes`)가 `safety.autoMaxDelete`를 넘음
    3. 바뀔 것이 없으면(`hasChanges` 거짓) 실행하지 않고 끝(정상, 멈추지 않음).
    4. 그 외에는 `runner.execute({ jobId, previewRunId, confirmedDeletes: plannedDeletes })`. 사람이 누를 때와 **같은 검사**(SR-01 ~ SR-03)를 그대로 거친다.
       실행이 실패로 끝나면 멈춘다(삭제 한도 초과로 rclone이 멈춘 경우 포함).
- 자동으로 시작한 실행은 메타에 `trigger: "schedule"`(예전 기록 · 수동은 `"manual"`, `default("manual")`)을 남겨 실행 기록에 "자동"으로 보인다.
- 멈춤 알림: Windows 알림(Electron `Notification`) "rcloneGUI — <작업 이름> 자동 실행을 멈췄습니다: <이유>". 화면에도 작업 목록 · 작업 화면에 "자동 실행 멈춤: <이유>"와 [다시 켜기].
  [다시 켜기]는 `paused`를 비우고 다음 시각을 새로 계산한다. 멈춘 동안에는 자동 실행하지 않는다(수동 비교 · 동기화는 된다).
- 새 IPC: `jobs:resume-schedule`(작업 ID), 이벤트 `jobs:changed`(main이 작업을 바꿨을 때 화면이 목록을 다시 읽게).

### 창을 닫을 때 (트레이)

- 자동 실행이 켜진(멈추지 않은) 작업이 하나라도 있으면, 창을 닫아도 앱을 끝내지 않고 알림 영역(트레이)에 남는다. 처음 한 번 "rcloneGUI는 알림 영역에서 자동 실행을 계속합니다" 알림.
- 트레이 메뉴: [열기] [자동 실행 모두 멈추기] [종료]. 트레이 아이콘을 누르면 창을 연다.
- 자동 실행 작업이 없으면 지금처럼 창을 닫으면 끝난다.
- 아이콘: `resources/icon.png`(앱이 만든 단색 아이콘, 외부 이미지 없음). 설치본 아이콘으로도 쓴다.

## 안전 (SR-10)

- 자동 실행도 **미리보기 → 검사 → 실행** 순서만 쓴다. 실행은 `runner.execute()` 하나로만 시작하고, 사람이 확인하는 대신 "삭제 수 ≤ 자동 한도"를 확인한 삭제 수로 넘긴다.
  `execute()`의 검사(성공한 최신 미리보기, 30분, 설정 지문, 빈 원본, 확인한 삭제 수, `--max-delete` 고정)는 그대로다.
- 의심스러우면 멈춘다: 실패 · 오류 · 빈 원본 · 한도 초과에서 실행하지 않고, 그 작업의 자동 실행을 멈춘 채로 둔다. 사람이 [다시 켜기]를 눌러야 다시 돈다.
- 자동 한도 0이면 삭제가 하나라도 있는 실행은 자동으로 하지 않는다.
- 백업 설정은 작업 그대로(기본 켬).

## 바꿀 파일

| 파일                                                                             | 변경                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/cron.ts` (새)                                                        | `parseCron`, `nextCronTime`, `nextScheduleTime`(간격 · cron)                                                                                                                                              |
| `src/shared/schemas.ts` · `types.ts`                                             | `schedule.cron` · `schedule.paused`, `runMeta.trigger`, cron 검증                                                                                                                                         |
| `src/main/schedule/scheduler.ts` (새)                                            | 스케줄러, 자동 실행 흐름(SR-10), 멈춤                                                                                                                                                                     |
| `src/main/rclone/runner.ts`                                                      | `preview(jobId, trigger)`, `execute`에 `trigger` (검사 변경 없음)                                                                                                                                         |
| `src/main/store/job-store.ts`                                                    | `setPaused(jobId, paused)` (검증 없이 schedule만 갱신)                                                                                                                                                    |
| `src/main/index.ts`                                                              | 스케줄러 시작 · 종료, 트레이, 창 닫기 동작, 알림                                                                                                                                                          |
| `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc/register.ts` | `jobs:resume-schedule`, `jobs:changed`                                                                                                                                                                    |
| `src/stores/app-store.ts`                                                        | `jobs:changed` 구독                                                                                                                                                                                       |
| 화면: `JobEditorDialog`, `JobListPane`, `JobPage`, `JobHistoryTable`             | 자동 실행 칸, 멈춤 표시 · [다시 켜기], 실행 기록 "자동"                                                                                                                                                   |
| `resources/icon.png` (새), `electron-builder.yml`                                | 아이콘                                                                                                                                                                                                    |
| 테스트                                                                           | cron 단위, 스케줄러 판단(가짜 runner · 시계로: 한도 이하 실행, 초과 · 오류 · 빈 원본 · 실패에서 멈춤, 바뀔 것 없음은 그냥 끝, 진행 중이면 건너뜀), 통합(실제 rclone으로 자동 실행 한 번 · 한도 초과 멈춤) |

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면: 임시 폴더 작업에 "1분마다" 자동 실행 → 1 ~ 2분 안에 자동 미리보기와 실행이 기록에 "자동"으로 남음 → 대상에서 지울 파일을 한도보다 많이 만들고 기다림 → 실행 없이 "자동 실행 멈춤: 삭제 N개가 자동 한도 M개를 넘습니다"와 Windows 알림 → [다시 켜기].
3. 자동 실행 작업이 있을 때 창을 닫으면 트레이에 남고, [열기] · [종료]가 된다. 없으면 창을 닫으면 끝난다.

## 하지 않는 것 (2단계 이후)

- Windows 작업 스케줄러 등록 · 앱이 꺼져 있을 때 실행(SR-14), 놓친 실행 따라잡기
- 체인 실행(F09)
- 트레이에서 실행 진행률 보기
