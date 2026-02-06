import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vibeflow", {
  createTab: (cwd?: string) => ipcRenderer.invoke("tab-create", cwd),
  closeTab: (tabId: string) => ipcRenderer.invoke("tab-close", tabId),
  selectRepo: () => ipcRenderer.invoke("select-repo"),
  write: (tabId: string, data: string) => ipcRenderer.send("pty-write", tabId, data),
  resize: (tabId: string, cols: number, rows: number) =>
    ipcRenderer.send("pty-resize", tabId, cols, rows),
  setIntent: (tabId: string, text: string) => ipcRenderer.send("session-intent", tabId, text),
  addParkedThought: (tabId: string, text: string) =>
    ipcRenderer.send("session-thought", tabId, text),
  recordFileRead: (tabId: string, relPath: string) =>
    ipcRenderer.send("session-file-read", tabId, relPath),
  setTimeEcho: (tabId: string, text: string) =>
    ipcRenderer.invoke("session-time-echo", tabId, text),
  markTimeEchoDelivered: (sessionId: string) =>
    ipcRenderer.invoke("session-echo-delivered", sessionId),
  getLastSession: () => ipcRenderer.invoke("session-get-last"),
  getActiveSession: (tabId: string) => ipcRenderer.invoke("session-get-active", tabId),
  getRecentSessions: () => ipcRenderer.invoke("session-get-recent"),
  getAllSessions: () => ipcRenderer.invoke("session-get-all"),
  deleteSession: (sessionId: string) => ipcRenderer.invoke("session-delete", sessionId),
  deleteRepoContext: (repoKey: string) => ipcRenderer.invoke("session-delete-repo", repoKey),
  getVibeTraceInclude: (repoKey: string | null) =>
    ipcRenderer.invoke("vibetrace-get-include", repoKey),
  setVibeTraceInclude: (repoKey: string | null, include: boolean) =>
    ipcRenderer.invoke("vibetrace-set-include", repoKey, include),
  readVibeTrace: (repoKey: string | null) =>
    ipcRenderer.invoke("vibetrace-read", repoKey),
  consumeTimeEchoes: (repoKey: string | null) =>
    ipcRenderer.invoke("time-echo-consume", repoKey),
  getRepoParkedThoughts: (repoKey: string | null) =>
    ipcRenderer.invoke("repo-parked-thoughts", repoKey),
  deleteRepoParkedThought: (repoKey: string | null, thoughtId: string) =>
    ipcRenderer.invoke("repo-parked-thought-delete", repoKey, thoughtId),
  getAppVersion: () => ipcRenderer.invoke("app-get-version"),
  openExternal: (url: string) => ipcRenderer.invoke("app-open-external", url),
  getRepoTree: (tabId: string) => ipcRenderer.invoke("repo-get-tree", tabId),
  readRepoFile: (tabId: string, relPath: string) =>
    ipcRenderer.invoke("repo-read-file", tabId, relPath),
  onPtyData: (callback: (tabId: string, data: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { tabId: string; data: string }
    ) => {
      callback(payload.tabId, payload.data);
    };
    ipcRenderer.on("pty-data", handler);
    return () => ipcRenderer.removeListener("pty-data", handler);
  },
  onPtyExit: (callback: (tabId: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { tabId: string }
    ) => {
      callback(payload.tabId);
    };
    ipcRenderer.on("pty-exit", handler);
    return () => ipcRenderer.removeListener("pty-exit", handler);
  },
  onRepoFileActivity: (
    callback: (payload: { tabId: string; relPath: string; type: "write" }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { tabId: string; relPath: string; type: "write" }
    ) => {
      callback(payload);
    };
    ipcRenderer.on("repo-file-activity", handler);
    return () => ipcRenderer.removeListener("repo-file-activity", handler);
  },
  windowControl: (action: "minimize" | "maximize" | "restore" | "close") =>
    ipcRenderer.send("window-control", action),
  isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowState: (callback: (state: { maximized: boolean }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: { maximized: boolean }
    ) => callback(state);
    ipcRenderer.on("window-state", handler);
    return () => ipcRenderer.removeListener("window-state", handler);
  }
});
