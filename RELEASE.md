# Release Guide

This repo ships Windows + macOS installers via GitHub Actions.

## Prereqs
- Node.js 18+
- npm

## Local installer builds (unsigned)
```bash
npm install
npm run dist
```

Outputs are written to `release/`.

Notes:
- Windows installer = NSIS `.exe`
- macOS installer = `.dmg`
- macOS builds must run on macOS

## GitHub Release (recommended)
1) Bump version in `package.json`
2) Tag and push
```bash
git tag v0.1.0
git push origin v0.1.0
```
3) GitHub Actions builds installers and publishes them to the release.

## Signing (optional but recommended)
- macOS: Developer ID + notarization
- Windows: code-signing certificate to avoid SmartScreen warnings
