# rclone 실험 노트

형식: 날짜 · rclone 버전 · OS · 명령 · 결과 · 앱에 준 영향.
실험은 `scripts/probes/`의 스크립트로 다시 돌릴 수 있다.

## 2026-10-11 · v1.75.1 · Windows 11 (winget `Rclone.Rclone`)

`scripts/probes/rclone-probes.ps1`을 로컬 임시 폴더에서 실행. `\\wsl.localhost`, `E:`, Google Drive 리모트는
이 PC에 없어 확인하지 못했다.

| 실험 | 명령                                                                   | 결과                                                                                                                                                                              | 앱에 준 영향                                                                                                  |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A    | `sync --dry-run --combined f --use-json-log -v --stats 1s --retries 1` | exit 0, 대상 불변. combined는 UTF-8(BOM 없음), 줄 끝 LF, 경로 구분자 `/`, 한글·공백 경로 그대로                                                                                   | `sync`가 `--combined`를 직접 지원 → `check`를 따로 돌릴 필요 없음. 파서 입력 형식 확정                        |
| A    | 같은 실행의 stderr                                                     | 한 줄에 JSON 하나. 항목 줄은 `skipped: copy/delete`, `size`, `object`. 마지막 줄 `stats{bytes,totalBytes,transfers,totalTransfers,checks,totalChecks,deletes,errors,eta,speed,…}` | 진행률은 `stats`만 읽는다. rclone.conf가 없으면 첫 줄에 `Config file … not found` notice가 나온다 (오류 아님) |
| G    | `sync --max-delete 1`, 삭제 대상 3개                                   | 1개 지운 뒤 `--max-delete threshold reached`, exit 7. **어느 파일이 지워지는지는 실행마다 다르다**                                                                                | 한도는 사전 차단이 아니다. 종료 메시지에서 `max-delete threshold`를 찾아 "다시 비교" 안내                     |
| G    | 같은 실행의 combined                                                   | 삭제에 실패한 파일이 `- path` 뒤에 `! path`로 **한 번 더** 나온다                                                                                                                 | 파서가 같은 경로를 한 줄로 합치고 오류를 우선한다                                                             |
| —    | `sync --max-delete 0`, 삭제 대상 1개                                   | 하나도 지우지 않고 실패 종료                                                                                                                                                      | 삭제 0개로 확인한 실행은 `--max-delete 0`으로 고정 (통합 테스트로 고정)                                       |
| H    | `sync --backup-dir bak` (대상 밖)                                      | 덮어쓴 파일의 이전 버전과 지운 파일이 원래 구조로 `bak`에 이동. 로그는 `Moved (server-side)`                                                                                      | 백업 기본 켬                                                                                                  |
| H2   | 실행 후 다시 `--dry-run --combined`                                    | `=`만 남음                                                                                                                                                                        | 최종검증 항목                                                                                                 |
| I    | `--backup-dir dst\.bak` (대상 안)                                      | `mustn't overlap`, exit 7                                                                                                                                                         | 백업 경로는 대상 드라이브 최상위로 자동 지정, 겹치면 저장 거부                                                |
| J    | 없는 원본                                                              | `directory not found`, exit 3                                                                                                                                                     | rclone을 띄우기 전에 원본 폴더를 검사                                                                         |
| K    | 빈 원본 `--dry-run`                                                    | 대상 전체가 `-`                                                                                                                                                                   | 원본 파일 수(`+`·`*`·`=`)가 0이면 실행 차단                                                                   |
| L    | `--filter-from`(줄마다 `- 패턴`)                                       | `--exclude`와 같은 결과                                                                                                                                                           | 필터 파일 방식 채택                                                                                           |
| L    | `lsjson -R --files-only`                                               | `Path, Name, Size, MimeType, ModTime, IsDir` JSON 배열                                                                                                                            | F11(P1)에서 사용 예정                                                                                         |
| N    | `copy --dry-run --combined`                                            | 대상에만 있는 파일도 `-`로 나온다 (copy는 지우지 않는다)                                                                                                                          | copy에서는 "삭제"가 아니라 "대상에만 · 그대로 둠"으로 표시하고 삭제 수에 넣지 않는다                          |
| M    | 인자 부족                                                              | exit 2                                                                                                                                                                            | 종료 코드 2 = 사용법 오류 확인                                                                                |

그 밖에 알게 된 것

- Windows PowerShell 5.1에서 `rclone … 2> file`은 stderr 줄을 오류 레코드로 감싸 JSON 로그를 깨뜨린다.
  실험 스크립트는 `Start-Process -RedirectStandardError`로 받는다. 앱은 `spawn`으로 직접 읽으므로 무관하다.
- Windows PowerShell 5.1은 BOM 없는 `.ps1`을 ANSI로 읽는다. 실험 스크립트는 ASCII로만 쓴다.

- winget(`Rclone.Rclone`)은 rclone을 `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Rclone.Rclone_…\rclone-v…\`에 풀고 그 폴더를 사용자 PATH에 넣는다
  (이 PC에서는 `WinGet\Links`에 링크가 생기지 않았다). 설치 전에 열려 있던 터미널은 PATH가 옛것이라
  rclone을 못 찾는다. 앱은 PATH에 없으면 이 패키지 폴더를 직접 찾는다 (`locate.ts`).

아직 확인하지 못한 것

- `\\wsl.localhost` 원본의 속도와 오류 빈도, Linux 파일명 치환(`:` → `：`), 대소문자만 다른 두 파일
- Google Drive 리모트에서의 `--backup-dir`(`remote:.baton-backup/…`)와 `--fast-list`
- 원본 폴더 읽기 실패 + `--ignore-errors` (아래 1.60.1 실험 E)의 최신 버전 재확인
- 종료 코드 4·5의 뜻 (앱 문구는 공식 문서의 일반적인 설명을 따랐다)

## 2026-10-09 · v1.60.1 · Ubuntu 24.04 (기획 단계)

`scripts/probes/rclone_probes.sh`. 기획서 5.2의 실험 A–M. 요점만 옮긴다.

- D: 원본 **파일** 읽기 실패 → 기본은 삭제 보류(exit 1), `--ignore-errors`를 주면 삭제 진행.
- E: 원본 **폴더** 읽기 실패 + `--ignore-errors` → 대상의 같은 폴더 파일이 삭제됨 (exit 6). → `--ignore-errors` 기본 금지.
- F: 원본의 소켓 파일은 "Can't transfer non file/directory" 안내만 나오고 오류가 아니다 (Linux).
- 1.60.1의 `sync`에는 `--combined`가 없다 → 앱은 `sync --help`에 플래그가 있는지로 필수 기능을 검사한다.
