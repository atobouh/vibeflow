#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

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
    idleTimeoutMinutes: DEFAULT_IDLE_MINUTES
  });
  if (!data || typeof data !== "object") {
    return { activeByRepo: {}, idleTimeoutMinutes: DEFAULT_IDLE_MINUTES };
  }
  return {
    activeByRepo: data.activeByRepo || {},
    idleTimeoutMinutes:
      typeof data.idleTimeoutMinutes === "number" ? data.idleTimeoutMinutes : DEFAULT_IDLE_MINUTES
  };
};

const saveState = (state) => {
  saveJson(STATE_FILE, state);
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
  return session;
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
  active.session.parkedThoughts.push({ text: value, createdAt: nowIso() });
  active.session.lastActivityAt = nowIso();
  saveSessions(sessions);
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
    return;
  }
  if (active.autoEnded && active.endedSession) {
    console.log("Last session (auto-ended due to inactivity):");
    printSessionSummary(active.endedSession, false);
    return;
  }
  const last = getLastSessionForRepo(sessions, repoKey);
  if (!last) {
    console.log("No sessions found for this repo.");
    return;
  }
  console.log("Last session:");
  printSessionSummary(last, false);
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
