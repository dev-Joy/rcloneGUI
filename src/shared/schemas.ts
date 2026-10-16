/**
 *  Schemas
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - 작업·설정·IPC 입력을 검증하는 zod 스키마
 */

/**
 *  External imports
 */
import { z } from "zod";

/**
 *  Internal imports
 */
import { cronProblem } from "./cron";
import { INPUT_LIMITS } from "./limits";

/**
 *  Types 정의
 */
const pathSchema = z
    .string()
    .trim()
    .min(1, "경로를 입력하세요")
    .max(INPUT_LIMITS.path, `경로는 ${INPUT_LIMITS.path}자까지 쓸 수 있습니다`)
    .refine((v) => !/[\r\n\0]/.test(v), "경로에 줄바꿈을 넣을 수 없습니다")
    // rclone이 옵션으로 읽지 않도록 막는다.
    .refine((v) => !v.startsWith("-"), "경로는 - 로 시작할 수 없습니다");

const excludeSchema = z
    .string()
    .trim()
    .min(1)
    .max(INPUT_LIMITS.excludePattern, `제외 패턴 한 줄은 ${INPUT_LIMITS.excludePattern}자까지 쓸 수 있습니다`)
    .refine((v) => !/[\r\n\0]/.test(v), "제외 패턴에 줄바꿈을 넣을 수 없습니다");

/**
 *  메인 클래스 / export 함수
 */
// 작업 ID는 실행 폴더·백업 폴더 이름으로 쓰이므로 경로에 안전한 글자만 허용한다.
export const jobIdSchema = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "작업 ID는 영문 소문자·숫자·하이픈만 쓸 수 있습니다");

export const runIdSchema = z.string().regex(/^\d{8}-\d{6}(-\d+)?$/, "실행 ID 형식이 아닙니다");

export const jobSchema = z.object({
    id: jobIdSchema,
    name: z
        .string()
        .trim()
        .min(1, "이름을 입력하세요")
        .max(INPUT_LIMITS.jobName, `이름은 ${INPUT_LIMITS.jobName}자까지 쓸 수 있습니다`),
    mode: z.enum(["copy", "sync"]),
    source: pathSchema,
    dest: pathSchema,
    excludes: z
        .array(excludeSchema)
        .max(INPUT_LIMITS.excludeCount, `제외 패턴은 ${INPUT_LIMITS.excludeCount}줄까지 쓸 수 있습니다`),
    options: z.object({
        checkers: z.number().int().min(1).max(64),
        transfers: z.number().int().min(1).max(64),
        fastList: z.boolean(),
        skipLinks: z.boolean(),
        // F11. 예전 작업에는 없으므로 켬으로 읽는다.
        readDetails: z.boolean().default(true),
        // F25. 예전 작업은 지금과 같은 "파일만"으로 읽는다.
        scope: z.enum(["files", "all", "folders"]).default("files"),
    }),
    safety: z.object({
        backup: z.boolean(),
        autoMaxDelete: z.number().int().min(0).max(1_000_000),
        allowIgnoreErrors: z.boolean(),
    }),
    schedule: z.object({
        enabled: z.boolean(),
        everyMinutes: z.number().int().min(1).max(10_080),
        chainNext: jobIdSchema.nullable(),
        // F10. cron 식이 있으면 간격 대신 쓴다. 예전 작업은 간격으로 읽는다.
        cron: z
            .string()
            .trim()
            .max(100)
            .refine((v) => cronProblem(v) === null, {
                error: (issue) => cronProblem(String(issue.input)) ?? "cron 식이 아닙니다",
            })
            .nullable()
            .default(null),
        // F10 · SR-10. 자동 실행이 스스로 멈춘 때와 이유. 사람이 [다시 켜기]를 눌러야 비워진다.
        paused: z
            .object({ at: z.string(), reason: z.string().max(500) })
            .nullable()
            .default(null),
    }),
    rcloneConfig: pathSchema.nullable(),
});

// 새 작업은 ID 없이 저장을 요청하고, main이 이름에서 ID를 만든다.
export const jobInputSchema = jobSchema.extend({ id: jobIdSchema.or(z.literal("")) });

export const settingsSchema = z.object({
    rclonePath: pathSchema.nullable(),
    rcloneConfig: pathSchema.nullable(),
    // F29. 예전에 저장한 설정에는 없으므로 null로 읽는다.
    defaultSource: pathSchema.nullable().default(null),
    defaultDest: pathSchema.nullable().default(null),
    // F12. Windows에 로그인하면 앱을 켠다. 예전 설정은 끔으로 읽는다.
    launchAtLogin: z.boolean().default(false),
});

/** 폴더 선택 창이 어느 칸을 위한 것인지. 시작 위치는 main이 설정에서 정한다. */
export const pickFolderSchema = z.enum(["source", "dest", "settings"]);

/** WSL 배포판 이름 (F24). main이 실제 목록과 다시 대조한다. */
export const wslDistroSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "WSL 배포판 이름이 아닙니다");

/** 폴더 선택 입력. WSL 배포판을 주면 그 배포판의 맨 위 폴더에서 연다 (F24). */
export const pickFolderInputSchema = pickFolderSchema.or(
    z.object({ target: pickFolderSchema, wslDistro: wslDistroSchema }),
);

export const executeInputSchema = z.object({
    previewRunId: runIdSchema,
    jobId: jobIdSchema,
    confirmedDeletes: z.number().int().min(0),
});

export const runRefSchema = z.object({ jobId: jobIdSchema, runId: runIdSchema });

export const openTargetSchema = runRefSchema.extend({ target: z.enum(["runDir", "backupDir"]) });

const countSchema = z.number().int().min(0);

// 저장된 실행 메타(DB 행, 예전 run.json)를 읽을 때 쓴다. 형태는 types.ts의 itfRunMeta와 같다.
export const runMetaSchema = z.object({
    runId: runIdSchema,
    jobId: jobIdSchema,
    kind: z.enum(["preview", "execute"]),
    status: z.enum(["queued", "running", "success", "failed", "canceled"]),
    exitCode: z.number().int().nullable(),
    counts: z.object({
        add: countSchema,
        change: countSchema,
        delete: countSchema,
        same: countSchema,
        error: countSchema,
    }),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    jobHash: z.string(),
    command: z.string(),
    mode: z.enum(["copy", "sync"]),
    backupDir: z.string().nullable(),
    previewRunId: runIdSchema.nullable(),
    blocked: z.enum(["EMPTY_SOURCE"]).nullable(),
    message: z.string(),
    errors: z.array(z.string()),
    details: z.enum(["read", "failed", "off"]).nullable().default(null),
    trigger: z.enum(["manual", "schedule"]).default("manual"),
    dirs: z
        .object({
            make: countSchema,
            remove: countSchema,
            kept: countSchema.default(0),
            verified: z.boolean().default(false),
        })
        .nullable()
        .default(null),
});
