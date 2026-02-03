import path from "path";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { spawn, IPty } from "node-pty";
import { SessionManager } from "./session";

type TabInfo = {
  id: string;
  pty: IPty;
  cwd: string;
  shellKind: ShellKind;
};

let mainWindow: BrowserWindow | null = null;
const tabs = new Map<string, TabInfo>();
const sessionManager = new SessionManager();

type ShellKind = "powershell" | "cmd" | "bash" | "zsh" | "fish" | "unknown";

function getShellKind(shell: string): ShellKind {
  const lower = shell.toLowerCase();
  if (lower.includes("powershell") || lower.includes("pwsh")) {
    return "powershell";
  }
  if (lower.includes("cmd.exe") || lower.endsWith("cmd")) {
    return "cmd";
  }
  if (lower.includes("zsh")) {
    return "zsh";
  }
  if (lower.includes("fish")) {
    return "fish";
  }
  if (lower.includes("bash")) {
    return "bash";
  }
  return "unknown";
}

function getDefaultShellCommand() {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec;
    if (comspec && comspec.toLowerCase().includes("cmd.exe")) {
      return { shell: comspec, args: [] };
    }
    const shell = comspec || "powershell.exe";
    const lower = shell.toLowerCase();
    const args = lower.includes("powershell") || lower.includes("pwsh") ? ["-NoLogo"] : [];
    return { shell, args };
  }
  return { shell: process.env.SHELL || "/bin/bash", args: [] };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0f14",
    icon: path.join(__dirname, "..", "assets", "Vibeflow4X.png"),
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.join(__dirname, "..", "ui", "index.html");
  mainWindow.loadFile(indexPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-state", { maximized: true });
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-state", { maximized: false });
  });
}

function createTab(cwd = process.cwd()) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { shell, args } = getDefaultShellCommand();
  const shellKind = getShellKind(shell);
  const pty = spawn(shell, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      VIBEFLOW: "1",
      TERM_PROGRAM: "VibeFlow"
    }
  });

  tabs.set(id, { id, pty, cwd, shellKind });
  sessionManager.startSession(id, "tab-open", cwd);

  pty.onData((data) => {
    sessionManager.recordActivity(id, "pty-output");
    mainWindow?.webContents.send("pty-data", { tabId: id, data });
  });

  pty.onExit(() => {
    sessionManager.endSession(id, "pty-exit");
    tabs.delete(id);
    mainWindow?.webContents.send("pty-exit", { tabId: id });
  });

  const session = sessionManager.getActiveSession(id);
  return {
    id,
    cwd,
    projectRoot: session?.projectRoot || null,
    shellKind
  };
}

function closeTab(tabId: string, reason: string) {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }
  tab.pty.kill();
  tabs.delete(tabId);
  sessionManager.endSession(tabId, reason);
}

ipcMain.handle("tab-create", (_event, cwd?: string) => {
  return createTab(cwd);
});

ipcMain.handle("tab-close", (_event, tabId: string) => {
  closeTab(tabId, "tab-close");
});

ipcMain.handle("select-repo", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select repository folder",
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.on("pty-write", (_event, tabId: string, data: string) => {
  sessionManager.recordActivity(tabId, "pty-input");
  tabs.get(tabId)?.pty.write(data);
});

ipcMain.on("pty-resize", (_event, tabId: string, cols: number, rows: number) => {
  tabs.get(tabId)?.pty.resize(cols, rows);
});

ipcMain.on("session-intent", (_event, tabId: string, text: string) => {
  sessionManager.setIntent(tabId, text);
});

ipcMain.on("session-thought", (_event, tabId: string, text: string) => {
  sessionManager.addParkedThought(tabId, text);
});

ipcMain.handle("session-get-last", () => {
  return sessionManager.getLastEndedSession();
});

ipcMain.handle("session-get-active", (_event, tabId: string) => {
  return sessionManager.getActiveSession(tabId);
});

ipcMain.handle("session-get-recent", () => {
  return sessionManager.getRecentSessions();
});

ipcMain.handle("session-get-all", () => {
  return sessionManager.getAllSessions();
});

ipcMain.on("window-control", (event, action: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return;
  }
  if (action === "minimize") {
    win.minimize();
  } else if (action === "maximize") {
    win.maximize();
  } else if (action === "restore") {
    win.unmaximize();
  } else if (action === "close") {
    win.close();
  }
});

ipcMain.handle("window-is-maximized", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win?.isMaximized() || false;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  sessionManager.shutdown();
  for (const tab of tabs.values()) {
    tab.pty.kill();
  }
  tabs.clear();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
