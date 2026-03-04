## Implementation Slices

Each slice is independently buildable and testable. Do not start the next slice until the current one is done and verified.

---

### Slice 1 — Project Scaffold
**Goal:** Tauri + React + TypeScript project boots, empty window opens on macOS and Windows.

Tasks:
- Init Tauri v2 project with React + TypeScript frontend
- Confirm dev build runs (`bun run dev` or `npm run tauri dev`)
- Confirm release build produces a `.app` / `.exe`
- No UI beyond a placeholder "Veno-Orbit" title

Done when: window opens, no console errors, build artifacts produced.

---

### Slice 2 — Navigation Shell
**Goal:** Full bank/slot/layer navigation structure renders, no audio logic yet.

Tasks:
- Bank tabs: RED, GREEN, BLUE, WHITE, CYAN, ORANGE, YELLOW, PINK
- Slot pages 0–7 within each bank (prev/next or numbered pagination)
- 8-cell grid per slot: L0 L1 L2 L3 | R0 R1 R2 R3
- Each cell shows its label and an empty state placeholder
- Active bank and slot stored in component/app state

Done when: can navigate all 8 banks × 8 slots, all 64 cells visible per bank.

---

### Slice 3 — File Assignment
**Goal:** Files can be assigned to cells and persisted in app state.

Tasks:
- Click cell → native file picker (wav/aiff/flac/mp3/m4a)
- Drag & drop audio file onto a cell
- Store assigned file path in global state (Zustand or React context)
- Cell shows filename when assigned
- Clear/remove button per cell

Done when: can assign and clear files across multiple cells, state survives slot/bank navigation.

---

### Slice 4 — Audio Metadata
**Goal:** Each cell displays duration and stereo/mono indicator after file assignment.

Tasks:
- Read file metadata on assignment (duration in seconds, channel count)
- Display in cell: filename, duration (e.g. `1m 23s`), stereo/mono badge
- Flag if duration > 60s (visual indicator, no trim UI yet)

Done when: metadata displays correctly for wav/mp3/flac/aiff files.

---

### Slice 5 — Preview
**Goal:** Assigned files can be previewed in-app.

Tasks:
- Play/pause button per cell
- Uses Web Audio API or HTML `<audio>` for playback (frontend only, no ffmpeg needed)
- Only one file plays at a time; starting another stops the current
- Preview uses the raw source file (pre-processing)

Done when: can play and stop any assigned file.

---

### Slice 6 — Trim Controls
**Goal:** Files longer than 60s show a trim UI; files ≤ 60s show nothing.

Tasks:
- If duration > 60s: show trim section in cell (or expanded panel)
  - Start time: slider + numeric input (seconds, 0 to duration−window)
  - Window length: numeric input (default 60s, max 60s)
  - Convenience buttons: "Start" (0s), "Middle" (center 60s), "End" (last 60s)
- Trim values stored per cell in state
- Preview respects trim window (seek to start, stop at end)

Done when: trim UI appears only for long files, all controls update state, preview uses trim window.

---

### Slice 7 — Stereo Handling
**Goal:** Stereo files have explicit mono strategy; split option populates counterpart cell.

Tasks:
- Default strategy for stereo files: sum to mono (0.5L + 0.5R)
- Show "Split stereo → fill R/L counterpart" button when file is stereo and in an L or R cell
  - L cell split: L channel → this cell, R channel → matching R cell
  - R cell split: R channel → this cell, L channel → matching L cell
  - Same trim window applies to both
- Strategy stored per cell (sum / split-L / split-R)

Done when: split correctly links two cells; both cells show the strategy in their UI.

---

### Slice 8 — Export
**Goal:** All filled cells are processed and written to an SD-card-ready folder tree.

Tasks:
- "Export" button → native folder picker for output destination
- Overwrite dialog if destination already contains files: "Overwrite all" / "Skip existing" / "Cancel"
- For each filled cell, run audio pipeline via ffmpeg sidecar:
  1. Decode source file
  2. Apply trim (start, duration)
  3. Mono mix or channel split per strategy
  4. 5ms fade in/out
  5. Resample to 48kHz
  6. Convert to 16-bit PCM
  7. Write `/<COLOUR>/<COLOUR>_SLOT<n>_<L/R><n>.wav`
- Generate `manifest.csv` (source path, bank, slot, chan, layer, trim start/len, stereo mode, output path)
- Progress display (n of total files processed)
- Error reporting per file (skip and continue, report at end)

ffmpeg strategy: bundle as Tauri sidecar. For dev/testing, allow fallback to system ffmpeg if sidecar not found.

Done when: full export produces correct folder tree and manifest; verified against Veno-Orbit naming spec.

---

### Slice 9 — Project Save/Load *(post-MVP)*
**Goal:** Full grid state persists to and loads from a JSON file.

Tasks:
- Save: write `veno_project.json` with all cell assignments, trim settings, stereo strategies
- Load: restore entire grid from file, re-validate that source paths still exist
- "New project" clears all state

Done when: save → reopen app → load → all cells restored correctly.

---

## Status

| Slice | Name | Status |
|-------|------|--------|
| 1 | Project Scaffold | done |
| 2 | Navigation Shell | done |
| 3 | File Assignment | done |
| 4 | Audio Metadata | done |
| 5 | Preview | done |
| 6 | Trim Controls | done |
| 7 | Stereo Handling | done |
| 8 | Export | done |
| 9 | Project Save/Load | deferred |
