import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type IdleGap = {
  startAt: string;
  endAt: string;
  durationMs: number;
};

type IntentEntry = {
  text: string;
  setAt: string;
};

type ParkedThought = {
  id: string;
  text: string;
  createdAt: string;
};

type FileTouch = {
  reads: number;
  writes: number;
  lastTouched: string;
};

type TimeEcho = {
  id: string;
  text: string;
  createdAt: string;
  deliverAt: string;
  deliveredAt?: string;
  sourceSessionId?: string;
};

type FlowSummary = {
  sessionDurationMs: number;
  totalActiveMs: number;
  totalIdleMs: number;
  deepFlowBlocks: number;
  totalDeepFlowMs: number;
  longestDeepFlowMs: number;
  driftBlocks: number;
  contextLossGaps: number;
  label: "deep-flow" | "drift" | "context-loss" | "steady";
};

type VibeTracePayload = {
  version: 1;
  generatedAt: string;
  sessionId: string;
  projectRoot: string | null;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  intent?: IntentEntry;
  intentTimeline: IntentEntry[];
  parkedThoughts: ParkedThought[];
  flowSummary?: FlowSummary;
  endReason?: string;
  commitHash?: string;
  touchedFiles: Array<{
    path: string;
    reads: number;
    writes: number;
    lastTouched: string;
  }>;
  contextDiff: {
    intent: string | null;
    touchedFiles: Array<{
      path: string;
      reads: number;
      writes: number;
    }>;
  };
};

type AppConfig = {
  vibeTraceIncludeByRepo: Record<string, boolean>;
  pendingTimeEchoesByRepo: Record<string, TimeEcho[]>;
  repoParkedThoughtsByRepo: Record<string, ParkedThought[]>;
};

const DEFAULT_CONFIG: AppConfig = {
  vibeTraceIncludeByRepo: {},
  pendingTimeEchoesByRepo: {},
  repoParkedThoughtsByRepo: {}
};

export type SessionRecord = {
  id: string;
  tabId: string;
  projectRoot: string | null;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  activity: string[];
  idleGaps: IdleGap[];
  intent?: IntentEntry;
  intentTimeline?: IntentEntry[];
  parkedThoughts: ParkedThought[];
  timeEchoes?: TimeEcho[];
  timeEcho?: TimeEcho;
  vibeTrace?: VibeTracePayload;
  fileTouches?: Record<string, FileTouch>;
  flowSummary?: FlowSummary;
  endReason?: string;
  idleForMs?: number;
  paused?: boolean;
};

export type RecentSession = {
  id: string;
  projectRoot: string | null;
  cwd: string;
  endedAt?: string;
  intent?: IntentEntry;
};

type ActiveTabState = {
  session: SessionRecord;
  lastActivityAt: number;
  lastActivityRecordedAt: number;
  idleStartedAt: number | null;
};

type SessionState = {
  sessions: SessionRecord[];
  tabs: Map<string, ActiveTabState>;
};

const IDLE_GAP_THRESHOLD_MS = 5 * 60 * 1000;
const AUTO_END_THRESHOLD_MS = 10 * 60 * 1000;
const ACTIVITY_SAMPLE_MS = 1000;
const DEEP_FLOW_THRESHOLD_MS = 15 * 60 * 1000;
const DRIFT_BLOCK_MAX_MS = 5 * 60 * 1000;
const DRIFT_BLOCK_MIN_MS = 30 * 1000;
const CONTEXT_LOSS_THRESHOLD_MS = 5 * 60 * 1000;

// data storage handled by SessionManager instance

function findGitRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function createSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function computeFlowSummary(session: SessionRecord, endAtMs: number): FlowSummary {
  const startMs = Date.parse(session.startedAt);
  const gaps = [...session.idleGaps].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)
  );

  const blocks: Array<{ start: number; end: number }> = [];
  let cursor = startMs;

  for (const gap of gaps) {
    const gapStart = Date.parse(gap.startAt);
    const gapEnd = Date.parse(gap.endAt);
    if (gapStart > cursor) {
      blocks.push({ start: cursor, end: gapStart });
    }
    cursor = Math.max(cursor, gapEnd);
  }

  if (endAtMs > cursor) {
    blocks.push({ start: cursor, end: endAtMs });
  }

  const totalIdleMs = gaps.reduce((sum, gap) => sum + gap.durationMs, 0);
  const totalActiveMs = blocks.reduce((sum, block) => sum + (block.end - block.start), 0);

  let deepFlowBlocks = 0;
  let totalDeepFlowMs = 0;
  let longestDeepFlowMs = 0;
  let driftBlocks = 0;

  for (const block of blocks) {
    const duration = block.end - block.start;
    if (duration >= DEEP_FLOW_THRESHOLD_MS) {
      deepFlowBlocks += 1;
      totalDeepFlowMs += duration;
      if (duration > longestDeepFlowMs) {
        longestDeepFlowMs = duration;
      }
    } else if (duration >= DRIFT_BLOCK_MIN_MS && duration <= DRIFT_BLOCK_MAX_MS) {
      driftBlocks += 1;
    }
  }

  const contextLossGaps = gaps.filter((gap) => gap.durationMs >= CONTEXT_LOSS_THRESHOLD_MS)
    .length;

  let label: FlowSummary["label"] = "steady";
  if (deepFlowBlocks > 0 && totalDeepFlowMs >= 20 * 60 * 1000) {
    label = "deep-flow";
  } else if (contextLossGaps > 0) {
    label = "context-loss";
  } else if (driftBlocks >= 3) {
    label = "drift";
  }

  return {
    sessionDurationMs: Math.max(0, endAtMs - startMs),
    totalActiveMs,
    totalIdleMs,
    deepFlowBlocks,
    totalDeepFlowMs,
    longestDeepFlowMs,
    driftBlocks,
    contextLossGaps,
    label
  };
}

function normalizeRelPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function buildTouchedFiles(session: SessionRecord) {
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
}

function buildVibeTracePayload(session: SessionRecord): VibeTracePayload {
  const touchedFiles = buildTouchedFiles(session);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionId: session.id,
    projectRoot: session.projectRoot,
    cwd: session.cwd,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    intent: session.intent,
    intentTimeline: session.intentTimeline || [],
    parkedThoughts: session.parkedThoughts,
    flowSummary: session.flowSummary,
    endReason: session.endReason,
    touchedFiles,
    contextDiff: {
      intent: session.intent?.text || null,
      touchedFiles: touchedFiles.map((item) => ({
        path: item.path,
        reads: item.reads,
        writes: item.writes
      }))
    }
  };
}

export class SessionManager {
  private state: SessionState;
  private saveTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private dataDir: string;
  private sessionsFile: string;
  private configFile: string;
  private vibeTraceIncludeByRepo: Record<string, boolean> = {};
  private pendingTimeEchoesByRepo: Record<string, TimeEcho[]> = {};
  private repoParkedThoughtsByRepo: Record<string, ParkedThought[]> = {};

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), "data");
    this.sessionsFile = path.join(this.dataDir, "sessions.json");
    this.configFile = path.join(this.dataDir, "config.json");
    const config = this.loadConfig();
    this.vibeTraceIncludeByRepo = config.vibeTraceIncludeByRepo;
    this.pendingTimeEchoesByRepo = config.pendingTimeEchoesByRepo;
    this.repoParkedThoughtsByRepo = config.repoParkedThoughtsByRepo;
    this.state = {
      sessions: this.loadSessions(),
      tabs: new Map()
    };
  }

  startSession(tabId: string, reason: string, cwd = process.cwd()) {
    if (this.state.tabs.has(tabId)) {
      return;
    }
    const now = Date.now();
    const session: SessionRecord = {
      id: createSessionId(),
      tabId,
      projectRoot: findGitRoot(cwd),
      cwd,
      startedAt: new Date(now).toISOString(),
      activity: [new Date(now).toISOString()],
      idleGaps: [],
      parkedThoughts: [],
      intentTimeline: [],
      fileTouches: {}
    };

    this.state.sessions.push(session);
    this.state.tabs.set(tabId, {
      session,
      lastActivityAt: now,
      lastActivityRecordedAt: now,
      idleStartedAt: null
    });

    this.saveSoon();
    this.startIdleTimer();
  }

  setIntent(tabId: string, text: string) {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }
    const tab = this.getOrStart(tabId, "intent");
    if (!tab) {
      return;
    }
    const now = Date.now();
    const entry = {
      text: cleaned,
      setAt: new Date(now).toISOString()
    };
    tab.session.intent = entry;
    if (!tab.session.intentTimeline) {
      tab.session.intentTimeline = [];
    }
    tab.session.intentTimeline.push(entry);
    this.recordActivity(tabId, "intent");
    this.saveSoon();
  }

  addParkedThought(tabId: string, text: string) {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }
    const tab = this.getOrStart(tabId, "parked-thought");
    if (!tab) {
      return;
    }
    const now = Date.now();
    const thought = {
      id: createSessionId(),
      text: cleaned,
      createdAt: new Date(now).toISOString()
    };
    tab.session.parkedThoughts.push(thought);
    const repoKey = tab.session.projectRoot || tab.session.cwd;
    if (repoKey) {
      if (!this.repoParkedThoughtsByRepo[repoKey]) {
        this.repoParkedThoughtsByRepo[repoKey] = [];
      }
      this.repoParkedThoughtsByRepo[repoKey].push(thought);
      this.saveConfig();
    }
    this.recordActivity(tabId, "parked-thought");
    this.saveSoon();
  }

  setTimeEcho(tabId: string, text: string): boolean {
    const cleaned = text.trim();
    if (!cleaned) {
      return false;
    }
    const tab = this.getOrStart(tabId, "time-echo");
    if (!tab) {
      return false;
    }
    if (!tab.session.timeEchoes) {
      tab.session.timeEchoes = [];
    }
    const now = new Date();
    tab.session.timeEchoes.push({
      id: createSessionId(),
      text: cleaned,
      createdAt: now.toISOString(),
      deliverAt: now.toISOString(),
      sourceSessionId: tab.session.id
    });
    this.recordActivity(tabId, "time-echo");
    this.saveSoon();
    return true;
  }

  markTimeEchoDelivered(sessionId: string): boolean {
    const session = this.state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return false;
    }
    const now = new Date().toISOString();
    let updated = false;
    if (session.timeEchoes && session.timeEchoes.length > 0) {
      for (const echo of session.timeEchoes) {
        if (!echo.deliveredAt) {
          echo.deliveredAt = now;
          updated = true;
        }
      }
    } else if (session.timeEcho && !session.timeEcho.deliveredAt) {
      session.timeEcho.deliveredAt = now;
      updated = true;
    }
    if (updated) {
      this.saveSoon(true);
    }
    return updated;
  }

  recordActivity(tabId: string, source: string) {
    const tab = this.getOrStart(tabId, `activity:${source}`);
    if (!tab) {
      return;
    }

    const now = Date.now();
    tab.lastActivityAt = now;

    if (tab.idleStartedAt !== null) {
      this.recordIdleGap(tab, now);
    }

    if (now - tab.lastActivityRecordedAt >= ACTIVITY_SAMPLE_MS) {
      tab.session.activity.push(new Date(now).toISOString());
      tab.lastActivityRecordedAt = now;
      this.saveSoon();
    }
  }

  recordFileTouch(tabId: string, relPath: string, type: "read" | "write") {
    const cleaned = normalizeRelPath(relPath);
    if (!cleaned) {
      return;
    }
    const tab = this.getOrStart(tabId, `file-${type}`);
    if (!tab) {
      return;
    }
    if (!tab.session.fileTouches) {
      tab.session.fileTouches = {};
    }
    const now = new Date().toISOString();
    const existing = tab.session.fileTouches[cleaned] || {
      reads: 0,
      writes: 0,
      lastTouched: now
    };
    if (type === "read") {
      existing.reads += 1;
    } else {
      existing.writes += 1;
    }
    existing.lastTouched = now;
    tab.session.fileTouches[cleaned] = existing;
    this.recordActivity(tabId, `file-${type}`);
    this.saveSoon();
  }

  private queueTimeEchoes(session: SessionRecord) {
    const repoKey = session.projectRoot || session.cwd;
    if (!repoKey) {
      return;
    }
    const echoes = session.timeEchoes || (session.timeEcho ? [session.timeEcho] : []);
    if (echoes.length === 0) {
      return;
    }
    const existing = this.pendingTimeEchoesByRepo[repoKey] || [];
    this.pendingTimeEchoesByRepo[repoKey] = existing.concat(echoes);
    this.saveConfig();
  }

  endSession(tabId: string, reason: string) {
    const tab = this.state.tabs.get(tabId);
    if (!tab) {
      return;
    }
    const now = Date.now();
    if (tab.idleStartedAt !== null) {
      this.recordIdleGap(tab, now);
    }
    tab.session.endedAt = new Date(now).toISOString();
    tab.session.endReason = reason;
    tab.session.flowSummary = computeFlowSummary(tab.session, now);
    this.queueTimeEchoes(tab.session);
    tab.session.vibeTrace = buildVibeTracePayload(tab.session);
    this.writeVibeTrace(tab.session);
    this.state.tabs.delete(tabId);
    if (this.state.tabs.size === 0) {
      this.stopIdleTimer();
    }
    this.saveSoon(true);
  }

  shutdown() {
    for (const tabId of Array.from(this.state.tabs.keys())) {
      this.endSession(tabId, "app-quit");
    }
    this.stopIdleTimer();
  }

  getActiveSession(tabId: string): SessionRecord | null {
    const tab = this.state.tabs.get(tabId);
    if (!tab) {
      return null;
    }
    const now = Date.now();
    const idleForMs = Math.max(0, now - tab.lastActivityAt);
    const paused = idleForMs >= IDLE_GAP_THRESHOLD_MS;
    return {
      ...tab.session,
      flowSummary: computeFlowSummary(tab.session, now),
      idleForMs,
      paused
    };
  }

  getLastEndedSession(): SessionRecord | null {
    for (let i = this.state.sessions.length - 1; i >= 0; i -= 1) {
      const session = this.state.sessions[i];
      if (session.endedAt) {
        return session;
      }
    }
    return null;
  }

  getLastSession(): SessionRecord | null {
    let latest: SessionRecord | null = null;
    let latestTime = 0;

    for (const session of this.state.sessions) {
      const activity = session.activity?.[session.activity.length - 1];
      const candidate = activity || session.endedAt || session.startedAt;
      const candidateTime = Date.parse(candidate);
      if (!Number.isNaN(candidateTime) && candidateTime >= latestTime) {
        latest = session;
        latestTime = candidateTime;
      }
    }

    return latest;
  }

  getRecentSessions(limit = 3): RecentSession[] {
    const recent: RecentSession[] = [];
    const seen = new Set<string>();

    for (let i = this.state.sessions.length - 1; i >= 0; i -= 1) {
      const session = this.state.sessions[i];
      if (!session.endedAt) {
        continue;
      }
      const key = session.projectRoot || session.cwd;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      recent.push({
        id: session.id,
        projectRoot: session.projectRoot,
        cwd: session.cwd,
        endedAt: session.endedAt,
        intent: session.intent
      });
      if (recent.length >= limit) {
        break;
      }
    }
    return recent;
  }

  getAllSessions(): SessionRecord[] {
    return this.state.sessions.map((session) => {
      const endAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
      return {
        ...session,
        flowSummary: session.flowSummary || computeFlowSummary(session, endAtMs)
      };
    });
  }

  deleteSession(sessionId: string): boolean {
    const activeTabId = Array.from(this.state.tabs.entries()).find(
      ([, tab]) => tab.session.id === sessionId
    )?.[0];
    if (activeTabId) {
      this.endSession(activeTabId, "deleted");
    }
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => session.id !== sessionId);
    if (this.state.sessions.length !== before) {
      this.saveSoon(true);
      return true;
    }
    return false;
  }

  deleteRepoContext(repoKey: string): number {
    const activeTabIds = Array.from(this.state.tabs.entries())
      .filter(([, tab]) => (tab.session.projectRoot || tab.session.cwd) === repoKey)
      .map(([tabId]) => tabId);
    for (const tabId of activeTabIds) {
      this.endSession(tabId, "deleted");
    }
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter(
      (session) => (session.projectRoot || session.cwd) !== repoKey
    );
    const removed = before - this.state.sessions.length;
    if (removed > 0) {
      this.saveSoon(true);
    }
    if (this.vibeTraceIncludeByRepo[repoKey]) {
      delete this.vibeTraceIncludeByRepo[repoKey];
      this.saveConfig();
    }
    if (this.pendingTimeEchoesByRepo[repoKey]) {
      delete this.pendingTimeEchoesByRepo[repoKey];
      this.saveConfig();
    }
    if (this.repoParkedThoughtsByRepo[repoKey]) {
      delete this.repoParkedThoughtsByRepo[repoKey];
      this.saveConfig();
    }
    return removed;
  }

  getVibeTraceInclude(repoKey: string | null): boolean {
    if (!repoKey) {
      return false;
    }
    return this.vibeTraceIncludeByRepo[repoKey] === true;
  }

  setVibeTraceInclude(repoKey: string | null, include: boolean): boolean {
    if (!repoKey) {
      return false;
    }
    if (include) {
      this.vibeTraceIncludeByRepo[repoKey] = true;
    } else {
      delete this.vibeTraceIncludeByRepo[repoKey];
    }
    this.saveConfig();
    this.syncGitignore(repoKey, include);
    return include;
  }

  readVibeTrace(repoKey: string | null): VibeTracePayload | null {
    if (!repoKey) {
      return null;
    }
    try {
      const tracePath = path.join(repoKey, ".vibeflow", "trace.json");
      if (!fs.existsSync(tracePath)) {
        return null;
      }
      const raw = fs.readFileSync(tracePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed as VibeTracePayload;
    } catch {
      return null;
    }
  }

  consumeTimeEchoes(repoKey: string | null): TimeEcho[] {
    if (!repoKey) {
      return [];
    }
    const echoes = this.pendingTimeEchoesByRepo[repoKey] || [];
    if (echoes.length === 0) {
      return [];
    }
    delete this.pendingTimeEchoesByRepo[repoKey];
    this.saveConfig();
    return echoes;
  }

  getRepoParkedThoughts(repoKey: string | null): ParkedThought[] {
    if (!repoKey) {
      return [];
    }
    const list = this.repoParkedThoughtsByRepo[repoKey] || [];
    let changed = false;
    const normalized = list.map((thought) => {
      if (thought.id) {
        return thought;
      }
      changed = true;
      return {
        ...thought,
        id: createSessionId()
      };
    });
    if (changed) {
      this.repoParkedThoughtsByRepo[repoKey] = normalized;
      this.saveConfig();
    }
    return normalized;
  }

  deleteRepoParkedThought(repoKey: string | null, thoughtId: string): boolean {
    if (!repoKey || !thoughtId) {
      return false;
    }
    const list = this.repoParkedThoughtsByRepo[repoKey] || [];
    const next = list.filter((thought) => thought.id !== thoughtId);
    if (next.length === list.length) {
      return false;
    }
    this.repoParkedThoughtsByRepo[repoKey] = next;
    for (const session of this.state.sessions) {
      if (!session.parkedThoughts || session.parkedThoughts.length === 0) {
        continue;
      }
      session.parkedThoughts = session.parkedThoughts.filter(
        (thought) => thought.id !== thoughtId
      );
    }
    this.saveConfig();
    this.saveSoon(true);
    return true;
  }

  private getOrStart(tabId: string, reason: string) {
    if (!this.state.tabs.has(tabId)) {
      this.startSession(tabId, reason);
    }
    return this.state.tabs.get(tabId) || null;
  }

  private recordIdleGap(tab: ActiveTabState, now: number) {
    if (tab.idleStartedAt === null) {
      return;
    }
    const start = tab.idleStartedAt;
    if (now > start) {
      tab.session.idleGaps.push({
        startAt: new Date(start).toISOString(),
        endAt: new Date(now).toISOString(),
        durationMs: now - start
      });
    }
    tab.idleStartedAt = null;
    this.saveSoon();
  }

  private startIdleTimer() {
    if (this.idleTimer) {
      return;
    }
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      const toEnd: string[] = [];
      for (const [tabId, tab] of this.state.tabs.entries()) {
        const idleFor = now - tab.lastActivityAt;
        if (idleFor >= IDLE_GAP_THRESHOLD_MS && tab.idleStartedAt === null) {
          tab.idleStartedAt = tab.lastActivityAt;
        }
        if (idleFor >= AUTO_END_THRESHOLD_MS) {
          toEnd.push(tabId);
        }
      }
      for (const tabId of toEnd) {
        this.endSession(tabId, "inactivity");
      }
    }, 10_000);
  }

  private stopIdleTimer() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private loadConfig(): AppConfig {
    try {
      if (!fs.existsSync(this.configFile)) {
        return DEFAULT_CONFIG;
      }
      const raw = fs.readFileSync(this.configFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        vibeTraceIncludeByRepo:
          parsed.vibeTraceIncludeByRepo && typeof parsed.vibeTraceIncludeByRepo === "object"
            ? parsed.vibeTraceIncludeByRepo
            : DEFAULT_CONFIG.vibeTraceIncludeByRepo,
        pendingTimeEchoesByRepo:
          parsed.pendingTimeEchoesByRepo && typeof parsed.pendingTimeEchoesByRepo === "object"
            ? parsed.pendingTimeEchoesByRepo
            : DEFAULT_CONFIG.pendingTimeEchoesByRepo,
        repoParkedThoughtsByRepo:
          parsed.repoParkedThoughtsByRepo && typeof parsed.repoParkedThoughtsByRepo === "object"
            ? parsed.repoParkedThoughtsByRepo
            : DEFAULT_CONFIG.repoParkedThoughtsByRepo
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private saveConfig() {
    this.ensureDataDir();
    const payload: AppConfig = {
      vibeTraceIncludeByRepo: this.vibeTraceIncludeByRepo,
      pendingTimeEchoesByRepo: this.pendingTimeEchoesByRepo,
      repoParkedThoughtsByRepo: this.repoParkedThoughtsByRepo
    };
    fs.writeFileSync(this.configFile, JSON.stringify(payload, null, 2), "utf8");
  }

  private getGitHead(repoRoot: string): string | null {
    try {
      const output = execSync("git rev-parse HEAD", {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"]
      })
        .toString()
        .trim();
      return output || null;
    } catch {
      return null;
    }
  }

  private writeVibeTrace(session: SessionRecord) {
    const repoRoot = session.projectRoot || session.cwd;
    if (!repoRoot) {
      return;
    }
    try {
      const traceDir = path.join(repoRoot, ".vibeflow");
      fs.mkdirSync(traceDir, { recursive: true });
      const payload = session.vibeTrace || buildVibeTracePayload(session);
      const gitHead = session.projectRoot ? this.getGitHead(session.projectRoot) : null;
      if (gitHead) {
        payload.commitHash = gitHead;
      }
      session.vibeTrace = payload;
      const tracePath = path.join(traceDir, "trace.json");
      fs.writeFileSync(tracePath, JSON.stringify(payload, null, 2), "utf8");
      if (session.projectRoot) {
        const include = this.getVibeTraceInclude(session.projectRoot);
        this.syncGitignore(session.projectRoot, include);
      }
    } catch {
      // ignore write failures
    }
  }

  private syncGitignore(repoRoot: string, include: boolean) {
    const gitDir = path.join(repoRoot, ".git");
    if (!fs.existsSync(gitDir)) {
      return;
    }
    const gitignorePath = path.join(repoRoot, ".gitignore");
    const entry = ".vibeflow/";
    if (!fs.existsSync(gitignorePath)) {
      if (!include) {
        fs.writeFileSync(gitignorePath, `${entry}\n`, "utf8");
      }
      return;
    }
    const raw = fs.readFileSync(gitignorePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      return (
        trimmed !== ".vibeflow" &&
        trimmed !== entry &&
        trimmed !== "/.vibeflow" &&
        trimmed !== "/.vibeflow/"
      );
    });
    if (!include) {
      filtered.push(entry);
    }
    const next = filtered.join("\n").replace(/\n+$/, "");
    fs.writeFileSync(gitignorePath, next ? `${next}\n` : `${entry}\n`, "utf8");
  }

  private saveSoon(force = false) {
    if (force) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.saveSessions(this.state.sessions);
      return;
    }
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSessions(this.state.sessions);
    }, 2000);
  }

  private ensureDataDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private loadSessions(): SessionRecord[] {
    try {
      if (!fs.existsSync(this.sessionsFile)) {
        return [];
      }
      const raw = fs.readFileSync(this.sessionsFile, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((record, index) => {
        const safeRecord = record as Partial<SessionRecord>;
        return {
          id: safeRecord.id || `legacy-${index}`,
          tabId: safeRecord.tabId || "legacy",
          projectRoot: safeRecord.projectRoot || null,
          cwd: safeRecord.cwd || process.cwd(),
          startedAt: safeRecord.startedAt || new Date(0).toISOString(),
          endedAt: safeRecord.endedAt,
          activity: safeRecord.activity || [],
          idleGaps: safeRecord.idleGaps || [],
          intent: safeRecord.intent,
          intentTimeline: safeRecord.intentTimeline || [],
          parkedThoughts: (safeRecord.parkedThoughts || []).map((thought) => ({
            id: (thought as ParkedThought).id || createSessionId(),
            text: thought.text || "",
            createdAt: thought.createdAt || new Date(0).toISOString()
          })),
          timeEchoes: (
            safeRecord.timeEchoes ||
            (safeRecord.timeEcho ? [safeRecord.timeEcho] : [])
          ).map((echo) => ({
            id: (echo as TimeEcho).id || createSessionId(),
            text: echo.text || "",
            createdAt: echo.createdAt || new Date(0).toISOString(),
            deliverAt: echo.deliverAt || new Date(0).toISOString(),
            deliveredAt: echo.deliveredAt,
            sourceSessionId: echo.sourceSessionId
          })),
          timeEcho: safeRecord.timeEcho,
          vibeTrace: safeRecord.vibeTrace,
          fileTouches: safeRecord.fileTouches || {},
          flowSummary: safeRecord.flowSummary,
          endReason: safeRecord.endReason
        };
      });
    } catch {
      const backup = `${this.sessionsFile}.${Date.now()}.bak`;
      try {
        fs.copyFileSync(this.sessionsFile, backup);
      } catch {
        // ignore backup errors
      }
      return [];
    }
  }

  private saveSessions(sessions: SessionRecord[]) {
    this.ensureDataDir();
    fs.writeFileSync(this.sessionsFile, JSON.stringify(sessions, null, 2), "utf8");
  }
}
