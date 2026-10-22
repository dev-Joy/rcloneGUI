# F27 작업별 옵션 파일 · SR-15

- 날짜: 2026-10-17
- 요구사항: [prd.md](../prd.md) F27 (P2, v0.3), SR-15. 사용자 메모(2026-10-14): "rclone 옵션값이 길어지면 파일로 넣는다"
- 사용자 "남은거랑 다음후보 다해줘"(2026-10-17)

## 목적

편집 창의 칸으로는 없는 rclone 옵션(속도 제한, 체크섬 비교, Drive 청크 크기 등)을 작업마다 **텍스트 파일**로 두고 쓴다.
파일에서 읽은 옵션도 차단 목록(SR-09) · 글자 수 제한(F28)을 거치고, 앱의 안전장치를 우회하는 옵션은 받지 않는다(SR-15).

## 동작

### 파일 형식

- UTF-8 텍스트, 한 줄에 옵션 하나: `--bwlimit 10M`, `--checksum`, `--drive-chunk-size=64M`. 값에 공백이 있으면 큰따옴표: `--user-agent "my app"`.
- 빈 줄과 `#`으로 시작하는 줄은 무시한다.
- 한도: 200줄, 한 줄 512자, 파일 64 KiB(F28과 같은 수준).
- 이름이 `--`로 시작해야 한다. 짧은 옵션(`-c`)은 받지 않는다(무엇인지 헷갈리지 않게 긴 이름만).

### 허용 목록 (SR-15)

허용 목록에 있는 옵션만 받는다. 그 밖은 "N번째 줄: --xxx는 옵션 파일에서 쓸 수 없습니다(이유)"로 거부한다.

- 전송 · 속도: `--bwlimit` `--bwlimit-file` `--tpslimit` `--tpslimit-burst` `--buffer-size` `--multi-thread-cutoff` `--multi-thread-streams` `--max-backlog` `--order-by` `--check-first` `--no-traverse` `--low-level-retries` `--timeout` `--contimeout` `--user-agent`
- 비교 방식: `--checksum` `--size-only` `--ignore-size` `--ignore-checksum` `--update` `--modify-window` `--no-update-modtime` `--use-server-modtime` `--ignore-case-sync`
- 크기 · 날짜 거르기: `--max-size` `--min-size` `--max-age` `--min-age` (거른 파일은 양쪽에서 빠져 지워지지 않는다. 미리보기에 그대로 반영된다)
- 백엔드 설정: 이름이 `--<백엔드>-`로 시작하는 것 — `drive` `s3` `sftp` `onedrive` `local` `b2` `dropbox` `box` `webdav` `ftp` `smb` `azureblob` `gcs` `pcloud` `mega` `crypt`

받지 않는 대표 옵션과 이유(문구에 쓴다):

- 앱이 정하는 것: `--dry-run` `--max-delete` `--backup-dir` `--combined` `--config` `--filter*` `--include*` `--exclude*` `--files-from*` `--use-json-log` `--log-*` `-v` `--stats*` `--retries` `--ignore-errors` `--create-empty-src-dirs` `--fast-list` `--skip-links` `--checkers` `--transfers`
- 지우는 방식을 바꾸는 것: `--delete-*` `--track-renames*` `--suffix*` `--compare-dest` `--copy-dest`
- 차단 목록(SR-09): `--delete-excluded` `--no-check-dest` `--dump*` — 거부하고, 생성된 인자는 어차피 `assertSafeArgs`를 한 번 더 거친다

### 값 쓰는 방법 (R1 검토로 정함)

- 값 없는 옵션(`--checksum` 등)은 `--이름` 또는 `--이름=true|false`만. rclone은 값 없는 옵션 뒤의 낱말을 값으로 가져가지 않고 **다른 옵션으로 읽으므로**(`--checksum --ignore-errors`가 우회가 됨) 뒤 낱말을 받지 않는다.
- 값 있는 옵션은 `--이름 값` 또는 `--이름=값`. 값이 `-`로 시작하면 거부(다른 옵션으로 읽힐 수 있음).
- 백엔드 설정은 **`--이름=값`만**(값 없는 설정도 `=true`). 앱은 값을 받는 설정인지 모르므로 이름만 쓰면 rclone이 다음 인자를 값으로 가져갈 수 있다(R2 검토: `--s3-storage-class`가 `--dry-run`을 먹어 실제 동기화로 지워짐, rclone-notes 2026-10-22). 이름에 `pass` `token` `secret` `key` `auth` `client-id` `service-account` `trash` `hard-delete` `root-folder-id` `team-drive` `shared-with-me` `impersonate` `remote` `endpoint` `bucket` `host` `user` `url` `ssh` `command` `shell`이 들어가면 거부(비밀값이 기록에 남음 · 휴지통 건너뛰기 · 실제 위치가 바뀌어 겹침 · 백업 검사가 맞지 않음 · 명령 실행).
- 생성된 인자 검사(`assertSafeArgs`)도 강화: 앱이 정하는 옵션(`--config` `--backup-dir` `--max-delete` `--filter-from` `--combined` `--dry-run`)이 두 번 나오면 거부, 실제 동기화에서 `--backup-dir` 없이 `--ignore-errors`가 있으면 거부.
- 실행은 실행 검사(`execute()`) 때 읽은 옵션을 그대로 시작에 넘긴다(두 번 읽으면 그 사이 바뀐 옵션이 검사 없이 돈다).

### 작업 · 편집 창

- 작업에 `optionsFile: 경로 | null`(예전 작업은 null). 편집 창 "rclone 옵션 파일" 칸 + [파일 선택] + 안내(형식 · 허용 범위 요약).
- 저장할 때 main이 파일을 읽어 검사한다. 없거나 틀리면 저장을 거부하고 줄 번호와 이유를 보인다.

### 실행

- 미리보기 · 실행 · 명령 복사 · 제외됨 계산을 시작할 때마다 파일을 **다시 읽어** 검사하고, 옵션을 **원본 · 대상 바로 뒤, 모든 앱 옵션 앞**에 붙인다(R3: 혹시 다음 인자를 값으로 가져가도 그것은 `--filter-from`이라 rclone이 사용법 오류로 시작하지 않는다. `--dry-run` · 삭제 한도 · 백업에는 닿지 않는다). 목록 읽기(lsjson) · 용량(about)에도 같은 옵션을 붙인다(전역 옵션이라 받아들인다, rclone-notes 2026-10-17).
- 그때 파일이 없거나 틀리면 그 미리보기 · 실행은 시작하지 않고 이유를 알린다(OPTIONS_INVALID).
- 읽은 옵션은 실행 설정 지문(`jobHash`)에 들어간다. 미리보기 뒤에 파일 내용이 바뀌면 그 미리보기로는 실행할 수 없다(SR-01). 옵션 파일 경로도 화면 쪽 지문(`runSettingsOf`)에 들어가 경로를 바꾸면 화면도 [동기화]를 끈다.
- 실행한 명령(기록)에 옵션이 그대로 보인다.

## 안전

- 새 실행 경로 없음. 옵션은 기존 `buildArgs` · `buildListArgs` · `buildAboutArgs`에 붙고 `assertSafeArgs`를 거친다.
- 허용 목록 밖은 거부(기본 거부). 앱 안전 옵션(`--max-delete` · `--backup-dir` · `--dry-run`)을 덮어쓸 수 없다.
- 옵션 파일은 rclone.conf가 아니다(사용자가 쓴 옵션). 읽어서 검사한다. 내용은 실행 명령 기록에 남는다 — 비밀값을 넣지 말라고 안내한다.

## 바꿀 파일

| 파일                                                             | 변경                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/options-file.ts` (새)                                | `parseOptionsText`(순수: 줄 나누기 · 따옴표 · 한도 · 허용 목록)                                                                                                                |
| `src/shared/schemas.ts` · `types.ts` · `limits.ts`               | `optionsFile`, `runSettingsOf`에 경로, 한도                                                                                                                                    |
| `src/main/rclone/command-builder.ts`                             | `extraArgs`, `jobHash(job, config, options)`                                                                                                                                   |
| `src/main/store/job-store.ts`, `src/main/rclone/options.ts` (새) | 파일 읽기 · 저장 검사                                                                                                                                                          |
| `src/main/rclone/runner.ts`                                      | 시작 · 실행 검사 · 명령 · 제외됨에서 옵션 읽기                                                                                                                                 |
| `src/pages/JobEditorDialog.tsx`, `src/lib/job-defaults.ts`       | 칸 · [파일 선택] · 안내                                                                                                                                                        |
| 테스트                                                           | 파서(형식 · 따옴표 · 주석 · 한도 · 허용 · 거부 이유), 인자 위치 · 차단, 지문, 저장 검사, 통합(옵션이 명령에 들어가 동작, 파일을 바꾸면 실행 거부, 틀린 파일이면 미리보기 거부) |

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면(임시 프로필): 임시 옵션 파일 `--checksum` · `--bwlimit 10M` 지정 → 저장 → 비교 → 실행 기록 [정보] 명령에 보임 → 파일에 `--max-delete 5` 추가 → 저장 거부(줄 번호 · 이유) → 파일만 고치고(편집 창 저장 없이) 동기화 → 거부 "다시 비교하세요".

## 하지 않는 것

- 편집 창에서 옵션 파일 내용을 쓰고 저장하는 편집기(파일은 사용자가 만든다)
- 짧은 옵션, 허용 목록 밖 옵션의 "고급 모드"
