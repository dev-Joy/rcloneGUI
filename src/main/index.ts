/**
 *  Index
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - Electron main 진입점. 창 생성, 저장소·실행기 조립, IPC 등록
 */

/**
 *  External imports
 */
import { app, BrowserWindow, dialog, Menu, Notification, shell, Tray } from "electron";
import { join } from "node:path";

/**
 *  Internal imports
 */
import { CHANNELS } from "@/shared/ipc-contract";
import { registerIpc } from "./ipc/register";
import { findRclone } from "./rclone/locate";
import { clsRcloneRunner, clsRunError } from "./rclone/runner";
import { openAppDatabase, type clsAppDatabase } from "./store/app-database";
import { clsJobStore } from "./store/job-store";
import { clsRunStore } from "./store/run-store";
import { clsSettingsStore } from "./store/settings-store";
import { clsScheduler } from "./schedule/scheduler";
import { clsGroupStore } from "./store/group-store";

/**
 *  Types 정의
 */
let mainWindow: BrowserWindow | null = null;

/** 알림 영역 아이콘. 자동 실행 중 창을 닫았을 때 만든다 (F10) */
let tray: Tray | null = null;

/** 자동 실행이 켜진 작업이 있어 창을 닫아도 앱을 끝내지 않을지 (F10). 주기적으로 갱신한다 */
let keepInTray = false;

/** [종료]로 정말 끝내는 중인지 */
let quitting = false;

/** 트레이로 숨었다는 알림을 이미 보였는지 */
let trayNoticeShown = false;

/**
 *  내부 함수
 */
/** 아이콘 경로. 설치본은 resources 폴더(extraResources), 개발 실행은 저장소의 resources */
function f_IconPath(): string {
    return app.isPackaged
        ? join(process.resourcesPath, "icon.png")
        : join(__dirname, "../../resources/icon.png");
}

/** Windows 알림 */
function f_Notify(title: string, body: string): void {
    if (Notification.isSupported()) new Notification({ title, body, icon: f_IconPath() }).show();
}

/** 창을 보이고 앞으로 */
function f_ShowWindow(): void {
    if (!mainWindow) {
        f_CreateWindow();
        return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function f_CreateWindow(): void {
    const window = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 560,
        show: false,
        autoHideMenuBar: true,
        title: "rcloneGUI",
        icon: f_IconPath(),
        backgroundColor: "#f6f7f9",
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });
    mainWindow = window;
    window.on("ready-to-show", () => window.show());
    window.on("closed", () => {
        mainWindow = null;
    });
    // 자동 실행이 켜진 작업이 있으면 창을 닫아도 알림 영역에 남는다 (F10).
    window.on("close", (event) => {
        if (quitting || !keepInTray) return;
        event.preventDefault();
        window.hide();
        if (!trayNoticeShown) {
            trayNoticeShown = true;
            f_Notify(
                "rcloneGUI",
                "rcloneGUI는 알림 영역에서 자동 실행을 계속합니다. 끝내려면 알림 영역 아이콘의 [종료]를 누르세요.",
            );
        }
    });

    // 앱 창은 앱 화면만 보여준다. 다른 주소는 열지 않거나 기본 브라우저로 넘긴다.
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        // 개발 중 새로고침(같은 주소)만 허용한다.
        if (url !== window.webContents.getURL()) event.preventDefault();
    });

    const devUrl = process.env["ELECTRON_RENDERER_URL"];
    if (!app.isPackaged && devUrl) void window.loadURL(devUrl);
    else void window.loadFile(join(__dirname, "../renderer/index.html"));
}

/**
 *  메인 클래스 / export 함수
 */
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => f_ShowWindow());
    app.on("before-quit", () => {
        quitting = true;
    });

    void app.whenReady().then(async () => {
        const baseDir = app.getPath("userData");
        let database: clsAppDatabase;
        try {
            database = await openAppDatabase(baseDir);
        } catch (error) {
            // 빈 저장소로 계속 켜면 작업이 사라진 것처럼 보이므로 멈춘다.
            dialog.showErrorBox(
                "rcloneGUI 데이터를 열 수 없습니다",
                `${(error as Error).message}

데이터 폴더: ${baseDir}`,
            );
            app.exit(1);
            return;
        }
        app.on("will-quit", () => database.close());
        const jobs = new clsJobStore(database);
        const runs = new clsRunStore(database, baseDir);
        const settings = new clsSettingsStore(database);
        const groups = new clsGroupStore(database, jobs);

        const f_ResolveRclone = async (): Promise<string> => {
            const path = await findRclone((await settings.get()).rclonePath);
            if (path === null) {
                throw new clsRunError(
                    "RCLONE_NOT_FOUND",
                    "rclone을 찾지 못했습니다. 설정에서 rclone.exe 위치를 지정하세요",
                );
            }
            return path;
        };

        const runner = new clsRcloneRunner({
            jobs,
            runs,
            manualDir: join(baseDir, "manual"),
            resolveRclone: f_ResolveRclone,
            defaultConfig: async () => (await settings.get()).rcloneConfig,
            emit: (event) => mainWindow?.webContents.send(CHANNELS.runEvent, event),
            onJobChanged: () => mainWindow?.webContents.send(CHANNELS.jobsChanged),
        });

        const scheduler = new clsScheduler({
            jobs,
            runner,
            notify: f_Notify,
            onJobsChanged: () => {
                mainWindow?.webContents.send(CHANNELS.jobsChanged);
                void f_RefreshTray();
            },
        });

        /** 자동 실행 작업이 있는지 다시 보고, 있으면 트레이 아이콘을 둔다 */
        const f_RefreshTray = async (): Promise<void> => {
            keepInTray = await scheduler.hasActiveSchedules();
            if (keepInTray && !tray) {
                tray = new Tray(f_IconPath());
                tray.setToolTip("rcloneGUI — 자동 실행 중");
                tray.on("click", () => f_ShowWindow());
                tray.setContextMenu(
                    Menu.buildFromTemplate([
                        { label: "열기", click: () => f_ShowWindow() },
                        {
                            label: "자동 실행 모두 멈추기",
                            click: () =>
                                void (async () => {
                                    for (const job of await jobs.list()) {
                                        if (job.schedule.enabled && job.schedule.paused === null) {
                                            await jobs.setPaused(job.id, {
                                                at: new Date().toISOString(),
                                                reason: "알림 영역에서 모두 멈춤",
                                            });
                                        }
                                    }
                                    scheduler.refresh();
                                    mainWindow?.webContents.send(CHANNELS.jobsChanged);
                                    await f_RefreshTray();
                                })(),
                        },
                        { type: "separator" },
                        {
                            label: "종료",
                            click: () => {
                                quitting = true;
                                app.quit();
                            },
                        },
                    ]),
                );
            }
            if (!keepInTray && tray && (mainWindow?.isVisible() ?? false)) {
                tray.destroy();
                tray = null;
            }
        };

        registerIpc({
            jobs,
            groups,
            runs,
            settings,
            runner,
            scheduler,
            resolveRclone: f_ResolveRclone,
            onJobsSaved: () => void f_RefreshTray(),
            getWindow: () => mainWindow,
        });
        f_CreateWindow();
        scheduler.start();
        void f_RefreshTray();
        // 작업 저장 · 삭제로 자동 실행 여부가 바뀌므로 자주 다시 본다 (DB 읽기 한 번).
        const trayTimer = setInterval(() => void f_RefreshTray(), 5000);
        app.on("will-quit", () => {
            clearInterval(trayTimer);
            scheduler.stop();
        });

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) f_CreateWindow();
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
