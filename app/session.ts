import fs from "fs";
import path from "path";

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
  text: string;
  createdAt: string;
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
  parkedThoughts: ParkedThought[];
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

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const IDLE_GAP_THRESHOLD_MS = 5 * 60 * 1000;
const AUTO_END_THRESHOLD_MS = 10 * 60 * 1000;
const ACTIVITY_SAMPLE_MS = 1000;
const DEEP_FLOW_THRESHOLD_MS = 15 * 60 * 1000;
const DRIFT_BLOCK_MAX_MS = 5 * 60 * 1000;
const DRIFT_BLOCK_MIN_MS = 30 * 1000;
const CONTEXT_LOSS_THRESHOLD_MS = 5 * 60 * 1000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSessions(): SessionRecord[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
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
        parkedThoughts: safeRecord.parkedThoughts || [],
        flowSummary: safeRecord.flowSummary,
        endReason: safeRecord.endReason
      };
    });
  } catch {
    const backup = `${SESSIONS_FILE}.${Date.now()}.bak`;
    try {
      fs.copyFileSync(SESSIONS_FILE, backup);
    } catch {
      // ignore backup errors
    }
    return [];
  }
}

function saveSessions(sessions: SessionRecord[]) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

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

export class SessionManager {
  private state: SessionState;
  private saveTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.state = {
      sessions: loadSessions(),
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
      parkedThoughts: []
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
    tab.session.intent = {
      text: cleaned,
      setAt: new Date(now).toISOString()
    };
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
    tab.session.parkedThoughts.push({
      text: cleaned,
      createdAt: new Date(now).toISOString()
    });
    this.recordActivity(tabId, "parked-thought");
    this.saveSoon();
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

  private saveSoon(force = false) {
    if (force) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      saveSessions(this.state.sessions);
      return;
    }
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveSessions(this.state.sessions);
    }, 2000);
  }
}
