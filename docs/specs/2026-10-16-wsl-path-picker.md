# F24 WSL 경로 선택

- 날짜: 2026-10-16
- 요구사항: [prd.md](../prd.md) F24 (P1, v0.2), 사용자 메모 "wsl -> mnt"(2026-10-14 확인: WSL 경로 선택 UI)

## 목적

작업 편집 창에서 WSL 배포판의 폴더를 바로 고른다. 지금은 `\\wsl.localhost\Ubuntu\home\…`을 손으로 적거나,
탐색기 폴더 선택 창에서 네트워크 위치를 찾아 들어가야 한다.

## 이 PC에서 확인한 것 (2026-10-16, Windows 11, WSL 2)

- `wsl.exe -l -q`는 배포판 이름을 **UTF-16LE**로, 줄 끝 `\r\n`으로 낸다(`55 00 62 00 …` = `Ubuntu\r\n`). 그대로 UTF-8로 읽으면 글자 사이에 NUL이 낀다.
- 배포판이 멈춰 있으면 `\\wsl.localhost\Ubuntu`가 바로 보이지 않을 수 있다. 그 경로에 접근하면 배포판이 켜지고 열린다(PowerShell `Get-ChildItem`으로 확인, 몇 초 걸림).
- `\\wsl.localhost\<배포판>\`과 `\\wsl$\<배포판>\`이 같은 곳을 가리킨다. 앱은 지금처럼 `\\wsl.localhost`를 쓴다(백업 위치 규칙 · 경로 겹침 검사가 이 형식을 안다).
- WSL이 설치되지 않은 PC에서는 `wsl.exe`가 없거나 오류로 끝난다.

## 동작

### main

- 새 IPC `app:wslDistros` → `string[]`. `execFile("wsl.exe", ["-l", "-q"], { shell: false, windowsHide: true, encoding: "buffer", timeout: 5000 })`,
  출력을 `utf16le`로 읽어 줄마다 자르고(앞뒤 공백 · NUL 제거) 빈 줄을 뺀다. 실패하거나 WSL이 없으면 빈 목록(오류로 다루지 않는다).
  파서 `parseWslList(buffer)`는 순수 함수로 두고 실제 출력 바이트로 테스트한다.
- `app:pickFolder`의 입력을 넓힌다: 지금의 `"source" | "dest" | "settings"`에 더해 `{ target, wslDistro }`.
  `wslDistro`가 있으면 main이 **방금 얻은 배포판 목록에 있는 이름인지** 확인한 뒤, 시작 위치를 `\\wsl.localhost\<배포판>\`으로 한다.
  목록에 없는 이름은 `INVALID_INPUT`. 화면이 임의 경로를 넘기는 채널은 여전히 없다(F29와 같은 원칙).
- 배포판 이름 검증: zod `string`, 1 ~ 64자, `^[A-Za-z0-9._-]+$` (WSL 배포판 이름 규칙 안).
- 폴더 선택 창이 고른 경로를 그대로 돌려준다. `\\wsl.localhost\Ubuntu\home\me\proj` 같은 UNC 경로가 들어간다.

### 화면 (작업 편집 창)

- 원본 · 대상 칸의 [폴더 선택] 옆에 [WSL] 단추. 배포판이 하나도 없으면 단추를 숨긴다(작업 편집 창을 열 때 한 번 목록을 받는다).
- 배포판이 하나면 [WSL] 단추 하나, 둘 이상이면 배포판마다 [WSL: 이름] 단추를 둔다(메뉴 대신 단추. 배포판 수가 적다). 누르면 그 배포판에서 폴더 선택 창을 연다.
- 창이 열리기까지 배포판이 켜지는 시간이 걸릴 수 있다. 단추에 "WSL 여는 중…"을 보이고 그동안 다시 누를 수 없다.
- 고른 경로는 원본 · 대상 칸에 들어가고, 저장할 때 지금의 검사(원본 존재, SR-07 경로 겹침)를 그대로 받는다.

## 안전

- 새로 실행하는 외부 명령은 `wsl.exe -l -q`(목록 읽기)뿐이다. `shell: false`, 인자 배열, 시간 제한 5초. rclone 실행 경로와 무관하다.
- 화면이 넘기는 것은 배포판 이름뿐이고, main이 실제 목록과 대조한다. 경로 조립은 main이 한다.
- 고른 경로는 작업 입력값일 뿐이다. 실행 · 삭제 조건(SR-01 ~ SR-08)은 바뀌지 않는다.

## 바꿀 파일

| 파일                                                     | 변경                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/main/system/wsl.ts` (새)                            | `parseWslList`, `listWslDistros`                                           |
| `src/shared/schemas.ts` · `ipc-contract.ts` · `types.ts` | `wslDistroSchema`, `pickFolder` 입력 확장, `app.wslDistros()`              |
| `src/preload/index.ts`                                   | 두 함수                                                                    |
| `src/main/ipc/register.ts`                               | `app:wslDistros`, `pickFolder`의 WSL 시작 위치                             |
| `src/pages/JobEditorDialog.tsx` · `.module.css`          | [WSL] 단추와 배포판 메뉴                                                   |
| `tests/unit/wsl.test.ts` (새)                            | 실제 바이트(`55 00 62 00 … 0d 00 0a 00`), 여러 배포판, 빈 출력, NUL · 공백 |
| `tests/unit/*`                                           | 배포판 이름 스키마                                                         |
| `docs/knowhow/rclone-notes.md`                           | "그 밖에 알게 된 것"에 wsl -l 인코딩 · 멈춘 배포판                         |

## 확인 방법

1. `pnpm run check`
2. 화면(이 PC, Ubuntu 1개): 작업 편집 → 원본 [WSL] → 폴더 선택 창이 `\\wsl.localhost\Ubuntu\`에서 열림 → 취소하면 칸 그대로 → (가능하면) 폴더를 골라 칸에 UNC 경로가 들어가고 저장 · 비교가 된다.
3. `pickFolder({ target: "source", wslDistro: "NoSuchDistro" })`는 거부된다.

## 하지 않는 것

- `/mnt/d/…` 같은 WSL 안쪽 경로를 Windows 경로로 바꾸기(사용자가 고르지 않은 해석)
- rclone을 WSL 안에서 실행하기
- 배포판 시작 · 중지 제어
