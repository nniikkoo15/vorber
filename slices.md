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

### Slice 9 (renumbered) — Project Save/Load *(deferred)*
**Goal:** Full grid state persists to and loads from a JSON file.

Tasks:
- Save: write `vorber_project.json` with all cell assignments, trim settings, stereo strategies
- Load: restore entire grid from file, re-validate that source paths still exist
- "New project" clears all state

Done when: save → reopen app → load → all cells restored correctly.

---

## v0.2.0 — UI Redesign

### Slice 10 — Foundation: PT Mono font + paired row layout
**Goal:** Typography and layer layout match Figma design. No logic changes.

Tasks:
- Bundle PT Mono Regular + Bold (woff2) in `src/assets/fonts/`
- Apply PT Mono globally via `@font-face` in App.css
- Replace 4×2 grid with 4 paired L↔R rows
- Row structure: `[▶] [name] [dur badge] [fmt badge]` left · `[fmt badge] [dur badge] [name] [▶]` right
- Empty state: "No file. drop or click" per side, drag/click still works
- Hover → reveal X (delete) button per side
- `—X—` connector shown when split pair active; clicking unlinks trim (unsplit, keep both files)

Done when: layout matches Figma, font applied, all existing functionality still works.

---

### Slice 11 — Bank tabs + slot circles
**Goal:** Navigation matches Figma design. Two new store actions.

Tasks:
- Bank tabs: add slot count badge ("X slot"), colored underline bar per bank color
- Replace slot pagination row with 4×2 circle grid (top = slots 0–3, bottom = 4–7)
- Circle shows assigned layer count; colored fill when >0, grey when empty
- Add `clearBank(bank)` and `clearAllBanks()` to store
- Context buttons top-right: "clear [BANK] bank" + "clear SLOT[n]"
- Global top-right: "clear all banks" + "export"

Done when: can navigate via circles, counts update on assign/clear, clear actions work.

---

### Slice 12 — Inline format controls
**Goal:** Format badge replaces always-visible split button.

Tasks:
- Format badge on each assigned cell (shows "stereo", "mono L", "mono R", "mono")
- Click badge → in-place overlay replaces row content; one overlay at a time; click-outside closes
- Overlay options by state:
  - Stereo + sum: `stereo > mono · mono L · mono R · split to R/L · cancel`
  - Stereo + split-L: `flatten · keep L · keep R · split to R · cancel`
  - Stereo + split-R: `flatten · keep L · keep R · split to L · cancel`
  - Mono: badge non-interactive
- "flatten" = revert to sum + clear counterpart if same file

Done when: all stereo mode transitions work via inline overlay, no regression on export.

---

### Slice 13 — Trim panel redesign (placeholder waveform)
**Goal:** Trim panel matches Figma. Real waveform deferred.

Tasks:
- Trim opens by clicking duration badge (not by cell selection)
- Header: `[cell name] · [format] · Start [MM:SS] · length [XX.XXs]` + X close
- Waveform area: flat color bar (no decoding) + draggable green start / orange end handles
- Handles update `trim.start` / `trim.length` in store
- Footer: source filename + total file length
- Trim panel replaces current slider-based panel

Done when: trim open/close works via duration click, handles update trim state, export uses updated values.

---

### Slice 14 — Real waveform rendering *(v0.3.0)*
**Goal:** Waveform area shows actual audio peaks.

Tasks:
- Decode audio via `AudioContext.decodeAudioData` on trim panel open
- Render channel peak data to `<canvas>` (downsampled to canvas width)
- Green start / orange end markers overlay the canvas, draggable
- Cache decoded buffer per file path (avoid re-decode on re-open)

Done when: waveform renders for all supported formats, markers drag correctly.

---

### Slice 15 — GitHub Actions auto-build *(v0.3.0)*
**Goal:** Push a tag → binaries appear as release assets automatically.

Tasks:
- `.github/workflows/release.yml`: trigger on `v*` tags
- Matrix: macOS (aarch64), Windows (x86_64)
- Upload `.dmg` and `.msi` to GitHub release

---

### Slice 16 — Trim panel playhead
**Goal:** Waveform shows a playhead position line during preview and loop playback.

Tasks:
- While loop is playing in TrimPanelContent, animate a vertical line over the waveform canvas showing current playback position
- Position derived from `AudioContext.currentTime` minus the source start offset, wrapped within the trim window
- Line redraws via `requestAnimationFrame` loop; stops when playback stops
- Same playhead shown for row-level preview when trim panel is open for that cell

Done when: playhead moves smoothly during loop and row preview while trim panel is open.

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
| 9 | Project Save/Load | done |
| 10 | Font + Paired Row Layout | done |
| 11 | Bank tabs + Slot circles | done |
| 12 | Inline format controls | done |
| 13 | Trim panel redesign | done |
| 14 | Real waveform rendering | done |
| 15 | GitHub Actions auto-build | deferred |
| 16 | Trim panel playhead | pending |
