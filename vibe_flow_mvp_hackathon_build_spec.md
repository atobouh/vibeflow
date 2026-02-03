# VibeFlow — MVP Build Specification (Hackathon)

## One‑Line Description
**VibeFlow is a local, open‑source terminal app that preserves human intent and context while coding with AI agents, so developers can instantly resume work without losing flow.**

---

## The Problem (Very Clear)
Agentic coding tools (Codex, Claude Code, Cursor, etc.) generate code fast — but they destroy **context continuity**.

Developers regularly:
- Forget *why* they started something
- Lose track of decisions made with agents
- Waste time re‑reading code or re‑explaining context to AI

**Git tracks code. AI generates code. Nothing tracks human intent.**

---

## The Core Insight
> As AI makes coding faster, **context loss becomes the bottleneck**.

VibeFlow solves this by capturing:
- **Intent** (what the human is trying to do)
- **Flow** (how the work progressed)
- **Parked thoughts** (what was postponed)

All locally. All transparent. All agent‑agnostic.

---

## MVP Scope (What We Are Actually Building)

### 1️⃣ A Terminal App (Warp‑like Wrapper)
- VibeFlow is its **own terminal application**
- Users run Codex / Claude Code *inside* VibeFlow
- VibeFlow owns the terminal UI → enables popups, hotkeys, notifications

**Non‑goal:** Compete with Warp features (tabs, AI autocomplete, etc.)

---

### 2️⃣ Session Engine (Automatic)
When the user starts coding:
- VibeFlow automatically starts a **session**
- Detects project root (git repo)
- Tracks time, activity, and idle periods

A session ends:
- Manually, OR
- Automatically after inactivity

---

### 3️⃣ Intent Capture (Human‑Only)
Users can set intent at any time:
- Via popup or panel
- One sentence only

Examples:
- “Prototype fast, ignore edge cases”
- “Debug auth bug before meeting”

Intent is:
- Optional but encouraged
- Shown prominently in resume

---

### 4️⃣ Parked Thoughts (Key Feature)
At any moment, user presses a hotkey:

- A **1‑line popup** appears
- User types a thought
- Popup closes instantly

Examples:
- “Auth logic is hacky — fix later”
- “Ask agent about rate limiting”

Purpose:
- Prevent cognitive overload
- Preserve flow without derailing work

---

### 5️⃣ Flow Detection (Simple Heuristics)
VibeFlow automatically detects:
- Deep flow (continuous activity)
- Drift (frequent context switching)
- Context loss (long pauses)

This is:
- Heuristic‑based
- Non‑judgmental
- Used only for summaries

---

### 6️⃣ Resume Screen (The WOW Moment)
When the user returns later, VibeFlow shows:

- Last session duration
- Last intent
- Flow summary
- Top files touched
- Parked thoughts
- Suggested next step (rule‑based)

This is the **primary demo feature**.

---

### 7️⃣ Copy‑for‑Agent
One button:

> “Copy session context for AI agent”

Generates a short, clean summary the user pastes into Codex / Claude.

This reconnects:
- Human intent
- Agent output

---

## What We Are NOT Building (Important)
❌ No cloud sync
❌ No accounts
❌ No team features
❌ No heavy AI reasoning
❌ No analytics dashboards
❌ No prompt interception by default

This keeps execution strong and trust high.

---

## Privacy & Trust Principles
- Fully local‑first
- Open source
- Prompt capture is **opt‑in**
- No network calls in MVP

Trust is a feature.

---

## Target Users
- Agentic / vibe coders
- Indie hackers
- Solo founders
- Developers using Codex / Claude Code daily

---

## Why This Wins the Hackathon
- **Usefulness:** Solves a real daily pain
- **Impact:** Works with any agent or stack
- **Execution:** Small, reliable, demoable
- **Innovation:** New mental model — context continuity

---

## MVP Success Criteria
The MVP is successful if users say:

> “I don’t want to code without this anymore.”

Not feature‑complete. **Emotion‑complete.**

---

## Demo Flow (High Level)
1. Open VibeFlow terminal
2. Run Codex
3. Set intent
4. Park a thought via hotkey
5. End session
6. Reopen → Resume screen
7. Copy context → paste into agent

---

## Final Statement
**VibeFlow is the context layer between humans and AI.**

This MVP proves that context continuity is a real, painful problem — and that it can be solved without changing how developers code.

