# 0005 작업 · 설정 · 실행 메타는 SQLite(node:sqlite) 한 파일에 둔다

- 상태: 채택 (2026-10-14)
- 대체: [0004](0004-job-json-and-filter-file.md)의 "작업은 `jobs.json`에 둔다" 부분. 필터 파일(`filter.txt` + `--filter-from`)과 rclone.conf 경로 참조는 그대로다.

## 배경

뒤에 올 기능(F21 작업 그룹, F10 스케줄, F27 옵션 파일, F29 기본 폴더)이 저장할 것을 늘린다. 지금처럼 기능마다 JSON 파일을 따로 두면
파일 사이의 일관성(작업을 지우면 체인 · 실행 기록도 정리)을 앱이 직접 맞춰야 한다. 실행 기록 목록은 폴더를 훑어 `run.json`을
하나씩 읽어야 하고, 순서도 폴더 이름의 문자열 정렬에 기대고 있었다.

## 결정

- `%APPDATA%\rcloneGUI\rclonegui.db` 하나에 `jobs` · `settings` · `runs` · `app_meta` 표를 둔다. 스키마 버전은 `PRAGMA user_version`이다.
- 엔진은 Electron 44(Node 24.21)에 들어 있는 `node:sqlite`의 `DatabaseSync`를 쓴다. WAL 모드.
- 각 행의 `data`에는 예전 JSON 한 건을 그대로 두고, 읽을 때 zod로 검증한다. 검색이나 정렬에 필요한 값(`id`, `position`, `job_id`, `run_id`, `seq`)만 열로 둔다.
- 실행 기록은 메타만 DB에 넣는다. `combined.txt` · `rclone.jsonl` · `filter.txt`는 rclone이 직접 쓰고 읽는 파일이라 실행 폴더에 그대로 둔다.
- 실행 목록의 최신순은 처음 기록한 순번(`seq`)이다. SR-01의 "가장 최근 실행"도 이 순서로 판단한다.
- DB를 처음 열 때 예전 `jobs.json` · `settings.json` · `runs/*/*/run.json`을 한 트랜잭션으로 가져오고, `app_meta.json_imported_at`을 남긴다.
  원본 JSON은 읽기만 하고 남겨 둔다. `jobs.json`이 깨져 있으면 아무것도 가져오지 않고 앱을 멈춘다(빈 목록으로 켜지 않는다).
- 앱보다 새 스키마의 DB는 열지 않는다.

## 버린 대안

- `better-sqlite3`: 안정 API지만 네이티브 모듈이라 Electron 버전마다 다시 빌드해야 하고, 설치본(F12) 빌드에 위험을 더한다.
- 작업 필드를 열로 풀기: 작업 스키마가 바뀔 때마다 마이그레이션이 생긴다. 지금 쿼리에 필요한 열이 없다.
- `combined.txt`까지 DB에 넣기: 파일을 rclone이 직접 쓰므로 어차피 남고, 저장이 두 번 된다. 트리 보기(F19)에서 필요하면 그때 정한다.
- 가져온 JSON을 지우거나 이름 바꾸기: 문제가 생겼을 때 되돌리기 어렵다(판단 기준 3).

## 결과

- 의존성은 늘지 않는다. `THIRD_PARTY_NOTICES.md` 변경 없음.
- Node에서 실행하는 테스트는 `node:sqlite`의 ExperimentalWarning을 한 번 출력할 수 있다. 동작에는 영향이 없다.
- 예전 JSON을 다시 가져오려면 `rclonegui.db`(와 `-wal`, `-shm`)를 지우고 앱을 켠다. 그 뒤 DB에만 있던 변경은 사라진다.
- DB 파일은 앱 밖에서 `sqlite3`로 열어 볼 수 있다. 비밀값은 없다(경로 · 옵션 · 실행 메타뿐, rclone.conf는 경로만).
