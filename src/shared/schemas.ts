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
 *  Types 정의
 */
const pathSchema = z
    .string()
    .trim()
    .min(1, "경로를 입력하세요")
    .max(1024)
    .refine((v) => !/[\r\n\0]/.test(v), "경로에 줄바꿈을 넣을 수 없습니다")
    // rclone이 옵션으로 읽지 않도록 막는다.
    .refine((v) => !v.startsWith("-"), "경로는 - 로 시작할 수 없습니다");

const excludeSchema = z
    .string()
    .trim()
    .min(1)
    .max(512)
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
    name: z.string().trim().min(1, "이름을 입력하세요").max(100),
    mode: z.enum(["copy", "sync"]),
    source: pathSchema,
    dest: pathSchema,
    excludes: z.array(excludeSchema).max(200),
    options: z.object({
        checkers: z.number().int().min(1).max(64),
        transfers: z.number().int().min(1).max(64),
        fastList: z.boolean(),
        skipLinks: z.boolean(),
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
    }),
    rcloneConfig: pathSchema.nullable(),
});

// 새 작업은 ID 없이 저장을 요청하고, main이 이름에서 ID를 만든다.
export const jobInputSchema = jobSchema.extend({ id: jobIdSchema.or(z.literal("")) });

export const settingsSchema = z.object({
    rclonePath: pathSchema.nullable(),
    rcloneConfig: pathSchema.nullable(),
});

export const executeInputSchema = z.object({
    previewRunId: runIdSchema,
    jobId: jobIdSchema,
    confirmedDeletes: z.number().int().min(0),
});

export const runRefSchema = z.object({ jobId: jobIdSchema, runId: runIdSchema });

export const openTargetSchema = runRefSchema.extend({ target: z.enum(["runDir", "backupDir"]) });
