export {};

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

type SessionRecord = {
  id: string;
  tabId: string;
  projectRoot: string | null;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  activity: string[];
  idleGaps: Array<{
    startAt: string;
    endAt: string;
    durationMs: number;
  }>;
  intent?: {
    text: string;
    setAt: string;
  };
  parkedThoughts: Array<{
    text: string;
    createdAt: string;
  }>;
  flowSummary?: FlowSummary;
  endReason?: string;
};

type TabCreateResult = {
  id: string;
  cwd: string;
  projectRoot: string | null;
  shellKind: "powershell" | "cmd" | "bash" | "zsh" | "fish" | "unknown";
};

type RecentSession = {
  id: string;
  projectRoot: string | null;
  cwd: string;
  endedAt?: string;
  intent?: {
    text: string;
    setAt: string;
  };
};

declare global {
  interface Window {
    vibeflow: {
      createTab: (cwd?: string) => Promise<TabCreateResult>;
      closeTab: (tabId: string) => Promise<void>;
      selectRepo: () => Promise<string | null>;
      write: (tabId: string, data: string) => void;
      resize: (tabId: string, cols: number, rows: number) => void;
      setIntent: (tabId: string, text: string) => void;
      addParkedThought: (tabId: string, text: string) => void;
      getLastSession: () => Promise<SessionRecord | null>;
      getActiveSession: (tabId: string) => Promise<SessionRecord | null>;
      getRecentSessions: () => Promise<RecentSession[]>;
      getAllSessions: () => Promise<SessionRecord[]>;
      onPtyData: (callback: (tabId: string, data: string) => void) => () => void;
      onPtyExit: (callback: (tabId: string) => void) => () => void;
      windowControl: (action: "minimize" | "maximize" | "restore" | "close") => void;
      isWindowMaximized: () => Promise<boolean>;
      onWindowState: (callback: (state: { maximized: boolean }) => void) => () => void;
    };
  }
}
