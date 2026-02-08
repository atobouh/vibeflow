#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");
const https = require("https");
let clipboardy = null;
try {
  clipboardy = require("clipboardy");
} catch {
  clipboardy = null;
}
let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch {
  ffmpegPath = null;
}

const args = process.argv.slice(2);
const command = args[0];

const isTty = process.stdout.isTTY;
const color = (code, text) => (isTty ? `\u001b[${code}m${text}\u001b[0m` : text);
const c = {
  dim: (t) => color("2", t),
  cyan: (t) => color("36", t),
  magenta: (t) => color("35", t),
  blue: (t) => color("34", t),
  green: (t) => color("32", t),
  yellow: (t) => color("33", t),
  gray: (t) => color("90", t)
};

const nowIso = () => new Date().toISOString();

const getDataDir = () => {
  if (process.env.VF_DATA_DIR) {
    return process.env.VF_DATA_DIR;
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "vibeflow-cli");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "vibeflow-cli");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "vibeflow-cli");
};

const DATA_DIR = getDataDir();
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const DEFAULT_IDLE_MINUTES = 240;
const STT_DIR = path.join(DATA_DIR, "stt");
const STT_CONFIG_FILE = path.join(STT_DIR, "stt.json");
const STT_WHISPER_DIR = path.join(STT_DIR, "whisper");
const STT_MODEL_NAME = "ggml-tiny.en-q5_1.bin";
const STT_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin";
const STT_RELEASE = "v1.8.2";
const STT_WINDOWS_ZIP = `https://github.com/ggml-org/whisper.cpp/releases/download/${STT_RELEASE}/whisper-bin-x64.zip`;

const ensureDir = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
};

const loadJson = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const saveJson = (filePath, value) => {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};

const loadSessions = () => {
  const data = loadJson(SESSIONS_FILE, []);
  return Array.isArray(data) ? data : [];
};

const saveSessions = (sessions) => {
  saveJson(SESSIONS_FILE, sessions);
};

const loadState = () => {
  const data = loadJson(STATE_FILE, {
    activeByRepo: {},
    idleTimeoutMinutes: DEFAULT_IDLE_MINUTES,
    pendingTimeEchoesByRepo: {},
    deliveredTimeEchoesByRepo: {},
    repoParkedThoughtsByRepo: {}
  });
  if (!data || typeof data !== "object") {
    return {
      activeByRepo: {},
      idleTimeoutMinutes: DEFAULT_IDLE_MINUTES,
      pendingTimeEchoesByRepo: {},
      deliveredTimeEchoesByRepo: {},
      repoParkedThoughtsByRepo: {}
    };
  }
  const pending = data.pendingTimeEchoesByRepo || {};
  const delivered = data.deliveredTimeEchoesByRepo || {};
  const parked = data.repoParkedThoughtsByRepo || {};
  const normalizeEchoMap = (map) =>
    Object.fromEntries(
      Object.entries(map).map(([key, list]) => [
        key,
        Array.isArray(list) ? list.map(normalizeTimeEcho) : []
      ])
    );
  const normalizeThoughtMap = (map) =>
    Object.fromEntries(
      Object.entries(map).map(([key, list]) => [
        key,
        Array.isArray(list) ? list.map(normalizeParkedThought) : []
      ])
    );
  return {
    activeByRepo: data.activeByRepo || {},
    idleTimeoutMinutes:
      typeof data.idleTimeoutMinutes === "number" ? data.idleTimeoutMinutes : DEFAULT_IDLE_MINUTES,
    pendingTimeEchoesByRepo: normalizeEchoMap(pending),
    deliveredTimeEchoesByRepo: normalizeEchoMap(delivered),
    repoParkedThoughtsByRepo: normalizeThoughtMap(parked)
  };
};

const saveState = (state) => {
  saveJson(STATE_FILE, state);
};

const loadSttConfig = () => {
  const data = loadJson(STT_CONFIG_FILE, {
    winDevice: null,
    macAudioIndex: null
  });
  return data || { winDevice: null, macAudioIndex: null };
};

const saveSttConfig = (config) => {
  saveJson(STT_CONFIG_FILE, config);
};

const ensureSttDirs = () => {
  fs.mkdirSync(STT_DIR, { recursive: true });
  fs.mkdirSync(STT_WHISPER_DIR, { recursive: true });
};

const runProcess = (cmd, args) =>
  new Promise((resolve) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => resolve({ code: code ?? 0, output }));
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

const findInPath = (commandName) => {
  const tool = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(tool, [commandName], { encoding: "utf8" });
  if (result.status === 0 && result.stdout) {
    return result.stdout.split(/\r?\n/).find((line) => line.trim().length > 0) || null;
  }
  return null;
};

const resolveWhisperPaths = () => {
  const envBin = process.env.VF_WHISPER_BIN;
  const envModel = process.env.VF_WHISPER_MODEL;
  if (envBin && envModel) {
    return { binPath: envBin, modelPath: envModel };
  }
  const base = STT_WHISPER_DIR;
  let binPath = null;
  if (process.platform === "win32") {
    binPath = path.join(base, "bin", "win", "whisper-cli.exe");
  } else if (process.platform === "darwin") {
    binPath = path.join(base, "bin", "mac", "whisper-cli");
  } else {
    binPath = path.join(base, "bin", "linux", "whisper-cli");
  }
  const modelPath = path.join(base, "models", STT_MODEL_NAME);
  if (fs.existsSync(binPath) && fs.existsSync(modelPath)) {
    return { binPath, modelPath };
  }
  const fromPath = findInPath("whisper-cli");
  if (fromPath && (envModel || fs.existsSync(modelPath))) {
    return { binPath: fromPath, modelPath: envModel || modelPath };
  }
  return { binPath: fs.existsSync(binPath) ? binPath : null, modelPath };
};

const downloadFile = (url, outPath, redirectsLeft = 5) =>
  new Promise((resolve, reject) => {
    ensureSttDirs();
    const file = fs.createWriteStream(outPath);
    const targetUrl = new URL(url);
    const client = targetUrl.protocol === "http:" ? require("http") : https;
    const request = client.get(
      targetUrl,
      { headers: { "User-Agent": "vibeflow-cli" } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects."));
            return;
          }
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          file.close(() => {
            fs.unlink(outPath, () => {
              downloadFile(nextUrl, outPath, redirectsLeft - 1).then(resolve).catch(reject);
            });
          });
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }
    );
    request.on("error", (err) => {
      fs.unlink(outPath, () => reject(err));
    });
  });

const extractZip = (zipPath, destDir) =>
  new Promise((resolve, reject) => {
    if (process.platform === "win32") {
      const cmd = "powershell";
      const args = [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
      ];
      const proc = spawn(cmd, args, { windowsHide: true });
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Expand-Archive failed."));
        }
      });
      return;
    }
    const unzipPath = findInPath("unzip");
    if (unzipPath) {
      const proc = spawn(unzipPath, ["-o", zipPath, "-d", destDir]);
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("unzip failed."));
        }
      });
      return;
    }
    reject(new Error("unzip not available. Install unzip or set VF_WHISPER_BIN/VF_WHISPER_MODEL."));
  });

const findFileRecursive = (dir, filename) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, filename);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

const findGitRoot = (startDir) => {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

const getRepoKey = (cwd) => {
  const root = findGitRoot(cwd);
  return root || path.resolve(cwd);
};

const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
};

const formatClock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const BIG_DIGITS = {
  "0": [" ___ ", "|   |", "|   |", "|   |", "|___|"],
  "1": ["  |  ", "  |  ", "  |  ", "  |  ", "  |  "],
  "2": [" ___ ", "    |", " ___|", "|    ", "|___ "],
  "3": [" ___ ", "    |", " ___|", "    |", " ___|"],
  "4": ["|   |", "|   |", "|___|", "    |", "    |"],
  "5": [" ___ ", "|    ", "|___ ", "    |", " ___|"],
  "6": [" ___ ", "|    ", "|___ ", "|   |", "|___|"],
  "7": [" ___ ", "    |", "    |", "    |", "    |"],
  "8": [" ___ ", "|   |", "|___|", "|   |", "|___|"],
  "9": [" ___ ", "|   |", "|___|", "    |", " ___|"],
  ":": ["     ", "  :  ", "     ", "  :  ", "     "]
};

const renderBigTime = (text) => {
  const lines = ["", "", "", "", ""];
  for (const ch of text) {
    const glyph = BIG_DIGITS[ch] || BIG_DIGITS["0"];
    for (let i = 0; i < lines.length; i += 1) {
      lines[i] += `${glyph[i]} `;
    }
  }
  return lines.map((line) => line.trimEnd());
};

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeParkedThought = (thought) => ({
  id: thought?.id || createId(),
  text: thought?.text || "",
  createdAt: thought?.createdAt || nowIso()
});

const normalizeTimeEcho = (echo) => ({
  id: echo?.id || createId(),
  text: echo?.text || "",
  createdAt: echo?.createdAt || nowIso(),
  deliverAt: echo?.deliverAt || nowIso(),
  deliveredAt: echo?.deliveredAt,
  sourceSessionId: echo?.sourceSessionId
});

const findSessionById = (sessions, id) => sessions.find((s) => s.id === id);

const getLastSessionForRepo = (sessions, repoKey) => {
  const filtered = sessions.filter((s) => s.repoKey === repoKey);
  if (filtered.length === 0) {
    return null;
  }
  filtered.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return filtered[0];
};

const usage = () => {
  console.log(`
VibeFlow CLI

Usage:
  vf start [path]        Start a session
  vf intent "text"       Set intent for current repo session
  vf park "note"         Park a thought
  vf echo "message"      Queue a time echo for next session
  vf echo list           List queued/delivered echoes
  vf echo park <id>      Park a delivered echo
  vf echo discard <id>   Discard a delivered echo
  vf stt                Push-to-talk speech-to-text
  vf stt --copy         Copy transcription to clipboard
  vf stt --intent       Save transcription as intent
  vf stt --park         Save transcription as parked thought
  vf stt --echo         Save transcription as time echo
  vf stt --device <val> Override microphone device or index
  vf stt setup          Download Whisper CLI + model (all platforms)
  vf status              Show current session status
  vf status --watch      Live session timer
  vf timer               Live session timer (alias)
  vf idle [value]        Get/set idle timeout (minutes or Nh)
  vf touch               Refresh activity timestamp
  vf resume [path]       Show last session summary
  vf history [path]      List recent sessions
  vf end                 End current session
  vf receipt [id]        Print receipt (defaults to last session)
  vf help                Show this help
`);
};

const printSessionSummary = (session, active = false) => {
  const durationMs = session.endedAt
    ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
    : Date.now() - Date.parse(session.startedAt);
  const state = active ? "Active" : session.endedAt ? "Ended" : "In progress";
  console.log(`Repo: ${session.repoName || path.basename(session.repoKey)}`);
  console.log(`Session ID: ${session.id}`);
  console.log(`Status: ${state}`);
  console.log(`Started: ${formatTime(session.startedAt)}`);
  if (session.endedAt) {
    console.log(`Ended: ${formatTime(session.endedAt)}`);
  }
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log(`Intent: ${session.intent?.text || "Not set"}`);
  console.log(`Parked: ${(session.parkedThoughts || []).length}`);
  console.log(`Time Echoes: ${(session.timeEchoes || []).length}`);
};

const getIdleTimeoutMs = (state) => {
  const minutes =
    typeof state.idleTimeoutMinutes === "number" ? state.idleTimeoutMinutes : DEFAULT_IDLE_MINUTES;
  if (minutes <= 0) {
    return 0;
  }
  return minutes * 60 * 1000;
};

const normalizeSession = (session) => {
  if (!session.lastActivityAt) {
    session.lastActivityAt = session.startedAt;
  }
  if (!session.parkedThoughts) {
    session.parkedThoughts = [];
  }
  session.parkedThoughts = session.parkedThoughts.map(normalizeParkedThought);
  if (!session.timeEchoes) {
    session.timeEchoes = session.timeEcho ? [normalizeTimeEcho(session.timeEcho)] : [];
  } else {
    session.timeEchoes = session.timeEchoes.map(normalizeTimeEcho);
  }
  return session;
};

const ensureGitignore = (repoKey) => {
  const gitDir = path.join(repoKey, ".git");
  if (!fs.existsSync(gitDir)) {
    return;
  }
  const gitignorePath = path.join(repoKey, ".gitignore");
  const entry = ".vibeflow/";
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\n`, "utf8");
    return;
  }
  const raw = fs.readFileSync(gitignorePath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.some((line) => line.trim() === entry || line.trim() === ".vibeflow")) {
    return;
  }
  lines.push(entry);
  fs.writeFileSync(gitignorePath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
};

const buildTracePayload = (session) => {
  const durationMs = session.endedAt
    ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
    : Date.now() - Date.parse(session.startedAt);
  return {
    version: 1,
    generatedAt: nowIso(),
    sessionId: session.id,
    repoKey: session.repoKey,
    repoName: session.repoName,
    startedAt: session.startedAt,
    endedAt: session.endedAt || null,
    durationMs,
    intent: session.intent || null,
    parkedThoughts: session.parkedThoughts || [],
    timeEchoes: session.timeEchoes || []
  };
};

const writeTrace = (session) => {
  try {
    const dir = path.join(session.repoKey, ".vibeflow");
    fs.mkdirSync(dir, { recursive: true });
    const payload = buildTracePayload(session);
    fs.writeFileSync(path.join(dir, "trace.json"), JSON.stringify(payload, null, 2), "utf8");
    ensureGitignore(session.repoKey);
  } catch {
    // ignore trace failures
  }
};

const readTrace = (repoKey) => {
  try {
    const filePath = path.join(repoKey, ".vibeflow", "trace.json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const queueTimeEchoes = (session, state) => {
  if (!session.timeEchoes || session.timeEchoes.length === 0) {
    return;
  }
  const existing = state.pendingTimeEchoesByRepo[session.repoKey] || [];
  state.pendingTimeEchoesByRepo[session.repoKey] = existing.concat(session.timeEchoes);
};

const deliverPendingEchoes = (repoKey, state) => {
  const pending = state.pendingTimeEchoesByRepo[repoKey] || [];
  if (pending.length === 0) {
    return [];
  }
  delete state.pendingTimeEchoesByRepo[repoKey];
  state.deliveredTimeEchoesByRepo[repoKey] = pending;
  return pending;
};

const clearDeliveredEchoes = (repoKey, state) => {
  if (state.deliveredTimeEchoesByRepo[repoKey]) {
    delete state.deliveredTimeEchoesByRepo[repoKey];
  }
};

const showEchoes = (echoes) => {
  if (!echoes || echoes.length === 0) {
    return;
  }
  console.log(c.magenta("Time Echoes:"));
  echoes.forEach((echo) => {
    console.log(`- ${echo.id}: ${echo.text}`);
  });
  console.log(c.gray("Use `vf echo park <id>` to park or `vf echo discard <id>` to delete."));
};

const showTraceSummary = (trace) => {
  if (!trace) {
    return;
  }
  console.log(c.blue("VibeTrace found"));
  console.log(`Last intent: ${trace.intent?.text || "Not set"}`);
  if (trace.durationMs) {
    console.log(`Last session duration: ${formatDuration(trace.durationMs)}`);
  }
  console.log(`Parked thoughts: ${(trace.parkedThoughts || []).length}`);
  console.log(`Time echoes: ${(trace.timeEchoes || []).length}`);
};

const ensureActiveSession = (sessions, state, repoKey) => {
  const activeId = state.activeByRepo[repoKey];
  if (!activeId) {
    return { session: null, autoEnded: false, endedSession: null };
  }
  const session = findSessionById(sessions, activeId);
  if (!session) {
    return { session: null, autoEnded: false, endedSession: null };
  }
  normalizeSession(session);
  const timeoutMs = getIdleTimeoutMs(state);
  if (timeoutMs > 0) {
    const last = Date.parse(session.lastActivityAt || session.startedAt);
    if (Date.now() - last > timeoutMs) {
      session.endedAt = nowIso();
      session.endedReason = "idle";
      queueTimeEchoes(session, state);
      writeTrace(session);
      saveSessions(sessions);
      delete state.activeByRepo[repoKey];
      saveState(state);
      return { session: null, autoEnded: true, endedSession: session };
    }
  }
  return { session, autoEnded: false, endedSession: null };
};

const startSession = (targetPath, watch) => {
  const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const repoKey = getRepoKey(cwd);
  const repoName = path.basename(repoKey);
  const sessions = loadSessions();
  const state = loadState();

  const existing = ensureActiveSession(sessions, state, repoKey);
  if (existing.session && !existing.session.endedAt) {
    console.log(c.yellow("Session already active:"));
    printSessionSummary(existing.session, true);
    return;
  }

  const session = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    repoKey,
    repoName,
    cwd,
    startedAt: nowIso(),
    lastActivityAt: nowIso(),
    parkedThoughts: []
  };

  sessions.push(session);
  state.activeByRepo[repoKey] = session.id;
  saveSessions(sessions);
  saveState(state);

  const banner = [
    c.cyan("__      __ _          ______ _               "),
    c.cyan("\\ \\    / /(_) |        |  ____| |              "),
    c.blue(" \\ \\  / / _| |__   ___ | |__  | | _____      __"),
    c.blue("  \\ \\/ / | | '_ \\ / _ \\|  __| | |/ _ \\ \\ /\\ / /"),
    c.magenta("   \\  /  | | |_) |  __/| |    | | (_) \\ V  V / "),
    c.magenta("    \\/   |_|_.__/ \\___||_|    |_|\\___/ \\_/\\_/  ")
  ];
  console.log(banner.join("\n"));
  console.log(c.dim("Terminal IDE - Intent - Context - Flow\n"));
  console.log(c.green("Session started."));
  printSessionSummary(session, true);
  const trace = readTrace(repoKey);
  showTraceSummary(trace);
  clearDeliveredEchoes(repoKey, state);
  const echoes = deliverPendingEchoes(repoKey, state);
  if (echoes.length > 0) {
    showEchoes(echoes);
    saveState(state);
  }
  if (watch) {
    renderLiveTimer(session);
    return;
  }
  console.log(c.gray("Live timer: run `vf timer` when you want a live view."));
};

const setIntent = (text) => {
  const value = text.trim();
  if (!value) {
    console.error("Intent text is required.");
    return;
  }
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (!active.session) {
    if (active.autoEnded) {
      console.error("Session auto-ended due to inactivity. Run `vf start` to begin a new one.");
      printSessionSummary(active.endedSession, false);
      return;
    }
    console.error("No active session. Run `vf start` first.");
    return;
  }
  active.session.intent = { text: value, setAt: nowIso() };
  active.session.lastActivityAt = nowIso();
  saveSessions(sessions);
  console.log("Intent saved.");
};

const parkThought = (text) => {
  const value = text.trim();
  if (!value) {
    console.error("Parked thought text is required.");
    return;
  }
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (!active.session) {
    if (active.autoEnded) {
      console.error("Session auto-ended due to inactivity. Run `vf start` to begin a new one.");
      printSessionSummary(active.endedSession, false);
      return;
    }
    console.error("No active session. Run `vf start` first.");
    return;
  }
  const thought = normalizeParkedThought({ text: value, createdAt: nowIso() });
  active.session.parkedThoughts.push(thought);
  if (!state.repoParkedThoughtsByRepo[repoKey]) {
    state.repoParkedThoughtsByRepo[repoKey] = [];
  }
  state.repoParkedThoughtsByRepo[repoKey].push(thought);
  active.session.lastActivityAt = nowIso();
  saveSessions(sessions);
  saveState(state);
  console.log("Thought parked.");
};

const printBigTimeOnce = (elapsed) => {
  const lines = renderBigTime(elapsed);
  const tinted = lines.map((line, idx) => {
    if (idx < 2) return c.cyan(line);
    if (idx < 4) return c.blue(line);
    return c.magenta(line);
  });
  console.log(tinted.join("\n"));
};

const renderLiveTimer = (session) => {
  console.log(c.cyan("== VibeFlow Timer =="));
  console.log(c.gray("Ctrl+C to stop\n"));
  const startMs = Date.parse(session.startedAt);
  let painted = false;
  const interval = setInterval(() => {
    const elapsed = formatClock(Date.now() - startMs);
    const lines = renderBigTime(elapsed);
    if (painted) {
      process.stdout.write(`\u001b[${lines.length}A`);
    }
    const tinted = lines.map((line, idx) => {
      if (idx < 2) return c.cyan(line);
      if (idx < 4) return c.blue(line);
      return c.magenta(line);
    });
    process.stdout.write(tinted.map((line) => `\u001b[2K${line}`).join("\n") + "\n");
    painted = true;
  }, 1000);
  const cleanup = () => {
    clearInterval(interval);
    process.stdout.write("\n");
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
};

const status = (watch = false) => {
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (active.session) {
    if (watch) {
      active.session.lastActivityAt = nowIso();
      saveSessions(sessions);
      renderLiveTimer(active.session);
      return;
    }
    printSessionSummary(active.session, true);
    return;
  }
  if (active.autoEnded && active.endedSession) {
    console.log(c.yellow("Session auto-ended due to inactivity."));
    printSessionSummary(active.endedSession, false);
    return;
  }
  const last = getLastSessionForRepo(sessions, repoKey);
  if (!last) {
    console.log("No sessions found for this repo.");
    return;
  }
  console.log("No active session. Last session:");
  printSessionSummary(last, false);
};

const resume = (targetPath) => {
  const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const repoKey = getRepoKey(cwd);
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (active.session) {
    console.log("Active session:");
    printSessionSummary(active.session, true);
  } else if (active.autoEnded && active.endedSession) {
    console.log("Last session (auto-ended due to inactivity):");
    printSessionSummary(active.endedSession, false);
  } else {
    const last = getLastSessionForRepo(sessions, repoKey);
    if (!last) {
      console.log("No sessions found for this repo.");
    } else {
      console.log("Last session:");
      printSessionSummary(last, false);
    }
  }
  const trace = readTrace(repoKey);
  showTraceSummary(trace);
  clearDeliveredEchoes(repoKey, state);
  const echoes = deliverPendingEchoes(repoKey, state);
  if (echoes.length > 0) {
    showEchoes(echoes);
    saveState(state);
  }
};

const history = (targetPath) => {
  const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const repoKey = getRepoKey(cwd);
  const sessions = loadSessions().filter((s) => s.repoKey === repoKey);
  if (sessions.length === 0) {
    console.log("No sessions found for this repo.");
    return;
  }
  sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  console.log(`Recent sessions (${Math.min(5, sessions.length)}):`);
  for (const session of sessions.slice(0, 5)) {
    const durationMs = session.endedAt
      ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
      : Date.now() - Date.parse(session.startedAt);
    console.log(
      `- ${session.id} - ${formatTime(session.startedAt)} - ${formatDuration(durationMs)} - ${
        session.intent?.text || "No intent"
      }`
    );
  }
};

const timer = () => status(true);

const end = () => {
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (!active.session) {
    if (active.autoEnded) {
      console.error("Session already auto-ended due to inactivity.");
      printSessionSummary(active.endedSession, false);
      return;
    }
    console.error("No active session to end.");
    return;
  }
  active.session.endedAt = nowIso();
  active.session.endedReason = "ended";
  queueTimeEchoes(active.session, state);
  writeTrace(active.session);
  saveSessions(sessions);
  delete state.activeByRepo[repoKey];
  saveState(state);
  console.log("Session ended.");
  printSessionSummary(active.session, false);
  process.exit(0);
};

const receipt = (id) => {
  const sessions = loadSessions();
  const repoKey = getRepoKey(process.cwd());
  const targetId = id || getLastSessionForRepo(sessions, repoKey)?.id;
  if (!targetId) {
    console.error("No session found to print a receipt.");
    return;
  }
  const session = findSessionById(sessions, targetId);
  if (!session) {
    console.error("Session not found.");
    return;
  }
  console.log("VibeFlow Session Receipt");
  console.log(`Session ID: ${session.id}`);
  console.log(`Repo: ${session.repoName || path.basename(session.repoKey)}`);
  console.log(`Started: ${formatTime(session.startedAt)}`);
  if (session.endedAt) {
    console.log(`Ended: ${formatTime(session.endedAt)}`);
  }
  const durationMs = session.endedAt
    ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
    : Date.now() - Date.parse(session.startedAt);
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log(`Intent: ${session.intent?.text || "Not set"}`);
  console.log(`Parked: ${(session.parkedThoughts || []).length}`);
  console.log(`Time Echoes: ${(session.timeEchoes || []).length}`);
};

const echoCommand = (argsList) => {
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const sub = argsList[0];
  if (!sub || sub === "list") {
    const pending = state.pendingTimeEchoesByRepo[repoKey] || [];
    const delivered = state.deliveredTimeEchoesByRepo[repoKey] || [];
    if (pending.length === 0 && delivered.length === 0) {
      console.log("No time echoes for this repo.");
      return;
    }
    if (pending.length > 0) {
      console.log(c.blue("Queued (next session):"));
      pending.forEach((echo) => {
        console.log(`- ${echo.id}: ${echo.text}`);
      });
    }
    if (delivered.length > 0) {
      console.log(c.magenta("Delivered (waiting for action):"));
      delivered.forEach((echo) => {
        console.log(`- ${echo.id}: ${echo.text}`);
      });
      console.log(c.gray("Use `vf echo park <id>` or `vf echo discard <id>`."));
    }
    return;
  }
  if (sub === "park" || sub === "discard") {
    const id = argsList[1];
    if (!id) {
      console.error("Echo id is required.");
      return;
    }
    const delivered = state.deliveredTimeEchoesByRepo[repoKey] || [];
    const target = delivered.find((echo) => echo.id === id);
    if (!target) {
      console.error("Echo not found or already handled.");
      return;
    }
    state.deliveredTimeEchoesByRepo[repoKey] = delivered.filter((echo) => echo.id !== id);
    if (sub === "park") {
      if (!state.repoParkedThoughtsByRepo[repoKey]) {
        state.repoParkedThoughtsByRepo[repoKey] = [];
      }
      const thought = normalizeParkedThought({ text: target.text, createdAt: nowIso() });
      state.repoParkedThoughtsByRepo[repoKey].push(thought);
      const active = ensureActiveSession(sessions, state, repoKey);
      if (active.session) {
        active.session.parkedThoughts.push(thought);
        active.session.lastActivityAt = nowIso();
        saveSessions(sessions);
      }
      saveState(state);
      console.log("Echo parked as a thought.");
      return;
    }
    saveState(state);
    console.log("Echo discarded.");
    return;
  }
  const text = argsList.join(" ").trim();
  if (!text) {
    console.error("Echo message is required.");
    return;
  }
  const active = ensureActiveSession(sessions, state, repoKey);
  if (!active.session) {
    if (active.autoEnded) {
      console.error("Session auto-ended due to inactivity. Run `vf start` to begin a new one.");
      printSessionSummary(active.endedSession, false);
      return;
    }
    console.error("No active session. Run `vf start` first.");
    return;
  }
  const echo = normalizeTimeEcho({
    text,
    createdAt: nowIso(),
    deliverAt: nowIso(),
    sourceSessionId: active.session.id
  });
  if (!active.session.timeEchoes) {
    active.session.timeEchoes = [];
  }
  active.session.timeEchoes.push(echo);
  active.session.lastActivityAt = nowIso();
  saveSessions(sessions);
  console.log("Time Echo queued for next session.");
};

const parseIdleMinutes = (value) => {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().toLowerCase();
  if (cleaned === "off" || cleaned === "disable" || cleaned === "0") {
    return 0;
  }
  const match = cleaned.match(/^(\d+)(h|m)?$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (match[2] === "h") {
    return amount * 60;
  }
  return amount;
};

const setIdle = (value) => {
  const state = loadState();
  if (!value) {
    const current = getIdleTimeoutMs(state);
    if (current === 0) {
      console.log("Idle timeout: disabled");
      return;
    }
    console.log(`Idle timeout: ${state.idleTimeoutMinutes} minutes`);
    return;
  }
  const minutes = parseIdleMinutes(value);
  if (minutes === null) {
    console.error("Invalid idle timeout. Use minutes (e.g. 90) or hours (e.g. 4h) or 'off'.");
    return;
  }
  state.idleTimeoutMinutes = minutes;
  saveState(state);
  if (minutes === 0) {
    console.log("Idle timeout disabled.");
    return;
  }
  console.log(`Idle timeout set to ${minutes} minutes.`);
};

const touch = () => {
  const repoKey = getRepoKey(process.cwd());
  const sessions = loadSessions();
  const state = loadState();
  const active = ensureActiveSession(sessions, state, repoKey);
  if (!active.session) {
    if (active.autoEnded) {
      console.error("Session auto-ended due to inactivity.");
      printSessionSummary(active.endedSession, false);
      return;
    }
    console.error("No active session. Run `vf start` first.");
    return;
  }
  active.session.lastActivityAt = nowIso();
  saveSessions(sessions);
  console.log("Session activity refreshed.");
};

const parseStartArgs = (values) => {
  let watch = false;
  let targetPath = null;
  for (const arg of values) {
    if (arg === "--watch" || arg === "--timer") {
      watch = true;
      continue;
    }
    if (!targetPath) {
      targetPath = arg;
    }
  }
  return { watch, targetPath };
};

const parseSttArgs = (values) => {
  const options = {
    setup: false,
    copy: false,
    intent: false,
    park: false,
    echo: false,
    device: null,
    lang: "en"
  };
  const rest = [];
  for (let i = 0; i < values.length; i += 1) {
    const arg = values[i];
    if (arg === "setup") {
      options.setup = true;
      continue;
    }
    if (arg === "--copy") {
      options.copy = true;
      continue;
    }
    if (arg === "--intent") {
      options.intent = true;
      continue;
    }
    if (arg === "--park") {
      options.park = true;
      continue;
    }
    if (arg === "--echo") {
      options.echo = true;
      continue;
    }
    if (arg === "--device") {
      options.device = values[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === "--lang") {
      options.lang = values[i + 1] || options.lang;
      i += 1;
      continue;
    }
    rest.push(arg);
  }
  return { options, rest };
};

const sttSetup = async () => {
  ensureSttDirs();
  const tempZip = path.join(os.tmpdir(), `vibeflow-whisper-${Date.now()}.zip`);
  const extractDir = path.join(os.tmpdir(), `vibeflow-whisper-${Date.now()}`);
  let binDir = path.join(STT_WHISPER_DIR, "bin", "win");
  let zipUrl = STT_WINDOWS_ZIP;
  if (process.platform === "darwin") {
    binDir = path.join(STT_WHISPER_DIR, "bin", "mac");
    zipUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${STT_RELEASE}/whisper-bin-macos.zip`;
  } else if (process.platform !== "win32") {
    binDir = path.join(STT_WHISPER_DIR, "bin", "linux");
    zipUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${STT_RELEASE}/whisper-bin-ubuntu-x64.zip`;
  }
  const modelDir = path.join(STT_WHISPER_DIR, "models");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });
  console.log("Downloading Whisper CLI...");
  await downloadFile(zipUrl, tempZip);
  console.log("Extracting Whisper CLI...");
  await extractZip(tempZip, extractDir);
  const exeName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const exe = findFileRecursive(extractDir, exeName) ||
    (process.platform === "win32" ? findFileRecursive(extractDir, "main.exe") : null);
  if (!exe) {
    console.error("Unable to locate whisper-cli in the archive.");
    return;
  }
  const destExe = path.join(binDir, exeName);
  fs.copyFileSync(exe, destExe);
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(destExe, 0o755);
    } catch {
      // ignore chmod failures
    }
  }
  const dllDir = path.dirname(exe);
  const dlls = fs.readdirSync(dllDir).filter((file) => file.toLowerCase().endsWith(".dll"));
  for (const dll of dlls) {
    fs.copyFileSync(path.join(dllDir, dll), path.join(binDir, dll));
  }
  console.log("Downloading Whisper model...");
  await downloadFile(STT_MODEL_URL, path.join(modelDir, STT_MODEL_NAME));
  try {
    fs.unlinkSync(tempZip);
  } catch {
    // ignore cleanup errors
  }
  console.log("STT setup complete.");
};

const recordWithFfmpeg = async (device, deviceIndex) => {
  if (!ffmpegPath) {
    console.error("ffmpeg not available. Please reinstall the CLI.");
    return null;
  }
  ensureSttDirs();
  const stamp = nowIso().replace(/[:.]/g, "-");
  const wavPath = path.join(STT_DIR, `stt-${stamp}.wav`);
  const args = [];
  if (process.platform === "win32") {
    args.push(
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
      "wav",
      wavPath
    );
  } else if (process.platform === "darwin") {
    args.push(
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "avfoundation",
      "-i",
      `:${deviceIndex}`,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      wavPath
    );
  } else {
    console.error("STT recording is not supported on this platform yet.");
    return null;
  }
  const proc = spawn(ffmpegPath, args, { windowsHide: true });
  console.log(c.green("Listening... press Enter to stop."));
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
  await new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGINT");
      } catch {
        // ignore
      }
    }, 2000);
    proc.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });
    try {
      proc.stdin.write("q");
    } catch {
      // ignore
    }
  });
  return wavPath;
};

const transcribeWithWhisper = async (wavPath, lang) => {
  const { binPath, modelPath } = resolveWhisperPaths();
  if (!binPath || !fs.existsSync(binPath)) {
    console.error("Whisper CLI not found. Run `vf stt setup` or set VF_WHISPER_BIN.");
    return null;
  }
  if (!fs.existsSync(modelPath)) {
    console.error("Whisper model not found. Run `vf stt setup` or set VF_WHISPER_MODEL.");
    return null;
  }
  const outputBase = wavPath.replace(/\.wav$/i, "");
  const outputFile = `${outputBase}.txt`;
  const args = ["-m", modelPath, "-f", wavPath, "-otxt", "-of", outputBase];
  if (lang) {
    args.push("-l", lang);
  }
  await new Promise((resolve) => {
    const proc = spawn(binPath, args, { windowsHide: true, cwd: path.dirname(binPath) });
    proc.on("exit", () => resolve());
  });
  if (!fs.existsSync(outputFile)) {
    return null;
  }
  const text = fs.readFileSync(outputFile, "utf8").trim();
  try {
    fs.unlinkSync(outputFile);
    fs.unlinkSync(wavPath);
  } catch {
    // ignore cleanup errors
  }
  return text || null;
};

const applySttText = (text, options) => {
  if (!text) {
    console.error("No speech detected.");
    return;
  }
  if (options.intent) {
    setIntent(text);
    return;
  }
  if (options.park) {
    parkThought(text);
    return;
  }
  if (options.echo) {
    echoCommand([text]);
    return;
  }
  if (options.copy) {
    if (!clipboardy) {
      console.error("Clipboard support not available.");
      return;
    }
    try {
      clipboardy.writeSync(text);
      console.log(c.gray("Copied to clipboard."));
    } catch {
      console.error("Failed to copy to clipboard.");
    }
    return;
  }
  console.log(text);
};

const sttCommand = async (argsList) => {
  const parsed = parseSttArgs(argsList);
  if (parsed.options.setup) {
    await sttSetup();
    return;
  }
  if (!process.stdin.isTTY) {
    console.error("STT requires a TTY. Run this in an interactive terminal.");
    return;
  }
  if (!ffmpegPath) {
    console.error("ffmpeg is required. Reinstall the CLI or set PATH.");
    return;
  }
  if (!clipboardy && parsed.options.copy) {
    console.error("Clipboard support is unavailable on this system.");
    return;
  }
  const config = loadSttConfig();
  if (parsed.options.device) {
    if (process.platform === "win32") {
      config.winDevice = parsed.options.device;
    } else if (process.platform === "darwin") {
      const idx = Number.parseInt(parsed.options.device, 10);
      if (!Number.isNaN(idx)) {
        config.macAudioIndex = idx;
      }
    }
    saveSttConfig(config);
  }
  let device = config.winDevice;
  let deviceIndex = config.macAudioIndex;
  if (process.platform === "win32" && !device) {
    device = await detectWindowsDevice();
    if (device) {
      config.winDevice = device;
      saveSttConfig(config);
    }
  }
  if (process.platform === "darwin" && (deviceIndex === null || deviceIndex === undefined)) {
    deviceIndex = await detectMacAudioIndex();
    if (deviceIndex !== null && deviceIndex !== undefined) {
      config.macAudioIndex = deviceIndex;
      saveSttConfig(config);
    }
  }
  if (process.platform === "win32" && !device) {
    console.error("Microphone device not found. Use `vf stt --device \"Name\"`.");
    return;
  }
  if (process.platform === "darwin" && (deviceIndex === null || deviceIndex === undefined)) {
    console.error("Microphone device not found. Use `vf stt --device <index>`.");
    return;
  }
  const wavPath = await recordWithFfmpeg(device, deviceIndex);
  if (!wavPath || !fs.existsSync(wavPath)) {
    console.error("Recording failed.");
    return;
  }
  const stat = fs.statSync(wavPath);
  if (stat.size < 8192) {
    console.error("Recording too short.");
    return;
  }
  const text = await transcribeWithWhisper(wavPath, parsed.options.lang);
  applySttText(text, parsed.options);
};

const run = async () => {
  switch (command) {
    case "start":
      {
        const parsed = parseStartArgs(args.slice(1));
        startSession(parsed.targetPath, parsed.watch);
      }
      break;
    case "intent":
      setIntent(args.slice(1).join(" "));
      break;
    case "park":
      parkThought(args.slice(1).join(" "));
      break;
    case "status":
      status(args.includes("--watch"));
      break;
    case "timer":
      timer();
      break;
    case "resume":
      resume(args[1]);
      break;
    case "history":
      history(args[1]);
      break;
    case "idle":
      setIdle(args[1]);
      break;
    case "touch":
      touch();
      break;
    case "end":
      end();
      break;
    case "receipt":
      receipt(args[1]);
      break;
    case "echo":
      echoCommand(args.slice(1));
      break;
    case "stt":
      await sttCommand(args.slice(1));
      break;
    case "help":
    case "-h":
    case "--help":
    case undefined:
      usage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
};

run().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
