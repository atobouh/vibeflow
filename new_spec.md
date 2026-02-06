# Time Echo + VibeTrace - Implementation Plan

## Phase 1 - Data model + storage (DONE)
- Add `timeEcho` to session record (text, createdAt, deliverAt)
- Add `intentTimeline[]` with timestamps
- Add VibeTrace payload builder (intent, timeline, parked thoughts, flow summary, optional last commit hash)
- Store VibeTrace payload in session JSON (future: optional .vibeflow/trace.json)

## Phase 2 - Time Echo UX (DONE)
- Add "Send Time Echo" action (button + Alt+E)
- Input: single line, no edit later
- On resume: show full-screen Time Echo for ~1-2s before resuming
- Enforce scarcity: one echo per session

## Phase 3 - VibeTrace write (DONE)
- On session end: generate `.vibeflow/trace.json`
- Ensure `.vibeflow/` is in `.gitignore` by default
- Add opt-in toggle "Include VibeTrace in repo" (if on, remove from ignore)
- Optional: append last commit hash if available

## Phase 4 - VibeTrace read (DONE)
- On resume: detect `.vibeflow/trace.json`
- Show "VibeTrace found" badge in Resume modal
- Display key fields: last intent, last session duration, parked thoughts count

## Phase 5 - Context Diff (DONE)
- Compute "Intent vs touched files" summary at session end
- Display in receipt + VibeTrace payload
- Minimal heuristic: list files touched (read + write) + final intent

## Phase 6 - QA + Edge cases
- No echo set -> no resume banner
- Multiple sessions -> only latest echo triggers
- Missing trace file -> silent
- Large repos -> watcher performance check
