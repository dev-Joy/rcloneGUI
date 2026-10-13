# rcloneGUI

rclone 기반 폴더 비교·동기화 데스크톱 앱 (Windows). 동기화 엔진은 rclone을 그대로 실행하고,
앱은 명령 생성 · 미리보기 · 안전장치 · 기록을 맡는다.

작업 등록 → **비교**(대상은 바뀌지 않음) → 확인 → **동기화** → 결과·기록 확인.

## 준비

- Node.js 22.12 이상 (24 LTS 권장)
- pnpm 12 (`package.json`의 `packageManager` 참고). 설치 스크립트는 `pnpm-workspace.yaml`의 `allowBuilds`에 적힌 패키지만 실행된다
- `sync --combined`를 지원하는 rclone (v1.75.1에서 확인) — PATH에 두거나 앱 설정에서 `rclone.exe` 위치 지정
- 클라우드 리모트는 미리 `rclone config`로 만들어 둔다 (앱에는 계정 연결 화면이 없다)

```bash
pnpm install
```

```bash
pnpm run dev
```

## 명령

| 명령                            | 하는 일                                        |
| ------------------------------- | ---------------------------------------------- |
| `pnpm run dev`                  | 개발 실행                                      |
| `pnpm run check`                | typecheck + lint(oxlint, eslint) + 단위 테스트 |
| `pnpm run format`               | oxfmt로 포맷 (`format:check`는 검사만)         |
| `pnpm run test:int`             | 실제 rclone으로 임시 폴더 통합 테스트          |
| `pnpm run build` / `pnpm start` | `out/`에 빌드 / 빌드본 실행                    |

## 안전장치

- 실제 동기화는 같은 작업의 미리보기 뒤 30분 안에만, 그 미리보기가 가장 최근 실행일 때만 된다.
- sync에서 삭제가 있으면 목록을 보고 체크해야 실행된다. 실행 때 `--max-delete`를 확인한 수로 고정한다.
- 지우거나 덮어쓰는 파일은 대상 드라이브의 `.rclonegui-backup\<작업ID>\<실행ID>`로 옮긴다 (기본 켬).
- 원본이 없거나 비어 있으면 실행을 막는다. 원본·대상·백업 경로가 겹치면 저장을 거부한다.
- `--ignore-errors`는 기본 명령에 없고, 백업이 켜진 작업에서만 고급 옵션으로 허용한다.

## 데이터 위치

`%APPDATA%\rcloneGUI\` 아래 `jobs.json`, `settings.json`, `runs\<작업ID>\<실행ID>\{run.json, combined.txt, rclone.jsonl, filter.txt}`.

## 문서

- [AGENTS.md](AGENTS.md) — 작업 규칙
- [docs/intent.md](docs/intent.md) — 왜 만드는가, 판단 기준
- [docs/prd.md](docs/prd.md) — 요구사항과 진행 상황
- [docs/knowhow/rclone-notes.md](docs/knowhow/rclone-notes.md) — rclone 실험 결과
- [docs/adr/](docs/adr/) — 설계 결정
