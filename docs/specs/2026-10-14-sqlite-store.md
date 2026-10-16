# F26 SQLite 저장

- 날짜: 2026-10-14
- 요구사항: [prd.md](../prd.md) F26 (P1, v0.2)
- 관련 결정: ADR 0005 (이 작업에서 작성, ADR 0004의 "작업은 jobs.json" 부분을 대체)

## 목적

작업 · 설정 · 실행 기록 메타를 JSON 파일 여러 개 대신 SQLite 파일 하나(`%APPDATA%\rcloneGUI\rclonegui.db`)에 둔다.
뒤에 올 기능(F21 그룹, F10 스케줄, F27 옵션 파일)이 파일 형식을 늘리지 않고 표나 열을 더해 붙을 수 있게 한다.
사용자가 보는 화면과 동작은 바뀌지 않는다. 처음 켤 때 기존 JSON을 가져와 이전 작업과 기록이 그대로 보인다.

## 결정 (사용자 확인 2026-10-14)

| 항목      | 결정                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| 엔진      | `node:sqlite`(`DatabaseSync`). Electron 44 / Node 24.21 내장, SQLite 3.53. 네이티브 모듈 없음             |
| 실행 기록 | `run.json`의 내용만 DB로. `combined.txt` · `rclone.jsonl` · `filter.txt`는 실행 폴더에 그대로 둔다        |
| 기존 JSON | 가져온 뒤 파일은 손대지 않는다(이름 바꾸기 · 삭제 없음). DB에 가져왔다는 표시만 남겨 다시 가져오지 않는다 |

## 동작

### DB 구조 (`PRAGMA user_version = 1`)

```sql
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE jobs (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE runs (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    data TEXT NOT NULL,
    UNIQUE (job_id, run_id)
);
CREATE INDEX runs_by_job ON runs (job_id, seq DESC);
```

- 각 행의 `data`는 기존 JSON 한 건(작업 · 설정 · 실행 메타)이다. 읽을 때 zod 스키마로 파싱한다.
  필드를 열로 풀지 않는 이유: 작업 스키마가 바뀔 때마다 마이그레이션이 생기지 않게 하려는 것이다. 검색이나 정렬에 필요한 값만 열로 둔다.
- `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`.
- `user_version`이 앱이 아는 값보다 크면(새 버전 앱이 만든 DB) 열지 않고 `DB_NEWER_VERSION` 오류를 낸다.

### 저장소 동작 (지금과 같게)

- `clsJobStore`: `list` · `get` · `save` · `delete`. 순서는 처음 저장한 순서(`position`). 저장 전 검증(SR-07 경로 겹침,
  ignore-errors는 백업 필요, 자기 자신에게 체인 금지, 원본 폴더 존재)은 그대로. `delete`는 같은 트랜잭션에서
  다른 작업의 `chainNext`를 비운다.
- `clsSettingsStore`: 한 행. 없거나 파싱에 실패하면 기본값.
- `clsRunStore`:
    - `create`는 지금처럼 실행 폴더를 만들어 ID를 정한다(같은 초면 `-2`, `-3` …).
    - `write`는 `(job_id, run_id)` 기준 upsert. 처음 쓸 때 들어간 `seq`가 유지된다.
    - `list`는 `seq DESC`로 최근 100건. 실행을 만든 순서가 곧 최신순이라 SR-01("미리보기가 가장 최근 실행")의 판단은 그대로다.
      (지금은 폴더 이름의 문자열 역순이라 같은 초에 10번 넘게 실행하면 `-10`이 `-9`보다 앞에 오는데, 이 경우도 바로잡힌다.)
    - `read`는 한 건. 파싱에 실패한 행은 없는 것으로 본다.
    - `runDir` · `readItems`는 바뀌지 않는다(파일 그대로).
- 모든 메서드는 지금처럼 `Promise`를 돌려준다. 그래서 runner와 IPC 쪽 호출부는 생성 부분 말고는 바뀌지 않는다.

### 기존 JSON 가져오기

DB를 처음 열 때(`app_meta`에 `json_imported_at`이 없을 때) 한 트랜잭션으로 아래를 가져온다.

1. `jobs.json` → `jobs`. `z.array(jobSchema)`로 파싱한다. 실패하면 **아무것도 가져오지 않고** 표시도 남기지 않은 채
   `JSON_IMPORT_FAILED` 오류를 낸다(지금도 jobs.json이 깨져 있으면 작업 목록을 읽지 못한다). 파일이 없으면 0건.
2. `settings.json` → `settings`. 파싱에 실패하면 가져오지 않는다(지금도 기본값으로 대체한다).
3. `runs/<jobId>/<runId>/run.json` → `runs`. 실행 ID 순서대로 넣는다. 읽지 못하거나 스키마에 맞지 않거나 폴더 이름과
   `jobId` · `runId`가 다르면 건너뛰고 건수를 센다.
4. `app_meta.json_imported_at = <ISO 시각>`, 건너뛴 실행 수는 `json_import_skipped_runs`에 남긴다.

JSON 파일이 하나도 없는 새 설치도 같은 경로로 지나가 표시만 남는다.

### 앱 시작과 종료

- `src/main/index.ts`: `openAppDatabase(baseDir)`로 DB를 열고, 세 저장소에 넘긴다. 앱이 끝날 때(`will-quit`) 닫는다.
- 열기나 가져오기에 실패하면 오류 창(`dialog.showErrorBox`)에 이유와 DB 경로를 보여주고 앱을 끝낸다.
  빈 저장소로 계속 실행하지 않는다. 작업이 사라진 것처럼 보이면 안 되기 때문이다(판단 기준 2).

## 안전

- 지우거나 덮어쓰는 경로는 새로 생기지 않는다. 기존 JSON은 읽기만 한다.
- SR-01의 "가장 최근 실행" 판단은 `seq` 순서로 하고, 통합 테스트(`tests/integration/runner.test.ts`)가 그대로 통과해야 한다.
- rclone.conf는 지금처럼 경로(`settings.rcloneConfig`)만 저장하고 열지 않는다(SR-09, 안전 규칙 6).
- DB 파일에도 비밀값은 없다(경로 · 옵션 · 실행 메타뿐). 실행 메타의 `command`는 지금 `run.json`에 있는 것과 같다.

## 바꿀 파일

| 파일                                   | 변경                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/main/store/app-database.ts` (새)  | `openAppDatabase`, 스키마 생성, 버전 확인, JSON 가져오기, `clsAppDatabase`                                     |
| `src/main/store/job-store.ts`          | 생성자 `(db)`, DB 읽기 · 쓰기                                                                                  |
| `src/main/store/settings-store.ts`     | 생성자 `(db)`                                                                                                  |
| `src/main/store/run-store.ts`          | 생성자 `(db, baseDir)`, 메타는 DB, 폴더는 그대로                                                               |
| `src/main/store/json-file.ts`          | `readJson`만 남김(가져오기용). `writeJson`은 쓰는 곳이 없어지면 삭제                                           |
| `src/shared/schemas.ts`                | `runMetaSchema` 추가 (가져오기와 DB 읽기 검증)                                                                 |
| `src/main/index.ts`                    | DB 열기 · 닫기, 실패 시 오류 창                                                                                |
| `tests/unit/job-store.test.ts`         | 새 생성자로                                                                                                    |
| `tests/unit/app-database.test.ts` (새) | 스키마 생성, 재열기 유지, 버전 거부, JSON 가져오기(정상 · 깨진 jobs.json · 잘못된 run.json 건너뛰기 · 한 번만) |
| `tests/integration/runner.test.ts`     | 새 생성자로                                                                                                    |
| `docs/adr/0005-sqlite-store.md` (새)   | 결정 기록, 0004 상태를 "일부 대체"로                                                                           |

새 IPC 채널은 없다. 화면 파일도 바뀌지 않는다.

## 확인 방법

1. `pnpm run check` (typecheck · lint · 단위 테스트)
2. `pnpm run test:int` (SR-01 · SR-03 · SR-08 흐름이 DB 저장소로도 그대로)
3. `pnpm run build`로 `node:sqlite`가 번들에 묶이지 않고 외부 모듈로 남는지 확인
4. 화면 확인 (`app-verifier`):
    - 임시 프로필에 JSON 형식의 작업 하나와 실행 기록 하나를 두고 앱을 띄운다 → 작업 목록과 실행 기록에 보인다
    - 앱을 다시 띄워도 그대로이고 두 번 가져오지 않는다
    - 새 작업 저장 → 비교 → 동기화 → 실행 기록에 남는다 → 앱을 다시 켜도 남아 있다
    - 기존 JSON 파일은 바뀌지 않았다(수정 시각 · 내용)

## 하지 않는 것

- 실행 폴더의 파일(`combined.txt` 등)을 DB로 옮기기
- 작업 필드를 열로 풀기, 그룹(F21) · 스케줄(F10) 열 추가
- 기존 JSON 삭제 · 이름 바꾸기, DB를 JSON으로 되돌리는 내보내기
- 화면 변경
