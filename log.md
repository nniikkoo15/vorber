# Change Log

Append only. Most recent entry at bottom.

---

## 2026-03-03 — Slices 1–7 completed

Scaffolded Tauri + React + TypeScript project. Implemented navigation shell (bank tabs, slot pages, 8-cell grid), file assignment (drag/drop + file picker), audio metadata display (duration, stereo/mono badge), preview (Web Audio API, single-voice, gain node for immediate stop), trim controls (start/length/shortcuts, only shown for files >60s), and stereo split (split-L/split-R mode, counterpart cell population, unsplit).

### Design decision: trim independence after stereo split

When a stereo file in Lx is split to Rx, both cells start with the same trim window (copied at split time). After that, each cell's trim is independent.

The spec says "same trim window applies to both" — interpreted here as a description of the split action, not a permanent constraint. Linked trim (changes to one cell propagating to the other) is not implemented in v1.

**Implication for export:** L0 and R0 will use their respective trim windows when extracting L/R channels. They may diverge if the user edits them independently after splitting. This is intentional and potentially useful.

**If this should change:** implement a `splitPairId` field to track linked pairs, and propagate `setTrim` calls to the partner cell.

---

## 2026-03-04 — Slice 8 completed

Implemented Export. All filled cells are processed via a Rust command (`export_cells`) that invokes system ffmpeg (no sidecar bundling for v1). Output folder is user-chosen via native folder picker. Overwrite dialog ("Overwrite all" / "Skip existing" / "Cancel") shown when destination already contains matching files.

### Audio pipeline (per cell)
- `-ss`/`-t` for trim seek (before `-i` for fast seeking)
- `-af` filter chain:
  - Mono source: `afade=in + afade=out`
  - Stereo sum: `pan=mono|c0=0.5*FL+0.5*FR` + fades
  - Split-L: `pan=mono|c0=FL` + fades
  - Split-R: `pan=mono|c0=FR` + fades
- `-ac 1 -ar 48000 -c:a pcm_s16le` → 48kHz / 16-bit mono WAV
- 5ms fades (afade=t=in/out) to eliminate clicks

### Output naming
`<output_dir>/<BANK>/<BANK>_SLOT<n>_<L/R><n>.wav`
Example: `RED/RED_SLOT0_L0.wav`

### manifest.csv
Written to output_dir root when at least one file exports successfully. Columns: source_path, bank, slot, layer, trim_start, trim_length, stereo_mode, output_path.

### ffmpeg discovery
Checks `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, `/usr/bin/ffmpeg` before falling back to `which ffmpeg`.

### WAV container compatibility fix
Exported files were rejected by the module. Root cause: ffmpeg was inserting a `LIST INFO` chunk (ISFT: "Lavf62.3.100") between `fmt` and `data`. The module cannot skip unknown chunks and failed to find `data`. Fix: added `-fflags +bitexact` to the ffmpeg command, which suppresses encoder identification metadata. Output structure is now `RIFF → WAVE → fmt (16B) → data`, matching MediaHuman's output exactly.

### Drag-and-drop fix (2026-03-04)
Root cause: `onDragDropEvent` position is `PhysicalPosition` (device pixels). `document.elementFromPoint` expects CSS/logical pixels. On a 2× Retina Mac, raw coords land outside the CSS viewport → null hit → no assignment.

Fix: `cellFromPos(x, y)` divides by `window.devicePixelRatio` first, falls back to raw coords. Also added `"over"` event tracking for visual `.drag-over` highlight and `lastDragTarget` fallback (handles edge case where drop fires slightly outside the last hovered cell).

### Known issue: preview ignores stereo split mode
When a cell is in `split-L` or `split-R` mode, preview still plays the full stereo buffer. The fix is to route through a `ChannelSplitterNode` before the gain node, connecting only output 0 (L) or output 1 (R) to `previewGain`. Not blocking for export correctness — export uses ffmpeg's `pan` filter which is correct. Fix when prioritised.

---

## 2026-03-05 — Slices 9–14 + trim panel enhancements

### Slice 9 — Project Save/Load
- Save/load project as `vorber_project.json` via Rust commands `read_project`, `write_project`, `check_files_exist`
- TopBar shows `[new] [open] [clear BANK] [clear BANK/SLOTn]` on left, `[filename] [status badge]` on right
- Status badge states: `empty` / `unsaved` / `saved` / `missing (n files)`
- Filename click → save-as dialog; unsaved badge click → overwrite if path exists, else save-as
- `new` creates next `untitled01.json` / `untitled02.json` etc.
- Missing file detection on load: paths checked via `check_files_exist`, cells with missing files show "file missing" badge; row play button disabled
- `clearSlot(bank, slot)` added to store

### Slices 10–13 — v0.2.0 UI redesign
- PT Mono font applied globally
- Paired L↔R row layout: `[▶] [name] [dur] [fmt]` · `—` · `[fmt] [dur] [name] [▶]`
- Split pair shows `—X—` connector; clicking unlinks (converts to left-only / right-only)
- Bank tabs with slot-count badge and colored underline bar
- Slot navigation as 4×2 circle grid; circles show layer count, fill when >0
- Format badge opens inline overlay (one at a time, click-outside closes); all stereo mode transitions
- Trim panel opens by clicking duration badge (not cell selection)
- Trim panel always visible; empty state shows "No file selected"
- Fixed height trim panel (148px)
- Export bar redesigned: full-width, states empty/idle/running/done; progress fill animation

### Slice 14 — Real waveform rendering
- `buildPeaks(filePath)` decodes audio via Web Audio API, computes 2000-point peak array, caches per file path
- Canvas drawn inside `.trim-bar-bg` wrapper (avoids canvas-attribute vs CSS-position conflict)
- `ResizeObserver` redraws on panel resize
- Two-pass draw: grey outside selection region, light (`#d0d0d0`) inside
- `trimDrawRef` + `redrawRef` pattern: draw effect stores draw fn in ref; separate effect `[trimStartPct, trimEndPct]` calls it on every trim drag

### Trim panel additional enhancements (post-14)
- **Linked trim propagation**: editing trim on a split pair (L+R same file) updates both cells simultaneously; header shows `BANK_SLOTn_Lx-Rx`
- **Draggable region**: area between handles can be dragged to shift the window without changing length
- **Trim for short files**: duration badge now always clickable; default trim length capped at `min(duration, 60)`; minimum trim length 0.5s
- **Cell label in header**: `RED_SLOT0_L1` or `RED_SLOT0_L1-R1` format
- **`Start` / `Length` labels** with `formatTrimTime` format: `01m40.32s` or `40.32s`
- **Play as loop** button in trim panel header: loops trim region via `AudioBufferSourceNode` with `loop=true`, `loopStart`/`loopEnd`; shows "stop" while playing; cleanup on unmount
- **Loop trim live update**: dragging handles or region while looping updates `loopStart`/`loopEnd` on the live source node immediately
- **Start handle stops at min length**: end point is anchored; start handle can't slide the region when min length (0.5s) is reached — it simply stops

---

## 2026-03-07 — design pass: polish and consistency fixes

- **Export bar background**: inner info area uses `#000000` with `align-self: stretch` so it fills the full 44px height
- **Trim panel always rendered**: empty state (`#2b2b2b`, "No layer selected") shown when no layer is selected; `openTrimId` in store drives active state
- **Click-outside closes trim panel**: `mousedown` listener in `TrimPanelContent` closes panel unless click lands inside `.trim-panel` or `.layer-num.in-edit` / `.layer-side.in-edit`
- **Format overlay keeps trim panel open**: overlay-open early return in `LayerSide` now includes `in-edit` class so click-outside handler recognises it as a safe area
- **macOS title bar height**: `tauri.conf.json` height set to 648px (620px content + 28px native title bar). Documented in `CLAUDE.md` and memory.
- **Section heights pinned**: all sections use explicit pixel heights; `layer-section: flex:1` fills remainder — no scroll, no clipping
- **Typography — trim pill labels**: "Start" / "Length" changed to lowercase ("start" / "length") to match Figma
- **Close button consistency**: all three ✕ buttons (remove sample, format overlay close, trim close) now use the same Unicode character (`✕` U+2715), same 23×23px container, same `font-size: var(--font-body)`
- **Format overlay close button size**: added `min-width: 23px; flex-shrink: 0` to prevent flex compression
- **"split → R/L" label**: arrow symbol removed, now rendered as "split to R" / "split to L"
- **App icon**: custom icon artwork generated from source PNG via `bunx tauri icon`

---

## 2026-03-06 — design-tweaker.html improvements

`design-tweaker.html` is a standalone single-file token design tool (no build step) that loads `tokens.css` and `semantic.json`, renders a live preview of the Veno-Orbit app UI, and lets you edit token values with immediate visual feedback.

### States tab
- Added `states-view` panel support to `initViewTabs()`: toggling the States tab now shows/hides `#states-view` alongside the existing Screen and Components panels

### Screen view: fixed 800×620px (no scaling)
- Replaced `scalePreview()` + `ResizeObserver` transform approach with fixed `width:800px; height:620px; overflow:auto`
- `#preview-wrap` and `#preview-scaler` both set to `800×620`; scroll appears if panel is smaller

### Bank tab CSS (match App.css)
- Replaced `border-bottom: 2px solid transparent` underline + 16px colour bar with full `border: 1px solid transparent` outline, active state uses `border-color: var(--category-accent)`
- Tab name: `font-weight: 700`; active = `var(--fg-emphasis, #fff)`, assigned = `var(--fg-secondary, #bbb)`
- Colour bar: `width: 100%` (full-width), `height: 3px`, no separate opacity rule

### Slot circles: vertical column → 4×2 grid
- Replaced `.p-slot-col` (flex-row left sidebar) + `.p-slot-circles` (flex column) with `.p-slot-grid` (CSS grid, 4 columns) centered above layer rows
- `.p-main` changed from `flex-direction: row` to `flex-direction: column`
- Added `.p-slot-hdr` label (`RED\SLOT0`) between grid and layer rows

### Layer rows: 6 → 4
- Deleted two trailing empty `.p-layer-row` elements from `#preview-wrap`

### Tooltip fix
- `mouseover` + separate `mousemove` caused tooltip to flicker: `mouseover` fires on every child element transition, hiding the tip when a child without `data-tip` was entered
- Fix: merged into a single `mousemove` handler that calls `closest('[data-tip]')` and both finds the target and positions the tooltip in one step
- CSS var resolution: tries `getComputedStyle(document.body)` first (overrides from `applyAll()`), falls back to `getComputedStyle(document.documentElement)` (defaults from `tokens.css`)
- Handler registered on `preview-wrap`, `components-view`, and `states-view`

---

## 2026-03-07 — session wrap-up: icon, distribution, and future slices

### App icon (squircle)
- Source PNG regenerated by user three times; final version is 2048×2048 with all 4 corners alpha=0
- Generated all icon sizes via `bunx tauri icon ~/Downloads/vorber-icon.png`; source saved as `src-tauri/icons/app-icon-source.png`
- macOS squircle is applied by the OS at render time; icon artwork must have transparent corners so squircle is visible in Finder/DMG (Dock clips regardless)

### GitHub distribution (v0.1.0 – v0.1.2)
- Tags v0.1.0, v0.1.1, v0.1.2 pushed; DMG uploaded to GitHub Releases manually
- Git author corrected to "Niko Albertus / nikoalbertus@icloud.com" via `git config --global` + `git commit --amend --reset-author`
- App is unsigned/unnotarized; macOS Gatekeeper shows "damaged and can't be opened" on download — expected for unsigned apps. Fix: `xattr -dr com.apple.quarantine Vorber.app` or System Settings → Privacy & Security → Open Anyway

### UI character consistency fix
- All close buttons now use `✕` (U+2715 MULTIPLICATION X), not `×` (U+00D7 MULTIPLICATION SIGN)
- `.fmt-action.close` given `min-width: 23px; flex-shrink: 0` to prevent flex compression
- Split labels changed from "split → R/L" to "split to R / split to L"
- Trim pill labels lowercased: "start" / "length"

### Export bug fix: left-only / right-only stereo mode fell through to sum
- `left-only` and `right-only` stereo modes were not handled in the Rust `export_cells` pan filter match — both fell through to `pan=mono|c0=0.5*FL+0.5*FR` (sum) instead of extracting the correct channel.
- Fix: extended match arms so `"split-L" | "left-only"` → `pan=mono|c0=FL` and `"split-R" | "right-only"` → `pan=mono|c0=FR`.

### Export bug fix: LIST INFO chunk from sample pack sources
- Root cause: `-fflags +bitexact` suppresses ffmpeg's own encoder tags but does not strip metadata embedded in the source file. Splice (and other sample packs) bake `LIST INFO` chunks (artist, comment, copyright) into their WAV files; ffmpeg copies these through into the output.
- The Veno-Orbit module's WAV parser expects `fmt` immediately followed by `data`; finding `LIST` in between causes it to reject the file silently.
- Fix: added `-map_metadata -1` to the ffmpeg command in `export_cells` — strips all input metadata from every output file unconditionally.
- Re-export affected banks after updating to the new build.

### Future slices added (18–21)
- Slice 18: Trim panel grid-based trimming (snap handles to equal divisions)
- Slice 19: Trim panel region distribution (auto-slice source into N equal regions across L0–L3 / R0–R3)
- Slice 20: Trim panel waveform zoom (horizontal zoom + pan for long files)
- Slice 21: Export bar stereo warning (badge + confirmation dialog before any stereo→mono downmix)
