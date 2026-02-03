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
vf status
vf status --watch
vf timer
vf resume [path]
vf history [path]
vf end
vf receipt [id]
vf help
```

## Data location
Stored locally in your user config directory. Override with `VF_DATA_DIR`.
