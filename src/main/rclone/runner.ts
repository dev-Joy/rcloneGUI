/**
 *  Runner
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - rclone을 띄우는 유일한 곳. 미리보기·실행·취소·실행 큐
 */

/**
 *  External imports
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 *  Internal imports
 */
import {
    emptyCounts,
    plannedDeletes,
    PREVIEW_TTL_MS,
    type typJob,
    type itfJobCommands,
    type typRunEvent,
    type typRunKind,
    type itfRunMeta,
} from "@/shared/types";
import { countItems } from "@/main/parsers/combined";
import { createLineSplitter, formatErrorLine, parseLogLine } from "@/main/parsers/json-log";
import type { clsJobStore } from "@/main/store/job-store";
import { formatRunId, type clsRunStore } from "@/main/store/run-store";
import { assertSafeArgs, buildArgs, buildFilterText, formatCommand, jobHash } from "./command-builder";
import { backupDirFor, destKey, isRemote } from "./paths";

/**
 *  Types 정의
 */
const MAX_KEPT_ERRORS = 50;

export interface itfRunnerDeps {
    jobs: clsJobStore;
    runs: clsRunStore;
    /** 복사용 명령이 쓰는 필터 파일을 두는 폴더 */
    manualDir: string;
    /** rclone 실행 파일 경로. 못 찾으면 던진다. */
    resolveRclone: () => Promise<string>;
    /** 설정의 기본 rclone.conf 경로 */
    defaultConfig: () => Promise<string | null>;
    emit: (event: typRunEvent) => void;
    now?: () => Date;
    /** 백업 폴더 규칙. 기본은 대상 드라이브 최상위의 .baton-backup (테스트에서 바꿔 끼운다). */
    backupDirFor?: (dest: string, jobId: string, runId: string) => string | null;
}

interface itfActiveRun {
    meta: itfRunMeta;
    child: ChildProcess | null;
    canceled: boolean;
    finished: Promise<itfRunMeta>;
}

/**
 *  내부 함수
 */
async function f_AssertSourceDirectory(path: string): Promise<void> {
    try {
        if ((await stat(path)).isDirectory()) return;
    } catch {
        // 아래에서 같은 안내로 처리한다.
    }
    throw new clsRunError("SOURCE_MISSING", `원본 폴더를 찾을 수 없습니다: ${path}`);
}

/**
 *  메인 클래스 / export 함수
 */
export class clsRunError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "clsRunError";
    }
}

/** rclone 종료 코드를 사람이 읽는 말로 */
export function describeExit(code: number | null, errors: readonly string[]): string {
    if (errors.some((line) => line.includes("max-delete threshold"))) {
        return "삭제 한도에 걸려 멈췄습니다. 미리보기 뒤에 원본이나 대상이 바뀌었습니다. 다시 비교하세요";
    }
    switch (code) {
        case 0:
            return "성공";
        case 2:
            return "rclone 명령 사용법 오류";
        case 3:
            return "폴더를 찾을 수 없습니다";
        case 4:
            return "파일을 찾을 수 없습니다";
        case 5:
            return "일시적인 오류입니다. 다시 시도하면 될 수 있습니다";
        case 6:
            return "일부 파일에서 오류가 났습니다";
        case 7:
            return "치명적인 오류로 중단했습니다";
        case 8:
            return "전송량 한도에 도달했습니다";
        case 10:
            return "시간 한도에 도달했습니다";
        case null:
            return "rclone이 비정상 종료했습니다";
        default:
            return `오류가 났습니다 (종료 코드 ${code})`;
    }
}

/**
 * rclone을 띄우는 유일한 곳. 실제 동기화(--dry-run 없는 실행)는 execute()로만 시작되고,
 * execute()는 방금 끝난 미리보기와 사용자가 확인한 삭제 수가 맞아야만 진행한다.
 */
export class clsRcloneRunner {
    private readonly active = new Map<string, itfActiveRun>();
    private readonly queues = new Map<string, Promise<unknown>>();
    private readonly now: () => Date;
    private readonly backupDirFor: NonNullable<itfRunnerDeps["backupDirFor"]>;

    constructor(private readonly deps: itfRunnerDeps) {
        this.now = deps.now ?? (() => new Date());
        this.backupDirFor = deps.backupDirFor ?? backupDirFor;
    }

    /** 미리보기를 시작하고 실행 ID를 바로 돌려준다. */
    async preview(jobId: string): Promise<string> {
        const job = await this.deps.jobs.get(jobId);
        return this.start(job, "preview", null, undefined);
    }

    /** 미리보기를 확인한 만큼만 실제로 동기화한다. */
    async execute(input: { jobId: string; previewRunId: string; confirmedDeletes: number }): Promise<string> {
        const job = await this.deps.jobs.get(input.jobId);
        const preview = await this.deps.runs.read(input.jobId, input.previewRunId);
        if (!preview || preview.kind !== "preview" || preview.status !== "success" || !preview.endedAt) {
            throw new clsRunError("PREVIEW_INVALID", "끝난 미리보기가 없습니다. 먼저 비교하세요");
        }
        if (this.now().getTime() - new Date(preview.endedAt).getTime() > PREVIEW_TTL_MS) {
            throw new clsRunError("PREVIEW_EXPIRED", "미리보기가 30분을 넘었습니다. 다시 비교하세요");
        }
        const latest = (await this.deps.runs.list(input.jobId))[0];
        const hash = jobHash(job, await this.deps.defaultConfig());
        if (preview.jobHash !== hash || latest?.runId !== preview.runId) {
            throw new clsRunError(
                "PREVIEW_STALE",
                "미리보기 뒤에 작업 설정이나 실행 기록이 바뀌었습니다. 다시 비교하세요",
            );
        }
        if (preview.blocked === "EMPTY_SOURCE") {
            throw new clsRunError("EMPTY_SOURCE", "원본에 파일이 하나도 없어 실행을 막았습니다");
        }
        const deletes = plannedDeletes(preview);
        if (input.confirmedDeletes !== deletes) {
            throw new clsRunError("CONFIRM_MISMATCH", `확인한 삭제 수가 미리보기(${deletes}개)와 다릅니다`);
        }
        return this.start(job, "execute", preview.runId, deletes);
    }

    /** 대기 중이거나 실행 중인 rclone을 멈춘다. 이미 끝났으면 아무 일도 없다. */
    cancel(runId: string): void {
        const run = this.active.get(runId);
        if (!run) return;
        run.canceled = true;
        run.child?.kill();
    }

    /** 실행이 끝나 기록이 저장될 때까지 기다린다 (테스트·체인용). */
    async wait(runId: string): Promise<itfRunMeta | null> {
        return (await this.active.get(runId)?.finished) ?? null;
    }

    /** 터미널에서 그대로 실행할 수 있는 명령. 필터 파일을 실제로 만들어 둔다. */
    async commands(jobId: string): Promise<itfJobCommands> {
        const job = await this.deps.jobs.get(jobId);
        const dir = join(this.deps.manualDir, jobId);
        await mkdir(dir, { recursive: true });
        const filterPath = join(dir, "filter.txt");
        await writeFile(filterPath, buildFilterText(job.excludes), "utf8");

        const defaultConfig = await this.deps.defaultConfig();
        const base = { filterPath, combinedPath: join(dir, "combined.txt"), defaultConfig };
        const latest = (await this.deps.runs.list(jobId))[0];
        const fresh =
            latest?.kind === "preview" &&
            latest.status === "success" &&
            latest.jobHash === jobHash(job, defaultConfig);
        const manualRunId = `${formatRunId(this.now())}-manual`;
        return {
            preview: formatCommand(buildArgs(job, { ...base, kind: "preview" })),
            execute: formatCommand(
                buildArgs(job, {
                    ...base,
                    kind: "execute",
                    maxDelete: fresh ? plannedDeletes(latest) : 0,
                    backupDir: job.safety.backup ? this.backupDirFor(job.dest, job.id, manualRunId) : null,
                }),
            ),
        };
    }

    private async start(
        job: typJob,
        kind: typRunKind,
        previewRunId: string | null,
        maxDelete: number | undefined,
    ): Promise<string> {
        const exe = await this.deps.resolveRclone();
        if (!isRemote(job.source)) await f_AssertSourceDirectory(job.source);

        const defaultConfig = await this.deps.defaultConfig();
        const startedAt = this.now();
        const runId = await this.deps.runs.create(job.id, startedAt);
        const dir = this.deps.runs.runDir(job.id, runId);
        const backupDir =
            kind === "execute" && job.safety.backup ? this.backupDirFor(job.dest, job.id, runId) : null;

        const filterPath = join(dir, "filter.txt");
        const args = buildArgs(job, {
            kind,
            filterPath,
            combinedPath: join(dir, "combined.txt"),
            defaultConfig,
            maxDelete,
            backupDir,
        });
        await writeFile(filterPath, buildFilterText(job.excludes), "utf8");

        const meta: itfRunMeta = {
            runId,
            jobId: job.id,
            kind,
            status: "queued",
            exitCode: null,
            counts: emptyCounts(),
            startedAt: startedAt.toISOString(),
            endedAt: null,
            jobHash: jobHash(job, defaultConfig),
            command: formatCommand(args),
            mode: job.mode,
            backupDir,
            previewRunId,
            blocked: null,
            message: "대기 중",
            errors: [],
        };
        await this.deps.runs.write(meta);

        const run: itfActiveRun = { meta, child: null, canceled: false, finished: Promise.resolve(meta) };
        // 같은 대상에는 한 번에 하나만 실행한다.
        const key = destKey(job.dest);
        const previous = this.queues.get(key) ?? Promise.resolve();
        run.finished = previous
            .then(() => this.runProcess(run, exe, args, dir))
            .catch((error: unknown) => {
                // 기록 저장 실패처럼 예상 밖의 오류도 화면에는 끝났다고 알려야 한다.
                const failed: itfRunMeta = {
                    ...run.meta,
                    status: "failed",
                    endedAt: this.now().toISOString(),
                    message: `실행을 마무리하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
                };
                this.deps.emit({ runId, jobId: job.id, type: "done", payload: failed });
                return failed;
            });
        this.queues.set(key, run.finished);
        this.active.set(runId, run);
        void run.finished.finally(() => this.active.delete(runId));

        this.deps.emit({ runId, jobId: job.id, type: "started", payload: meta });
        return runId;
    }

    private async runProcess(
        run: itfActiveRun,
        exe: string,
        args: string[],
        dir: string,
    ): Promise<itfRunMeta> {
        const { runId, jobId } = run.meta;
        const errors: string[] = [];
        let exitCode: number | null = null;

        if (!run.canceled) {
            assertSafeArgs(args);
            run.meta = { ...run.meta, status: "running", message: "실행 중" };
            this.deps.emit({ runId, jobId, type: "started", payload: run.meta });

            const log = createWriteStream(join(dir, "rclone.jsonl"), { encoding: "utf8" });
            const splitter = createLineSplitter((line) => {
                log.write(`${line}\n`);
                const parsed = parseLogLine(line);
                if (!parsed) return;
                if (parsed.progress) {
                    this.deps.emit({ runId, jobId, type: "progress", payload: parsed.progress });
                }
                if (parsed.level === "error" && errors.length < MAX_KEPT_ERRORS) {
                    errors.push(formatErrorLine(parsed));
                }
            });

            exitCode = await new Promise<number | null>((resolve) => {
                const child = spawn(exe, args, { shell: false, windowsHide: true });
                run.child = child;
                child.stderr.setEncoding("utf8");
                child.stderr.on("data", (chunk: string) => splitter.push(chunk));
                child.stdout.resume();
                child.on("error", (error) => {
                    errors.push(`rclone을 시작하지 못했습니다: ${error.message}`);
                    resolve(null);
                });
                child.on("close", (code) => resolve(code));
                // 대기 중에 취소가 들어온 경우
                if (run.canceled) child.kill();
            });
            splitter.flush();
            await new Promise<void>((resolve) => log.end(resolve));
        }

        const counts = countItems(await this.deps.runs.readItems(jobId, runId));
        const status = run.canceled ? "canceled" : exitCode === 0 ? "success" : "failed";
        // 원본이 비어 있으면 sync가 대상을 통째로 지우므로 실행을 막는다.
        const emptySource =
            run.meta.kind === "preview" &&
            status === "success" &&
            counts.add + counts.change + counts.same === 0;

        const meta: itfRunMeta = {
            ...run.meta,
            status,
            exitCode,
            counts,
            endedAt: this.now().toISOString(),
            blocked: emptySource ? "EMPTY_SOURCE" : null,
            errors,
            message: run.canceled
                ? "취소"
                : emptySource
                  ? "원본에 파일이 없습니다. 경로를 확인하세요"
                  : describeExit(exitCode, errors),
        };
        run.meta = meta;
        await this.deps.runs.write(meta);
        this.deps.emit({ runId, jobId, type: "done", payload: meta });
        return meta;
    }
}
