# VibeFlow CLI

Terminal-first intent + context tracking.

## Install (from this repo)
```bash
cd cli
npm install -g .
```

## Versioning
Before publishing, bump the version:
```bash
npm version patch
```

## Publish
```bash
npm publish --access public
```

## Commands
```bash
vf start [path]
vf intent "text"
vf park "note"
vf stt
vf stt --copy
vf stt --intent
vf stt --park
vf stt --echo
vf stt --device "Microphone Name"
vf stt setup
vf status
vf status --watch
vf timer
vf resume [path]
vf history [path]
vf end
vf receipt [id]
vf help
```

## Speech to Text (STT)
- `vf stt` starts recording and stops on Enter.
- `vf stt setup` downloads Whisper CLI + model (Windows/macOS/Linux).
- Needs `unzip` on macOS/Linux (or install whisper.cpp manually and set `VF_WHISPER_BIN` + `VF_WHISPER_MODEL`).
- Set microphone with `vf stt --device "<name>"` (Windows) or `vf stt --device <index>` (macOS).

## Data location
Stored locally in your user config directory. Override with `VF_DATA_DIR`.
