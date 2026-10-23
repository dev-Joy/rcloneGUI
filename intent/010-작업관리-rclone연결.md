# 010 작업 관리 · rclone 연결 · 리모트 목록

- 작성: Claude (사후 작성 2026-10-23 — 이미 만든 기능을 TASK_001 기록로 정리) · 상태: 완료
- 만든 날: 2026-10-11 · 관련: PRD F01 · F02 · F03, ADR 0001 · 0004 · 커밋 2527c98 · 82ed703

## 문제

WSL 작업 폴더 → 로컬 드라이브 → Google Drive로 맞추는 일을 매번 rclone 명령으로 치고 있었다. 명령을 잘못 치면 대상 파일이 지워질 수 있고, 어떤 작업을 어떤 옵션으로 돌렸는지 남지 않는다.

## 바라는 결과

- 작업(이름 · 원본 · 대상 · copy/sync · 제외 패턴 · checkers/transfers)을 저장하고 복제 · 삭제한다.
- rclone.exe를 PATH · 지정 경로 · winget 폴더에서 찾고, 버전과 `sync --combined` 지원을 확인한다.
- `rclone listremotes`로 리모트를 고르고, rclone.conf는 경로로만 지정한다.

## 영향

- main 전체의 뼈대: `command-builder`, `runner`, `parsers`, `store`, IPC, 화면 작업 목록 · 편집 창 · 설정 창.

## 제약

- rclone은 `spawn`/`execFile(args[], { shell: false })`로만 실행한다(명령 문자열 조립 금지).
- rclone.conf는 열어 읽지 않고 경로로만 넘긴다.

## 결정된 것

- rclone은 rcd(rc API)가 아니라 CLI로 감싼다 — ADR 0001.
- 작업은 JSON, 필터는 실행마다 `--filter-from` 파일로 — ADR 0004(뒤에 F26 · ADR 0005로 일부 대체).

## 계획 (한 것)

1. main 뼈대와 IPC 계약(`src/shared/ipc-contract.ts`)
2. 작업 편집 창 · 설정 창
3. 단위 테스트 + 실제 rclone 통합 테스트

## 결과

- 2026-10-11 구현(P0). 단위 112개 · 통합 14개. GitHub 공개 때(2026-10-13) 영역별 커밋으로 올림.
- 리모트 목록은 리모트가 있는 환경에서 그때 확인하지 못했고, 뒤에 Google Drive 실사용(027)에서 확인.
