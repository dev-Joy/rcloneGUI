# Google Drive 폴더 주소 붙여 넣기 · 미리보기 진행 줄

- 날짜: 2026-10-17
- 요구사항: [prd.md](../prd.md) F15(리모트 추가 화면, v0.4)의 앞부분. 2026-10-16 사용자가 경로 칸에 Drive 웹 주소를 넣어 "didn't find section in config file ("https")"를 겪고, "이런 파싱 기능이 있어야 할 것 같다"고 함
- 사용자 "ㅇㅇ"(2026-10-17)

## 목적

Google Drive 폴더의 웹 주소를 원본 · 대상 칸에 붙여 넣으면, 리모트를 폴더마다 새로 만들지 않고 이미 있는 Drive 리모트로 그 폴더를 쓸 수 있게 한다.
rclone 연결 문자열 `<리모트>,root_folder_id=<폴더 ID>:<하위 경로>`를 쓴다(rclone-notes 2026-10-17: 비교 · 동기화 · 백업 모두 동작 확인).

함께, 진행 표시 수정(2026-10-17-average-progress)의 남은 것을 고친다: 미리보기(dry-run)도 bytes를 보고하므로 1초 넘게 걸리는 미리보기에서 "평균 … /s · 남은 시간"이 보일 수 있다.

## 동작

### 폴더 주소 알아보기 (순수 함수 `src/shared/drive-url.ts`)

- 받는 형식: `https://drive.google.com/drive/folders/<ID>`, `…/drive/u/<N>/folders/<ID>`, `…/open?id=<ID>`, `…/folderview?id=<ID>`. 뒤의 `?usp=…` · `#…`는 무시한다. ID는 `[A-Za-z0-9_-]{10,}`.
- 다른 주소(파일 주소 `…/file/d/…`, 다른 사이트)는 폴더 주소로 보지 않는다.
- `driveFolderLocation(remote, id)` → `<리모트 이름>,root_folder_id=<ID>:` (리모트 이름 끝의 `:`는 뗀다).

### 편집 창

- 원본 · 대상 칸 값이 Drive 폴더 주소이면 칸 아래에 안내를 띄운다.
    - Drive 리모트(종류 `drive`)가 있으면: "Google Drive 폴더 주소입니다. 어느 연결로 쓸까요?" + 리모트마다 단추. 누르면 칸 값을 연결 문자열로 바꾼다.
    - 없으면: "Google Drive 연결(rclone 리모트)이 없습니다. 터미널에서 `rclone config create <이름> drive`로 만든 뒤 이 창을 다시 여세요."
- 바꾼 뒤에는(값이 `…,root_folder_id=…:` 형식이면) 칸 아래에 "Google Drive 폴더 · 연결 <리모트>"를 보여 준다. 대상이 폴더 맨 위(`:` 뒤가 비어 있음)이면 "폴더 맨 위로 sync하면 원본에 없는 파일은 지워집니다(백업 폴더로 옮김). 하위 폴더를 쓰려면 끝에 이름을 붙이세요"를 덧붙인다.
  **(R2 정정)** 백업을 켜면 백업 폴더가 대상 안에 생겨 저장이 거부되므로(SR-04 · SR-07) "폴더 맨 위는 백업 폴더가 대상 안에 생겨 저장할 수 없습니다. 끝에 하위 폴더 이름을 붙이세요", 백업을 끄고 sync면 "원본에 없는 파일은 백업 없이 지워집니다"로 나눈다.
- 리모트 목록을 받기 전에는 "목록을 읽는 중…", 실패하면 "목록을 읽지 못했습니다"를 보인다("연결이 없습니다"는 받은 목록이 비었을 때만).
- 웹 주소를 바꾸지 않고 저장하면 지금처럼 main이 거부한다("웹 주소는 쓸 수 없습니다…").
- 대상 칸 아래의 리모트 단추 목록(지금 있는 것)은 그대로 이름만 넣는다.

### 리모트 목록 IPC

- `rclone:remotes`가 `{ name, type }[]`를 돌려준다(`listremotes --long --json`, rclone.conf는 읽지 않는다). 파서는 순수 함수, fixture는 실제 출력.

### 미리보기 진행 줄

- 미리보기(kind preview) 중에는 평균 속도 · 남은 시간 · 마무리 안내를 쓰지 않는다(아무것도 보내지 않으므로). 실제 동기화는 그대로.

## 안전

- 실행 · 확인 창 · 삭제 수 · 차단 목록은 그대로다. 연결 문자열은 경로 칸의 값일 뿐이고, 저장 · 미리보기 · 실행의 기존 검사를 모두 거친다.
- 새 IPC 채널은 없다. `rclone:remotes`의 응답 모양만 바뀐다(이름과 종류. 토큰 · 설정 값은 없다).
- 폴더 맨 위 sync 경고는 안내일 뿐이고, 지우는 파일은 지금처럼 미리보기 · 확인 창에서 보인다.

## 바꿀 파일

| 파일                                        | 변경                                                               |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `src/shared/drive-url.ts` (새)              | `parseDriveFolderUrl`, `driveFolderLocation`, `parseDriveLocation` |
| `src/main/rclone/locate.ts`                 | `listRemotes`가 `--long --json`, `parseRemoteList`(순수)           |
| `src/shared/types.ts` · `ipc-contract.ts`   | `itfRemote`, `remotes()` 응답                                      |
| `src/pages/JobEditorDialog.tsx` (+css)      | 주소 안내 · 변환 단추 · 연결 표시                                  |
| `src/pages/JobRunBanner.tsx`                | 미리보기는 속도 · 남은 시간 없음                                   |
| `tests/fixtures/listremotes-json.json` (새) | 실제 출력(리모트 이름만 바꿈)                                      |
| 테스트                                      | drive-url, parseRemoteList                                         |

## 확인 방법

1. `pnpm run check`, `pnpm run test:int`
2. 화면(임시 프로필, Drive 대신 `RCLONE_CONFIG_<NAME>_TYPE=drive` 환경 변수 리모트로 목록만 흉내): 대상 칸에 Drive 폴더 주소 붙여 넣기 → 안내와 리모트 단추 → 누르면 연결 문자열 → "Google Drive 폴더 · 연결 …" · 맨 위 경고 → 하위 이름을 붙이면 경고가 사라짐. 리모트가 없을 때 안내. 웹 주소 그대로 저장하면 거부.

## 하지 않는 것

- 앱 안에서 Google 로그인 · 리모트 만들기(F15 본편)
- 파일 주소 · 공유 드라이브(team drive) 주소
- 폴더 ID가 실제로 있는지 · 쓸 수 있는지 미리 확인

## 한계 (R1 검토)

- 겹침 검사(SR-07)와 같은 대상 동시 실행 막기(SR-08)는 경로 문자열로만 판단한다. 서로 다른 폴더 ID, 또는 `리모트:`와 `리모트,root_folder_id=ID:`가 실제로는 같은 폴더이거나 한쪽이 다른 쪽 안에 있어도 알지 못한다. 미리보기 · 확인 창의 삭제 목록과 백업이 마지막 안전망이다.
- `open?id=`는 파일 주소에도 쓰인다. 파일 ID를 root_folder_id로 넣었을 때 rclone이 어떻게 동작하는지는 확인하지 않았다(미리보기 실패나 빈 목록으로 예상하지만 실험 안 함). 대상에 들어가면 빈 원본 검사(SR-06)로는 막히지 않는다. 공유 링크의 `resourcekey`는 쓰지 않는다.
