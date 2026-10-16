# F12 설치본 (Windows exe)

- 날짜: 2026-10-16
- 요구사항: [prd.md](../prd.md) F12 (P1, v0.2), 사용자 메모 "exe 컴파일"
- 결정: 사용자 답이 없어 추천안으로 진행 — NSIS 설치 프로그램, 로그인 시 자동 시작은 설정에서 켜고 기본은 끔, 코드 서명 없음. 답이 오면 이 절을 고친다.

## 목적

개발 실행(`pnpm run dev` / `pnpm start`) 없이 설치해서 쓰는 Windows 앱을 만든다. F10(스케줄)의 Windows 작업 스케줄러 등록이 이 exe를 부른다.

## 동작

### 빌드

- 개발 의존성 `electron-builder`를 더한다(`THIRD_PARTY_NOTICES.md` 개발 도구 표에 한 줄).
- `pnpm run dist` = `pnpm run build` 뒤 `electron-builder --win nsis`. 결과는 `dist/`(git 무시)에 `rcloneGUI-Setup-<버전>.exe`.
- 설정 파일 `electron-builder.yml`:
    - `appId: io.github.dev-joy.rclonegui`, `productName: rcloneGUI`
    - `files`: `out/**`, `package.json`만. 소스 · 테스트 · 문서 · `.claude` · `.agents`는 넣지 않는다.
    - `nsis`: 사용자 단위 설치(관리자 권한 불필요), 설치 폴더 선택 가능, 시작 메뉴 바로 가기, 제거 시 사용자 데이터(`%APPDATA%\rcloneGUI`)는 **지우지 않는다**(작업 · 실행 기록 보존).
    - 코드 서명 없음(`win.signAndEditExecutable`은 기본, 인증서 설정 없음). 처음 실행할 때 SmartScreen 경고가 뜰 수 있다고 README에 적는다.
- 런타임 의존성은 번들에 이미 들어가 있다(electron-vite가 renderer는 번들, main은 `node:*` 외부). `node_modules`를 설치본에 넣지 않아도 되는지 빌드 결과로 확인한다(prd 9장 "pnpm의 node_modules 구조" 위험). 필요하면 `files`에 런타임 패키지만 더한다.
- rclone은 넣지 않는다. 사용자가 설치한 rclone을 지금처럼 찾는다(`locate.ts`).

### 로그인 시 자동 시작

- 설정에 `launchAtLogin: boolean`(`default(false)`, 예전 설정은 끔으로 읽음).
- 설정 창에 체크박스 "Windows에 로그인하면 rcloneGUI 시작". 저장하면 main이 `app.setLoginItemSettings({ openAtLogin })`로 반영한다.
- 개발 실행(`app.isPackaged === false`)에서는 등록하지 않고 "설치본에서만 동작" 안내를 보인다(개발용 Electron이 로그인 항목에 남지 않게).
- 앱을 켤 때는 로그인 항목을 바꾸지 않는다(사용자가 Windows 설정 · 작업 관리자에서 끈 것을 몰래 되살리지 않는다).
- 저장할 때도 **체크박스 값을 바꿔 저장한 경우에만** `setLoginItemSettings({ openAtLogin, enabled })`를 부른다. 다른 설정만 저장할 때는 로그인 항목을 건드리지 않는다.
- Windows의 실제 값은 `getLoginItemSettings().executableWillLaunchAtLogin`으로 읽는다. `openAtLogin`은 Run 키만 보고 작업 관리자의 "사용 안 함"(StartupApproved)을 반영하지 않는다(R1 지적, `electron.d.ts`). 설정 창은 저장된 값과 실제 값이 다르면 그 차이를 한 줄로 알린다.

### 앱 정보

- 설정 창 아래에 버전(`app.getVersion()`)과 "설치본 / 개발 실행" 표시. 새 IPC `app:info`.

## 안전

- 실행 · 삭제 조건(SR-01 ~ SR-11)은 바뀌지 않는다. 설치본은 같은 main 코드를 쓴다.
- 제거해도 사용자 데이터와 백업 폴더(`.rclonegui-backup`)는 지우지 않는다.
- 자동 시작은 앱을 켜기만 한다. 동기화를 자동으로 돌리는 것은 F10(SR-10 · SR-14)이다.
- `contextIsolation` · `sandbox`는 설치본에서도 그대로다(같은 `BrowserWindow` 설정).

## 바꿀 파일

| 파일                                                                 | 변경                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| `package.json`                                                       | `electron-builder` 개발 의존성, `dist` 스크립트, `version` |
| `electron-builder.yml` (새)                                          | 설치본 설정                                                |
| `.gitignore`                                                         | `dist/`                                                    |
| `src/shared/schemas.ts` · `types.ts` · `ipc-contract.ts`             | `launchAtLogin`, `app:info`                                |
| `src/main/index.ts`, `src/main/ipc/register.ts`                      | 로그인 항목 반영, 앱 정보                                  |
| `src/preload/index.ts`                                               | `app.info()`                                               |
| `src/pages/SettingsDialog.tsx`                                       | 체크박스, 버전 표시                                        |
| `THIRD_PARTY_NOTICES.md`, `AGENTS.md` 2장(명령), `docs/CHANGELOG.md` | 기록                                                       |

## 확인 방법

1. `pnpm run check`, `pnpm run dist` 성공, 설치 파일 크기와 포함 파일 목록(소스 · 테스트가 없는지).
2. 설치본을 이 PC에 사용자 단위로 설치 → 시작 메뉴에서 실행 → 기존 작업과 기록이 보인다(같은 `%APPDATA%\rcloneGUI`) → 비교만(미리보기) 해 본다.
3. 설정에서 자동 시작을 켜면 `getLoginItemSettings().openAtLogin === true`, 끄면 false. 개발 실행에서는 안내만.
4. 제거 → 사용자 데이터 폴더가 남는다.

설치 · 제거는 사용자 PC를 바꾸는 일이라 2 · 4번은 사용자에게 먼저 묻고 한다.

## 하지 않는 것

- 자동 업데이트, 코드 서명, 포터블 exe, rclone 동봉, macOS · Linux 빌드
