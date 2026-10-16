/**
 *  Register
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - IPC 핸들러 등록. 입력을 zod로 검증하고 서비스를 호출
 */

/**
 *  External imports
 */
import { app, clipboard, dialog, ipcMain, shell, type BrowserWindow } from "electron";
import { stat } from "node:fs/promises";
import { z } from "zod";

/**
 *  Internal imports
 */
import { CHANNELS } from "@/shared/ipc-contract";
import {
    executeInputSchema,
    groupIdSchema,
    groupSaveSchema,
    jobIdSchema,
    jobInputSchema,
    openTargetSchema,
    pickFolderInputSchema,
    runIdSchema,
    runRefSchema,
    settingsSchema,
} from "@/shared/schemas";
import type { typResult } from "@/shared/types";
import { getRcloneStatus, listRemotes } from "@/main/rclone/locate";
import { isRemote } from "@/main/rclone/paths";
import { listWslDistros, wslRoot } from "@/main/system/wsl";
import type { clsRcloneRunner } from "@/main/rclone/runner";
import type { clsJobStore } from "@/main/store/job-store";
import type { clsRunStore } from "@/main/store/run-store";
import type { clsSettingsStore } from "@/main/store/settings-store";
import type { clsGroupStore } from "@/main/store/group-store";
import type { clsScheduler } from "@/main/schedule/scheduler";

/**
 *  Types 정의
 */
export interface itfIpcDeps {
    jobs: clsJobStore;
    groups: clsGroupStore;
    runs: clsRunStore;
    settings: clsSettingsStore;
    runner: clsRcloneRunner;
    scheduler: clsScheduler;
    resolveRclone: () => Promise<string>;
    /** 작업을 저장 · 삭제했을 때 (자동 실행 여부가 바뀌었을 수 있음, F10 트레이) */
    onJobsSaved?: () => void;
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

/** 폴더 선택 창의 시작 위치. 로컬에 있는 폴더일 때만 쓰고, 리모트나 없는 폴더면 운영체제 기본 위치. */
async function f_LocalFolderOrUndefined(path: string | null): Promise<string | undefined> {
    if (path === null || isRemote(path)) return undefined;
    try {
        return (await stat(path)).isDirectory() ? path : undefined;
    } catch {
        return undefined;
    }
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
    f_Handle(CHANNELS.jobsSave, jobInputSchema, async (job) => {
        const saved = await jobs.save(job);
        // 스케줄을 바꿨을 수 있으니 다음 자동 실행 시각을 지금부터 다시 센다 (F10).
        deps.scheduler.refresh(saved.id);
        deps.onJobsSaved?.();
        return saved;
    });
    // 그룹 (F21). 그룹을 지우면 작업의 groupId가 바뀌므로 화면에 다시 읽으라고 알린다.
    f_Handle(CHANNELS.groupsList, none, () => deps.groups.list());
    f_Handle(CHANNELS.groupsSave, groupSaveSchema, async (input) => {
        const group = await deps.groups.save(input);
        deps.getWindow()?.webContents.send(CHANNELS.jobsChanged);
        return group;
    });
    f_Handle(CHANNELS.groupsDelete, groupIdSchema, async (groupId) => {
        await deps.groups.delete(groupId);
        deps.getWindow()?.webContents.send(CHANNELS.jobsChanged);
        return null;
    });
    f_Handle(CHANNELS.jobsResumeSchedule, jobIdSchema, async (jobId) => {
        const job = await jobs.setPaused(jobId, null);
        deps.scheduler.refresh(jobId);
        deps.onJobsSaved?.();
        return job;
    });
    f_Handle(CHANNELS.jobsDelete, jobIdSchema, async (jobId) => {
        await jobs.delete(jobId);
        deps.scheduler.refresh(jobId);
        deps.onJobsSaved?.();
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
    f_Handle(CHANNELS.settingsSave, settingsSchema, async (value) => {
        const before = await settings.get();
        const saved = await settings.save(value);
        // 로그인 시 시작은 설치본에서만, 그리고 사용자가 이 값을 바꿔 저장할 때만 Windows에 반영한다 (F12).
        // 다른 설정만 저장할 때 반영하면 작업 관리자 · Windows 설정에서 끈 것을 몰래 다시 켠다.
        if (app.isPackaged && saved.launchAtLogin !== before.launchAtLogin) {
            app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin, enabled: saved.launchAtLogin });
        }
        return saved;
    });
    f_Handle(CHANNELS.appInfo, none, () => ({
        version: app.getVersion(),
        packaged: app.isPackaged,
        // openAtLogin은 Run 키만 본다. 작업 관리자에서 끈 상태까지 반영한 값은 executableWillLaunchAtLogin이다.
        openAtLogin: app.isPackaged ? app.getLoginItemSettings().executableWillLaunchAtLogin : false,
    }));

    f_Handle(CHANNELS.appWslDistros, none, () => listWslDistros());
    f_Handle(CHANNELS.appPickFolder, pickFolderInputSchema, async (input) => {
        const window = deps.getWindow();
        const target = typeof input === "string" ? input : input.target;
        let defaultPath: string | undefined;
        if (typeof input !== "string") {
            // 화면이 넘긴 이름이 실제로 설치된 배포판인지 다시 확인하고, 경로는 main이 만든다 (F24).
            if (!(await listWslDistros()).includes(input.wslDistro)) {
                throw Object.assign(new Error("설치된 WSL 배포판이 아닙니다"), { code: "INVALID_INPUT" });
            }
            // 멈춰 있는 배포판은 접근할 때 켜지므로 존재 검사를 하지 않고 그대로 연다.
            defaultPath = wslRoot(input.wslDistro);
        } else {
            const current = await settings.get();
            const start =
                target === "source" ? current.defaultSource : target === "dest" ? current.defaultDest : null;
            defaultPath = await f_LocalFolderOrUndefined(start);
        }
        const options = { properties: ["openDirectory" as const], defaultPath };
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
