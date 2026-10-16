/**
 *  Runner
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - rclone을 띄우는 유일한 곳. 미리보기·실행·취소·실행 큐
 */

/**
 *  External imports
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 *  Internal imports
 */
import {
    DETAILS_READING_MESSAGE,
    emptyCounts,
    plannedDeletes,
    PREVIEW_TTL_MS,
    type typJob,
    type itfJobCommands,
    type typRunEvent,
    type typRunKind,
    type itfRunMeta,
    type typDetailsState,
    type itfDirCounts,
    type typRunTrigger,
    type itfRunSpace,
    type itfSpace,
    type itfExcludedItem,
} from "@/shared/types";
import { parseAbout } from "@/main/parsers/about";
import { parseLsjson } from "@/main/parsers/lsjson";
import { excludedListSchema } from "@/shared/schemas";
import { countItems, formatDirOps } from "@/main/parsers/combined";
import {
    createLineSplitter,
    dirOpOf,
    formatErrorLine,
    parseLogLine,
    type itfDirOp,
} from "@/main/parsers/json-log";
import type { clsJobStore } from "@/main/store/job-store";
import { formatRunId, type clsRunStore } from "@/main/store/run-store";
import {
    assertSafeArgs,
    buildAboutArgs,
    buildArgs,
    buildFilterText,
    buildListArgs,
    formatCommand,
    jobHash,
} from "./command-builder";
import { diffExcluded } from "./excluded";
import { aboutRoot, backupDirFor, destKey, isRemote } from "./paths";

/**
 *  Types 정의
 */
const MAX_KEPT_ERRORS = 50;

/** 용량 묻기(about) 시간 제한 (F20). 리모트는 느릴 수 있다 */
const ABOUT_TIMEOUT_MS = 30_000;

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
    /** 백업 폴더 규칙. 기본은 대상 드라이브 최상위의 .rclonegui-backup (테스트에서 바꿔 끼운다). */
    backupDirFor?: (dest: string, jobId: string, runId: string) => string | null;
    /** main이 작업을 바꿨을 때 (F23 성공한 실행 뒤 뺀 항목 비우기). 화면에 알린다 */
    onJobChanged?: (jobId: string) => void;
}

interface itfActiveRun {
    meta: itfRunMeta;
    child: ChildProcess | null;
    /** 미리보기 뒤 양쪽 목록을 읽는 lsjson (F11). 취소할 때 함께 끝낸다 */
    listChildren: ChildProcess[];
    /** 미리보기 뒤 읽을 목록의 인자. 읽지 않으면 null */
    listArgs: { source: string[]; dest: string[] } | null;
    /** 미리보기 뒤 용량을 묻는 about 인자 (F20). 뿌리를 알 수 없는 쪽은 null. 실행이면 null */
    aboutArgs: { source: string[] | null; dest: string[] | null } | null;
    /** 대상이 로컬일 때 그 경로. 대상 폴더가 아직 없는지 판단에 쓴다 */
    localDest: string | null;
    /** 동기화 범위 (F25). 폴더 구조만이면 빈 원본 검사를 하지 않는다 */
    scope: typJob["options"]["scope"];
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

async function f_IsMissingDirectory(path: string): Promise<boolean> {
    try {
        await stat(path);
        return false;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
}

/** lsjson 하나를 띄워 stdout을 파일로 받는다. 종료 코드를 돌려준다 (시작하지 못하면 null). */
function f_RunList(
    run: Pick<itfActiveRun, "listChildren" | "canceled">,
    exe: string,
    args: string[],
    outFile: string,
): Promise<number | null> {
    // 띄우기 직전에 차단 목록을 한 번 더 본다 (만들 때도 검사했다). 걸리면 읽기 실패로 본다 — 미리보기는 그대로 둔다.
    try {
        assertSafeArgs(args);
    } catch {
        return Promise.resolve(null);
    }
    const out = createWriteStream(outFile);
    const child = spawn(exe, args, { shell: false, windowsHide: true });
    run.listChildren.push(child);
    child.stdout.pipe(out);
    child.stderr.resume();
    // 파일이 다 써진 것과 프로세스가 끝난 것을 모두 기다린다. 둘의 순서는 정해져 있지 않다.
    // 파일을 쓰지 못하면(실행 폴더가 사라짐 등) rclone을 끝내고 실패로 본다.
    const written = new Promise<boolean>((resolve) => {
        out.on("error", () => {
            child.kill();
            resolve(false);
        });
        out.on("close", () => resolve(true));
    });
    const exited = new Promise<number | null>((resolve) => {
        child.on("error", () => {
            out.end();
            resolve(null);
        });
        child.on("close", (exitCode) => resolve(exitCode));
    });
    // 시작하기 전에 취소가 들어온 경우
    if (run.canceled) child.kill();
    return Promise.all([exited, written]).then(([code, ok]) => (ok ? code : null));
}

/** 짧은 rclone 명령(about)을 띄워 stdout을 문자열로 받는다. 실패 · 시간 초과(30초)면 null. 취소하면 함께 끝낸다 (F20) */
function f_RunCapture(run: itfActiveRun, exe: string, args: string[]): Promise<string | null> {
    // 띄우기 직전 재검사. 걸리면 그쪽 용량만 "확인 불가"로 본다.
    try {
        assertSafeArgs(args);
    } catch {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const child = spawn(exe, args, { shell: false, windowsHide: true, timeout: ABOUT_TIMEOUT_MS });
        run.listChildren.push(child);
        let out = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            out += chunk;
        });
        child.stderr.resume();
        child.on("error", () => resolve(null));
        child.on("close", (code) => resolve(code === 0 ? out : null));
        if (run.canceled) child.kill();
    });
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
    // 설정에 없는 리모트 이름 (예: 경로 칸에 웹 주소를 넣으면 "https"를 리모트로 읽는다)
    const unknownRemote = errors
        .map((line) => /didn't find section in config file \("([^"]*)"\)/.exec(line))
        .find((match) => match !== null);
    if (unknownRemote) {
        return `rclone 설정에 "${unknownRemote[1]}" 리모트가 없습니다. rclone config로 만든 리모트 이름을 쓰세요`;
    }
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
    /** 계산 중인 제외 목록 (F22). 같은 실행을 동시에 요청하면 한 번만 읽는다 */
    private readonly excludedReads = new Map<string, Promise<itfExcludedItem[]>>();
    private readonly now: () => Date;
    private readonly backupDirFor: NonNullable<itfRunnerDeps["backupDirFor"]>;

    constructor(private readonly deps: itfRunnerDeps) {
        this.now = deps.now ?? (() => new Date());
        this.backupDirFor = deps.backupDirFor ?? backupDirFor;
    }

    /** 미리보기를 시작하고 실행 ID를 바로 돌려준다. */
    async preview(jobId: string, trigger: typRunTrigger = "manual"): Promise<string> {
        const job = await this.deps.jobs.get(jobId);
        return this.start(job, "preview", null, undefined, trigger);
    }

    /** 미리보기를 확인한 만큼만 실제로 동기화한다. */
    async execute(input: {
        jobId: string;
        previewRunId: string;
        confirmedDeletes: number;
        trigger?: typRunTrigger;
    }): Promise<string> {
        const job = await this.deps.jobs.get(input.jobId);
        const preview = await this.deps.runs.read(input.jobId, input.previewRunId);
        if (!preview || preview.kind !== "preview" || preview.status !== "success" || !preview.endedAt) {
            throw new clsRunError("PREVIEW_INVALID", "끝난 미리보기가 없습니다. 먼저 비교하세요");
        }
        if (this.now().getTime() - new Date(preview.endedAt).getTime() > PREVIEW_TTL_MS) {
            throw new clsRunError("PREVIEW_EXPIRED", "미리보기가 30분을 넘었습니다. 다시 비교하세요");
        }
        const latestRunId = await this.deps.runs.latestRunId(input.jobId);
        const hash = jobHash(job, await this.deps.defaultConfig());
        if (preview.jobHash !== hash || latestRunId !== preview.runId) {
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
        return this.start(job, "execute", preview.runId, deletes, input.trigger ?? "manual");
    }

    /** 그 작업의 실행이 대기 중이거나 도는 중인지 (F10 스케줄러가 겹쳐 돌리지 않게) */
    isActive(jobId: string): boolean {
        for (const run of this.active.values()) if (run.meta.jobId === jobId) return true;
        return false;
    }

    /** 대기 중이거나 실행 중인 rclone을 멈춘다. 이미 끝났으면 아무 일도 없다. */
    cancel(runId: string): void {
        const run = this.active.get(runId);
        if (!run) return;
        run.canceled = true;
        run.child?.kill();
        for (const child of run.listChildren) child.kill();
    }

    /**
     * 성공한 미리보기에서 필터에 걸려 빠진 파일 (F22). 필터 없는 lsjson을 원본 · 대상에 띄워 미리보기 목록과 비교한다.
     * 읽기 전용이다. 결과는 실행 폴더의 excluded.json에 남겨 다음에는 읽기만 한다.
     */
    async readExcluded(jobId: string, runId: string): Promise<itfExcludedItem[]> {
        const key = `${jobId}/${runId}`;
        const reading = this.excludedReads.get(key);
        if (reading) return reading;
        const work = this.computeExcluded(jobId, runId).finally(() => this.excludedReads.delete(key));
        this.excludedReads.set(key, work);
        return work;
    }

    private async computeExcluded(jobId: string, runId: string): Promise<itfExcludedItem[]> {
        const meta = await this.deps.runs.read(jobId, runId);
        if (!meta || meta.kind !== "preview" || meta.status !== "success") {
            throw new clsRunError(
                "EXCLUDED_UNAVAILABLE",
                "성공한 미리보기에서만 제외된 파일을 볼 수 있습니다",
            );
        }
        const dir = this.deps.runs.runDir(jobId, runId);
        const cachePath = join(dir, "excluded.json");
        try {
            return excludedListSchema.parse(JSON.parse(await readFile(cachePath, "utf8")) as unknown);
        } catch (error) {
            // 없으면 새로 계산한다. 깨진 파일도 다시 계산해 덮어쓴다.
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") await rm(cachePath, { force: true });
        }

        const job = await this.deps.jobs.get(jobId);
        const defaultConfig = await this.deps.defaultConfig();
        if (jobHash(job, defaultConfig) !== meta.jobHash) {
            throw new clsRunError("RUN_STALE", "작업 설정이 바뀌었습니다. 다시 비교하세요");
        }
        const exe = await this.deps.resolveRclone();
        const lists = { listChildren: [] as ChildProcess[], canceled: false };
        const sourceFile = join(dir, "lsjson-src-all.json");
        const destFile = join(dir, "lsjson-dst-all.json");
        try {
            const [sourceCode, destCode] = await Promise.all([
                f_RunList(
                    lists,
                    exe,
                    buildListArgs(job, "source", { filterPath: null, defaultConfig }),
                    sourceFile,
                ),
                f_RunList(
                    lists,
                    exe,
                    buildListArgs(job, "dest", { filterPath: null, defaultConfig }),
                    destFile,
                ),
            ]);
            if (sourceCode !== 0) {
                throw new clsRunError(
                    "EXCLUDED_FAILED",
                    `원본 목록을 읽지 못했습니다 (rclone 종료 코드 ${sourceCode ?? "없음"})`,
                );
            }
            // 대상 폴더가 아직 없으면(첫 실행) 빈 목록으로 본다 (F11과 같다)
            const destMissing =
                destCode === 3 && (isRemote(job.dest) || (await f_IsMissingDirectory(job.dest)));
            if (destCode !== 0 && !destMissing) {
                throw new clsRunError(
                    "EXCLUDED_FAILED",
                    `대상 목록을 읽지 못했습니다 (rclone 종료 코드 ${destCode ?? "없음"})`,
                );
            }
            const result = diffExcluded(
                parseLsjson(await readFile(sourceFile, "utf8")),
                destMissing ? new Map() : parseLsjson(await readFile(destFile, "utf8")),
                await this.deps.runs.readItems(jobId, runId),
            );
            await writeFile(cachePath, JSON.stringify(result), "utf8");
            return result;
        } finally {
            await Promise.all([rm(sourceFile, { force: true }), rm(destFile, { force: true })]);
        }
    }

    /**
     * 대기 · 실행 중인 rclone을 모두 멈춘다. 앱이 끝날 때 부른다.
     * Windows에서는 앱이 꺼져도 자식 rclone이 남아 계속 돌기 때문이다. 기록은 다음에 켤 때 "중단됨"으로 닫힌다.
     */
    cancelAll(): void {
        for (const runId of [...this.active.keys()]) this.cancel(runId);
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
        await writeFile(filterPath, buildFilterText(job.excludes, job.options.scope, job.skip), "utf8");

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
        trigger: typRunTrigger,
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
        await writeFile(filterPath, buildFilterText(job.excludes, job.options.scope, job.skip), "utf8");
        const listArgs =
            kind === "preview" && job.options.readDetails
                ? {
                      source: buildListArgs(job, "source", { filterPath, defaultConfig }),
                      dest: buildListArgs(job, "dest", { filterPath, defaultConfig }),
                  }
                : null;
        const f_About = (path: string): string[] | null => {
            const rootPath = aboutRoot(path);
            return rootPath === null ? null : buildAboutArgs(job, rootPath, { defaultConfig });
        };
        const aboutArgs =
            kind === "preview" ? { source: f_About(job.source), dest: f_About(job.dest) } : null;

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
            details: null,
            dirs: null,
            trigger,
            space: null,
        };
        await this.deps.runs.write(meta);

        const run: itfActiveRun = {
            meta,
            child: null,
            listChildren: [],
            listArgs,
            aboutArgs,
            localDest: isRemote(job.dest) ? null : job.dest,
            scope: job.options.scope,
            canceled: false,
            finished: Promise.resolve(meta),
        };
        // 같은 대상에는 한 번에 하나만 실행한다.
        const key = destKey(job.dest);
        const previous = this.queues.get(key) ?? Promise.resolve();
        run.finished = previous
            .then(() => this.runProcess(run, exe, args, dir))
            .then((done) => this.afterRun(job, done))
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

    /**
     * 성공한 실제 동기화 뒤 이번 실행에서 뺀 항목을 비운다 (F23). 실행을 시작할 때의 목록 그대로일 때만.
     * 비우지 못해도 실행 결과는 그대로다.
     */
    private async afterRun(job: typJob, done: itfRunMeta): Promise<itfRunMeta> {
        if (done.kind !== "execute" || done.status !== "success" || job.skip.length === 0) return done;
        try {
            if (await this.deps.jobs.clearSkipIf(job.id, job.skip)) this.deps.onJobChanged?.(job.id);
        } catch {
            // 작업이 지워졌거나 DB를 쓰지 못함. 다음 실행 전 사람이 되돌릴 수 있다.
        }
        return done;
    }

    private async runProcess(
        run: itfActiveRun,
        exe: string,
        args: string[],
        dir: string,
    ): Promise<itfRunMeta> {
        const { runId, jobId } = run.meta;
        const errors: string[] = [];
        /** 폴더 작업 (F25). 같은 폴더가 두 번 나와도 한 번만 */
        const dirOps = new Map<string, itfDirOp>();
        /** 마지막 통계의 옮길 크기 (F20). 미리보기면 옮길 파일 크기 합이다 */
        let transferBytes = 0;
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
                    transferBytes = parsed.progress.totalBytes;
                    this.deps.emit({ runId, jobId, type: "progress", payload: parsed.progress });
                }
                // 설정에 없는 리모트처럼 시작부터 실패하면 rclone은 critical로 남긴다
                if (
                    (parsed.level === "error" || parsed.level === "critical") &&
                    errors.length < MAX_KEPT_ERRORS
                ) {
                    errors.push(formatErrorLine(parsed));
                }
                const dirOp = dirOpOf(parsed);
                if (dirOp) dirOps.set(`${dirOp.op}:${dirOp.path}`, dirOp);
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
        const { ops, dirs } = await this.settleDirOps(run, [...dirOps.values()]);
        if (ops.length > 0) await writeFile(join(dir, "dirs.txt"), formatDirOps(ops), "utf8");

        const details = await this.readDetails(run, exe, dir, exitCode);
        const space = await this.readSpace(run, exe, exitCode, transferBytes);
        const counts = countItems(await this.deps.runs.readItems(jobId, runId));
        const status = run.canceled ? "canceled" : exitCode === 0 ? "success" : "failed";
        // 원본이 비어 있으면 sync가 대상을 통째로 지우므로 실행을 막는다.
        // "폴더 구조만"(F25)은 파일을 걸러 내므로 combined가 늘 비어 있다. 파일을 지우지 않으니 이 검사를 하지 않는다.
        const emptySource =
            run.scope !== "folders" &&
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
            details,
            dirs,
            space,
            message: run.canceled
                ? "취소"
                : emptySource
                  ? "원본에 파일이 없습니다. 경로를 확인하세요"
                  : describeExit(exitCode, errors) +
                    (details === "failed" ? " · 크기 · 수정 시각을 읽지 못했습니다" : ""),
        };
        run.meta = meta;
        await this.deps.runs.write(meta);
        this.deps.emit({ runId, jobId, type: "done", payload: meta });
        return meta;
    }

    /**
     * 성공한 미리보기 뒤 원본 · 대상의 용량을 묻는다 (F20). 실패한 쪽은 null이고 미리보기 결과에는 영향이 없다.
     */
    private async readSpace(
        run: itfActiveRun,
        exe: string,
        exitCode: number | null,
        transferBytes: number,
    ): Promise<itfRunSpace | null> {
        if (run.aboutArgs === null || run.canceled || exitCode !== 0) return null;
        const f_Ask = async (args: string[] | null): Promise<itfSpace | null> => {
            if (args === null) return null;
            const out = await f_RunCapture(run, exe, args);
            if (out === null) return null;
            try {
                return parseAbout(out);
            } catch {
                return null;
            }
        };
        const [source, dest] = await Promise.all([f_Ask(run.aboutArgs.source), f_Ask(run.aboutArgs.dest)]);
        if (run.canceled) return null;
        return { source, dest, transferBytes };
    }

    /**
     * 폴더 작업을 정리한다 (F25). rclone의 remove directory는 시도일 뿐이라 비어 있지 않은 폴더는 남는다 (rclone-notes P6).
     * 로컬 대상의 실제 실행이면 폴더가 정말 사라졌는지 확인해 남은 것은 keep으로 바꾼다. 미리보기 · 리모트는 확인하지 않는다.
     */
    private async settleDirOps(
        run: itfActiveRun,
        ops: itfDirOp[],
    ): Promise<{ ops: { op: "make" | "remove" | "keep"; path: string }[]; dirs: itfDirCounts }> {
        const verify = run.meta.kind === "execute" && run.localDest !== null;
        const settled: { op: "make" | "remove" | "keep"; path: string }[] = [];
        for (const op of ops) {
            if (op.op === "remove" && verify && run.localDest !== null) {
                const gone = await f_IsMissingDirectory(join(run.localDest, op.path));
                settled.push({ op: gone ? "remove" : "keep", path: op.path });
            } else {
                settled.push(op);
            }
        }
        const f_Count = (kind: "make" | "remove" | "keep"): number =>
            settled.filter((o) => o.op === kind).length;
        return {
            ops: settled,
            dirs: {
                make: f_Count("make"),
                remove: f_Count("remove"),
                kept: f_Count("keep"),
                verified: verify,
            },
        };
    }

    /**
     * 성공한 미리보기 뒤에 원본 · 대상 목록(lsjson)을 동시에 읽어 실행 폴더에 둔다 (F11).
     * 실패해도 미리보기는 그대로 두고 상태만 남긴다. 동기화 판단은 combined가 한다.
     */
    private async readDetails(
        run: itfActiveRun,
        exe: string,
        dir: string,
        exitCode: number | null,
    ): Promise<typDetailsState | null> {
        if (run.meta.kind !== "preview") return null;
        if (run.listArgs === null) return "off";
        if (run.canceled || exitCode !== 0) return null;

        const { runId, jobId } = run.meta;
        run.meta = { ...run.meta, message: DETAILS_READING_MESSAGE };
        this.deps.emit({ runId, jobId, type: "started", payload: run.meta });

        const destFile = join(dir, "lsjson-dst.json");
        const [sourceCode, destCode] = await Promise.all([
            f_RunList(run, exe, run.listArgs.source, join(dir, "lsjson-src.json")),
            f_RunList(run, exe, run.listArgs.dest, destFile),
        ]);
        if (run.canceled) return null;
        let destOk = destCode === 0;
        // 대상 폴더가 아직 없으면(첫 실행) rclone은 exit 3(폴더 없음)을 낸다. 빈 목록으로 본다.
        // 로컬은 정말 없는지 한 번 더 보고, 리모트는 rclone의 exit 3을 믿는다 (rclone-notes 2026-10-16 Drive)
        if (destCode === 3 && (run.localDest === null || (await f_IsMissingDirectory(run.localDest)))) {
            await writeFile(destFile, "[]", "utf8");
            destOk = true;
        }
        return sourceCode === 0 && destOk ? "read" : "failed";
    }
}
