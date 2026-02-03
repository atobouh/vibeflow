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
  getLastSession: () => ipcRenderer.invoke("session-get-last"),
  getActiveSession: (tabId: string) => ipcRenderer.invoke("session-get-active", tabId),
  getRecentSessions: () => ipcRenderer.invoke("session-get-recent"),
  getAllSessions: () => ipcRenderer.invoke("session-get-all"),
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
