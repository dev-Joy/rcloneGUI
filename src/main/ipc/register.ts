/**
 *  Register
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - IPC 핸들러 등록. 입력을 zod로 검증하고 서비스를 호출
 */

/**
 *  External imports
 */
import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { z } from "zod";

/**
 *  Internal imports
 */
import { CHANNELS } from "@/shared/ipc-contract";
import {
    executeInputSchema,
    jobIdSchema,
    jobInputSchema,
    openTargetSchema,
    runIdSchema,
    runRefSchema,
    settingsSchema,
} from "@/shared/schemas";
import type { typResult } from "@/shared/types";
import { getRcloneStatus, listRemotes } from "@/main/rclone/locate";
import { isRemote } from "@/main/rclone/paths";
import type { clsRcloneRunner } from "@/main/rclone/runner";
import type { clsJobStore } from "@/main/store/job-store";
import type { clsRunStore } from "@/main/store/run-store";
import type { clsSettingsStore } from "@/main/store/settings-store";

/**
 *  Types 정의
 */
export interface itfIpcDeps {
    jobs: clsJobStore;
    runs: clsRunStore;
    settings: clsSettingsStore;
    runner: clsRcloneRunner;
    resolveRclone: () => Promise<string>;
    getWindow: () => BrowserWindow | null;
}

const none = z.undefined();

/**
 *  내부 함수
 */
/** 예외를 그대로 넘기지 않고 { ok, error: { code, message } }로 바꾼다. */
function f_ToError(error: unknown): typResult<never> {
    if (error instanceof z.ZodError) {
        return {
            ok: false,
            error: { code: "INVALID_INPUT", message: error.issues.map((i) => i.message).join(" · ") },
        };
    }
    if (error instanceof Error) {
        const code = "code" in error && typeof error.code === "string" ? error.code : "UNEXPECTED";
        return { ok: false, error: { code, message: error.message } };
    }
    return { ok: false, error: { code: "UNEXPECTED", message: String(error) } };
}

/** 입력을 zod 스키마로 검증한 뒤 서비스를 부르는 핸들러를 등록한다. */
function f_Handle<I, O>(channel: string, schema: z.ZodType<I>, fn: (input: I) => Promise<O> | O): void {
    ipcMain.handle(channel, async (_event, raw: unknown): Promise<typResult<O>> => {
        try {
            return { ok: true, data: await fn(schema.parse(raw)) };
        } catch (error) {
            return f_ToError(error);
        }
    });
}

/**
 *  메인 클래스 / export 함수
 */
export function registerIpc(deps: itfIpcDeps): void {
    const { jobs, runs, settings, runner } = deps;

    f_Handle(CHANNELS.jobsList, none, () => jobs.list());
    f_Handle(CHANNELS.jobsSave, jobInputSchema, (job) => jobs.save(job));
    f_Handle(CHANNELS.jobsDelete, jobIdSchema, async (jobId) => {
        await jobs.delete(jobId);
        return null;
    });

    f_Handle(CHANNELS.rcloneStatus, none, async () => getRcloneStatus((await settings.get()).rclonePath));
    f_Handle(CHANNELS.rcloneRemotes, none, async () =>
        listRemotes(await deps.resolveRclone(), (await settings.get()).rcloneConfig),
    );

    f_Handle(CHANNELS.runPreview, jobIdSchema, (jobId) => runner.preview(jobId));
    f_Handle(CHANNELS.runExecute, executeInputSchema, (input) => runner.execute(input));
    f_Handle(CHANNELS.runCancel, runIdSchema, (runId) => {
        runner.cancel(runId);
        return null;
    });
    f_Handle(CHANNELS.runCommand, jobIdSchema, (jobId) => runner.commands(jobId));

    f_Handle(CHANNELS.runsList, jobIdSchema, (jobId) => runs.list(jobId));
    f_Handle(CHANNELS.runsItems, runRefSchema, ({ jobId, runId }) => runs.readItems(jobId, runId));

    f_Handle(CHANNELS.settingsGet, none, () => settings.get());
    f_Handle(CHANNELS.settingsSave, settingsSchema, (value) => settings.save(value));

    f_Handle(CHANNELS.appPickFolder, none, async () => {
        const window = deps.getWindow();
        const options = { properties: ["openDirectory" as const] };
        const result = window
            ? await dialog.showOpenDialog(window, options)
            : await dialog.showOpenDialog(options);
        return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    f_Handle(CHANNELS.appPickFile, none, async () => {
        const window = deps.getWindow();
        const options = { properties: ["openFile" as const] };
        const result = window
            ? await dialog.showOpenDialog(window, options)
            : await dialog.showOpenDialog(options);
        return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    f_Handle(CHANNELS.appCopyText, z.string().max(20_000), (text) => {
        clipboard.writeText(text);
        return null;
    });
    // 화면이 임의 경로를 열 수 없도록, 실행 기록에 적힌 폴더만 연다.
    f_Handle(CHANNELS.appOpen, openTargetSchema, async ({ jobId, runId, target }) => {
        const meta = await runs.read(jobId, runId);
        if (!meta) throw Object.assign(new Error("실행 기록을 찾을 수 없습니다"), { code: "RUN_NOT_FOUND" });
        const path = target === "runDir" ? runs.runDir(jobId, runId) : meta.backupDir;
        if (!path || isRemote(path)) {
            throw Object.assign(new Error("탐색기로 열 수 있는 로컬 폴더가 아닙니다"), { code: "NOT_LOCAL" });
        }
        const problem = await shell.openPath(path);
        if (problem)
            throw Object.assign(new Error(`폴더를 열 수 없습니다: ${problem}`), { code: "OPEN_FAILED" });
        return null;
    });
}
