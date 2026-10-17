/**
 *  Index
 *
 *  @author dev-Joy    2026-10-11
 *  @description
 *      - contextBridge로 window.rclonegui 함수만 화면에 노출
 */

/**
 *  External imports
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

/**
 *  Internal imports
 */
import { CHANNELS, type itfRcloneGuiApi } from "@/shared/ipc-contract";
import type { typRunEvent } from "@/shared/types";

/**
 *  Types 정의
 */
// 화면에는 아래 함수만 열어 준다. ipcRenderer 자체는 넘기지 않는다.
const api: itfRcloneGuiApi = {
    jobs: {
        list: () => ipcRenderer.invoke(CHANNELS.jobsList),
        save: (job) => ipcRenderer.invoke(CHANNELS.jobsSave, job),
        delete: (jobId) => ipcRenderer.invoke(CHANNELS.jobsDelete, jobId),
        resumeSchedule: (jobId) => ipcRenderer.invoke(CHANNELS.jobsResumeSchedule, jobId),
        nextRuns: () => ipcRenderer.invoke(CHANNELS.jobsNextRuns),
        setSkip: (input) => ipcRenderer.invoke(CHANNELS.jobsSetSkip, input),
        onChanged: (listener) => {
            const h_Changed = (): void => listener();
            ipcRenderer.on(CHANNELS.jobsChanged, h_Changed);
            return () => ipcRenderer.removeListener(CHANNELS.jobsChanged, h_Changed);
        },
    },
    groups: {
        list: () => ipcRenderer.invoke(CHANNELS.groupsList),
        save: (input) => ipcRenderer.invoke(CHANNELS.groupsSave, input),
        delete: (groupId) => ipcRenderer.invoke(CHANNELS.groupsDelete, groupId),
    },
    rclone: {
        status: () => ipcRenderer.invoke(CHANNELS.rcloneStatus),
        remotes: () => ipcRenderer.invoke(CHANNELS.rcloneRemotes),
    },
    run: {
        preview: (jobId) => ipcRenderer.invoke(CHANNELS.runPreview, jobId),
        execute: (input) => ipcRenderer.invoke(CHANNELS.runExecute, input),
        cancel: (runId) => ipcRenderer.invoke(CHANNELS.runCancel, runId),
        command: (jobId) => ipcRenderer.invoke(CHANNELS.runCommand, jobId),
        onEvent: (listener) => {
            const h_RunEvent = (_event: IpcRendererEvent, payload: typRunEvent): void => listener(payload);
            ipcRenderer.on(CHANNELS.runEvent, h_RunEvent);
            return () => ipcRenderer.removeListener(CHANNELS.runEvent, h_RunEvent);
        },
    },
    runs: {
        list: (jobId) => ipcRenderer.invoke(CHANNELS.runsList, jobId),
        items: (ref) => ipcRenderer.invoke(CHANNELS.runsItems, ref),
        excluded: (ref) => ipcRenderer.invoke(CHANNELS.runsExcluded, ref),
        configCheck: (ref) => ipcRenderer.invoke(CHANNELS.runsConfigCheck, ref),
    },
    settings: {
        get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
        save: (settings) => ipcRenderer.invoke(CHANNELS.settingsSave, settings),
    },
    app: {
        pickFolder: (input) => ipcRenderer.invoke(CHANNELS.appPickFolder, input),
        wslDistros: () => ipcRenderer.invoke(CHANNELS.appWslDistros),
        info: () => ipcRenderer.invoke(CHANNELS.appInfo),
        pickFile: () => ipcRenderer.invoke(CHANNELS.appPickFile),
        copyText: (text) => ipcRenderer.invoke(CHANNELS.appCopyText, text),
        open: (ref) => ipcRenderer.invoke(CHANNELS.appOpen, ref),
    },
};

/**
 *  메인 클래스 / export 함수
 */
contextBridge.exposeInMainWorld("rclonegui", api);
