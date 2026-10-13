---
name: rclone-probe
description: rclone 동작 실험을 다시 돌려 앱이 기대하는 것과 달라졌는지 확인한다. rclone 버전을 올렸을 때, 새 환경(WSL 경로, Google Drive 리모트)을 처음 붙일 때, combined·JSON 로그 파서나 종료 코드 처리가 의심될 때 쓴다.
---

# rclone 동작 재확인

Baton은 rclone의 출력 형식과 종료 코드에 기대고 있다. 기대하는 동작은 `docs/knowhow/rclone-notes.md`에 표로 적혀 있고,
파서 테스트는 `tests/fixtures/`의 실제 출력으로 돈다.

## 순서

1. 지금 버전과 필수 기능을 확인한다.

    ```
    rclone version
    rclone sync --help | Select-String combined
    ```

2. 실험 스크립트를 **빈 임시 폴더**에서 돌린다. 스크립트가 그 폴더를 지우고 다시 만들므로 다른 용도의 폴더를 주지 않는다.

    ```
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/probes/rclone-probes.ps1 -Work <임시 폴더>
    ```

    Linux·WSL에서는 `scripts/probes/rclone_probes.sh <임시 폴더>` (권한 실험 D·E는 root와 `rtest` 사용자가 필요하다).

3. 출력을 `rclone-notes.md`의 가장 최근 표와 실험 글자(A, G, H …)별로 비교한다. 볼 것:
    - 종료 코드: 성공 0, 사용법 2, 없는 원본 3, 삭제 한도 7
    - combined: 기호 `+ - * = !`, 줄 끝 LF, 경로 구분자 `/`, 한글·공백 경로
    - 삭제 한도에 걸린 실행에서 같은 경로가 `-` 뒤에 `!`로 한 번 더 나오는지
    - JSON 로그 마지막 줄의 `stats` 키 이름
    - 빈 원본 미리보기가 대상 전체를 `-`로 내는지, `copy`도 대상에만 있는 파일을 `-`로 내는지

4. 달라진 것이 있으면
    - `rclone-notes.md`에 새 절(날짜 · 버전 · OS)로 표를 추가한다. 기존 절은 고치지 않는다.
    - 파서나 실행기를 고쳐야 하면 먼저 `tests/fixtures/`를 새 출력으로 바꾼다. 사용자 경로가 들어가지 않게 치환한다
      (`C:/work/probe` 같은 중립 경로). 그다음 `pnpm run check`, `pnpm run test:int`.
    - 안전장치에 영향을 주는 변화(오류 시 삭제 보류, `--max-delete`, `--backup-dir`)는 사용자에게 먼저 알린다.

5. 달라진 것이 없으면 `rclone-notes.md`에 "같은 결과" 한 줄만 추가한다.

## 하지 말 것

- 실제 작업 폴더나 리모트를 실험 대상으로 쓰지 않는다. 리모트 실험이 필요하면 사용자에게 테스트용 경로를 받는다.
- `--dry-run` 없는 rclone 쓰기 명령을 셸에서 직접 치지 않는다 (훅이 막는다). 실험은 스크립트로만 한다.
- rclone.conf를 열어 읽거나 내용을 기록하지 않는다.
