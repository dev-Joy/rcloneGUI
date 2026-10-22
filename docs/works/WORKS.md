# WORKS

하루 작업을 `[YYYY-MM-DD] : 요약` 한 줄로 적는다. 자세한 내용은 [WORKS_HISTORY.md](WORKS_HISTORY.md).

- [2026-10-11] : rcloneGUI P0(작업 관리·비교·동기화·안전장치·실행 기록) 구현, AGENTS.md 개발 규칙 적용(접두사·ZBC 컴포넌트·`@/` import·module.css), 린트·포맷을 oxlint·oxfmt로 전환, `docs/guide` 가이드 추가 후 기존 코드 전체를 가이드 구조로 맞춤, 패키지 매니저를 pnpm으로 전환, Claude Code 하네스(훅 · 규칙 · 스킬 · 검증 에이전트) 추가, Antigravity용 `.agents/` 동기화
- [2026-10-12] : CodeGraph 설치 · Claude Code와 Antigravity에 MCP 등록 · 이 저장소 색인, `docs/intent.md` · `docs/prd.md` 작성
- [2026-10-13] : GitHub(dev-Joy/rcloneGUI) 공개, 앱 이름을 Baton에서 rcloneGUI로 변경
- [2026-10-14] : GoodSync 화면과 사용자 메모를 바탕으로 PRD에 F19 ~ F28 · SR-12 ~ SR-15 추가, 로드맵 재편, intent.md에서 양방향 동기화를 범위 안으로 변경, F26 SQLite 저장(node:sqlite, 예전 JSON 가져오기, ADR 0005) 구현, F28 입력 글자 수 제한, F29 기본 폴더 위치, F11 파일 상세(lsjson), F19 비교 트리 보기
- [2026-10-16] : F19 트리 보기 R2 검증 재개, F25 동기화 범위 · 폴더 작업 미리보기 구현(SR-06은 ADR 0006으로 결정), F19 R3 통과, F24 WSL 경로 선택 구현(R2 통과), F12 설치본 구현(R2 통과), F10 1단계 앱 안 자동 실행 · SR-10(R2 통과), F09 체인 실행 · SR-11 구현
- [2026-10-16] (이어서) : 기능별 커밋 정리(feat/v0.2), 화면 후속 정리, F20 용량 표시 구현, F21 작업 그룹 구현, F22 기타 보기 구현, F23 항목별 동작 · SR-13 구현, Google Drive 실사용 확인(리모트 첫 실행 목록 · 중단된 실행 기록 · 웹 주소 · critical 오류 · 앱 종료 시 rclone 멈춤 수정)
- [2026-10-17] : 진행 표시 평균 속도 · 남은 시간, 새 Drive 폴더로 동기화 · 백업 확인, Drive 폴더 주소 붙여 넣기, 실행 스냅샷(필터 · rclone.conf 지문), 작업 목록 최근 동기화 · 주기 · 다음 실행, F27 작업별 옵션 파일 · SR-15
- [2026-10-22] : 사용자 수정 요구를 intent/ 계획 문서 9건으로 정리, F27 검증 마무리(R3), 화면 용어 통일 · 작업 화면 단추 정리
