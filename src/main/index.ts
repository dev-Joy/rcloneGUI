/**
 *  Index
 *
 *  @author Bruce.Cheong    2026-10-11
 *  @description
 *      - Electron main 진입점. 창 생성, 저장소·실행기 조립, IPC 등록
 */

/**
 *  External imports
 */
import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

/**
 *  Internal imports
 */
import { CHANNELS } from "@/shared/ipc-contract";
import { registerIpc } from "./ipc/register";
import { findRclone } from "./rclone/locate";
import { clsRcloneRunner, clsRunError } from "./rclone/runner";
import { clsJobStore } from "./store/job-store";
import { clsRunStore } from "./store/run-store";
import { clsSettingsStore } from "./store/settings-store";

/**
 *  Types 정의
 */
let mainWindow: BrowserWindow | null = null;

/**
 *  내부 함수
 */
function f_CreateWindow(): void {
    const window = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 560,
        show: false,
        autoHideMenuBar: true,
        title: "rcloneGUI",
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
    app.on("second-instance", () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    void app.whenReady().then(() => {
        const baseDir = app.getPath("userData");
        const jobs = new clsJobStore(baseDir);
        const runs = new clsRunStore(baseDir);
        const settings = new clsSettingsStore(baseDir);

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
        });

        registerIpc({
            jobs,
            runs,
            settings,
            runner,
            resolveRclone: f_ResolveRclone,
            getWindow: () => mainWindow,
        });
        f_CreateWindow();

        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) f_CreateWindow();
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
