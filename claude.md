## What this is
cross-platform desktop “companion” app that lets me assign audio files into Venus Instrument Veno-Orbit eurorack module

## Project files
- `spec.md` — what the app is and does, read this first
- `slices.md` — implementation plan and progress
- `log.md` — change history, append only

## Current work
Currently on: Slice 9 — Project Save/Load (deferred; MVP complete)
Not building yet: [everything after current slice]

## Rules
- Read spec.md and slices.md before starting any work
- Do not implement beyond the current slice
- If spec is ambiguous, ask before assuming
- If something implies a concept change, flag it and stop
- At session end, append a log entry to log.md
- After fixing a recurring mistake or learning something non-obvious about the project, save it to memory (`~/.claude/projects/.../memory/MEMORY.md`)

## Known platform gotchas
- **macOS Tauri window height**: `height` in tauri.conf.json is the OUTER window including the native title bar (~28px). Webview content = height − 28px. If Figma content = 620px, set height = 648px. Never calculate window height without accounting for this.