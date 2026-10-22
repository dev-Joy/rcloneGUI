/**
 *  Command builder
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업을 rclone 인자 배열로 바꾸고 위험 옵션을 차단
 */

/**
 *  External imports
 */
import { createHash } from "node:crypto";

/**
 *  Internal imports
 */
import { runSettingsOf, type typJob, type typSyncScope } from "@/shared/types";
import { isRemote } from "./paths";

/**
 *  Types 정의
 */
// 생성 결과에 절대 나오면 안 되는 옵션. 이 목록을 줄이는 변경은 ADR이 필요하다 (AGENTS.md 1.3).
const BLOCKED_FLAGS = ["--delete-excluded", "--no-check-dest"];

const BLOCKED_PREFIXES = ["--dump"];

export interface itfBuildContext {
    /** 미리보기는 --dry-run을 붙이고 대상을 바꾸지 않는다. */
    kind: "preview" | "execute";
    filterPath: string;
    combinedPath: string;
    /** 작업에 지정된 것이 없을 때 쓰는 rclone.conf 경로 */
    defaultConfig: string | null;
    /** execute + sync일 때 필수: 미리보기에서 확인한 삭제 수 */
    maxDelete?: number;
    /** execute이고 백업이 켜져 있을 때 필수 */
    backupDir?: string | null;
    /** 옵션 파일에서 읽어 검사한 옵션 (F27). 원본 · 대상 바로 뒤, 모든 앱 옵션 앞에 붙는다 */
    extraArgs?: readonly string[];
}

/**
 *  메인 클래스 / export 함수
 */
export class clsCommandError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "clsCommandError";
    }
}

/**
 * 필터 파일 내용. 제외 패턴마다 `- 패턴` 한 줄.
 * "폴더 구조만"(F25)이면 끝에 폴더는 포함하고(슬래시로 끝나는 패턴) 파일은 모두 제외하는 두 줄을 붙인다.
 * 먼저 맞는 규칙이 이기므로 사용자의 제외 패턴이 우선한다.
 */
export function buildFilterText(
    excludes: readonly string[],
    scope: typSyncScope = "files",
    skip: readonly string[] = [],
): string {
    // 이번 실행에서 뺀 항목(F23)이 먼저다. 뿌리에 고정(/)하고 글롭 특수 문자를 막는다.
    const lines = skip.flatMap((path) => {
        if (!path.endsWith("/")) return [`- /${escapeGlob(path)}\n`];
        const dir = escapeGlob(path.slice(0, -1));
        return [`- /${dir}/\n`, `- /${dir}/**\n`];
    });
    lines.push(...excludes.map((pattern) => `- ${pattern}\n`));
    if (scope === "folders") lines.push("+ */\n", "- *\n");
    return lines.join("");
}

/** rclone 필터 글롭의 특수 문자(\ * ? [ ] { })를 글자 그대로 읽게 한다 (F23, rclone-notes 2026-10-16) */
export function escapeGlob(path: string): string {
    return path.replace(/[\\*?[\]{}]/g, "\\$&");
}

/**
 * 작업을 rclone 인자 배열로 바꾼다. 미리보기와 실행은 같은 인자에서 출발하고,
 * 미리보기에는 --dry-run만, 실행에는 삭제 한도와 백업 폴더만 더한다.
 */
export function buildArgs(job: typJob, ctx: itfBuildContext): string[] {
    // 옵션 파일의 옵션(F27)은 원본 · 대상 바로 뒤, 앱 옵션 앞에 둔다. 혹시 옵션이 다음 인자를 값으로 가져가도
    // 그것은 --filter-from이라 필터 경로가 남는 인자가 되어 rclone이 시작 전에 멈춘다. --dry-run · 삭제 한도에는 닿지 않는다
    const args: string[] = [
        job.mode,
        job.source,
        job.dest,
        ...(ctx.extraArgs ?? []),
        "--filter-from",
        ctx.filterPath,
    ];

    const config = job.rcloneConfig ?? ctx.defaultConfig;
    if (config) args.push("--config", config);

    args.push("--checkers", String(job.options.checkers), "--transfers", String(job.options.transfers));
    // F25. "파일만"은 rclone 기본 동작이다.
    if (job.options.scope !== "files") args.push("--create-empty-src-dirs");
    if (job.options.skipLinks) args.push("--skip-links");
    if (job.options.fastList && (isRemote(job.source) || isRemote(job.dest))) args.push("--fast-list");

    if (job.safety.allowIgnoreErrors) {
        if (!job.safety.backup) {
            throw new clsCommandError(
                "IGNORE_ERRORS_NEEDS_BACKUP",
                "--ignore-errors는 백업 폴더가 켜진 작업에서만 쓸 수 있습니다",
            );
        }
        args.push("--ignore-errors");
    }

    if (ctx.kind === "preview") {
        args.push("--dry-run");
    } else {
        if (job.mode === "sync") {
            if (ctx.maxDelete === undefined || !Number.isInteger(ctx.maxDelete) || ctx.maxDelete < 0) {
                throw new clsCommandError("MAX_DELETE_REQUIRED", "sync 실행에는 확인한 삭제 수가 필요합니다");
            }
            args.push("--max-delete", String(ctx.maxDelete));
        }
        if (job.safety.backup) {
            if (!ctx.backupDir) {
                throw new clsCommandError("BACKUP_DIR_REQUIRED", "백업 폴더 경로를 정할 수 없습니다");
            }
            args.push("--backup-dir", ctx.backupDir);
        }
    }

    args.push("--combined", ctx.combinedPath, "--use-json-log", "-v", "--stats", "1s", "--retries", "1");

    assertSafeArgs(args);
    return args;
}

/**
 * 미리보기 뒤 한쪽 목록을 읽는 lsjson 인자 (F11). 읽기 전용이다.
 * 동기화와 같은 필터 파일 · config · fast-list 조건을 써서 같은 파일 집합을 본다.
 * filterPath가 null이면 필터 없이 모든 파일을 읽는다 (F22 제외된 파일 계산).
 */
export function buildListArgs(
    job: typJob,
    side: "source" | "dest",
    ctx: Pick<itfBuildContext, "defaultConfig" | "extraArgs"> & { filterPath: string | null },
): string[] {
    // 옵션 파일의 옵션은 맨 앞쪽(앱 옵션 앞)에 둔다 (buildArgs와 같은 이유). 크기 · 날짜 거르기가 같은 파일 집합을 보게 한다
    const args: string[] = ["lsjson", job[side], "-R", "--files-only", ...(ctx.extraArgs ?? [])];
    if (ctx.filterPath !== null) args.push("--filter-from", ctx.filterPath);

    const config = job.rcloneConfig ?? ctx.defaultConfig;
    if (config) args.push("--config", config);
    if (job.options.skipLinks) args.push("--skip-links");
    if (job.options.fastList && (isRemote(job.source) || isRemote(job.dest))) args.push("--fast-list");

    assertSafeArgs(args);
    return args;
}

/** 용량을 묻는 about 인자 (F20). 읽기 전용이다. root는 aboutRoot()가 정한 드라이브 · 리모트 맨 위 */
export function buildAboutArgs(
    job: typJob,
    root: string,
    ctx: Pick<itfBuildContext, "defaultConfig" | "extraArgs">,
): string[] {
    const args: string[] = ["about", root, "--json", ...(ctx.extraArgs ?? [])];
    const config = job.rcloneConfig ?? ctx.defaultConfig;
    if (config) args.push("--config", config);
    assertSafeArgs(args);
    return args;
}

/** 앱이 정하는 옵션. 두 번 나오면(나중 값이 이겨 앱 값을 덮으므로) 거부한다 */
const APP_ONLY_FLAGS = [
    "--config",
    "--backup-dir",
    "--max-delete",
    "--filter-from",
    "--combined",
    "--dry-run",
];

/** 차단 목록의 옵션이 섞여 있으면 던진다. rclone을 띄우기 직전에도 한 번 더 부른다. */
export function assertSafeArgs(args: readonly string[]): void {
    const flags = args.map((arg) => arg.split("=")[0]);
    for (const flag of APP_ONLY_FLAGS) {
        if (flags.filter((f) => f === flag).length > 1) {
            throw new clsCommandError("BLOCKED_OPTION", `앱이 정하는 옵션이 두 번 들어 있습니다: ${flag}`);
        }
    }
    // 실제 동기화(sync · copy, --dry-run 없음)에서 --ignore-errors는 백업 폴더가 있을 때만 (AGENTS.md 1.3)
    const realSync = (args[0] === "sync" || args[0] === "copy") && !flags.includes("--dry-run");
    if (realSync && flags.includes("--ignore-errors") && !flags.includes("--backup-dir")) {
        throw new clsCommandError("BLOCKED_OPTION", "백업 폴더 없이 --ignore-errors를 쓸 수 없습니다");
    }
    args.forEach((arg, index) => {
        const flag = arg.split("=")[0];
        if (BLOCKED_FLAGS.includes(flag) || BLOCKED_PREFIXES.some((p) => flag.startsWith(p))) {
            throw new clsCommandError("BLOCKED_OPTION", `허용되지 않는 옵션입니다: ${flag}`);
        }
        if (arg === "--max-delete=-1" || (arg === "--max-delete" && args[index + 1] === "-1")) {
            throw new clsCommandError("BLOCKED_OPTION", "삭제 한도를 끌 수 없습니다: --max-delete -1");
        }
    });
}

/** 화면에 보여주고 복사할 명령 한 줄. 실행에는 쓰지 않는다 (실행은 항상 인자 배열). */
export function formatCommand(args: readonly string[], exe = "rclone"): string {
    const f_Quote = (arg: string): string =>
        /[\s"&|<>^%()]/.test(arg) || arg === "" ? `"${arg.replace(/"/g, '\\"')}"` : arg;
    return [exe, ...args.map(f_Quote)].join(" ");
}

/** 미리보기 뒤에 작업 설정이 바뀌었는지 알아내는 지문. 명령에 영향을 주는 값만 넣는다. */
export function jobHash(job: typJob, defaultConfig: string | null, options: readonly string[] = []): string {
    return createHash("sha256")
        .update(JSON.stringify(runSettingsOf(job, defaultConfig, options)))
        .digest("hex")
        .slice(0, 16);
}
