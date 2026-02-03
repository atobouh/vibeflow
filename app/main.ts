import fs from "fs";
import path from "path";
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { spawn, IPty } from "node-pty";
import { SessionManager } from "./session";

type TabInfo = {
  id: string;
  pty: IPty;
  cwd: string;
  shellKind: ShellKind;
  projectRoot: string | null;
};

let mainWindow: BrowserWindow | null = null;
const tabs = new Map<string, TabInfo>();
let sessionManager: SessionManager | null = null;

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
      nodeIntegration: false,
      sandbox: true
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
  if (!sessionManager) {
    throw new Error("Session manager not ready");
  }
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

  tabs.set(id, { id, pty, cwd, shellKind, projectRoot: null });
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
  const projectRoot = session?.projectRoot || null;
  const tab = tabs.get(id);
  if (tab) {
    tab.projectRoot = projectRoot;
  }
  return {
    id,
    cwd,
    projectRoot,
    shellKind
  };
}

function closeTab(tabId: string, reason: string) {
  if (!sessionManager) {
    return;
  }
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
  sessionManager?.recordActivity(tabId, "pty-input");
  tabs.get(tabId)?.pty.write(data);
});

ipcMain.on("pty-resize", (_event, tabId: string, cols: number, rows: number) => {
  tabs.get(tabId)?.pty.resize(cols, rows);
});

ipcMain.on("session-intent", (_event, tabId: string, text: string) => {
  sessionManager?.setIntent(tabId, text);
});

ipcMain.on("session-thought", (_event, tabId: string, text: string) => {
  sessionManager?.addParkedThought(tabId, text);
});

ipcMain.handle("session-get-last", () => {
  return sessionManager?.getLastEndedSession() || null;
});

ipcMain.handle("session-get-active", (_event, tabId: string) => {
  return sessionManager?.getActiveSession(tabId) || null;
});

ipcMain.handle("session-get-recent", () => {
  return sessionManager?.getRecentSessions() || [];
});

ipcMain.handle("session-get-all", () => {
  return sessionManager?.getAllSessions() || [];
});

ipcMain.handle("session-delete", (_event, sessionId: string) => {
  return sessionManager?.deleteSession(sessionId) || false;
});

ipcMain.handle("session-delete-repo", (_event, repoKey: string) => {
  return sessionManager?.deleteRepoContext(repoKey) || 0;
});

ipcMain.handle("app-get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app-open-external", (_event, url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  return shell.openExternal(url);
});

type FileNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
};

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo"
]);
const MAX_TREE_DEPTH = 4;
const MAX_TREE_ENTRIES = 1200;

function isWithinRoot(root: string, target: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

async function buildTree(
  root: string,
  current: string,
  depth: number,
  counter: { count: number }
): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH || counter.count > MAX_TREE_ENTRIES) {
    return [];
  }
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());
  const ordered = [...dirs, ...files];

  const nodes: FileNode[] = [];
  for (const entry of ordered) {
    if (counter.count > MAX_TREE_ENTRIES) {
      break;
    }
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    const relPath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      counter.count += 1;
      const node: FileNode = {
        name: entry.name,
        path: relPath,
        type: "dir"
      };
      if (depth < MAX_TREE_DEPTH) {
        node.children = await buildTree(root, fullPath, depth + 1, counter);
      }
      nodes.push(node);
    } else if (entry.isFile()) {
      counter.count += 1;
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "file"
      });
    }
  }
  return nodes;
}

ipcMain.handle("repo-get-tree", async (_event, tabId: string) => {
  const tab = tabs.get(tabId);
  if (!tab) {
    return null;
  }
  const root = tab.projectRoot || tab.cwd;
  const counter = { count: 0 };
  const children = await buildTree(root, root, 0, counter);
  return {
    name: path.basename(root),
    path: "",
    type: "dir",
    children
  } satisfies FileNode;
});

ipcMain.handle("repo-read-file", async (_event, tabId: string, relPath: string) => {
  const tab = tabs.get(tabId);
  if (!tab) {
    return { ok: false, message: "No active tab." };
  }
  const root = tab.projectRoot || tab.cwd;
  const fullPath = path.join(root, relPath);
  if (!isWithinRoot(root, fullPath)) {
    return { ok: false, message: "Invalid path." };
  }
  try {
    const stat = await fs.promises.stat(fullPath);
    const maxSize = 256 * 1024;
    if (stat.size > maxSize) {
      return { ok: false, message: "File too large to preview." };
    }
    const buffer = await fs.promises.readFile(fullPath);
    if (buffer.includes(0)) {
      return { ok: false, message: "Binary file preview not supported." };
    }
    return { ok: true, content: buffer.toString("utf8") };
  } catch {
    return { ok: false, message: "Unable to read file." };
  }
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
  sessionManager = new SessionManager(path.join(app.getPath("userData"), "data"));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  sessionManager?.shutdown();
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
