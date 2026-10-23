# 029 Google Drive 폴더 주소 붙여 넣기

- 작성: Claude (사후 작성 2026-10-23 — 이미 만든 기능을 TASK_031 기록 · 명세로 정리) · 상태: 완료
- 만든 날: 2026-10-17 · 관련: PRD F15(부분), 003(리모트 등록), 명세 [`docs/specs/2026-10-17-drive-folder-url.md`](../docs/specs/2026-10-17-drive-folder-url.md) · 커밋 fc9a0a1

## 문제

Drive 폴더마다 리모트를 새로 만들거나 `리모트,root_folder_id=ID:`를 손으로 써야 했다. 사용자: "이런 파싱 기능이 있어야 할 것 같다".

## 바라는 결과

- 원본 · 대상 칸에 Drive 폴더 주소를 붙여 넣으면 "어느 연결로 쓸까요?"와 drive 리모트 단추, 누르면 연결 문자열로 바꿈.
- 폴더 맨 위로 sync하면 백업 설정에 맞는 경고.

## 영향

- `src/shared/drive-url.ts`, `listRemotes`(`--long --json` → 이름 · 종류), 편집 창.

## 제약

- 파일 주소 · 다른 도메인은 폴더로 읽지 않는다.
- 리모트는 만들지 않는다(만들기는 003).

## 결정된 것

- 없음.

## 계획 (한 것)

1. 주소 7종 · 아닌 것 8종 테스트, `parseRemoteList` fixture

## 결과

- R2 통과(R1 reviewer: 맨 위 sync 경고가 백업 설정과 맞지 않음).
- 남은 것: SR-07 · SR-08이 폴더 ID 사이 관계를 못 봄.
