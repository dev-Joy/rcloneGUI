# F11 파일 상세 (원본 · 대상 크기와 수정 시각)

- 날짜: 2026-10-14
- 요구사항: [prd.md](../prd.md) F11 (P1, v0.2). 트리 표(F19)는 다음 단계에서 이 데이터를 쓴다.
- rclone 동작: [rclone-notes.md](../knowhow/rclone-notes.md) 2026-10-14 lsjson 항목, fixture `tests/fixtures/lsjson-l-src.json` · `lsjson-l-dst.json`

## 목적

비교 목록에서 파일마다 원본 · 대상의 크기와 수정 시각을 본다. **대상이 원본보다 최신인데 덮어쓰게 되는 파일**(변경 `*`)에
경고를 붙이고, 실행 확인 창에도 그 수를 보여준다. 대상 쪽에서 고친 파일을 모르고 덮어쓰는 사고를 줄인다.

## 결정 (사용자 확인 2026-10-14)

- 읽기는 작업 옵션 `비교할 때 크기 · 수정 시각 읽기`로, **기본 켬**. 리모트처럼 목록이 느린 작업은 끌 수 있다.
- 비교 시간이 늘어나는 것(양쪽 목록을 한 번 더 읽음)은 받아들인다.

## 동작

### 작업 옵션

- `jobSchema.options.readDetails: boolean`, `default(true)`(예전 작업은 켬으로 읽는다).
- 작업 편집 창 rclone 옵션 칸에 체크박스 하나: "비교할 때 크기 · 수정 시각 읽기 (리모트는 느려질 수 있음)".
- 이 값은 작업 설정 지문(`jobHash`)에 들어간다. 바꾸면 그 전 미리보기는 무효다(SR-01과 같은 규칙).

### 미리보기 뒤 목록 읽기 (main)

미리보기(`--dry-run`)의 rclone이 **성공으로 끝나고**, 취소되지 않았고, 작업의 `readDetails`가 켜져 있으면:

1. 메타 메시지를 "크기 · 수정 시각 읽는 중"으로 바꿔 화면에 알린다.
2. 원본과 대상에 `rclone lsjson <경로> -R --files-only --filter-from <같은 filter.txt> [--config …] [--fast-list]`를 **동시에** 실행한다.
    - 인자는 `command-builder.ts`의 새 함수 `buildListArgs`가 만들고 `assertSafeArgs`를 거친다. `--fast-list`는 동기화와 같은 조건(작업 옵션 + 리모트)이고, `--skip-links`도 작업 옵션이 켜져 있으면 붙인다(동기화와 같은 파일 집합을 보려고).
    - 실행은 `runner.ts`에서 `spawn(exe, args, { shell: false })`. stdout을 실행 폴더의 `lsjson-src.json` · `lsjson-dst.json`에 그대로 쓴다.
    - [중지]를 누르면 두 프로세스를 함께 끝낸다. 이때 미리보기는 지금처럼 "취소"로 끝난다.
3. 결과를 메타의 새 필드 `details`에 남긴다.
    - `"read"`: 양쪽 모두 읽음.
    - `"failed"`: 한쪽이라도 읽지 못함. 미리보기 자체는 성공으로 두고, 메시지 끝에 "크기 · 수정 시각을 읽지 못했습니다"를 붙인다(실행을 막지 않는다. 동기화 판단은 combined가 한다).
    - `"off"`: 옵션이 꺼져 있음. `null`: 실행 기록, 예전 기록, 실패하거나 취소한 미리보기.
    - 대상 폴더가 아직 없으면(로컬 대상, 첫 실행) lsjson이 exit 3을 낸다. 이때 대상은 빈 목록으로 보고 `"read"`로 둔다.
4. 30분 미리보기 유효 시간(SR-01)은 목록 읽기까지 끝난 시각(`endedAt`)부터 센다. 지금과 같다.

실제 실행(`execute`)에는 목록 읽기를 하지 않는다.

### 항목 데이터

- 새 순수 파서 `src/main/parsers/lsjson.ts`의 `parseLsjson(text)`: zod로 각 항목(`Path`, `Size`, `ModTime`, `IsDir`)을 검증하고, 폴더는 빼고 `Map<path, { size, modTime }>`를 돌려준다.
  형식에 맞지 않으면 예외(→ 그 실행의 상세는 없는 것으로).
- `itfFileItem`에 선택 필드 `source?`, `dest?`(`{ size: number; modTime: string } | null`)를 더한다.
    - 필드가 없으면 "모름"(상세를 안 읽었거나 실패), `null`이면 "그쪽에 없음".
- `runs.readItems`가 `combined.txt`와 두 lsjson 파일을 경로로 합친다. 파일이 없으면 지금처럼 경로와 상태만.
- 판단 함수 `isDestNewer(item)`(`src/shared/types.ts`, 순수): 상태가 `change`이고 양쪽 상세가 있고 대상 수정 시각이 원본보다 늦으면 참.

### 화면

- 비교 목록(평면, 지금의 3열)에서 원본 칸 · 대상 칸의 경로 아래가 아니라 **오른쪽에** `크기 · 수정 시각`을 작은 글씨로 붙인다(`formatBytes`, `formatDateTime`). 없는 쪽은 지금처럼 "없음".
- `isDestNewer` 항목은 일어날 일 배지 옆에 "대상이 더 최신" 경고 표시(주황, `title`에 두 시각).
- 실행 확인 창: 그런 항목이 있으면 "대상이 원본보다 최신인 파일 N개를 원본으로 덮어씁니다(백업 폴더로 옮김)" 한 줄과 그 목록(삭제 목록과 같은 모양). 체크박스나 실행 조건은 바꾸지 않는다.
- 상세를 읽지 못했으면 목록 위에 "크기 · 수정 시각을 읽지 못했습니다" 한 줄.

## 안전

- 새로 실행하는 rclone 명령은 `lsjson`(읽기 전용)뿐이다. `--dry-run`이 필요 없는 명령이지만, 쓰기 명령이 아니므로 SR-01 ~ SR-03의 범위 밖이다.
  인자는 차단 목록 검사를 거친다.
- 실행 경로(`execute()`)와 그 검사는 바뀌지 않는다. 상세 읽기 실패가 실행을 막거나 허용하는 조건이 되지 않는다.
- 같은 대상 동시 1개(SR-08): 목록 읽기는 미리보기 안에서 일어나므로 같은 큐에 묶인다.
- 상세 파일은 실행 폴더에만 쓴다. rclone.conf는 지금처럼 `--config` 경로로만.

## 바꿀 파일

| 파일                                    | 변경                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `src/shared/schemas.ts`                 | `options.readDetails`(default true), `runMetaSchema.details`(default null)      |
| `src/shared/types.ts`                   | `itfFileSide`, `itfFileItem.source?/dest?`, `itfRunMeta.details`, `isDestNewer` |
| `src/main/parsers/lsjson.ts` (새)       | `parseLsjson`                                                                   |
| `src/main/rclone/command-builder.ts`    | `buildListArgs`                                                                 |
| `src/main/rclone/runner.ts`             | 미리보기 뒤 목록 읽기, 취소, `details`                                          |
| `src/main/store/run-store.ts`           | `readItems`가 상세를 합침                                                       |
| `src/lib/job-defaults.ts`               | `newJob`에 `readDetails: true`                                                  |
| `src/pages/JobEditorDialog.tsx`         | 체크박스                                                                        |
| `src/pages/JobFileList.tsx` (+css)      | 크기 · 시각, 경고                                                               |
| `src/pages/RunConfirmDialog.tsx` (+css) | 대상이 더 최신인 파일 수와 목록                                                 |
| `src/pages/JobPage.tsx`                 | 상세 실패 안내                                                                  |
| `tests/unit/parsers.test.ts`            | fixture로 `parseLsjson`, 폴더 제외, 잘못된 형식                                 |
| `tests/unit/command-builder.test.ts`    | `buildListArgs`(필터 · config · fast-list, 차단 목록)                           |
| `tests/unit/*`                          | `isDestNewer`, `readItems` 합치기                                               |
| `tests/integration/runner.test.ts`      | 미리보기 뒤 상세가 붙는다(크기 일치), 옵션 끄면 없다, 대상 폴더가 없을 때       |
| `scripts/probes/rclone-probes.ps1`      | (완료) L 단계에 양쪽 lsjson                                                     |

새 IPC 채널은 없다(`runs:items` 응답에 필드가 늘 뿐).

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면: 비교 → 원본 · 대상 크기와 시각이 보인다 → 대상 쪽 파일을 원본보다 나중에 고쳐 둔 경우 그 행에 "대상이 더 최신" → [동기화] 확인 창에 그 수와 목록 → 옵션을 끄고 비교하면 크기 · 시각 없이 지금처럼.
3. 대상 폴더가 없는 새 작업의 비교가 성공하고 대상 칸은 "없음".

## 하지 않는 것

- 트리 표 · 폴더 합계 (F19)
- 실행 기록(`execute`)의 상세, 상세를 미리보기 전에 읽기
- 내용 비교(해시), 시간대 변환 표시 옵션
