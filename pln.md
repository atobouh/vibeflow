# VibeFlow MVP Plan (Cross-Platform, Electron + TS + JSON)

## Stack
- App shell: Electron
- UI: Vanilla TypeScript (renderer)
- Terminal: node-pty (main) + xterm.js (renderer)
- Storage: Local JSON files
- IPC: Electron IPC for stdin/stdout + session events

## Phase 0: Repo Scaffold
- Create folders:
  - `app/` (Electron main process)
  - `ui/` (renderer)
  - `shared/` (types + helpers)
  - `data/` (runtime JSON storage)
- Add build tooling for TS in main + renderer.

## Phase 1: Terminal Wrapper
- Electron window with an xterm.js terminal view.
- Spawn the user shell via node-pty.
- Wire IPC: renderer -> main (stdin), main -> renderer (stdout).
- Basic resize handling for terminal dimensions.

## Phase 2: Session Engine
- Detect git root by walking up for a `.git` folder.
- Auto-start a session on app launch.
- Track:
  - session start/end timestamps
  - activity timestamps
  - idle gaps
- Auto-end session after inactivity or on app close.
- Persist sessions to JSON.

## Phase 3: Intent + Parked Thoughts
- Hotkey to open "intent" popup (1 sentence).
- Hotkey to open "parked thought" popup (1 line).
- Save intent + thoughts with timestamps and session id.

## Phase 4: Flow Heuristics
- Simple rules:
  - deep flow = long continuous activity
  - drift = frequent context switching
  - context loss = long pauses
- Summarize flow per session.

## Phase 5: Resume Screen (WOW Moment)
- Show last session:
  - duration
  - last intent
  - flow summary
  - parked thoughts
  - top files touched (optional for MVP)
- Suggested next step (rule-based).

## Phase 6: Copy-for-Agent
- Generate a short session summary string.
- One-click copy to clipboard.

## MVP Done Criteria
- Demo shows a session start -> intent -> parked thought -> session end -> resume view -> copy summary.
