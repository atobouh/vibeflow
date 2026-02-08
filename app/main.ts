import fs from "fs";
import path from "path";
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from "electron";
import { spawn as ptySpawn, IPty } from "node-pty";
import { spawn as spawnProcess } from "child_process";
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
const repoWatchers = new Map<string, fs.FSWatcher>();
let sessionManager: SessionManager | null = null;

// Temporary diagnostic: disable GPU to avoid renderer crashes during STT capture.
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

const ffmpegPath = require("ffmpeg-static");

const appendLog = (filename: string, message: string) => {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(filePath, line);
  } catch {
    // ignore logging failures
  }
};

type SttState = "idle" | "recording" | "transcribing";

type SttConfig = {
  winDevice?: string;
  macAudioIndex?: number;
  updatedAt: string;
};

let sttState: SttState = "idle";
let sttRecorder: ReturnType<typeof spawnProcess> | null = null;
let sttRecordingPath: string | null = null;
let sttRecordStartedAt: number | null = null;
let sttConfig: SttConfig | null = null;

const getSttConfigPath = () => path.join(app.getPath("userData"), "stt.json");

const loadSttConfig = () => {
  if (sttConfig) {
    return sttConfig;
  }
  try {
    const raw = fs.readFileSync(getSttConfigPath(), "utf8");
    sttConfig = JSON.parse(raw) as SttConfig;
    return sttConfig;
  } catch {
    sttConfig = { updatedAt: new Date().toISOString() };
    return sttConfig;
  }
};

const saveSttConfig = (config: SttConfig) => {
  sttConfig = config;
  try {
    fs.writeFileSync(getSttConfigPath(), JSON.stringify(config, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const sendSttStatus = (message: string) => {
  if (mainWindow && message) {
    mainWindow.webContents.send("stt-status", message);
  }
};

const sendSttResult = (text: string) => {
  if (mainWindow) {
    mainWindow.webContents.send("stt-result", text);
  }
};

const sendSttError = (message: string) => {
  if (mainWindow) {
    mainWindow.webContents.send("stt-error", message);
  }
};

const runProcess = (cmd: string, args: string[]) =>
  new Promise<{ code: number; output: string }>((resolve) => {
    const proc = spawnProcess(cmd, args, { windowsHide: true });
    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? 0, output });
    });
  });

const detectWindowsDevice = async () => {
  if (!ffmpegPath) {
    return null;
  }
  const { output } = await runProcess(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "dshow",
    "-i",
    "dummy"
  ]);
  appendLog("vibeflow-stt.log", `device-scan:${output}`);
  const lines = output.split(/\r?\n/);
  let inAudio = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("directshow audio devices")) {
      inAudio = true;
      continue;
    }
    if (lower.includes("directshow video devices")) {
      inAudio = false;
      continue;
    }
    if (!inAudio) {
      continue;
    }
    const match = line.match(/"([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }
  for (const line of lines) {
    const match = line.match(/"([^"]+)"\s*\(audio\)/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
};

const detectMacAudioIndex = async () => {
  if (!ffmpegPath) {
    return null;
  }
  const { output } = await runProcess(ffmpegPath, [
    "-hide_banner",
    "-f",
    "avfoundation",
    "-list_devices",
    "true",
    "-i",
    ""
  ]);
  const lines = output.split(/\r?\n/);
  let inAudio = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("avfoundation audio devices")) {
      inAudio = true;
      continue;
    }
    if (lower.includes("avfoundation video devices")) {
      inAudio = false;
      continue;
    }
    if (!inAudio) {
      continue;
    }
    const match = line.match(/\[(\d+)\]\s+(.+)/);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }
  return null;
};

const getRecordingArgs = async () => {
  const config = loadSttConfig();
  if (process.platform === "win32") {
    let device = config.winDevice;
    if (!device) {
      device = await detectWindowsDevice();
      if (device) {
        config.winDevice = device;
        config.updatedAt = new Date().toISOString();
        saveSttConfig(config);
      }
    }
    if (!device) {
      return null;
    }
    return {
      args: [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "dshow",
        "-i",
        `audio=${device}`,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav"
      ],
      label: device
    };
  }
  if (process.platform === "darwin") {
    let index = config.macAudioIndex;
    if (index === undefined || index === null || Number.isNaN(index)) {
      index = await detectMacAudioIndex();
      if (index !== null && index !== undefined) {
        config.macAudioIndex = index;
        config.updatedAt = new Date().toISOString();
        saveSttConfig(config);
      }
    }
    if (index === null || index === undefined || Number.isNaN(index)) {
      return null;
    }
    return {
      args: [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        `:${index}`,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav"
      ],
      label: `device ${index}`
    };
  }
  return null;
};

const getWhisperPaths = () => {
  const base = path.join(__dirname, "..", "assets", "whisper");
  const modelPath = path.join(base, "models", "ggml-tiny.en-q5_1.bin");
  let binPath = "";
  if (process.platform === "win32") {
    binPath = path.join(base, "bin", "win", "whisper-cli.exe");
  } else if (process.platform === "darwin") {
    binPath = path.join(base, "bin", "mac", "whisper-cli");
  } else {
    binPath = path.join(base, "bin", "linux", "whisper-cli");
  }
  return { binPath, modelPath };
};

type ShellKind = "powershell" | "cmd" | "bash" | "zsh" | "fish" | "unknown";

function shouldIgnoreWatchPath(relPath: string) {
  const normalized = relPath.replace(/\\/g, "/");
  return (
    normalized.startsWith(".git/") ||
    normalized.includes("/.git/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.startsWith("dist/") ||
    normalized.includes("/dist/") ||
    normalized.startsWith("build/") ||
    normalized.includes("/build/") ||
    normalized.startsWith("release/") ||
    normalized.includes("/release/")
  );
}

function stopRepoWatcher(tabId: string) {
  const watcher = repoWatchers.get(tabId);
  if (watcher) {
    watcher.close();
    repoWatchers.delete(tabId);
  }
}

function startRepoWatcher(tabId: string, root: string) {
  stopRepoWatcher(tabId);
  try {
    const watcher = fs.watch(root, { recursive: true }, (_eventType, filename) => {
      if (!filename) {
        return;
      }
      const relPath = path.normalize(filename.toString());
      if (shouldIgnoreWatchPath(relPath)) {
        return;
      }
      sessionManager?.recordFileTouch(tabId, relPath, "write");
      mainWindow?.webContents.send("repo-file-activity", {
        tabId,
        relPath,
        type: "write"
      });
    });
    repoWatchers.set(tabId, watcher);
  } catch {
    // Ignore watcher failures (e.g., permissions or unsupported FS)
  }
}

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
  const pty = ptySpawn(shell, args, {
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
    stopRepoWatcher(id);
    mainWindow?.webContents.send("pty-exit", { tabId: id });
  });

  const session = sessionManager.getActiveSession(id);
  const projectRoot = session?.projectRoot || null;
  const tab = tabs.get(id);
  if (tab) {
    tab.projectRoot = projectRoot;
  }
  startRepoWatcher(id, projectRoot || cwd);
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
  stopRepoWatcher(tabId);
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

ipcMain.on("session-file-read", (_event, tabId: string, relPath: string) => {
  sessionManager?.recordFileTouch(tabId, relPath, "read");
});

ipcMain.handle("session-time-echo", (_event, tabId: string, text: string) => {
  return sessionManager?.setTimeEcho(tabId, text) || false;
});

ipcMain.handle("session-echo-delivered", (_event, sessionId: string) => {
  return sessionManager?.markTimeEchoDelivered(sessionId) || false;
});

ipcMain.handle("session-get-last", () => {
  return sessionManager?.getLastSession() || null;
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

ipcMain.handle("vibetrace-get-include", (_event, repoKey: string | null) => {
  return sessionManager?.getVibeTraceInclude(repoKey) || false;
});

ipcMain.handle(
  "vibetrace-set-include",
  (_event, repoKey: string | null, include: boolean) => {
    return sessionManager?.setVibeTraceInclude(repoKey, include) || false;
  }
);

ipcMain.handle("vibetrace-read", (_event, repoKey: string | null) => {
  return sessionManager?.readVibeTrace(repoKey) || null;
});

ipcMain.handle("time-echo-consume", (_event, repoKey: string | null) => {
  return sessionManager?.consumeTimeEchoes(repoKey) || [];
});

ipcMain.handle("repo-parked-thoughts", (_event, repoKey: string | null) => {
  return sessionManager?.getRepoParkedThoughts(repoKey) || [];
});

ipcMain.handle(
  "repo-parked-thought-delete",
  (_event, repoKey: string | null, thoughtId: string) => {
    return sessionManager?.deleteRepoParkedThought(repoKey, thoughtId) || false;
  }
);

ipcMain.handle("app-get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app-open-external", (_event, url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  return shell.openExternal(url);
});

ipcMain.handle("stt-start", async () => {
  if (sttState === "recording") {
    sendSttStatus("Already listening.");
    return true;
  }
  if (sttState === "transcribing") {
    sendSttStatus("Transcribing...");
    return false;
  }
  if (!ffmpegPath) {
    sendSttError("FFmpeg missing.");
    return false;
  }
  const recordingConfig = await getRecordingArgs();
  if (!recordingConfig) {
    sendSttError("Microphone device not found.");
    return false;
  }
  const { binPath, modelPath } = getWhisperPaths();
  if (!fs.existsSync(binPath)) {
    sendSttError("STT binary missing.");
    return false;
  }
  if (!fs.existsSync(modelPath)) {
    sendSttError("STT model missing.");
    return false;
  }
  const sttDir = path.join(app.getPath("userData"), "stt");
  fs.mkdirSync(sttDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const wavPath = path.join(sttDir, `stt-${stamp}.wav`);
  const args = [...recordingConfig.args, wavPath];
  appendLog("vibeflow-stt.log", `record-start:${recordingConfig.label}`);
  try {
    sttRecorder = spawnProcess(ffmpegPath, args, { windowsHide: true });
  } catch (err) {
    sendSttError("Unable to start recorder.");
    appendLog(
      "vibeflow-stt.log",
      `record-error:${err instanceof Error ? err.message : "unknown"}`
    );
    return false;
  }
  sttRecordingPath = wavPath;
  sttRecordStartedAt = Date.now();
  sttState = "recording";
  sttRecorder?.stderr?.on("data", (data) => {
    appendLog("vibeflow-stt.log", `ffmpeg:${data.toString()}`);
  });
  sttRecorder?.on("exit", (code) => {
    appendLog("vibeflow-stt.log", `record-exit:${code ?? 0}`);
    if (sttState === "recording") {
      sttState = "idle";
      sendSttError("Recording stopped.");
    }
  });
  sendSttStatus("Listening...");
  return true;
});

ipcMain.handle("stt-stop", async () => {
  if (sttState !== "recording" || !sttRecorder || !sttRecordingPath) {
    return false;
  }
  const recorder = sttRecorder;
  const wavPath = sttRecordingPath;
  const startedAt = sttRecordStartedAt;
  sttRecorder = null;
  sttRecordingPath = null;
  sttRecordStartedAt = null;
  sttState = "transcribing";
  sendSttStatus("Preparing audio...");
  const stopRecording = () =>
    new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try {
          recorder.kill("SIGINT");
        } catch {
          // ignore
        }
      }, 2000);
      recorder.once("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });
      try {
        recorder.stdin?.write("q");
      } catch {
        // ignore
      }
    });

  await stopRecording();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const durationMs = startedAt ? Date.now() - startedAt : 0;
  if (durationMs < 600) {
    try {
      fs.unlinkSync(wavPath);
    } catch {
      // ignore
    }
    sttState = "idle";
    sendSttError("Recording too short.");
    return false;
  }
  try {
    const stat = fs.statSync(wavPath);
    appendLog("vibeflow-stt.log", `record-size:${stat.size}`);
    if (stat.size < 8192) {
      sendSttError("Recording too short.");
      sttState = "idle";
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // ignore
      }
      return false;
    }
    const header = fs.readFileSync(wavPath).subarray(0, 12).toString("ascii");
    if (!header.startsWith("RIFF") || !header.includes("WAVE")) {
      sendSttError("Recording failed.");
      sttState = "idle";
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // ignore
      }
      return false;
    }
  } catch {
    sendSttError("Recording failed.");
    sttState = "idle";
    try {
      fs.unlinkSync(wavPath);
    } catch {
      // ignore
    }
    return false;
  }

  const { binPath, modelPath } = getWhisperPaths();
  const outputBase = wavPath.replace(/\.wav$/i, "");
  const outputFile = `${outputBase}.txt`;
  appendLog("vibeflow-stt.log", "transcribe-start");
  sendSttStatus("Transcribing...");
  let transcribeExitCode = 0;
  await new Promise<void>((resolve) => {
    const proc = spawnProcess(
      binPath,
      ["-m", modelPath, "-f", wavPath, "-otxt", "-of", outputBase],
      { windowsHide: true, cwd: path.dirname(binPath) }
    );
    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (err) => {
      transcribeExitCode = 1;
      appendLog(
        "vibeflow-stt.log",
        `transcribe-error:${err instanceof Error ? err.message : "unknown"}`
      );
      resolve();
    });
    proc.on("exit", (code) => {
      transcribeExitCode = code ?? 0;
      appendLog("vibeflow-stt.log", `transcribe-exit:${code ?? 0}`);
      if (stderr) {
        appendLog("vibeflow-stt.log", `whisper:${stderr}`);
      }
      resolve();
    });
  });

  let text = "";
  let hasOutput = false;
  try {
    if (fs.existsSync(outputFile)) {
      text = fs.readFileSync(outputFile, "utf8").trim();
      hasOutput = true;
    }
  } catch {
    text = "";
    hasOutput = false;
  }
  try {
    fs.unlinkSync(wavPath);
    fs.unlinkSync(outputFile);
  } catch {
    // ignore cleanup errors
  }
  if (text) {
    sendSttResult(text);
  } else if (hasOutput) {
    sendSttError("No speech detected.");
  } else if (transcribeExitCode === 3221225781) {
    sendSttError("Missing Microsoft Visual C++ runtime.");
  } else {
    sendSttError("STT failed.");
  }
  sttState = "idle";
  return true;
});

ipcMain.on("stt-log", (_event, message: string) => {
  if (typeof message !== "string" || message.length === 0) {
    return;
  }
  appendLog("vibeflow-stt.log", message);
});

ipcMain.handle("clipboard-save-image", (_event, repoKey: string | null) => {
  if (!repoKey) {
    return null;
  }
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return null;
    }
    const dir = path.join(repoKey, ".vibeflow", "clipboard");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `clip-${stamp}.png`;
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, image.toPNG());
    return path.relative(repoKey, fullPath).replace(/\\/g, "/");
  } catch {
    return null;
  }
});

ipcMain.handle(
  "image-save-file",
  (_event, repoKey: string | null, originalName: string, bytes: Uint8Array) => {
    if (!repoKey || !bytes) {
      return null;
    }
    try {
      const safeName = (originalName || "image").replace(/[^a-z0-9._-]/gi, "_");
      const ext = path.extname(safeName) || ".png";
      const base = path.basename(safeName, ext) || "image";
      const dir = path.join(repoKey, ".vibeflow", "uploads");
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${base}-${stamp}${ext}`;
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, Buffer.from(bytes));
      return path.relative(repoKey, fullPath).replace(/\\/g, "/");
    } catch {
      return null;
    }
  }
);

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
  if (sttRecorder) {
    try {
      sttRecorder.kill("SIGINT");
    } catch {
      // ignore
    }
    sttRecorder = null;
  }
  tabs.clear();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
