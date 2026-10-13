<!-- 생성 파일: .claude/rules/tests.md 에서 scripts/harness/sync-agents.mjs 가 만든다. 직접 고치지 말고 원본을 고친 뒤 pnpm run harness:sync -->

> 적용 범위: `tests/**`, `scripts/**` 를 다룰 때만 따른다.

# 테스트와 스크립트를 고칠 때

- 테스트는 임시 폴더(`os.tmpdir()` 아래 `mkdtemp`)만 쓰고 끝나면 지운다. 실제 사용자 경로(`E:\…`, `\\wsl.localhost\…`, `GDRIVE-…`)와 rclone.conf 내용을
  테스트·fixture·예제에 넣지 않는다.
- `tests/fixtures/`는 `scripts/probes/`로 받은 **실제 rclone 출력**이다. 손으로 지어내지 않는다. 바꿀 때는 경로만 중립적으로 치환한다.
- 통합 테스트(`tests/integration`)는 실제 rclone을 쓴다. rclone이 없으면 이유를 출력하고 건너뛰게 유지한다.
  백업 폴더는 `backupDirFor` 주입으로 임시 폴더 안에 두어, 드라이브 최상위에 쓰지 않는다.
- 삭제 한도에 걸릴 때 어느 파일이 남는지는 실행마다 다르다. 특정 파일 이름에 기대는 단언을 쓰지 않는다.
- 안전장치를 확인하는 테스트(미리보기 없이 실행 거부, 확인 수 불일치, 30분 경과, 설정 변경, 빈 원본, 차단 옵션)는 지우거나 약하게 만들지 않는다.
- `scripts/probes/rclone-probes.ps1`은 ASCII로만 쓴다 (Windows PowerShell 5.1이 BOM 없는 파일을 ANSI로 읽는다).
- `scripts/dev/drive-app.mjs`는 임시 프로필만 쓴다. 실제 프로필이나 실제 작업 폴더를 기본값으로 바꾸지 않는다.
