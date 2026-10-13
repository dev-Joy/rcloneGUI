---
paths:
    - "src/main/**"
    - "src/preload/**"
    - "src/shared/**"
---

# main · preload · shared를 고칠 때

- 파일 구조는 `docs/guide/File.tsx.guide` 4장: 머리말 → External/Internal imports → `Types 정의` → `내부 함수` → `메인 클래스 / export 함수`.
- rclone은 `src/main/rclone/runner.ts`와 `locate.ts`에서만, `spawn`/`execFile(exe, args[], { shell: false })`로만 실행한다.
- `--dry-run` 없는 실행은 `clsRcloneRunner.execute()` 하나뿐이다. 이 메서드의 검사(성공한 최신 미리보기, 30분, 설정 지문, 빈 원본, 확인한 삭제 수)를
  줄이거나 우회하는 경로를 만들지 않는다. 바꿔야 하면 사용자에게 먼저 묻고 ADR을 쓴다.
- `command-builder.ts`의 차단 목록(`--delete-excluded`, `--no-check-dest`, `--max-delete -1`, `--dump*`, 백업 없는 `--ignore-errors`)을 줄이는 변경은 ADR 필수.
- 빌더·파서·실행기를 고치면 `tests/unit`과 `tests/integration`에 테스트를 더하고 `pnpm run test:int`까지 돌린다.
- IPC: 채널과 타입은 `src/shared/ipc-contract.ts`에만. 핸들러는 `src/main/ipc/register.ts`에서 zod로 검증하고 `{ ok, data } | { ok, error }`로 답한다.
  화면이 임의 경로를 열거나 임의 명령을 실행할 수 있는 채널을 만들지 않는다.
- `src/shared`는 Node·DOM·electron을 가져오지 않는다. preload는 `contextBridge`로 함수만 연다.
- rclone.conf는 경로로만 넘긴다. 열어 읽거나 로그에 남기지 않는다.
- rclone 출력 형식에 기대는 코드를 고칠 때는 `docs/knowhow/rclone-notes.md`를 먼저 본다. 의심되면 `rclone-probe` 스킬.
