import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

type TabState = {
  id: string;
  title: string;
  iconClass: string;
  iconColor: string;
  accentColor?: string;
  kind: "terminal" | "settings" | "history";
  container: HTMLDivElement;
  chat: Array<{ text: string; time: string }>;
  term?: Terminal;
  fitAddon?: FitAddon;
  shellKind?: ShellKind;
  outputBuffer?: string;
  readOutputBuffer?: string;
  currentLine?: string;
  lastCommand?: string;
  escapeSequence?: string | null;
  followOutput?: boolean;
  cwd?: string;
  projectRoot?: string | null;
  timeEchoes?: Array<{
    id: string;
    text: string;
    createdAt: string;
    deliverAt: string;
  }>;
  echoesConsumed?: boolean;
  lastUserActionAt?: number;
  lastOutputAt?: number;
  displayElapsedMs?: number;
  lastDisplayTick?: number;
  sessionStartedAt?: string;
  activityUntil?: number;
  activityTimer?: number;
};

type ShellKind = "powershell" | "cmd" | "bash" | "zsh" | "fish" | "unknown";

const terminalStack = document.getElementById("terminal-stack");
const terminalShell = document.getElementById("terminal-container");
const toolPanel = document.getElementById("tool-panel");
const fileTree = document.getElementById("vf-file-tree");
const filePath = document.getElementById("vf-file-path");
const fileContent = document.getElementById("vf-file-content");
const fileRefresh = document.getElementById("vf-files-refresh");
const fileToggle = document.getElementById("vf-files-toggle");
const tabsContainer = document.getElementById("tab-container");
const tabAddButton = document.getElementById("vf-tab-add");
const contextPanel = document.getElementById("context-panel");
const contextToggle = document.getElementById("vf-context-toggle");
const contextIcon = document.getElementById("vf-context-icon");
const terminalScrollbar = document.getElementById("vf-terminal-scrollbar");
const terminalScrollbarThumb = document.getElementById("vf-terminal-scrollbar-thumb");
const welcomePane = document.getElementById("new-tab-screen");
const welcomeSelect = document.getElementById("vf-welcome-select");
const recentWrap = document.getElementById("vf-recent-wrap");
const recentList = document.getElementById("vf-recent-list");

const contextIntent = document.getElementById("vf-context-intent");
const contextFlowTime = document.getElementById("vf-context-flow-time");
const contextFlowLabel = document.getElementById("vf-context-flow-label");
const contextFlowIcon = document.getElementById("vf-context-flow-icon");
const contextFlowBar = document.getElementById("vf-context-flow-bar");
const contextThoughts = document.getElementById("vf-context-thoughts");
const contextIntentAction = document.getElementById("vf-action-intent");
const contextThoughtAction = document.getElementById("vf-action-thought");
const contextEchoAction = document.getElementById("vf-action-echo");
const contextCopy = document.getElementById("vf-context-copy");
const contextEchoes = document.getElementById("vf-context-echoes");
const contextEchoList = document.getElementById("vf-echo-list");

const chatLog = document.getElementById("vf-chat-log");
const chatInput = document.getElementById("vf-chat-text") as HTMLInputElement | null;
const chatFile = document.getElementById("vf-chat-file") as HTMLInputElement | null;
const chatAttach = document.getElementById("vf-chat-attach");
const chatSend = document.getElementById("vf-chat-send");
const chatAgent = document.getElementById("vf-chat-agent");
const commandDock = document.getElementById("command-dock");
const chatToggle = document.getElementById("vf-chat-toggle");
const chatExpand = document.getElementById("vf-chat-expand");
const chatCollapsed = document.getElementById("vf-chat-collapsed");
const terminalJump = document.getElementById("vf-terminal-jump");
const quickIntent = document.getElementById("vf-intent-quick");
  const terminalAttach = document.getElementById("vf-terminal-attach");
  const terminalFile = document.getElementById("vf-terminal-file") as HTMLInputElement | null;
  const terminalActions = document.getElementById("vf-terminal-actions");
const voiceOverlay = document.getElementById("vf-voice-overlay");
const voiceText = document.getElementById("vf-voice-text");
const settingsOpen = document.getElementById("vf-settings-open");
const historyOpen = document.getElementById("vf-history-open");
const tabColorMenu = document.getElementById("vf-tab-color-menu");
const tabColorOptions = document.getElementById("vf-tab-color-options");
const tabColorClear = document.getElementById("vf-tab-color-clear");

const minimizeButton = document.getElementById("vf-window-minimize");
const maximizeButton = document.getElementById("vf-window-maximize");
const maximizeIcon = document.getElementById("vf-window-maximize-icon");
const closeButton = document.getElementById("vf-window-close");

const resumeOverlay = document.getElementById("resume-screen");
const resumeSub = document.getElementById("vf-resume-sub");
const resumeRepo = document.getElementById("vf-resume-repo");
const resumeTrace = document.getElementById("vf-resume-trace");
const resumeDuration = document.getElementById("vf-resume-duration");
const resumeIntent = document.getElementById("vf-resume-intent");
const resumeFlow = document.getElementById("vf-resume-flow");
const resumeFlowDetail = document.getElementById("vf-resume-flow-detail");
const resumeNext = document.getElementById("vf-resume-next");
const resumeContinue = document.getElementById("vf-resume-continue");
const resumeNew = document.getElementById("vf-resume-new");
const copyButton = document.getElementById("vf-copy-context");
const overlay = document.getElementById("intent-popup");
const overlayInput = document.getElementById("vf-input") as HTMLInputElement | null;

const receiptOverlay = document.getElementById("receipt-screen");
const receiptSummary = document.getElementById("vf-receipt-summary");
const receiptDuration = document.getElementById("vf-receipt-duration");
const receiptIntents = document.getElementById("vf-receipt-intents");
const receiptContext = document.getElementById("vf-receipt-context");
const receiptDiffIntent = document.getElementById("vf-receipt-diff-intent");
const receiptDiffFiles = document.getElementById("vf-receipt-diff-files");
const receiptFlow = document.getElementById("vf-receipt-flow");
const receiptCopy = document.getElementById("vf-receipt-copy");
const receiptClose = document.getElementById("vf-receipt-close");
const receiptNew = document.getElementById("vf-receipt-new");
const timeEchoScreen = document.getElementById("time-echo-screen");
const timeEchoText = document.getElementById("vf-time-echo-text");
const confirmOverlay = document.getElementById("vf-confirm-overlay");
const confirmTitle = document.getElementById("vf-confirm-title");
const confirmMessage = document.getElementById("vf-confirm-message");
const confirmCancel = document.getElementById("vf-confirm-cancel");
const confirmOk = document.getElementById("vf-confirm-ok");

const DEBUG_UI = (() => {
  try {
    return localStorage.getItem("vf-debug") === "1";
  } catch {
    return false;
  }
})();

const UI_IDLE_THRESHOLD_MS = 8_000;
const UI_PAUSED_THRESHOLD_MS = 5 * 60 * 1000;

const logUi = (...args: unknown[]) => {
  if (DEBUG_UI) {
    console.log("[vibeflow-ui]", ...args);
  }
};

if (
  !terminalStack ||
  !terminalShell ||
  !toolPanel ||
  !fileTree ||
  !filePath ||
  !fileContent ||
  !fileRefresh ||
  !fileToggle ||
  !tabsContainer ||
  !tabAddButton ||
  !contextPanel ||
  !terminalScrollbar ||
  !terminalScrollbarThumb ||
  !welcomePane ||
  !welcomeSelect ||
  !contextToggle ||
  !contextIcon ||
  !contextIntent ||
  !contextFlowTime ||
  !contextFlowLabel ||
  !contextFlowIcon ||
  !contextFlowBar ||
  !contextThoughts ||
  !contextIntentAction ||
  !contextThoughtAction ||
  !contextEchoAction ||
  !contextCopy ||
  !contextEchoes ||
  !contextEchoList ||
  !chatLog ||
  !chatInput ||
  !chatFile ||
  !chatAttach ||
  !chatSend ||
  !chatAgent ||
  !commandDock ||
  !chatToggle ||
  !chatExpand ||
  !chatCollapsed ||
  !terminalJump ||
  !terminalAttach ||
  !terminalFile ||
  !terminalActions ||
  !quickIntent ||
  !voiceOverlay ||
  !voiceText ||
  !settingsOpen ||
  !historyOpen ||
  !tabColorMenu ||
  !tabColorOptions ||
  !tabColorClear ||
  !minimizeButton ||
  !maximizeButton ||
  !maximizeIcon ||
  !closeButton ||
  !resumeOverlay ||
  !resumeSub ||
  !resumeRepo ||
  !resumeTrace ||
  !resumeDuration ||
  !resumeIntent ||
  !resumeFlow ||
  !resumeFlowDetail ||
  !resumeNext ||
  !resumeContinue ||
  !resumeNew ||
  !copyButton ||
  !overlay ||
  !overlayInput ||
  !recentWrap ||
  !recentList ||
  !receiptOverlay ||
  !receiptSummary ||
  !receiptDuration ||
  !receiptIntents ||
  !receiptContext ||
  !receiptDiffIntent ||
  !receiptDiffFiles ||
  !receiptFlow ||
  !receiptCopy ||
  !receiptClose ||
  !receiptNew ||
  !timeEchoScreen ||
  !timeEchoText ||
  !confirmOverlay ||
  !confirmTitle ||
  !confirmMessage ||
  !confirmCancel ||
  !confirmOk
) {
  throw new Error("UI missing required elements");
}

const tabs = new Map<string, TabState>();
let tabOrder: string[] = [];
let activeTabId: string | null = null;
let overlayTabId: string | null = null;
let receiptAction: (() => void) | null = null;
let receiptText = "";
let resumeSession: SessionRecord | null = null;
let audioEnabled = true;
let audioContext: AudioContext | null = null;
let flashTimer: number | null = null;
const isIdleScreenOpen = () => welcomePane.classList.contains("is-open");
let chatIsCollapsed = false;
let settingsAudioInput: HTMLInputElement | null = null;
let settingsVibeTraceInput: HTMLInputElement | null = null;
let settingsVibeTraceRepoSelect: HTMLSelectElement | null = null;
let settingsSessionSelect: HTMLSelectElement | null = null;
let settingsRepoSelect: HTMLSelectElement | null = null;
let settingsDeleteSessionButton: HTMLButtonElement | null = null;
let settingsDeleteRepoButton: HTMLButtonElement | null = null;
let settingsVersionLabel: HTMLElement | null = null;
let historyRepoList: HTMLElement | null = null;
let historySessionList: HTMLElement | null = null;
let historySelectedRepo: string | null = null;
let historySessionsCache: SessionRecord[] = [];
let openHistorySessionId: string | null = null;
let toolPanelCollapsed = false;
let confirmAction: (() => void) | null = null;
let settingsRepoStats = new Map<string, { name: string; count: number }>();
const fileActivityByTab = new Map<string, Map<string, { type: "read" | "write"; expiresAt: number }>>();
const fileActivityTimers = new Map<string, number>();
const tabActivityTimers = new Map<string, number>();
const selectedFileByTab = new Map<string, string>();
let isScrollDragging = false;
let includeVibeTrace = false;
let tabColorTargetId: string | null = null;

const TAB_COLOR_CHOICES = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#f43f5e"
];

const openTabColorMenu = (tabId: string, x: number, y: number) => {
  if (!tabColorMenu || !tabColorOptions || !tabColorClear) {
    return;
  }
  tabColorTargetId = tabId;
  tabColorOptions.innerHTML = "";
  for (const color of TAB_COLOR_CHOICES) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "tab-color-swatch";
    swatch.style.background = color;
    swatch.addEventListener("click", () => {
      const tab = tabs.get(tabId);
      if (tab) {
        tab.accentColor = color;
        renderTabs();
      }
      closeTabColorMenu();
    });
    tabColorOptions.appendChild(swatch);
  }
  tabColorClear.onclick = () => {
    const tab = tabs.get(tabId);
    if (tab) {
      tab.accentColor = undefined;
      renderTabs();
    }
    closeTabColorMenu();
  };
  tabColorMenu.style.left = `${x}px`;
  tabColorMenu.style.top = `${y}px`;
  tabColorMenu.classList.add("is-open");
  tabColorMenu.setAttribute("aria-hidden", "false");
};

const closeTabColorMenu = () => {
  if (!tabColorMenu) {
    return;
  }
  tabColorMenu.classList.remove("is-open");
  tabColorMenu.setAttribute("aria-hidden", "true");
  tabColorTargetId = null;
};

const getStoredBool = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    if (value === null) {
      return fallback;
    }
    return value === "1";
  } catch {
    return fallback;
  }
};

const setStoredBool = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
};

audioEnabled = getStoredBool("vf-ui-audio", true);

const insertTextAtCursor = (input: HTMLInputElement, text: string) => {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const next = `${before}${text}${after}`;
  const cursor = start + text.length;
  input.value = next;
  input.setSelectionRange(cursor, cursor);
  input.focus();
};

const handleImagePaste = async (event: ClipboardEvent, target: HTMLInputElement) => {
  if (!event.clipboardData) {
    return;
  }
  const hasImage = Array.from(event.clipboardData.items || []).some((item) =>
    item.type.startsWith("image/")
  );
  if (!hasImage) {
    return;
  }
  event.preventDefault();
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  const repoKey = tab.projectRoot || tab.cwd || null;
  const relPath = await window.vibeflow.saveClipboardImage(repoKey);
  if (!relPath) {
    return;
  }
  insertTextAtCursor(target, relPath);
  if (activeTabId) {
    markUserActivity(activeTabId);
  }
  playClick();
};

const handleImageFileUpload = async (file: File, target: HTMLInputElement) => {
  if (!file || !file.type.startsWith("image/")) {
    return;
  }
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  const repoKey = tab.projectRoot || tab.cwd || null;
  const buffer = await file.arrayBuffer();
  const relPath = await window.vibeflow.saveImageFile(
    repoKey,
    file.name || "image.png",
    new Uint8Array(buffer)
  );
  if (!relPath) {
    return;
  }
  insertTextAtCursor(target, relPath);
  if (activeTabId) {
    markUserActivity(activeTabId);
  }
  playClick();
};

const insertTextIntoTerminal = (tabId: string, text: string) => {
  if (!text) {
    return;
  }
  window.vibeflow.write(tabId, text);
  const tab = tabs.get(tabId);
  if (tab) {
    tab.currentLine = `${tab.currentLine || ""}${text}`;
    markUserActivity(tabId);
    markTabActivity(tabId);
  }
};

const insertPathIntoTerminal = (tabId: string, relPath: string) =>
  insertTextIntoTerminal(tabId, relPath);

const handleTerminalImageUpload = async (file: File, tabId: string) => {
  if (!file || !file.type.startsWith("image/")) {
    return;
  }
  const tab = tabs.get(tabId);
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  const repoKey = tab.projectRoot || tab.cwd || null;
  const buffer = await file.arrayBuffer();
  const relPath = await window.vibeflow.saveImageFile(
    repoKey,
    file.name || "image.png",
    new Uint8Array(buffer)
  );
  if (!relPath) {
    return;
  }
  insertPathIntoTerminal(tabId, relPath);
  playClick();
};

const setTerminalStdin = (term: Terminal, enabled: boolean) => {
  const termAny = term as unknown as {
    setOption?: (key: string, value: boolean) => void;
    options?: { disableStdin?: boolean };
  };
  if (typeof termAny.setOption === "function") {
    termAny.setOption("disableStdin", !enabled);
    return;
  }
  if (!termAny.options) {
    termAny.options = {};
  }
  termAny.options.disableStdin = !enabled;
};

const sendCommandToTerminal = (tabId: string, input: string, shellKind: ShellKind) => {
  const newline = shellKind === "powershell" || shellKind === "cmd" ? "\r" : "\n";
  window.vibeflow.write(tabId, `${input}${newline}`);
  markTabActivity(tabId);
};

const stripAnsi = (value: string) =>
  value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001bO./g, "");

const sanitizeTerminalText = (value: string) =>
  stripAnsi(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();

const getViewportY = (term: Terminal) =>
  (term as unknown as { buffer?: { active?: { viewportY?: number } } }).buffer?.active
    ?.viewportY ?? 0;

const getBaseY = (term: Terminal) =>
  (term as unknown as { buffer?: { active?: { baseY?: number } } }).buffer?.active?.baseY ?? 0;

const isTerminalAtBottom = (term: Terminal) => {
  const baseY = getBaseY(term);
  const viewportY = getViewportY(term);
  return viewportY >= baseY - 1;
};

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const extractReadPaths = (line: string) => {
  const results: string[] = [];
  const cleaned = line.trim();
  if (!cleaned) {
    return results;
  }
  const commandMatch = cleaned.match(/\b(?:get-content|cat|type|bat)\b\s+([^\s]+?)(?:\s|$)/i);
  if (commandMatch?.[1]) {
    const candidate = commandMatch[1].replace(/^['"]|['"]$/g, "").replace(/[),.;]+$/g, "");
    results.push(candidate);
    return results;
  }
  const ranMatch = cleaned.match(
    /\b(?:ran\s+)(?:get-content|cat|type|bat)\b\s+([^\s]+?)(?:\s|$)/i
  );
  if (ranMatch?.[1]) {
    const candidate = ranMatch[1].replace(/^['"]|['"]$/g, "").replace(/[),.;]+$/g, "");
    results.push(candidate);
    return results;
  }
  const readInline = cleaned.match(/\b(?:reading|read|opened|opening)\b\s+([^\s]+)$/i);
  if (readInline?.[1]) {
    results.push(readInline[1].replace(/^['"]|['"]$/g, ""));
    return results;
  }
  const patterns = [
    /^([A-Za-z]:[\\/][^:\s]+?\.[\w.-]+):\d+/,
    /^(\/[^:\s]+?\.[\w.-]+):\d+/,
    /^([A-Za-z0-9._-][^:\s]*\.[\w.-]+):\d+/
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      results.push(match[1]);
      return results;
    }
  }
  const readMatch = cleaned.match(/\b(reading|read|opening|open)\b[^:]*:\s*(.+)$/i);
  if (readMatch?.[2]) {
    const candidate = readMatch[2].replace(/^['"]|['"]$/g, "");
    const firstToken = candidate.split(/\s+/)[0];
    if (firstToken) {
      results.push(firstToken);
    }
  }
  return results;
};

const openConfirm = (options: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) => {
  confirmTitle.textContent = options.title;
  confirmMessage.textContent = options.message;
  confirmOk.textContent = options.confirmLabel || "Confirm";
  confirmOverlay.style.display = "flex";
  confirmOverlay.setAttribute("aria-hidden", "false");
  confirmAction = options.onConfirm;
};

const closeConfirm = () => {
  confirmOverlay.style.display = "none";
  confirmOverlay.setAttribute("aria-hidden", "true");
  confirmAction = null;
};

const setTerminalInputEnabled = (enabled: boolean) => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab || tab.kind !== "terminal" || !tab.term) {
    return;
  }
  setTerminalStdin(tab.term, enabled);
  if (enabled) {
    tab.term.focus();
  }
};
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let sttActive = false;
let sttTargetInput: HTMLInputElement | null = null;
let sttPhase: "idle" | "listening" | "processing" = "idle";
const sttDebug = (() => {
  try {
    return localStorage.getItem("vf-stt-debug") === "1";
  } catch {
    return false;
  }
})();

const logStt = (...args: unknown[]) => {
  if (!(sttDebug || DEBUG_UI)) {
    return;
  }
  console.log("[vibeflow-stt]", ...args);
  try {
    const message = args
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join(" ");
    window.vibeflow.logStt(message);
  } catch {
    // ignore
  }
};

const resolveVoiceTarget = () => {
  if (overlayMode && overlayInput) {
    return overlayInput;
  }
  if (!chatInput) {
    return null;
  }
  if (chatIsCollapsed) {
    setChatCollapsed(false);
  }
  return chatInput;
};

const resolveVoiceTargetForStt = () => {
  if (overlayMode && overlayInput) {
    return overlayInput;
  }
  if (!chatInput) {
    return null;
  }
  if (chatIsCollapsed) {
    return null;
  }
  return chatInput;
};

const showVoiceOverlay = (
  active: boolean,
  text = "",
  phase: "idle" | "listening" | "processing" = "idle"
) => {
  voiceOverlay.classList.toggle("is-open", active);
  voiceOverlay.classList.toggle("is-listening", active && phase === "listening");
  voiceOverlay.classList.toggle("is-processing", active && phase === "processing");
  voiceOverlay.setAttribute("aria-hidden", (!active).toString());
  voiceText.textContent = text;
  sttPhase = active ? phase : "idle";
};

const startVoiceInput = () => {
  if (sttActive) {
    logStt("toggle-stop");
    showVoiceOverlay(true, "Processing...", "processing");
    void window.vibeflow.stopStt().then((ok) => {
      if (!ok) {
        sttActive = false;
        sttTargetInput = null;
        showVoiceOverlay(false, "");
      }
    });
    return;
  }
  const targetInput = resolveVoiceTargetForStt();
  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  if (!targetInput && !(chatIsCollapsed && activeTab?.kind === "terminal")) {
    return;
  }
  sttTargetInput = targetInput;
  sttActive = true;
  showVoiceOverlay(true, "Listening...", "listening");
  logStt("start-recording");
  void window.vibeflow.startStt().then((ok) => {
    if (!ok && sttActive) {
      sttActive = false;
      showVoiceOverlay(true, "STT not ready.", "processing");
      window.setTimeout(() => showVoiceOverlay(false, ""), 1800);
    }
  });
};

type LastSession = Awaited<ReturnType<typeof window.vibeflow.getLastSession>>;
type ActiveSession = Awaited<ReturnType<typeof window.vibeflow.getActiveSession>>;
type SessionRecord = NonNullable<LastSession>;
type SessionList = Awaited<ReturnType<typeof window.vibeflow.getAllSessions>>;

const flowLabelText: Record<string, string> = {
  "deep-flow": "Optimal",
  drift: "Drift",
  "context-loss": "Context loss",
  steady: "Steady"
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const formatClock = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");
  return `${minutes}:${paddedSeconds}`;
};

const markUserActivity = (tabId: string) => {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }
  tab.lastUserActionAt = Date.now();
};

const TAB_ACTIVITY_MS = 1800;

const markTabActivity = (tabId: string) => {
  const tab = tabs.get(tabId);
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  const now = Date.now();
  const wasActive = tab.activityUntil && tab.activityUntil > now;
  tab.activityUntil = now + TAB_ACTIVITY_MS;
  if (!wasActive) {
    renderTabs();
  }
  const existing = tabActivityTimers.get(tabId);
  if (existing) {
    window.clearTimeout(existing);
  }
  const timer = window.setTimeout(() => {
    const current = tabs.get(tabId);
    if (current && current.activityUntil && current.activityUntil <= Date.now()) {
      current.activityUntil = undefined;
      renderTabs();
    }
    tabActivityTimers.delete(tabId);
  }, TAB_ACTIVITY_MS + 80);
  tabActivityTimers.set(tabId, timer);
};

const formatHms = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const formatTime = (iso: string | undefined) => {
  if (!iso) {
    return "unknown";
  }
  const date = new Date(iso);
  return date.toLocaleString();
};

const ensureAudioContext = () => {
  if (!audioEnabled) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
};

const playTone = (
  startFreq: number,
  endFreq: number,
  durationMs: number,
  type: OscillatorType,
  volume: number
) => {
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + durationMs / 1000);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
};

const playClick = () => {
  playTone(900, 600, 45, "triangle", 0.035);
};

const playTick = () => {
  playTone(1200, 900, 60, "square", 0.03);
};

const playWhoosh = () => {
  playTone(420, 120, 240, "sine", 0.05);
};

const titleFromPath = (projectRoot: string | null, cwd: string) => {
  const target = projectRoot || cwd;
  const cleaned = target.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || target;
};

const uniqueTitle = (base: string) => {
  let title = base;
  let counter = 2;
  const existing = new Set(Array.from(tabs.values()).map((tab) => tab.title));
  while (existing.has(title)) {
    title = `${base} (${counter})`;
    counter += 1;
  }
  return title;
};

const findTerminalTabByPath = (path: string) => {
  for (const tab of tabs.values()) {
    if (tab.kind !== "terminal") {
      continue;
    }
    const tabPath = tab.projectRoot || tab.cwd;
    if (tabPath === path) {
      return tab;
    }
  }
  return null;
};

const specialTabs = {
  settings: {
    id: "vf-settings",
    title: "Settings",
    iconClass: "fa-gear",
    iconColor: "#60a5fa"
  },
  history: {
    id: "vf-history",
    title: "History",
    iconClass: "fa-clock-rotate-left",
    iconColor: "#f59e0b"
  }
};

const iconSets = [
  {
    keywords: ["api", "server", "backend"],
    icons: ["fa-server", "fa-network-wired"],
    color: "#34d399"
  },
  {
    keywords: ["web", "client", "frontend", "ui"],
    icons: ["fa-window-maximize", "fa-desktop"],
    color: "#60a5fa"
  },
  {
    keywords: ["db", "data", "postgres", "mysql", "mongo"],
    icons: ["fa-database", "fa-table"],
    color: "#f59e0b"
  },
  {
    keywords: ["infra", "ops", "deploy", "cloud"],
    icons: ["fa-cloud", "fa-sitemap"],
    color: "#a78bfa"
  },
  {
    keywords: ["cli", "tool", "script"],
    icons: ["fa-terminal", "fa-wrench"],
    color: "#9ca3af"
  },
  {
    keywords: ["auth", "security", "login"],
    icons: ["fa-shield-halved", "fa-lock"],
    color: "#f87171"
  },
  {
    keywords: ["docs", "doc", "wiki"],
    icons: ["fa-book", "fa-file-lines"],
    color: "#38bdf8"
  },
  {
    keywords: ["test", "spec"],
    icons: ["fa-vial", "fa-flask"],
    color: "#f472b6"
  },
  {
    keywords: ["mobile", "ios", "android"],
    icons: ["fa-mobile-screen", "fa-tablet-screen-button"],
    color: "#22d3ee"
  },
  {
    keywords: ["ai", "ml", "model"],
    icons: ["fa-brain", "fa-robot"],
    color: "#c084fc"
  }
];

const pickIconForName = (name: string) => {
  const lower = name.toLowerCase();
  for (const group of iconSets) {
    if (group.keywords.some((keyword) => lower.includes(keyword))) {
      const icon = group.icons[Math.floor(Math.random() * group.icons.length)];
      return { iconClass: icon, iconColor: group.color };
    }
  }
  const fallback = ["fa-folder-open", "fa-code-branch", "fa-cube"];
  return {
    iconClass: fallback[Math.floor(Math.random() * fallback.length)],
    iconColor: "#60a5fa"
  };
};

const renderSettingsPane = (container: HTMLDivElement) => {
  container.innerHTML = `
    <div class="panel-pane">
      <div class="panel-header">
        <div>
          <div class="panel-title">Settings</div>
          <div class="panel-subtitle">Memory, control, and trust.</div>
        </div>
      </div>
      <div class="panel-grid">
        <div class="panel-card">
          <h3>Audio Cues</h3>
          <div class="settings-row">
            <div>
              <div>Subtle UI sounds</div>
              <div class="settings-hint">Click, focus, and resume cues.</div>
            </div>
            <label class="toggle">
              <input id="vf-setting-audio" type="checkbox" />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        </div>
        <div class="panel-card">
          <h3>VibeTrace</h3>
          <div class="settings-field">
            <label for="vf-vibetrace-repo-select">Repo</label>
            <select id="vf-vibetrace-repo-select" class="settings-select"></select>
          </div>
          <div class="settings-row">
            <div>
              <div>Include VibeTrace in repo</div>
              <div class="settings-hint">Writes .vibeflow/trace.json alongside your code.</div>
            </div>
            <label class="toggle">
              <input id="vf-setting-vibetrace" type="checkbox" />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        </div>
        <div class="panel-card">
          <h3>Commands</h3>
          <div class="settings-list">
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Open repository</div>
                <div class="settings-command-hint">Choose a folder to start or resume a session.</div>
              </div>
              <kbd>Ctrl+O</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Set intent</div>
                <div class="settings-command-hint">Capture the current session goal in one sentence.</div>
              </div>
              <kbd>Alt+I</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Park thought</div>
                <div class="settings-command-hint">Save a quick note without breaking flow.</div>
              </div>
              <kbd>Alt+P</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Voice input</div>
                <div class="settings-command-hint">Dictate into chat, intent, or echo fields.</div>
              </div>
              <kbd>Ctrl+Shift+S</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Time Echo</div>
                <div class="settings-command-hint">Leave a message for your future self.</div>
              </div>
              <kbd>Alt+E</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Send command</div>
                <div class="settings-command-hint">Runs the command from the chat dock.</div>
              </div>
              <kbd>Enter</kbd>
            </div>
            <div class="settings-command">
              <div class="settings-command-text">
                <div class="settings-command-title">Save intent (terminal)</div>
                <div class="settings-command-hint">Uses the current terminal line as intent.</div>
              </div>
              <kbd>Button</kbd>
            </div>
          </div>
        </div>
        <div class="panel-card settings-danger">
          <h3>Data Controls</h3>
          <div class="settings-field">
            <label for="vf-settings-session-select">Delete session</label>
            <select id="vf-settings-session-select" class="settings-select"></select>
            <button id="vf-settings-session-delete" class="danger-button" type="button">
              Delete session
            </button>
          </div>
          <div class="settings-field" style="margin-top: 16px;">
            <label for="vf-settings-repo-select">Delete repo context</label>
            <select id="vf-settings-repo-select" class="settings-select"></select>
            <button id="vf-settings-repo-delete" class="danger-button" type="button">
              Delete repo context
            </button>
          </div>
        </div>
        <div class="panel-card">
          <h3>Session Trust</h3>
          <div class="settings-hint">All session data is stored locally on this device.</div>
        </div>
        <div class="panel-card">
          <h3>About</h3>
          <div class="settings-about">
            <div class="about-row">
              <div class="about-meta">
                <div class="about-title">Built by Dev Kuns</div>
                <div class="about-sub">Creator • vibeathon</div>
              </div>
              <button
                class="about-link"
                type="button"
                data-external-url="https://github.com/atobouh"
              >
                GitHub
              </button>
            </div>
            <div class="about-row">
              <div class="about-meta">
                <div class="about-title">BridgeMind</div>
                <div class="about-sub">Community • join the conversation</div>
              </div>
              <button
                class="about-link"
                type="button"
                data-external-url="https://discord.gg/bridgemind"
              >
                Discord
              </button>
            </div>
            <div class="about-row">
              <div class="about-meta">
                <div class="about-title">VibeFlow Version</div>
                <div id="vf-about-version" class="about-sub">Loading...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  settingsAudioInput = container.querySelector("#vf-setting-audio") as HTMLInputElement | null;
  settingsVibeTraceInput = container.querySelector(
    "#vf-setting-vibetrace"
  ) as HTMLInputElement | null;
  settingsVibeTraceRepoSelect = container.querySelector(
    "#vf-vibetrace-repo-select"
  ) as HTMLSelectElement | null;
  settingsSessionSelect = container.querySelector("#vf-settings-session-select") as
    | HTMLSelectElement
    | null;
  settingsRepoSelect = container.querySelector("#vf-settings-repo-select") as HTMLSelectElement | null;
  settingsDeleteSessionButton = container.querySelector("#vf-settings-session-delete") as
    | HTMLButtonElement
    | null;
  settingsDeleteRepoButton = container.querySelector("#vf-settings-repo-delete") as
    | HTMLButtonElement
    | null;
  settingsVersionLabel = container.querySelector("#vf-about-version");
  updateAudioToggle();
  void updateVibeTraceToggle();
  settingsAudioInput?.addEventListener("change", () => {
    audioEnabled = !!settingsAudioInput?.checked;
    setStoredBool("vf-ui-audio", audioEnabled);
    if (audioEnabled) {
      playClick();
    }
  });
  settingsVibeTraceInput?.addEventListener("change", async () => {
    const repoKey = settingsVibeTraceRepoSelect?.value || null;
    if (!repoKey) {
      return;
    }
    const next = !!settingsVibeTraceInput?.checked;
    includeVibeTrace = await window.vibeflow.setVibeTraceInclude(repoKey, next);
    playClick();
  });
  void refreshSettingsData();
  settingsDeleteSessionButton?.addEventListener("click", () => {
    if (!settingsSessionSelect?.value) {
      return;
    }
    const sessionId = settingsSessionSelect.value;
    openConfirm({
      title: "Delete session?",
      message: "This will permanently delete the selected session. It cannot be recovered.",
      confirmLabel: "Delete session",
      onConfirm: async () => {
        await window.vibeflow.deleteSession(sessionId);
        openHistorySessionId = null;
        await refreshSettingsData();
        await refreshHistory();
      }
    });
  });
  settingsDeleteRepoButton?.addEventListener("click", () => {
    if (!settingsRepoSelect?.value) {
      return;
    }
    const repoKey = settingsRepoSelect.value;
    const repoInfo = settingsRepoStats.get(repoKey);
    const repoLabel = repoInfo?.name || "this repo";
    const countText = repoInfo ? ` (${repoInfo.count} sessions)` : "";
    openConfirm({
      title: "Delete repo context?",
      message: `This will permanently delete all stored context for ${repoLabel}${countText}. It cannot be recovered.`,
      confirmLabel: "Delete repo context",
      onConfirm: async () => {
        await window.vibeflow.deleteRepoContext(repoKey);
        openHistorySessionId = null;
        await refreshSettingsData();
        await refreshHistory();
      }
    });
  });
  settingsVibeTraceRepoSelect?.addEventListener("change", () => {
    void updateVibeTraceToggle();
  });
  container.querySelectorAll<HTMLElement>("[data-external-url]").forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.dataset.externalUrl;
      if (url) {
        void window.vibeflow.openExternal(url);
        playClick();
      }
    });
  });
  void refreshAboutVersion();
};

const setToolPanelVisible = (visible: boolean) => {
  logUi("toolPanelVisible", { visible });
  toolPanel.style.display = visible ? "flex" : "none";
};

const setToolPanelCollapsed = (collapsed: boolean) => {
  toolPanelCollapsed = collapsed;
  logUi("toolPanelCollapsed", { collapsed });
  toolPanel.classList.toggle("collapsed", collapsed);
  const icon = fileToggle.querySelector("i");
  if (icon) {
    icon.className = collapsed ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-left";
  }
  setStoredBool("vf-ui-tool-collapsed", collapsed);
};

const getFileActivityMap = (tabId: string) => {
  const existing = fileActivityByTab.get(tabId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, { type: "read" | "write"; expiresAt: number }>();
  fileActivityByTab.set(tabId, created);
  return created;
};

const refreshFileActivityStyles = (tabId: string | null = activeTabId) => {
  if (!tabId || tabId !== activeTabId) {
    return;
  }
  const activityMap = fileActivityByTab.get(tabId);
  const now = Date.now();
  fileTree.querySelectorAll<HTMLElement>(".tool-item.file").forEach((node) => {
    const relPath = node.dataset.path;
    node.classList.remove("is-read", "is-write");
    if (!relPath || !activityMap) {
      return;
    }
    const activity = activityMap.get(relPath);
    if (!activity) {
      return;
    }
    if (activity.expiresAt <= now) {
      activityMap.delete(relPath);
      return;
    }
    node.classList.add(activity.type === "write" ? "is-write" : "is-read");
  });
};

const markFileActivity = (tabId: string, relPath: string, type: "read" | "write") => {
  if (!relPath) {
    return;
  }
  const activityMap = getFileActivityMap(tabId);
  const ttl = 5000;
  const expiresAt = Date.now() + ttl;
  activityMap.set(relPath, { type, expiresAt });
  const timerKey = `${tabId}:${relPath}`;
  const existing = fileActivityTimers.get(timerKey);
  if (existing) {
    window.clearTimeout(existing);
  }
  const timer = window.setTimeout(() => {
    const map = fileActivityByTab.get(tabId);
    if (map) {
      const entry = map.get(relPath);
      if (entry && entry.expiresAt <= Date.now()) {
        map.delete(relPath);
        refreshFileActivityStyles(tabId);
      }
    }
    fileActivityTimers.delete(timerKey);
  }, ttl + 50);
  fileActivityTimers.set(timerKey, timer);
  refreshFileActivityStyles(tabId);
  markTabActivity(tabId);
};

const renderFileTree = (node: FileNode | null) => {
  fileTree.innerHTML = "";
  if (!node || !node.children || node.children.length === 0) {
    fileTree.innerHTML = "<div class=\"history-empty\" style=\"padding: 8px 12px;\">No files found.</div>";
    return;
  }
  const activePath = activeTabId ? selectedFileByTab.get(activeTabId) : null;
  const activityMap = activeTabId ? fileActivityByTab.get(activeTabId) : null;
  const now = Date.now();

  const buildNode = (item: FileNode, depth: number) => {
    const wrapper = document.createElement("div");
    wrapper.className = "tool-node";

    const row = document.createElement("div");
    row.className = `tool-item ${item.type}`;
    row.style.paddingLeft = `${12 + depth * 12}px`;

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = item.type === "dir" ? "<i class=\"fa-solid fa-folder\"></i>" : "<i class=\"fa-regular fa-file\"></i>";

    const label = document.createElement("span");
    label.textContent = item.name;

    row.appendChild(icon);
    row.appendChild(label);
    wrapper.appendChild(row);

    if (item.type === "dir") {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "tool-children";
      if (depth >= 2) {
        childrenWrap.classList.add("collapsed");
      }
      row.addEventListener("click", () => {
        childrenWrap.classList.toggle("collapsed");
      });
      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          childrenWrap.appendChild(buildNode(child, depth + 1));
        }
      } else {
        const empty = document.createElement("div");
        empty.className = "history-item-meta";
        empty.style.paddingLeft = `${24 + depth * 12}px`;
        empty.textContent = "Empty folder";
        childrenWrap.appendChild(empty);
      }
      wrapper.appendChild(childrenWrap);
    } else {
      row.dataset.path = item.path;
      if (activePath && item.path === activePath) {
        row.classList.add("active");
      }
      const activity = activityMap?.get(item.path);
      if (activity && activity.expiresAt > now) {
        row.classList.add(activity.type === "write" ? "is-write" : "is-read");
      }
      row.addEventListener("click", () => {
        void openFilePreview(item.path);
      });
    }

    return wrapper;
  };

  for (const child of node.children) {
    fileTree.appendChild(buildNode(child, 0));
  }
};

const openFilePreview = async (relPath: string) => {
  if (!activeTabId) {
    return;
  }
  selectedFileByTab.set(activeTabId, relPath);
  const selected = fileTree.querySelectorAll(".tool-item.file.active");
  selected.forEach((node) => node.classList.remove("active"));
  const target = fileTree.querySelector(
    `.tool-item.file[data-path="${CSS.escape(relPath)}"]`
  );
  target?.classList.add("active");
  filePath.textContent = relPath || "File preview";
  fileContent.textContent = "Loading...";
  const result = await window.vibeflow.readRepoFile(activeTabId, relPath);
  if (result.ok) {
    fileContent.textContent = result.content;
  } else {
    fileContent.textContent = result.message;
  }
};

const loadRepoTree = async () => {
  if (!activeTabId) {
    fileTree.innerHTML = "";
    filePath.textContent = "No file selected";
    fileContent.textContent = "Select a file to preview.";
    return;
  }
  const tab = tabs.get(activeTabId);
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  fileTree.innerHTML = "<div class=\"history-empty\" style=\"padding: 8px 12px;\">Loading...</div>";
  const tree = await window.vibeflow.getRepoTree(activeTabId);
  renderFileTree(tree);
  refreshFileActivityStyles(activeTabId);
};

const renderHistoryPane = (container: HTMLDivElement) => {
  container.innerHTML = `
    <div class="panel-pane">
      <div class="panel-header">
        <div>
          <div class="panel-title">History</div>
          <div class="panel-subtitle">Session memory and repo context.</div>
        </div>
      </div>
      <div class="history-layout">
        <div class="panel-card">
          <h3>Repos</h3>
          <div id="vf-history-repos" class="history-list"></div>
        </div>
        <div class="panel-card">
          <h3>Sessions</h3>
          <div id="vf-history-sessions" class="history-list"></div>
        </div>
      </div>
    </div>
  `;
  historyRepoList = container.querySelector("#vf-history-repos");
  historySessionList = container.querySelector("#vf-history-sessions");
};

const openSpecialTab = (kind: "settings" | "history") => {
  const spec = specialTabs[kind];
  const existing = tabs.get(spec.id);
  if (existing) {
    logUi("openSpecialTab-existing", { kind, tabId: existing.id });
    setActiveTab(existing.id, "open-special-tab-existing");
    if (kind === "history") {
      void refreshHistory();
    }
    if (kind === "settings") {
      void refreshSettingsData();
      void refreshAboutVersion();
    }
    return;
  }
  logUi("openSpecialTab-create", { kind, tabId: spec.id });
  const container = document.createElement("div");
  container.className = "terminal-pane";
  container.dataset.tabId = spec.id;
  terminalStack.appendChild(container);
  if (kind === "settings") {
    renderSettingsPane(container);
  } else {
    renderHistoryPane(container);
  }
  tabs.set(spec.id, {
    id: spec.id,
    title: spec.title,
    iconClass: spec.iconClass,
    iconColor: spec.iconColor,
    kind,
    container,
    chat: []
  });
  if (!tabOrder.includes(spec.id)) {
    tabOrder.push(spec.id);
  }
  renderTabs();
  setActiveTab(spec.id, "open-special-tab");
  if (kind === "history") {
    void refreshHistory();
  }
  if (kind === "settings") {
    void refreshSettingsData();
    void refreshAboutVersion();
  }
};

const commandMarker = "__VF_EXIT:";
const enableExitMarkers = false;

const buildCommandForShell = (input: string, shellKind: ShellKind) => {
  if (!enableExitMarkers) {
    return input;
  }
  if (shellKind === "powershell") {
    return `${input}; $code = if ($?) { if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 } } else { 1 }; Write-Output "${commandMarker}$code"`;
  }
  if (shellKind === "cmd") {
    return `${input} & echo ${commandMarker}%ERRORLEVEL%`;
  }
  return `${input}; echo ${commandMarker}$?`;
};

const flashTerminal = (success: boolean) => {
  terminalShell.classList.remove("flash-success", "flash-error");
  if (flashTimer) {
    window.clearTimeout(flashTimer);
    flashTimer = null;
  }
  terminalShell.classList.add(success ? "flash-success" : "flash-error");
  flashTimer = window.setTimeout(() => {
    terminalShell.classList.remove("flash-success", "flash-error");
    flashTimer = null;
  }, 240);
};

const handlePtyData = (tabId: string, data: string) => {
  const tab = tabs.get(tabId);
  if (!tab || tab.kind !== "terminal" || !tab.term) {
    return;
  }
  tab.lastOutputAt = Date.now();
  markTabActivity(tabId);
  if (!enableExitMarkers) {
    const shouldFollow = tab.followOutput !== false;
    tab.term.write(data);
    if (shouldFollow) {
      tab.term.scrollToBottom();
      tab.followOutput = true;
    }
    const cleaned = stripAnsi(data);
    tab.readOutputBuffer = (tab.readOutputBuffer || "") + cleaned;
    const lines = tab.readOutputBuffer.split(/\r?\n/);
    tab.readOutputBuffer = lines.pop() || "";
    const root = tab.projectRoot || tab.cwd || "";
    const rootNorm = normalizePath(root);
    const isWindowsRoot = /^[A-Za-z]:/.test(rootNorm);
    for (const line of lines) {
      const paths = extractReadPaths(line);
      if (paths.length === 0) {
        continue;
      }
      for (const candidate of paths) {
        let rel = normalizePath(candidate).replace(/^\.\/+/, "");
        if (rootNorm && normalizePath(candidate).startsWith(rootNorm)) {
          rel = normalizePath(candidate).slice(rootNorm.length).replace(/^\/+/, "");
        } else if (isWindowsRoot && normalizePath(candidate).toLowerCase().startsWith(rootNorm.toLowerCase())) {
          rel = normalizePath(candidate).slice(rootNorm.length).replace(/^\/+/, "");
        }
        if (!rel || rel.startsWith("..")) {
          continue;
        }
        markFileActivity(tabId, rel, "read");
        window.vibeflow.recordFileRead(tabId, rel);
      }
    }
    updateTerminalScrollbar();
    return;
  }
  tab.outputBuffer = `${tab.outputBuffer || ""}${data}`;
  const lines = tab.outputBuffer.split("\n");
  tab.outputBuffer = lines.pop() || "";

  let output = "";
  for (const line of lines) {
    const cleaned = line.replace(/\r/g, "");
    const markerIndex = cleaned.indexOf(commandMarker);
    if (markerIndex !== -1) {
      const codeText = cleaned.slice(markerIndex + commandMarker.length).trim();
      const code = Number.parseInt(codeText, 10);
      if (!Number.isNaN(code)) {
        flashTerminal(code === 0);
      }
      const before = line.slice(0, markerIndex);
      if (before) {
        output += `${before}\n`;
      }
      continue;
    }
    output += `${line}\n`;
  }

  if (output) {
    const shouldFollow = tab.followOutput !== false;
    tab.term.write(output);
    if (shouldFollow) {
      tab.term.scrollToBottom();
      tab.followOutput = true;
    }
    updateTerminalScrollbar();
  }
  if (tab.outputBuffer.length > 8000) {
    tab.outputBuffer = tab.outputBuffer.slice(-4000);
  }
};

const focusActiveTerminal = () => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (tab?.kind === "terminal" && tab.term) {
    tab.term.focus();
  }
};

const updateWindowButtons = async () => {
  const maximized = await window.vibeflow.isWindowMaximized();
  maximizeIcon.className = maximized
    ? "fa-regular fa-window-restore"
    : "fa-regular fa-square";
};

const updateAudioToggle = () => {
  if (!settingsAudioInput) {
    return;
  }
  settingsAudioInput.checked = audioEnabled;
};

const updateVibeTraceToggle = async () => {
  if (!settingsVibeTraceInput || !settingsVibeTraceRepoSelect) {
    return;
  }
  const repoKey = settingsVibeTraceRepoSelect.value || null;
  if (!repoKey) {
    settingsVibeTraceInput.checked = false;
    settingsVibeTraceInput.disabled = true;
    return;
  }
  settingsVibeTraceInput.disabled = false;
  includeVibeTrace = await window.vibeflow.getVibeTraceInclude(repoKey);
  settingsVibeTraceInput.checked = includeVibeTrace;
};

const setChatCollapsed = (collapsed: boolean) => {
  chatIsCollapsed = collapsed;
  commandDock.classList.toggle("collapsed", collapsed);
  chatCollapsed.setAttribute("aria-hidden", (!collapsed).toString());
  chatToggle.setAttribute("aria-expanded", (!collapsed).toString());
  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  const showTerminalActions = activeTab?.kind === "terminal";
  terminalActions.style.display = showTerminalActions && collapsed ? "flex" : "none";
  chatInput.disabled = collapsed;
  if (collapsed) {
    chatSend.setAttribute("disabled", "true");
    chatAgent.setAttribute("disabled", "true");
    setTerminalInputEnabled(true);
    focusActiveTerminal();
  } else {
    setTerminalInputEnabled(false);
    renderChat();
    setTimeout(() => {
      if (!chatInput.disabled) {
        chatInput.focus();
      }
    }, 0);
  }
  if (collapsed) {
    chatInput.blur();
  }
  setStoredBool("vf-ui-chat-collapsed", collapsed);
};

const createTerminal = (tabId: string) => {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "JetBrains Mono, Cascadia Mono, Consolas, monospace",
    fontWeight: "500",
    lineHeight: 1.25,
    scrollback: 50000,
    theme: {
      background: "#0a0a0a",
      foreground: "#e4e4e7"
    }
  });
  term.attachCustomKeyEventHandler((event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      if (term.hasSelection()) {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection);
        }
        return false;
      }
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      const tab = tabs.get(tabId);
      if (tab) {
        tab.followOutput = false;
      }
      term.scrollLines(event.key === "PageUp" ? -10 : 10);
      event.preventDefault();
      return false;
    }
    return true;
  });
  return term;
};

const fitActiveTerminal = () => {
  if (!activeTabId) {
    return;
  }
  const tab = tabs.get(activeTabId);
  if (!tab || tab.kind !== "terminal" || !tab.fitAddon || !tab.term) {
    return;
  }
  const restoreScroll = tab.followOutput === false ? getViewportY(tab.term) : null;
  tab.fitAddon.fit();
  window.vibeflow.resize(tab.id, tab.term.cols, tab.term.rows);
  if (restoreScroll !== null) {
    const baseY = getBaseY(tab.term);
    const target = Math.min(restoreScroll, baseY);
    tab.term.scrollToLine(target);
  }
  updateTerminalScrollbar();
};

const scrollActiveTerminalToBottom = () => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (tab?.kind === "terminal" && tab.term) {
    tab.followOutput = true;
    tab.term.scrollToBottom();
    tab.term.focus();
  }
};

const updateTerminalScrollbar = () => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab || tab.kind !== "terminal" || !tab.term) {
    return;
  }
  const buffer = (tab.term as unknown as { buffer?: { active?: { baseY: number; length: number; viewportY: number } } })
    .buffer?.active;
  if (!buffer) {
    return;
  }
  const total = buffer.length || 1;
  const visible = tab.term.rows || 1;
  const trackHeight = terminalScrollbar.clientHeight - 4;
  const thumbHeight =
    total <= visible + 1
      ? trackHeight
      : Math.max(24, Math.round((visible / total) * trackHeight));
  const maxScroll = Math.max(0, total - visible);
  const ratio = maxScroll > 0 ? buffer.viewportY / maxScroll : 0;
  const top = Math.round(ratio * Math.max(0, trackHeight - thumbHeight));
  terminalScrollbarThumb.style.height = `${thumbHeight}px`;
  terminalScrollbarThumb.style.transform = `translateY(${Math.max(0, top)}px)`;
};

const scrollTerminalToRatio = (ratio: number) => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  if (!tab || tab.kind !== "terminal" || !tab.term) {
    return;
  }
  const buffer = (tab.term as unknown as { buffer?: { active?: { baseY: number } } }).buffer?.active;
  if (!buffer) {
    return;
  }
  const baseY = buffer.baseY || 0;
  const target = Math.max(0, Math.min(baseY, Math.round(baseY * ratio)));
  tab.followOutput = false;
  tab.term.scrollToLine(target);
  updateTerminalScrollbar();
};

const ensureTabOrder = () => {
  if (tabOrder.length === 0 && tabs.size > 0) {
    tabOrder = Array.from(tabs.keys());
    return;
  }
  tabOrder = tabOrder.filter((id) => tabs.has(id));
};

const reorderTabOrder = (dragId: string, targetId: string) => {
  ensureTabOrder();
  const from = tabOrder.indexOf(dragId);
  const to = tabOrder.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) {
    return;
  }
  tabOrder.splice(from, 1);
  tabOrder.splice(to, 0, dragId);
};

const renderTabs = () => {
  tabsContainer.innerHTML = "";
  ensureTabOrder();
  logUi("renderTabs", {
    count: tabs.size,
    activeTabId,
    idleOpen: isIdleScreenOpen(),
    tabs: Array.from(tabs.values()).map((tab) => ({ id: tab.id, title: tab.title, kind: tab.kind }))
  });
  const orderedTabs = tabOrder.length
    ? tabOrder.map((id) => tabs.get(id)).filter((tab): tab is TabState => Boolean(tab))
    : Array.from(tabs.values());
  for (const tab of orderedTabs) {
    const button = document.createElement("button");
    button.className = "tab no-drag";
    button.type = "button";
    if (tab.id === activeTabId) {
      button.classList.add("active");
    }
    if (tab.accentColor) {
      button.classList.add("is-colored");
      button.style.setProperty("--tab-accent", tab.accentColor);
    } else {
      button.classList.remove("is-colored");
      button.style.removeProperty("--tab-accent");
    }
    button.dataset.tabId = tab.id;
    button.draggable = true;

    const icon = document.createElement("i");
    icon.className = `fa-solid ${tab.iconClass}`;
    icon.style.color = tab.iconColor;

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;

    let activity: HTMLElement | null = null;
    if (tab.kind === "terminal") {
      activity = document.createElement("i");
      activity.className = "fa-solid fa-circle-notch tab-activity";
      if (tab.activityUntil && tab.activityUntil > Date.now()) {
        activity.classList.add("is-active");
      }
    }

    const close = document.createElement("i");
    close.className = "fa-solid fa-xmark tab-close";
    close.addEventListener("click", async (event) => {
      event.stopPropagation();
      playClick();
      if (tab.kind === "terminal") {
        await closeTab(tab.id);
      } else {
        removeTabLocal(tab.id);
      }
    });

    button.appendChild(icon);
    button.appendChild(title);
    if (activity) {
      button.appendChild(activity);
    }
    button.appendChild(close);
    button.addEventListener("click", () => setActiveTab(tab.id, "tab-click"));
    button.addEventListener("dragstart", (event) => {
      button.classList.add("dragging");
      event.dataTransfer?.setData("text/tab-id", tab.id);
      event.dataTransfer?.setData("text/plain", tab.id);
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("dragging");
    });
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      button.classList.add("drag-over");
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openTabColorMenu(tab.id, event.clientX, event.clientY);
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("drag-over");
      const draggedId =
        event.dataTransfer?.getData("text/tab-id") || event.dataTransfer?.getData("text/plain");
      if (!draggedId || draggedId === tab.id) {
        return;
      }
      reorderTabOrder(draggedId, tab.id);
      renderTabs();
    });
    button.addEventListener("dragleave", () => {
      button.classList.remove("drag-over");
    });
    tabsContainer.appendChild(button);
  }
};

const setActiveTab = (tabId: string, source = "unknown") => {
  const nextTab = tabs.get(tabId);
  if (!nextTab) {
    logUi("setActiveTab-missing", { tabId, activeTabId, tabs: Array.from(tabs.keys()) });
    return;
  }
  if (!tabOrder.includes(tabId)) {
    tabOrder.push(tabId);
  }
  const previousTab = activeTabId ? tabs.get(activeTabId) : null;
  logUi("setActiveTab", { source, from: previousTab?.id, to: tabId });
  activeTabId = tabId;
  markUserActivity(tabId);
  for (const tab of tabs.values()) {
    tab.container.classList.toggle("active", tab.id === tabId);
  }
  welcomePane.classList.remove("is-open");
  const showTerminalActions = nextTab.kind === "terminal";
  terminalActions.style.display = showTerminalActions && chatIsCollapsed ? "flex" : "none";
  if (previousTab?.kind === "terminal" && previousTab.term && nextTab.kind !== "terminal") {
    setTerminalStdin(previousTab.term, false);
  }
  if (nextTab.kind === "terminal") {
    setToolPanelVisible(true);
    setToolPanelCollapsed(toolPanelCollapsed);
    void loadRepoTree();
    setTerminalInputEnabled(chatIsCollapsed);
  } else {
    setToolPanelVisible(false);
  }
  renderTabs();
  renderChat();
  void refreshContext();
  if (nextTab.kind === "terminal") {
    fitActiveTerminal();
    focusActiveTerminal();
    void deliverTimeEchoesForTab(nextTab);
  }
  if (previousTab?.id !== tabId) {
    playClick();
  }
};

const createTab = async (cwd?: string) => {
  logUi("createTab", { cwd });
  const tabInfo = await window.vibeflow.createTab(cwd);
  const container = document.createElement("div");
  container.className = "terminal-pane";
  container.dataset.tabId = tabInfo.id;
  terminalStack.appendChild(container);
  const activateFromTerminal = () => {
    if (activeTabId !== tabInfo.id) {
      setActiveTab(tabInfo.id, "terminal-focus");
    }
  };
  container.addEventListener("mousedown", activateFromTerminal);
  container.addEventListener("focusin", activateFromTerminal);

  const term = createTerminal(tabInfo.id);
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  markUserActivity(tabInfo.id);
  container.addEventListener(
    "wheel",
    (event) => {
      const tab = tabs.get(tabInfo.id);
      if (!tab?.term) {
        return;
      }
      tab.followOutput = false;
      const delta = Math.sign(event.deltaY) * 3;
      tab.term.scrollLines(delta);
      event.preventDefault();
    },
    { passive: false, capture: true }
  );
  const viewport = container.querySelector(".xterm-viewport");
  viewport?.addEventListener("wheel", (event) => {
    const tab = tabs.get(tabInfo.id);
    if (!tab?.term) {
      return;
    }
    if (event.deltaY < 0) {
      tab.followOutput = false;
      return;
    }
    window.setTimeout(() => {
      tab.followOutput = isTerminalAtBottom(tab.term as Terminal);
    }, 0);
  });
  term.onScroll((position) => {
    const tab = tabs.get(tabInfo.id);
    if (!tab || !tab.term) {
      return;
    }
    const baseY = (tab.term as unknown as { buffer?: { active?: { baseY: number } } })
      .buffer?.active?.baseY;
    if (typeof baseY === "number") {
      tab.followOutput = position >= baseY;
    }
    updateTerminalScrollbar();
  });
  term.onData((data) => {
    markUserActivity(tabInfo.id);
    markTabActivity(tabInfo.id);
    window.vibeflow.write(tabInfo.id, data);
    if (chatIsCollapsed) {
      const tab = tabs.get(tabInfo.id);
      if (!tab) {
        return;
      }
      if (tab.escapeSequence === undefined) {
        tab.escapeSequence = null;
      }
      for (const ch of data) {
        if (tab.escapeSequence) {
          tab.escapeSequence += ch;
          if (/[A-Za-z~]$/.test(tab.escapeSequence) || tab.escapeSequence.length > 16) {
            tab.escapeSequence = null;
          }
          continue;
        }
        if (ch === "\u001b") {
          tab.escapeSequence = "\u001b";
          continue;
        }
        if (ch === "\r") {
          if (tab.currentLine.trim()) {
            tab.lastCommand = tab.currentLine.trim();
          }
          tab.currentLine = "";
        } else if (ch === "\u007f") {
          tab.currentLine = tab.currentLine.slice(0, -1);
        } else if (ch >= " " && ch !== "\u001b") {
          tab.currentLine += ch;
        }
      }
    }
  });

  const baseTitle = titleFromPath(tabInfo.projectRoot, tabInfo.cwd);
  tabs.set(tabInfo.id, {
    id: tabInfo.id,
    title: uniqueTitle(baseTitle),
    ...pickIconForName(baseTitle),
    kind: "terminal",
    shellKind: tabInfo.shellKind,
    term,
    fitAddon,
    container,
    chat: [],
    outputBuffer: "",
    readOutputBuffer: "",
    currentLine: "",
    lastCommand: "",
    followOutput: true,
    cwd: tabInfo.cwd,
    projectRoot: tabInfo.projectRoot
  });
  if (!tabOrder.includes(tabInfo.id)) {
    tabOrder.push(tabInfo.id);
  }

  renderTabs();
  setActiveTab(tabInfo.id, "createTab");
  welcomePane.classList.remove("is-open");
};

const removeTabLocal = (tabId: string) => {
  const tab = tabs.get(tabId);
  if (!tab) {
    return;
  }
  logUi("removeTabLocal", { tabId, activeTabId });
  if (tab.kind === "terminal" && tab.term) {
    tab.term.dispose();
  }
  tab.container.remove();
  tabs.delete(tabId);
  tabOrder = tabOrder.filter((id) => id !== tabId);
  fileActivityByTab.delete(tabId);
  selectedFileByTab.delete(tabId);
  const activityTimer = tabActivityTimers.get(tabId);
  if (activityTimer) {
    window.clearTimeout(activityTimer);
    tabActivityTimers.delete(tabId);
  }
  for (const key of Array.from(fileActivityTimers.keys())) {
    if (key.startsWith(`${tabId}:`)) {
      const timer = fileActivityTimers.get(key);
      if (timer) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      fileActivityTimers.delete(key);
    }
  }

  if (activeTabId === tabId) {
    const remaining = Array.from(tabs.keys());
    if (remaining.length > 0) {
      setActiveTab(remaining[0], "removeTabLocal");
    } else {
      showIdleState();
    }
  } else {
    renderTabs();
  }
};

const closeTab = async (tabId: string) => {
  logUi("closeTab", { tabId });
  const session = await window.vibeflow.getActiveSession(tabId);
  await window.vibeflow.closeTab(tabId);
  removeTabLocal(tabId);
  if (session) {
    showReceipt(session, () => {
      void selectRepoAndCreateTab();
    });
  }
  void refreshRecentRepos();
};

const selectRepoAndCreateTab = async () => {
  logUi("selectRepoAndCreateTab");
  const selected = await window.vibeflow.selectRepo();
  if (!selected) {
    return;
  }
  await createTab(selected);
};

const showIdleState = () => {
  logUi("showIdleState", { activeTabId });
  const previous = activeTabId ? tabs.get(activeTabId) : null;
  if (previous?.kind === "terminal" && previous.term) {
    setTerminalStdin(previous.term, false);
  }
  activeTabId = null;
  for (const tab of tabs.values()) {
    tab.container.classList.remove("active");
  }
  quickIntent.style.display = "none";
  setToolPanelVisible(false);
  welcomePane.classList.add("is-open");
  renderTabs();
  renderChat();
  void refreshContext();
  void refreshRecentRepos();
  playClick();
};

const renderChat = () => {
  const tab = activeTabId ? tabs.get(activeTabId) : null;
  const showTerminalActions = tab?.kind === "terminal";
  chatLog.innerHTML = "";
  if (!tab || tab.kind !== "terminal") {
    chatInput.disabled = true;
    chatSend.setAttribute("disabled", "true");
    chatAgent.setAttribute("disabled", "true");
    chatAttach.setAttribute("disabled", "true");
    terminalActions.style.display = "none";
    chatInput.placeholder = tab ? "Chat disabled for this tab." : "Select a repository to begin...";
    return;
  }
  if (chatIsCollapsed) {
    chatInput.disabled = true;
    chatSend.setAttribute("disabled", "true");
    chatAgent.setAttribute("disabled", "true");
    chatAttach.setAttribute("disabled", "true");
    terminalActions.style.display = showTerminalActions ? "flex" : "none";
    chatInput.placeholder = "Chat is collapsed...";
  } else {
  chatInput.disabled = false;
  chatSend.removeAttribute("disabled");
  chatAgent.removeAttribute("disabled");
  chatAttach.removeAttribute("disabled");
  terminalActions.style.display = "none";
  chatInput.placeholder = "Send command to terminal...";
  }
  for (const message of tab.chat) {
    const entry = document.createElement("div");
    entry.className = "command-entry";

    const time = document.createElement("span");
    time.className = "command-time";
    time.textContent = message.time;

    const text = document.createElement("span");
    text.className = "command-text";
    text.textContent = message.text;

    entry.appendChild(time);
    entry.appendChild(text);
    chatLog.appendChild(entry);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
};

const animateParkedThought = (text: string) => {
  contextPanel.classList.add("park-pulse");
  window.setTimeout(() => contextPanel.classList.remove("park-pulse"), 900);
  if (prefersReducedMotion || contextPanel.classList.contains("collapsed")) {
    return;
  }
  const inputRect = overlayInput.getBoundingClientRect();
  const targetRect = contextThoughts.getBoundingClientRect();
  if (!inputRect || !targetRect) {
    return;
  }
  const fly = document.createElement("div");
  fly.className = "park-fly";
  const trimmed = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  fly.textContent = trimmed;
  fly.style.left = `${inputRect.left}px`;
  fly.style.top = `${inputRect.top}px`;
  fly.style.width = `${Math.min(280, inputRect.width)}px`;
  document.body.appendChild(fly);

  const endLeft = targetRect.left + 16;
  const endTop = targetRect.top + 12;
  const dx = endLeft - inputRect.left;
  const dy = endTop - inputRect.top;

  const animation = fly.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(0.7)`, opacity: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 }
    ],
    {
      duration: 950,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
    }
  );
  animation.onfinish = () => {
    fly.remove();
  };
};

const showParkedThoughtSkeleton = () => {
  const item = document.createElement("li");
  item.className = "thought-skeleton";
  item.innerHTML = `
    <span class="skeleton-dot"></span>
    <span class="skeleton-bar"></span>
  `;
  contextThoughts.prepend(item);
  window.setTimeout(() => {
    item.remove();
  }, 1200);
};

const getTouchedFiles = (session: SessionRecord | LastSession) => {
  const touches = session.fileTouches || {};
  return Object.entries(touches)
    .map(([pathKey, touch]) => ({
      path: pathKey,
      reads: touch.reads,
      writes: touch.writes,
      lastTouched: touch.lastTouched
    }))
    .sort((a, b) => {
      if (b.writes !== a.writes) {
        return b.writes - a.writes;
      }
      if (b.reads !== a.reads) {
        return b.reads - a.reads;
      }
      return Date.parse(b.lastTouched) - Date.parse(a.lastTouched);
    });
};

const buildReceiptText = (session: LastSession) => {
  const flowLabel = flowLabelText[session.flowSummary?.label || "steady"] || "Steady";
  const durationMs = session.flowSummary?.sessionDurationMs || 0;
  const intentCount = session.intent ? 1 : 0;
  const contextCount = session.parkedThoughts.length;
  const touched = getTouchedFiles(session);
  const touchedList = touched.slice(0, 8).map((item) => item.path);
  return [
    "VibeFlow Session Receipt",
    `Project: ${session.projectRoot || session.cwd}`,
    `Duration: ${formatDuration(durationMs)} (${flowLabel})`,
    `Intent updates: ${intentCount}`,
    `Context notes: ${contextCount}`,
    `Intent: ${session.intent?.text || "No intent set"}`,
    touchedList.length > 0
      ? `Touched files: ${touchedList.join(", ")}`
      : "Touched files: none"
  ].join("\n");
};

const showReceipt = (session: LastSession, action?: () => void) => {
  receiptAction = action || null;
  receiptText = buildReceiptText(session);
  receiptOverlay.classList.add("is-open");
  receiptOverlay.setAttribute("aria-hidden", "false");

  const flowLabel = flowLabelText[session.flowSummary?.label || "steady"] || "Steady";
  const durationMs = session.flowSummary?.sessionDurationMs || 0;
  const intentCount = session.intent ? 1 : 0;
  const contextCount = session.parkedThoughts.length;

  receiptSummary.textContent = `${formatDuration(durationMs)} in ${flowLabel} • ${intentCount} intent update${
    intentCount === 1 ? "" : "s"
  } • ${contextCount} context note${contextCount === 1 ? "" : "s"}`;
  receiptDuration.textContent = formatHms(durationMs);
  receiptIntents.textContent = intentCount.toString();
  receiptContext.textContent = contextCount.toString();
  receiptFlow.textContent = flowLabel;
  const touched = getTouchedFiles(session);
  receiptDiffIntent.textContent = session.intent?.text
    ? `Intent: ${session.intent.text}`
    : "Intent: No intent set";
  receiptDiffFiles.innerHTML = "";
  if (touched.length === 0) {
    const empty = document.createElement("span");
    empty.className = "receipt-diff-chip";
    empty.textContent = "No files touched";
    receiptDiffFiles.appendChild(empty);
  } else {
    const top = touched.slice(0, 4);
    for (const item of top) {
      const chip = document.createElement("span");
      chip.className = "receipt-diff-chip";
      const reads = item.reads ? `r${item.reads}` : "";
      const writes = item.writes ? `w${item.writes}` : "";
      const suffix = [writes, reads].filter(Boolean).join(" ");
      chip.textContent = suffix ? `${item.path} • ${suffix}` : item.path;
      receiptDiffFiles.appendChild(chip);
    }
    if (touched.length > top.length) {
      const more = document.createElement("span");
      more.className = "receipt-diff-chip";
      more.textContent = `+${touched.length - top.length} more`;
      receiptDiffFiles.appendChild(more);
    }
  }
};

const hideReceipt = () => {
  receiptOverlay.classList.remove("is-open");
  receiptOverlay.setAttribute("aria-hidden", "true");
  receiptAction = null;
};

const showTimeEchoOverlay = async (text: string) => {
  if (!text) {
    return;
  }
  timeEchoText.textContent = text;
  timeEchoScreen.classList.add("is-open");
  timeEchoScreen.setAttribute("aria-hidden", "false");
  await new Promise((resolve) => window.setTimeout(resolve, 1400));
  timeEchoScreen.classList.remove("is-open");
  timeEchoScreen.setAttribute("aria-hidden", "true");
};

const renderTimeEchoes = (tab: TabState | null, animate = false) => {
  if (!tab || tab.kind !== "terminal") {
    contextEchoes.style.display = "none";
    contextEchoList.innerHTML = "";
    return;
  }
  const echoes = tab.timeEchoes || [];
  if (echoes.length === 0) {
    contextEchoes.style.display = "none";
    contextEchoList.innerHTML = "";
    return;
  }
  contextEchoes.style.display = "grid";
  contextEchoList.innerHTML = "";
  echoes.forEach((echo, index) => {
    const item = document.createElement("div");
    item.className = "echo-item";
    if (animate) {
      item.classList.add("echo-enter");
      item.style.animationDelay = `${index * 120}ms`;
    }
    const text = document.createElement("div");
    text.className = "echo-text";
    text.textContent = echo.text;
    const actions = document.createElement("div");
    actions.className = "echo-actions";
    const parkButton = document.createElement("button");
    parkButton.type = "button";
    parkButton.className = "echo-action primary";
    parkButton.textContent = "Park";
    parkButton.addEventListener("click", () => {
      if (!activeTabId) {
        return;
      }
      window.vibeflow.addParkedThought(activeTabId, echo.text);
      tab.timeEchoes = (tab.timeEchoes || []).filter((item) => item.id !== echo.id);
      renderTimeEchoes(tab);
      void refreshContext();
      playTick();
    });
    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.className = "echo-action danger";
    discardButton.textContent = "Discard";
    discardButton.addEventListener("click", () => {
      tab.timeEchoes = (tab.timeEchoes || []).filter((item) => item.id !== echo.id);
      renderTimeEchoes(tab);
      playClick();
    });
    actions.appendChild(parkButton);
    actions.appendChild(discardButton);
    item.appendChild(text);
    item.appendChild(actions);
    contextEchoList.appendChild(item);
  });
};

const deliverTimeEchoesForTab = async (tab: TabState) => {
  if (tab.kind !== "terminal" || tab.echoesConsumed) {
    return;
  }
  tab.echoesConsumed = true;
  const repoKey = tab.projectRoot || tab.cwd || null;
  const echoes = await window.vibeflow.consumeTimeEchoes(repoKey);
  if (!echoes || echoes.length === 0) {
    renderTimeEchoes(tab);
    return;
  }
  tab.timeEchoes = echoes;
  renderTimeEchoes(tab, true);
};

const refreshRecentRepos = async () => {
  const recent = await window.vibeflow.getRecentSessions();
  recentList.innerHTML = "";
  if (!recent || recent.length === 0) {
    recentWrap.style.display = "none";
    return;
  }
  recentWrap.style.display = "block";
  for (const item of recent) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-item";
    const title = document.createElement("div");
    title.className = "recent-item-title";
    title.textContent = titleFromPath(item.projectRoot, item.cwd);
    const intent = document.createElement("div");
    intent.className = "recent-item-intent";
    intent.textContent = item.intent?.text
      ? `Last intent: ${item.intent.text}`
      : "No intent recorded";
    const meta = document.createElement("div");
    meta.className = "recent-item-meta";
    meta.textContent = item.endedAt ? `Last active ${formatTime(item.endedAt)}` : "Recent";
    button.appendChild(title);
    button.appendChild(intent);
    button.appendChild(meta);
    button.addEventListener("click", () => {
      playClick();
      void createTab(item.projectRoot || item.cwd);
    });
    recentList.appendChild(button);
  }
};

const refreshSettingsData = async () => {
  if (!settingsSessionSelect || !settingsRepoSelect || !settingsVibeTraceRepoSelect) {
    return;
  }
  const sessions: SessionList = await window.vibeflow.getAllSessions();
  const endedSessions = sessions.filter((session) => session.endedAt);
  const sortedSessions = endedSessions.sort(
    (a, b) => Date.parse(b.endedAt || b.startedAt) - Date.parse(a.endedAt || a.startedAt)
  );

  settingsSessionSelect.innerHTML = "";
  if (sortedSessions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No sessions available";
    settingsSessionSelect.appendChild(option);
    settingsSessionSelect.disabled = true;
    if (settingsDeleteSessionButton) {
      settingsDeleteSessionButton.disabled = true;
    }
  } else {
    settingsSessionSelect.disabled = false;
    if (settingsDeleteSessionButton) {
      settingsDeleteSessionButton.disabled = false;
    }
    for (const session of sortedSessions.slice(0, 50)) {
      const option = document.createElement("option");
      option.value = session.id;
      const duration = formatDuration(session.flowSummary?.sessionDurationMs || 0);
      option.textContent = `${titleFromPath(session.projectRoot, session.cwd)} • ${formatTime(
        session.endedAt || session.startedAt
      )} • ${duration}`;
      settingsSessionSelect.appendChild(option);
    }
  }

  const repoMap = new Map<
    string,
    { key: string; name: string; count: number; lastEndedAt: string }
  >();

  for (const session of sessions) {
    const key = session.projectRoot || session.cwd;
    const existing = repoMap.get(key);
    const lastEndedAt = session.endedAt || session.startedAt;
    if (!existing) {
      repoMap.set(key, {
        key,
        name: titleFromPath(session.projectRoot, session.cwd),
        count: 1,
        lastEndedAt
      });
    } else {
      existing.count += 1;
      if (Date.parse(lastEndedAt) > Date.parse(existing.lastEndedAt)) {
        existing.lastEndedAt = lastEndedAt;
      }
    }
  }

  settingsRepoStats = new Map(
    Array.from(repoMap.values()).map((repo) => [repo.key, { name: repo.name, count: repo.count }])
  );

  settingsRepoSelect.innerHTML = "";
  settingsVibeTraceRepoSelect.innerHTML = "";
  if (repoMap.size === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No repo context available";
    settingsRepoSelect.appendChild(option);
    settingsRepoSelect.disabled = true;
    const traceOption = option.cloneNode(true) as HTMLOptionElement;
    settingsVibeTraceRepoSelect.appendChild(traceOption);
    settingsVibeTraceRepoSelect.disabled = true;
    if (settingsDeleteRepoButton) {
      settingsDeleteRepoButton.disabled = true;
    }
  } else {
    settingsRepoSelect.disabled = false;
    settingsVibeTraceRepoSelect.disabled = false;
    if (settingsDeleteRepoButton) {
      settingsDeleteRepoButton.disabled = false;
    }
    const repoList = Array.from(repoMap.values()).sort(
      (a, b) => Date.parse(b.lastEndedAt) - Date.parse(a.lastEndedAt)
    );
    for (const repo of repoList) {
      const option = document.createElement("option");
      option.value = repo.key;
      option.textContent = `${repo.name} (${repo.count} sessions)`;
      settingsRepoSelect.appendChild(option);
      const traceOption = option.cloneNode(true) as HTMLOptionElement;
      settingsVibeTraceRepoSelect.appendChild(traceOption);
    }
  }
  void updateVibeTraceToggle();
};

const refreshAboutVersion = async () => {
  if (!settingsVersionLabel) {
    return;
  }
  try {
    const version = await window.vibeflow.getAppVersion();
    settingsVersionLabel.textContent = `v${version}`;
  } catch {
    settingsVersionLabel.textContent = "Version unavailable";
  }
};

const refreshHistory = async () => {
  if (!historyRepoList || !historySessionList) {
    return;
  }
  const sessions: SessionList = await window.vibeflow.getAllSessions();
  historySessionsCache = sessions.filter((session) => session.endedAt);
  historyRepoList.innerHTML = "";
  historySessionList.innerHTML = "";

  if (historySessionsCache.length === 0) {
    historyRepoList.innerHTML = "<div class=\"history-item\">No sessions yet.</div>";
    historySessionList.innerHTML = "<div class=\"history-item\">No sessions yet.</div>";
    return;
  }

  const repoMap = new Map<
    string,
    {
      key: string;
      name: string;
      totalMs: number;
      count: number;
      lastEndedAt: string;
      lastIntent: string | null;
    }
  >();

  for (const session of historySessionsCache) {
    const key = session.projectRoot || session.cwd;
    const existing = repoMap.get(key);
    const durationMs = session.flowSummary?.sessionDurationMs
      ? session.flowSummary.sessionDurationMs
      : Date.parse(session.endedAt || session.startedAt) - Date.parse(session.startedAt);
    const lastEndedAt = session.endedAt || session.startedAt;
    if (!existing) {
      repoMap.set(key, {
        key,
        name: titleFromPath(session.projectRoot, session.cwd),
        totalMs: Math.max(0, durationMs),
        count: 1,
        lastEndedAt,
        lastIntent: session.intent?.text || null
      });
    } else {
      existing.totalMs += Math.max(0, durationMs);
      existing.count += 1;
      if (Date.parse(lastEndedAt) > Date.parse(existing.lastEndedAt)) {
        existing.lastEndedAt = lastEndedAt;
        existing.lastIntent = session.intent?.text || existing.lastIntent;
      }
    }
  }

  const repoList = Array.from(repoMap.values()).sort(
    (a, b) => Date.parse(b.lastEndedAt) - Date.parse(a.lastEndedAt)
  );

  const allKey = "__all__";
  const addRepoItem = (label: string, key: string, meta: string) => {
    const item = document.createElement("div");
    item.className = `history-item selectable ${historySelectedRepo === key ? "selected" : ""}`;
    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = label;
    const metaLine = document.createElement("div");
    metaLine.className = "history-item-meta";
    metaLine.textContent = meta;
    item.appendChild(title);
    item.appendChild(metaLine);
    item.addEventListener("click", () => {
      historySelectedRepo = key;
      openHistorySessionId = null;
      void refreshHistory();
    });
    historyRepoList.appendChild(item);
  };

  const totalSessions = historySessionsCache.length;
  addRepoItem(
    "All repos",
    allKey,
    `${totalSessions} session${totalSessions === 1 ? "" : "s"}`
  );

  for (const repo of repoList) {
    addRepoItem(
      repo.name,
      repo.key,
      `${formatDuration(repo.totalMs)} • ${repo.count} sessions • ${formatTime(repo.lastEndedAt)}`
    );
  }

  if (!historySelectedRepo) {
    historySelectedRepo = repoList[0]?.key || allKey;
  }

  renderHistoryLists();
};

const renderHistoryLists = () => {
  if (!historySessionList) {
    return;
  }
  historySessionList.innerHTML = "";

  const selectedKey = historySelectedRepo || "__all__";
  const sessions = historySessionsCache
    .filter((session) => {
      if (selectedKey === "__all__") {
        return true;
      }
      const key = session.projectRoot || session.cwd;
      return key === selectedKey;
    })
    .sort((a, b) => Date.parse(b.endedAt || b.startedAt) - Date.parse(a.endedAt || a.startedAt));

  if (sessions.length === 0) {
    historySessionList.innerHTML = "<div class=\"history-item\">No sessions for this repo.</div>";
    return;
  }

  for (const session of sessions.slice(0, 40)) {
    const item = document.createElement("div");
    item.className = "history-item";
    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = titleFromPath(session.projectRoot, session.cwd);
    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = `${formatTime(session.endedAt)} • ${formatDuration(
      session.flowSummary?.sessionDurationMs || 0
    )} • ${flowLabelText[session.flowSummary?.label || "steady"]}`;
    const intent = document.createElement("div");
    intent.className = "history-item-meta";
    intent.textContent = session.intent?.text
      ? `Final intent: ${session.intent.text}`
      : "No intent set";
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const detailsButton = document.createElement("button");
    detailsButton.textContent = openHistorySessionId === session.id ? "Hide details" : "View details";
    detailsButton.addEventListener("click", () => {
      openHistorySessionId = openHistorySessionId === session.id ? null : session.id;
      renderHistoryLists();
      playClick();
    });
    const resumeButton = document.createElement("button");
    resumeButton.className = "primary";
    resumeButton.textContent = "Resume";
    resumeButton.addEventListener("click", () => {
      void showResumeForSession(session);
      playClick();
    });
    actions.appendChild(detailsButton);
    actions.appendChild(resumeButton);
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(intent);
    item.appendChild(actions);

    if (openHistorySessionId === session.id) {
      const details = renderHistoryDetailsInline(session);
      item.appendChild(details);
    }

    historySessionList.appendChild(item);
  }
};

const renderHistoryDetailsInline = (session: SessionRecord) => {
  const wrapper = document.createElement("div");
  wrapper.className = "history-details-inline";
  const flowLabel = flowLabelText[session.flowSummary?.label || "steady"];
  const duration = formatDuration(session.flowSummary?.sessionDurationMs || 0);
  const parked = session.parkedThoughts || [];
  const intentText = session.intent?.text || "No intent recorded.";
  const intentTime = session.intent?.setAt ? formatTime(session.intent.setAt) : "N/A";
  const touched = getTouchedFiles(session);
  const topTouched = touched.slice(0, 6);
  const diffChips = topTouched
    .map((item) => {
      const reads = item.reads ? `r${item.reads}` : "";
      const writes = item.writes ? `w${item.writes}` : "";
      const suffix = [writes, reads].filter(Boolean).join(" ");
      const label = suffix ? `${item.path} • ${suffix}` : item.path;
      return `<span class="history-diff-chip">${label}</span>`;
    })
    .join("");
  const diffMore =
    touched.length > topTouched.length
      ? `<span class="history-diff-chip">+${touched.length - topTouched.length} more</span>`
      : "";
  const diffEmpty = touched.length === 0
    ? "<span class=\"history-diff-chip\">No files touched</span>"
    : "";
  const echoes = session.timeEchoes || (session.timeEcho ? [session.timeEcho] : []);
  const echoList = echoes.length
    ? echoes.map((echo) => `<span class="history-diff-chip">${echo.text}</span>`).join("")
    : "<span class=\"history-diff-chip\">No time echoes</span>";

  const tags = [
    `Flow: ${flowLabel}`,
    `Active: ${formatDuration(session.flowSummary?.totalActiveMs || 0)}`,
    `Idle: ${formatDuration(session.flowSummary?.totalIdleMs || 0)}`
  ];

  wrapper.innerHTML = `
    <div class="history-details-body">
      <div class="history-details-row">
        <div class="history-details-label">Summary</div>
        <div>${titleFromPath(session.projectRoot, session.cwd)} • ${duration}</div>
        <div class="history-tags">
          ${tags.map((tag) => `<span class="history-tag">${tag}</span>`).join("")}
        </div>
      </div>
      <div class="history-details-row">
        <div class="history-details-label">Intent</div>
        <div>${intentText}</div>
        <div class="history-item-meta">Set at ${intentTime}</div>
      </div>
      <div class="history-details-row">
        <div class="history-details-label">Context Diff</div>
        <div class="history-item-meta">Intent vs touched files</div>
        <div class="history-diff-files">${diffEmpty || diffChips + diffMore}</div>
      </div>
      <div class="history-details-row">
        <div class="history-details-label">Time Echoes</div>
        <div class="history-diff-files">${echoList}</div>
      </div>
      <div class="history-details-row">
        <div class="history-details-label">Parked Thoughts</div>
        <div class="history-item-meta">${
          parked.length ? "" : "No parked thoughts were recorded."
        }</div>
        <div class="history-tags">
          ${parked.slice(0, 6).map((p) => `<span class="history-tag">${p.text}</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="history-details-close">
      <button type="button">Dismiss</button>
    </div>
  `;

  const dismiss = wrapper.querySelector("button");
  dismiss?.addEventListener("click", () => {
    openHistorySessionId = null;
    renderHistoryLists();
    playClick();
  });

  return wrapper;
};

const sendChatCommand = () => {
  if (!activeTabId || !chatInput) {
    return;
  }
  const value = chatInput.value.trim();
  if (!value) {
    return;
  }
  const tab = tabs.get(activeTabId);
  if (!tab || tab.kind !== "terminal" || !tab.shellKind) {
    return;
  }
  markUserActivity(activeTabId);
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  tab.chat.push({ text: value, time });
  renderChat();
  const command = buildCommandForShell(value, tab.shellKind);
  sendCommandToTerminal(activeTabId, command, tab.shellKind);
  if (tab.term) {
    tab.followOutput = true;
    tab.term.scrollToBottom();
    updateTerminalScrollbar();
  }
  chatInput.value = "";
  if (chatIsCollapsed) {
    focusActiveTerminal();
  } else {
    chatInput.focus();
  }
  playClick();
};

const saveIntentFromChat = () => {
  if (!activeTabId || !chatInput) {
    return;
  }
  const value = chatInput.value.trim();
  if (!value) {
    return;
  }
  markUserActivity(activeTabId);
  window.vibeflow.setIntent(activeTabId, value);
  chatInput.value = "";
  void refreshContext();
  playClick();
};

const saveIntentFromTerminal = () => {
  if (!activeTabId) {
    return;
  }
  const tab = tabs.get(activeTabId);
  if (!tab || tab.kind !== "terminal") {
    return;
  }
  const value = sanitizeTerminalText(tab.currentLine || "") ||
    sanitizeTerminalText(tab.lastCommand || "");
  if (!value) {
    return;
  }
  markUserActivity(activeTabId);
  window.vibeflow.setIntent(activeTabId, value);
  void refreshContext();
  playClick();
};

type OverlayMode = "intent" | "thought" | "echo" | null;
let overlayMode: OverlayMode = null;

const openOverlay = (mode: OverlayMode) => {
  if (!mode || !activeTabId) {
    return;
  }
  overlayMode = mode;
  overlayTabId = activeTabId;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  overlayInput.value = "";
  overlayInput.placeholder =
    mode === "intent"
      ? "What are you trying to achieve?"
      : mode === "echo"
      ? "Send a message to future you..."
      : "Capture a parked thought...";
  const popupTitle = document.getElementById("vf-popup-title");
  const popupIcon = document.getElementById("vf-popup-icon");
  if (popupTitle && popupIcon) {
    if (mode === "intent") {
      popupTitle.textContent = "Set Intent";
      popupIcon.className = "fa-solid fa-bullseye";
    } else if (mode === "echo") {
      popupTitle.textContent = "Time Echo";
      popupIcon.className = "fa-regular fa-hourglass";
    } else {
      popupTitle.textContent = "Parked Thought";
      popupIcon.className = "fa-regular fa-note-sticky";
    }
  }
  setTimeout(() => overlayInput.focus(), 0);
};

const closeOverlay = () => {
  overlayMode = null;
  overlayTabId = null;
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlayInput.value = "";
  focusActiveTerminal();
};

overlayInput.addEventListener("keydown", async (event) => {
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    const value = overlayInput.value.trim();
    if (value && overlayTabId) {
      if (overlayMode === "intent") {
        window.vibeflow.setIntent(overlayTabId, value);
        markUserActivity(overlayTabId);
        playClick();
      } else if (overlayMode === "echo") {
        await window.vibeflow.setTimeEcho(overlayTabId, value);
        markUserActivity(overlayTabId);
        playClick();
      } else if (overlayMode === "thought") {
        animateParkedThought(value);
        showParkedThoughtSkeleton();
        window.vibeflow.addParkedThought(overlayTabId, value);
        markUserActivity(overlayTabId);
        playTick();
      }
      if (overlayMode === "thought") {
        window.setTimeout(() => {
          void refreshContext();
        }, 900);
      } else if (overlayMode === "echo") {
        window.setTimeout(() => {
          void refreshContext();
        }, 300);
      } else {
        void refreshContext();
      }
    }
    closeOverlay();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeOverlay();
  }
});

overlayInput.addEventListener("paste", (event) => {
  void handleImagePaste(event, overlayInput);
});

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) {
    closeOverlay();
  }
});

confirmCancel.addEventListener("click", () => {
  closeConfirm();
  playClick();
});

confirmOk.addEventListener("click", () => {
  const action = confirmAction;
  closeConfirm();
  if (action) {
    action();
  }
  playClick();
});

confirmOverlay.addEventListener("click", (event) => {
  if (event.target === confirmOverlay) {
    closeConfirm();
  }
});

window.addEventListener(
  "keydown",
  (event) => {
    const pressedKey = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && pressedKey === "s") {
      event.preventDefault();
      startVoiceInput();
      return;
    }
    if (overlayMode) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.isContentEditable)) {
      return;
    }
    if (event.altKey && pressedKey === "i") {
      event.preventDefault();
      openOverlay("intent");
    } else if (event.altKey && pressedKey === "e") {
      event.preventDefault();
      openOverlay("echo");
    } else if (event.altKey && pressedKey === "p") {
      event.preventDefault();
      openOverlay("thought");
    } else if ((event.ctrlKey || event.metaKey) && pressedKey === "o") {
      event.preventDefault();
      void selectRepoAndCreateTab();
    }
  },
  { capture: true }
);

const suggestNextStep = (session: LastSession) => {
  if (!session) {
    return "Start a session.";
  }
  if (!session.intent?.text) {
    return "Set a single-sentence intent for this session.";
  }
  if (session.parkedThoughts.length > 0) {
    return "Review parked thoughts and pick the top one to resolve.";
  }
  if (session.flowSummary?.label === "context-loss") {
    return "Re-open the last touched file and re-anchor context.";
  }
  if (session.flowSummary?.label === "drift") {
    return "Consolidate the next action into one focused task.";
  }
  if (session.flowSummary?.label === "deep-flow") {
    return "Continue momentum on the same task.";
  }
  return "Pick the smallest next step to re-enter flow.";
};

const refreshContext = async () => {
  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  if (!activeTab || activeTab.kind !== "terminal") {
    contextIntent.textContent = "-";
    contextFlowTime.textContent = "00:00";
    contextFlowLabel.textContent = "Steady";
    contextFlowLabel.style.color = "#9ca3af";
    contextFlowBar.style.width = "20%";
    contextThoughts.innerHTML = "";
    return;
  }
  const session: ActiveSession = await window.vibeflow.getActiveSession(activeTabId);
  if (!session) {
    contextIntent.textContent = "-";
    contextFlowTime.textContent = "00:00";
    contextFlowLabel.textContent = "Steady";
    contextFlowLabel.style.color = "#9ca3af";
    contextFlowBar.style.width = "20%";
    contextThoughts.innerHTML = "";
    return;
  }
  contextIntent.textContent = session.intent?.text || "No intent set.";
  const summary = session.flowSummary;
  if (summary) {
    const now = Date.now();
    const startMs = Date.parse(session.startedAt);
    if (activeTab.sessionStartedAt !== session.startedAt) {
      activeTab.sessionStartedAt = session.startedAt;
      activeTab.displayElapsedMs = summary.totalActiveMs || 0;
      activeTab.lastDisplayTick = now;
    }
    if (activeTab.displayElapsedMs === undefined) {
      activeTab.displayElapsedMs = summary.totalActiveMs || 0;
      activeTab.lastDisplayTick = now;
    }
    if (activeTab.lastDisplayTick === undefined) {
      activeTab.lastDisplayTick = now;
    }
    const lastUser = activeTab.lastUserActionAt || 0;
    const lastOutput = activeTab.lastOutputAt || 0;
    const lastSignal = Math.max(lastUser, lastOutput, startMs);
    const tabIdleFor = Math.max(0, now - lastSignal);
    const pausedOrIdle = tabIdleFor >= UI_IDLE_THRESHOLD_MS;
    if (!pausedOrIdle) {
      activeTab.displayElapsedMs += Math.max(0, now - activeTab.lastDisplayTick);
    }
    activeTab.lastDisplayTick = now;
    if (pausedOrIdle) {
      const displayMs = Math.max(0, activeTab.displayElapsedMs || 0);
      contextFlowTime.textContent = formatClock(displayMs);
      const isPaused = tabIdleFor >= UI_PAUSED_THRESHOLD_MS;
      contextFlowLabel.textContent = isPaused ? "Paused" : "No activity";
      contextFlowLabel.style.color = isPaused ? "#94a3b8" : "#6b7280";
      contextFlowIcon.className = isPaused
        ? "fa-regular fa-circle-pause"
        : "fa-regular fa-moon";
      contextFlowBar.style.width = isPaused ? "10%" : "8%";
    } else {
      contextFlowTime.textContent = formatClock(activeTab.displayElapsedMs || 0);
      contextFlowLabel.textContent = flowLabelText[summary.label] || "Steady";
      contextFlowIcon.className = "fa-solid fa-bolt";
      const flowColor =
        summary.label === "deep-flow"
          ? "#4ade80"
          : summary.label === "drift"
          ? "#facc15"
          : summary.label === "context-loss"
          ? "#f87171"
          : "#9ca3af";
      contextFlowLabel.style.color = flowColor;
      const ratio =
        summary.sessionDurationMs > 0
          ? Math.min(1, summary.totalActiveMs / summary.sessionDurationMs)
          : 0.2;
      contextFlowBar.style.width = `${Math.max(10, Math.round(ratio * 100))}%`;
    }
  } else {
    contextFlowTime.textContent = "00:00";
    contextFlowLabel.textContent = "Steady";
    contextFlowLabel.style.color = "#9ca3af";
    contextFlowIcon.className = "fa-solid fa-bolt";
    contextFlowBar.style.width = "20%";
  }

  const repoKey = activeTab.projectRoot || activeTab.cwd || null;
  const repoThoughts = repoKey ? await window.vibeflow.getRepoParkedThoughts(repoKey) : [];
  const thoughtsToShow = repoThoughts.length > 0 ? repoThoughts : session.parkedThoughts;

  contextThoughts.innerHTML = "";
  if (thoughtsToShow.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No parked thoughts";
    contextThoughts.appendChild(empty);
  } else {
    for (const thought of thoughtsToShow.slice(0, 4)) {
      const li = document.createElement("li");
      const icon = document.createElement("i");
      icon.className = "fa-regular fa-note-sticky";
      icon.style.color = "#a78bfa";
      const text = document.createElement("span");
      text.textContent = thought.text;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "thoughts-delete";
      remove.title = "Delete parked thought";
      remove.innerHTML = "<i class=\"fa-solid fa-xmark\"></i>";
      remove.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!repoKey || !thought.id) {
          return;
        }
        await window.vibeflow.deleteRepoParkedThought(repoKey, thought.id);
        void refreshContext();
        playClick();
      });
      li.appendChild(icon);
      li.appendChild(text);
      li.appendChild(remove);
      contextThoughts.appendChild(li);
    }
  }
  renderTimeEchoes(activeTab);
};

const showResumeForSession = async (session: SessionRecord) => {
  resumeSession = session;
  resumeOverlay.dataset.sessionId = session.id;
  resumeOverlay.dataset.sessionPath = session.projectRoot || session.cwd;
  resumeOverlay.classList.add("is-open");
  resumeOverlay.setAttribute("aria-hidden", "false");
  const projectName = titleFromPath(session.projectRoot, session.cwd);
  resumeSub.textContent = "Here is where you left off.";
  resumeRepo.textContent = projectName;
  resumeTrace.style.display = "none";
  resumeTrace.textContent = "";
  const trace = await window.vibeflow.readVibeTrace(session.projectRoot || session.cwd);
  if (trace) {
    const intent = trace.intent?.text || "No intent";
    const duration = trace.flowSummary?.sessionDurationMs
      ? formatDuration(trace.flowSummary.sessionDurationMs)
      : "Unknown duration";
    const parkedCount = trace.parkedThoughts?.length || 0;
    resumeTrace.textContent = `VibeTrace found • ${intent} • ${duration} • ${parkedCount} notes`;
    resumeTrace.style.display = "inline-flex";
  }
  resumeDuration.textContent = session.flowSummary
    ? formatHms(session.flowSummary.sessionDurationMs)
    : "00:00:00";
  resumeIntent.textContent = session.intent?.text || "No intent set";
  if (session.flowSummary) {
    resumeFlow.textContent = flowLabelText[session.flowSummary.label] || "Steady";
    resumeFlowDetail.textContent = `Active ${formatDuration(
      session.flowSummary.totalActiveMs
    )} / Idle ${formatDuration(session.flowSummary.totalIdleMs)}`;
  } else {
    resumeFlow.textContent = "Steady";
    resumeFlowDetail.textContent = "Flow summary unavailable";
  }
  resumeNext.textContent = suggestNextStep(session);
};

const openResume = async () => {
  const session = await window.vibeflow.getLastSession();
  if (!session) {
    return;
  }
  await showResumeForSession(session);
};

const animateResumeToContext = async () => {
  if (prefersReducedMotion) {
    return;
  }
  const card = resumeOverlay.querySelector(".resume-card") as HTMLElement | null;
  if (!card) {
    return;
  }
  const cardRect = card.getBoundingClientRect();
  const targetRect = contextPanel.getBoundingClientRect();
  const clone = card.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = `${cardRect.left}px`;
  clone.style.top = `${cardRect.top}px`;
  clone.style.width = `${cardRect.width}px`;
  clone.style.height = `${cardRect.height}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "70";
  clone.style.transformOrigin = "top left";
  document.body.appendChild(clone);

  const scale = Math.min(targetRect.width / cardRect.width, targetRect.height / cardRect.height);
  const dx = targetRect.left - cardRect.left + 12;
  const dy = targetRect.top - cardRect.top + 12;

  resumeOverlay.style.opacity = "0";
  await clone.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.2 }
    ],
    { duration: 520, easing: "cubic-bezier(0.2, 0, 0, 1)" }
  ).finished;

  clone.remove();
  resumeOverlay.style.opacity = "";
  contextPanel.classList.add("resume-pulse");
  window.setTimeout(() => {
    contextPanel.classList.remove("resume-pulse");
  }, 700);
};

resumeContinue.addEventListener("click", async () => {
  logUi("resumeContinue");
  playWhoosh();
  await animateResumeToContext();
  resumeOverlay.classList.remove("is-open");
  resumeOverlay.setAttribute("aria-hidden", "true");
  const targetPath = resumeOverlay.dataset.sessionPath;
  if (targetPath) {
    const existing = findTerminalTabByPath(targetPath);
    if (existing) {
      setActiveTab(existing.id, "resume-continue");
      contextPanel.classList.add("resume-pulse");
      window.setTimeout(() => {
        contextPanel.classList.remove("resume-pulse");
      }, 700);
      return;
    }
    if (!activeTabId || tabs.get(activeTabId)?.kind !== "terminal") {
      await createTab(targetPath);
      contextPanel.classList.add("resume-pulse");
      window.setTimeout(() => {
        contextPanel.classList.remove("resume-pulse");
      }, 700);
      return;
    }
  }
  focusActiveTerminal();
});

resumeNew.addEventListener("click", async () => {
  resumeOverlay.classList.remove("is-open");
  resumeOverlay.setAttribute("aria-hidden", "true");
  welcomePane.classList.add("is-open");
  const session = await window.vibeflow.getLastSession();
  if (session) {
    showReceipt(session, () => {
      void selectRepoAndCreateTab();
    });
    return;
  }
  void selectRepoAndCreateTab();
});

const buildContextSummary = (session: LastSession) => {
  if (!session) {
    return "No session available.";
  }
  const lines: string[] = [];
  lines.push("VibeFlow Session Context");
  lines.push(`Project: ${session.projectRoot || session.cwd}`);
  lines.push(`Ended: ${formatTime(session.endedAt)}`);
  lines.push(`Duration: ${formatDuration(session.flowSummary?.sessionDurationMs || 0)}`);
  if (session.intent?.text) {
    lines.push(`Intent: ${session.intent.text}`);
  }
  if (session.flowSummary) {
    lines.push(
      `Flow: ${flowLabelText[session.flowSummary.label] || "Steady"} | Active ${formatDuration(
        session.flowSummary.totalActiveMs
      )} | Idle ${formatDuration(session.flowSummary.totalIdleMs)}`
    );
  }
  if (session.parkedThoughts.length > 0) {
    lines.push("Parked thoughts:");
    for (const thought of session.parkedThoughts.slice(0, 6)) {
      lines.push(`- ${thought.text}`);
    }
  } else {
    lines.push("Parked thoughts: none");
  }
  lines.push(`Suggested next step: ${suggestNextStep(session)}`);
  return lines.join("\n");
};

copyButton.addEventListener("click", async () => {
  const session = await window.vibeflow.getLastSession();
  if (!session) {
    return;
  }
  const summary = buildContextSummary(session);
  try {
    await navigator.clipboard.writeText(summary);
    playClick();
  } catch {
    // ignore
  }
});

window.vibeflow.onPtyData((tabId, data) => {
  handlePtyData(tabId, data);
});

window.vibeflow.onPtyExit((tabId) => {
  removeTabLocal(tabId);
});

window.vibeflow.onRepoFileActivity(({ tabId, relPath }) => {
  markFileActivity(tabId, relPath, "write");
  markTabActivity(tabId);
});

window.addEventListener("click", () => {
  closeTabColorMenu();
});

window.addEventListener("error", (event) => {
  logStt("window-error", event.message || "unknown");
});

window.addEventListener("unhandledrejection", (event) => {
  logStt("unhandledrejection", event.reason || "unknown");
});

window.vibeflow.onSttStatus((message) => {
  if (!message) {
    return;
  }
  const lower = message.toLowerCase();
  const phase =
    lower.includes("transcrib") || lower.includes("prepar")
      ? "processing"
      : "listening";
  showVoiceOverlay(true, message, phase);
});

window.vibeflow.onSttResult((text) => {
  sttActive = false;
  showVoiceOverlay(false, "");
  if (text) {
    const activeTab = activeTabId ? tabs.get(activeTabId) : null;
    if (chatIsCollapsed && activeTab?.kind === "terminal") {
      insertTextIntoTerminal(activeTab.id, text);
      focusActiveTerminal();
    } else {
      const targetInput = sttTargetInput || resolveVoiceTarget();
      if (targetInput) {
        insertTextAtCursor(targetInput, text);
        if (activeTabId) {
          markUserActivity(activeTabId);
        }
      }
    }
  }
  sttTargetInput = null;
  sttPhase = "idle";
});

window.vibeflow.onSttError((message) => {
  sttActive = false;
  showVoiceOverlay(true, message || "Speech error.", "processing");
  window.setTimeout(() => showVoiceOverlay(false, ""), 1800);
  sttTargetInput = null;
  sttPhase = "idle";
});

tabAddButton.addEventListener("click", () => {
  const idleOpen = isIdleScreenOpen();
  logUi("tabAddClick", { activeTabId, idleOpen });
  if (idleOpen) {
    void selectRepoAndCreateTab();
    return;
  }
  showIdleState();
});

tabsContainer.addEventListener("wheel", (event) => {
  if (event.deltaY !== 0) {
    tabsContainer.scrollLeft += event.deltaY;
  }
});

fileRefresh.addEventListener("click", () => {
  if (activeTabId && tabs.get(activeTabId)?.kind === "terminal") {
    void loadRepoTree();
    playClick();
  }
});

fileToggle.addEventListener("click", () => {
  logUi("toolPanelToggle", { collapsed: toolPanelCollapsed });
  setToolPanelCollapsed(!toolPanelCollapsed);
  fitActiveTerminal();
  playClick();
});

chatSend.addEventListener("click", sendChatCommand);
chatAgent.addEventListener("click", saveIntentFromChat);
chatAttach?.addEventListener("click", () => {
  if (!chatFile || !chatInput) {
    return;
  }
  if (!activeTabId || tabs.get(activeTabId)?.kind !== "terminal") {
    return;
  }
  chatFile.value = "";
  chatFile.click();
});
chatFile?.addEventListener("change", async () => {
  if (!chatFile || !chatInput) {
    return;
  }
  const file = chatFile.files?.[0];
  if (!file) {
    return;
  }
  await handleImageFileUpload(file, chatInput);
  chatFile.value = "";
});
terminalAttach?.addEventListener("click", () => {
  if (!terminalFile || !activeTabId || tabs.get(activeTabId)?.kind !== "terminal") {
    return;
  }
  terminalFile.value = "";
  terminalFile.click();
});
terminalFile?.addEventListener("change", async () => {
  if (!terminalFile || !activeTabId) {
    return;
  }
  const file = terminalFile.files?.[0];
  if (!file) {
    return;
  }
  await handleTerminalImageUpload(file, activeTabId);
  terminalFile.value = "";
});
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatCommand();
  }
});
chatInput.addEventListener("paste", (event) => {
  void handleImagePaste(event, chatInput);
});

chatToggle.addEventListener("click", () => {
  setChatCollapsed(true);
  playClick();
});

chatExpand.addEventListener("click", () => {
  setChatCollapsed(false);
  playClick();
});

quickIntent.addEventListener("click", () => {
  saveIntentFromTerminal();
});

terminalJump.addEventListener("click", () => {
  scrollActiveTerminalToBottom();
  playClick();
});

terminalScrollbarThumb.addEventListener("mousedown", (event) => {
  event.preventDefault();
  isScrollDragging = true;
  const trackRect = terminalScrollbar.getBoundingClientRect();
  const startY = event.clientY;
  const thumbRect = terminalScrollbarThumb.getBoundingClientRect();
  const startOffset = thumbRect.top - trackRect.top;

  const onMove = (moveEvent: MouseEvent) => {
    if (!isScrollDragging) {
      return;
    }
    const delta = moveEvent.clientY - startY;
    const trackHeight = trackRect.height - 4;
    const thumbHeight = thumbRect.height;
    const next = Math.max(0, Math.min(trackHeight - thumbHeight, startOffset + delta));
    const ratio = (trackHeight - thumbHeight) > 0 ? next / (trackHeight - thumbHeight) : 0;
    scrollTerminalToRatio(ratio);
  };

  const onUp = () => {
    isScrollDragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
});

terminalScrollbar.addEventListener("mousedown", (event) => {
  if (event.target === terminalScrollbarThumb) {
    return;
  }
  const trackRect = terminalScrollbar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientY - trackRect.top) / trackRect.height));
  scrollTerminalToRatio(ratio);
});

contextToggle.addEventListener("click", () => {
  const next = !contextPanel.classList.contains("collapsed");
  contextPanel.classList.toggle("collapsed", next);
  contextIcon.className = next ? "fa-solid fa-angle-left" : "fa-solid fa-angle-right";
  setStoredBool("vf-ui-context-collapsed", next);
  fitActiveTerminal();
  playClick();
});

contextIntentAction.addEventListener("click", () => {
  openOverlay("intent");
  playClick();
});
contextEchoAction.addEventListener("click", () => {
  openOverlay("echo");
  playClick();
});
contextThoughtAction.addEventListener("click", () => {
  openOverlay("thought");
  playClick();
});
contextCopy.addEventListener("click", async () => {
  if (!activeTabId) {
    return;
  }
  const session = await window.vibeflow.getActiveSession(activeTabId);
  if (!session) {
    return;
  }
  const summary = buildContextSummary(session);
  try {
    await navigator.clipboard.writeText(summary);
    playClick();
  } catch {
    // ignore
  }
});

minimizeButton.addEventListener("click", () => {
  window.vibeflow.windowControl("minimize");
  playClick();
});
maximizeButton.addEventListener("click", () => {
  void window.vibeflow.isWindowMaximized().then((maximized) => {
    window.vibeflow.windowControl(maximized ? "restore" : "maximize");
  });
  playClick();
});
closeButton.addEventListener("click", () => {
  window.vibeflow.windowControl("close");
  playClick();
});

settingsOpen.addEventListener("click", () => {
  openSpecialTab("settings");
  playClick();
});

historyOpen.addEventListener("click", () => {
  openSpecialTab("history");
  playClick();
});

receiptClose.addEventListener("click", () => {
  hideReceipt();
});

receiptCopy.addEventListener("click", async () => {
  if (!receiptText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(receiptText);
    playClick();
  } catch {
    // ignore
  }
});

receiptNew.addEventListener("click", () => {
  hideReceipt();
  if (receiptAction) {
    receiptAction();
    return;
  }
  void selectRepoAndCreateTab();
});

window.vibeflow.onWindowState((state) => {
  maximizeIcon.className = state.maximized
    ? "fa-regular fa-window-restore"
    : "fa-regular fa-square";
});

if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(() => fitActiveTerminal());
  ro.observe(terminalStack);
} else {
  window.addEventListener("resize", () => fitActiveTerminal());
}

setInterval(() => {
  void refreshContext();
}, 4000);

void updateWindowButtons();
updateAudioToggle();
const storedChatCollapsed = getStoredBool("vf-ui-chat-collapsed", true);
setChatCollapsed(storedChatCollapsed);
setToolPanelVisible(false);
const storedToolCollapsed = getStoredBool("vf-ui-tool-collapsed", false);
setToolPanelCollapsed(storedToolCollapsed);
const storedContextCollapsed = getStoredBool("vf-ui-context-collapsed", false);
contextPanel.classList.toggle("collapsed", storedContextCollapsed);
contextIcon.className = storedContextCollapsed
  ? "fa-solid fa-angle-left"
  : "fa-solid fa-angle-right";
welcomeSelect.addEventListener("click", () => {
  playClick();
  void selectRepoAndCreateTab();
});

welcomePane.classList.add("is-open");
renderTabs();
renderChat();
void refreshContext();
void refreshRecentRepos();
void openResume();
