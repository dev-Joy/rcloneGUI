---
name: run-rclonegui
description: rcloneGUI 앱을 실제로 띄워 화면까지 확인한다. 화면·IPC·실행기(runner)를 고친 뒤 "앱에서 되는지 확인", "실행해서 보여줘", "스크린샷" 요청이 있을 때, 또는 테스트만으로는 확인되지 않는 변경(스타일, 대화상자, 버튼 상태)을 검증할 때 쓴다.
---

<!-- 생성 파일: .claude/skills/run-rclonegui/SKILL.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

# rcloneGUI 실행해서 확인하기

빌드본을 **임시 프로필**로 띄우고 `scripts/dev/drive-app.mjs`로 조작한다. 사용자의 실제 프로필(`%APPDATA%\rcloneGUI`)과
실제 작업 폴더는 건드리지 않는다.

## 순서

1. 빌드한다. 화면은 빌드본(`out/`)을 읽으므로 코드를 고친 뒤에는 다시 빌드해야 한다.

    ```
    pnpm run build
    ```

2. 띄우고, 확인용 작업을 만든다. `seed`는 임시 원본·대상 폴더와 작업 "Dev Fixture"(sync, 추가 1 · 변경 1 · 삭제 1 · 같음 1)를 만든다.

    ```
    node scripts/dev/drive-app.mjs launch
    node scripts/dev/drive-app.mjs seed
    ```

3. 조작하고 관찰한다.

    ```
    node scripts/dev/drive-app.mjs click 비교
    node scripts/dev/drive-app.mjs text ".zbcBadge"
    node scripts/dev/drive-app.mjs shot preview
    node scripts/dev/drive-app.mjs eval "document.querySelector('h1').textContent"
    ```

    - `click <글자>`는 글자가 정확히 같거나 `<글자>:`로 시작하는 버튼을 누른다 (`동기화: 대상에 …` 버튼은 `click 동기화`).
    - `shot <이름>`은 `<작업 폴더>/shots/<이름>.png`에 저장하고 경로를 출력한다. Read 도구로 열어 본다.
    - 화면 콘솔의 error·warning은 명령 출력 끝에 `--- 화면 콘솔 ---`로 붙는다.
    - rclone 실행은 비동기다. `click 비교`나 `click 실행` 뒤에는 2~3초 기다린 다음 읽는다.

4. 끝나면 반드시 정리한다. 앱을 끄고 작업 폴더와 이 도구가 만든 백업 폴더를 지운다.

    ```
    node scripts/dev/drive-app.mjs clean
    ```

## 알아 둘 것

- 선택자: 공용 컴포넌트는 전역 클래스(`.zbcButton`, `.zbcModal`, `.zbcBadge`, `.zbcCheckInput`)를 쓰고, 페이지 내부 클래스는
  CSS Modules로 해시되므로 선택자로 쓸 수 없다. 글자나 태그(`h1`, `footer`, `tbody tr`)로 찾는다.
- 삭제가 있는 sync는 확인 창에서 체크해야 [실행]이 켜진다:
  `eval "document.querySelector('.zbcModal .zbcCheckInput').click()"` 다음 `click 실행`.
- 실제 sync를 돌리면 백업이 **대상 드라이브 최상위**의 `.rclonegui-backup\dev-fixture`에 생긴다. `clean`이 지운다.
- 앱 창은 사용자 화면에 실제로 뜬다. 사용자가 그 창을 직접 누르면 결과가 섞일 수 있다.
- 작업 폴더는 `RCLONEGUI_DEV_DIR`, 포트는 `RCLONEGUI_DEV_PORT`(기본 9333)로 바꾼다.
- rclone이 없으면 버튼이 꺼져 있다. `eval "window.rclonegui.rclone.status()"`로 확인한다.
- 개발 모드(`pnpm run dev`)를 조작해야 하면 `electron-vite dev --remoteDebuggingPort 9333`로 띄운다. 이때는 실제 프로필을 쓴다.

## 보고할 때

무엇을 눌렀고 무엇을 봤는지(글자, 스크린샷 경로)를 적는다. 확인하지 못한 부분은 확인하지 못했다고 적는다.
