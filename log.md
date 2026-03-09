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

### Known issue: layer order is inverted
On the Veno-Orbit module, layer 0 is at the physical bottom. The correct top-to-bottom display order is L3 → L2 → L1 → L0 (left) and R3 → R2 → R1 → R0 (right). The app currently renders them L0 → L3 top-to-bottom, which is reversed. Fix: reverse the row rendering order in the slot view so L3/R3 is at the top and L0/R0 is at the bottom.

### Known issue: clear while playing does not stop audio
When a layer is being previewed and the user clicks ✕ to remove the sample, the audio continues playing. Root cause: the ✕ button in `LayerSide` calls `clearCell()` directly without checking `playingCellId` or calling `stopPreview()`. The `AudioBufferSourceNode` remains connected to `previewGain` and keeps playing.

Fix (next release): in the clear button `onClick`, check `useStore.getState().playingCellId === id` and call `stopPreview()` + `setPlayingCellId(null)` before `clearCell()`.

### Known issue: preview and loop do not apply stereo format
Both the layer play button (`handlePlay`) and the trim panel loop button play the raw decoded audio buffer with no channel processing. The selected stereo mode (sum, mono L, mono R, split-L, split-R) is ignored — stereo files always play both channels regardless of format.

Fix (next release): route the `BufferSourceNode` through a `ChannelSplitterNode` (for left-only / split-L / right-only / split-R) or a `ChannelMergerNode` (for sum) before connecting to `previewGain`. Applies to both `handlePlay` and the trim panel `toggleLoop`.

### Known issue: preview continues playing when navigating away from slot
Audio keeps playing when user switches to a different slot or bank, even though the playing layer is no longer visible. Fix (next release): call `stopPreview()` + `setPlayingCellId(null)` when `activeBank` or `activeSlot` changes (e.g. in a `useEffect` watching those values in the store).

### Feature: "play once" button in trim panel
Add a "play once" button next to the existing loop button in the trim panel header. Plays the trim region once and stops. Useful for quick auditioning without toggling loop on/off. The two buttons sit side by side: `[▶ once] [⟳ loop]`.

### Feature: pre-export warnings (from Slice 21)
Before export begins, warn the user about: (1) layers with trimmed length still over 60s (module will reject them), (2) stereo files being downmixed to mono (sum / mono L / mono R). Show a summary dialog with the affected cells listed, with options to proceed or cancel.

---

## 2026-03-08 — v0.1.4

### Fixes
- **Canvas GPU reallocation**: backing store resize now conditional (`canvas.width !== W`), preventing continuous GPU texture reallocation at 60fps
- **AudioContext suspended**: added `previewCtx.resume()` guard before all playback paths
- **Layer order inverted**: slot view now renders L3→L0 / R3→R0 top-to-bottom to match module physical layout
- **Clear while playing**: ✕ button now stops audio before clearing the cell
- **Preview continues on slot/bank navigation**: `stopPreview()` called on `activeBank`/`activeSlot` change; trim panel also closes
- **Decode race condition**: module-level `isDecoding` flag prevents two concurrent decode operations

### Features
- **Pre-export warnings**: orange warning bar shows "N files will be summed to mono" and "N files will be trimmed to 60s" before export; "export anyway!" / "wait a sec!" actions
- **Play once in trim panel**: "play once" button added next to loop button; plays trim region once and stops; playhead animates for both play once and loop
- **Playhead decoupled from region**: playhead tracks absolute file position; dragging region window no longer moves playhead; playback stops if region is dragged past playhead
- **Filename replace**: clicking filename in an assigned layer opens file picker to replace the sample in place
- **Play opens trim panel**: pressing the layer play button now opens the trim panel for that layer
- **Split pair play mirroring**: play/loop state shown on both L and R buttons when layers are linked
- **Loop icon on layer button**: ⟳ at 2× size shown on layer button while trim panel loop is active
- **Layer link indicator**: connector lines now white, vertically padded to match Figma
- **Export action underlines**: "export!", "export anyway!", "wait a sec!" all underlined
- **Filename hover underline**: hovering the filename underlines it; hover area constrained to text width only
- **Right-side filename alignment**: right channel filename now right-aligned to the layer button

---

## 2026-03-08 — v0.1.5: Slices 15, 17, 21, 26 + ghost tooltip drag UX + PLAYBOOK

### Features
- **GitHub Actions release workflow** (Slice 15): `.github/workflows/release.yml` — pushes a `v*` tag → builds macOS aarch64 DMG and Windows x86_64 MSI automatically via `tauri-apps/tauri-action`; uploads to a draft GitHub release
- **React ErrorBoundary** (Slice 17): `src/ErrorBoundary.tsx` wraps the app; any render error shows a dark fallback UI with the error message, stack trace, and a "try again" button instead of a blank window
- **Layer drag-to-rearrange** (Slice 26): click-hold the body of an assigned layer side and drag to another layer side in the same slot; drop on empty = move; drop on loaded = swap; Option (⌥)+drop on empty = copy (origin stays); interactive children (filename, badges, ✕) block accidental drag; split pairs auto-broken to mono L/R before move; dragging cell fades to 0.4 opacity; drop target brightens; trim panel closes on drag start if open for the dragged cell. Implemented via pointer events (mousedown/mousemove/mouseup) — WKWebView does not reliably support HTML5 drag-and-drop for custom elements.
- **Ghost tooltip drag text**: tooltip follows cursor during layer drag with contextual text: `moving Lx file.wav`, `moving Lx file.wav > Ly`, `swapping Lx file.wav <> Ly file2.wav`, `copying Lx file.wav`, `copying Lx file.wav > Ly`

### Meta
- **PLAYBOOK.md**: new document capturing higher-order build principles, spec discipline, UX heuristics, technical heuristics, pre-spec and pre-code question checklists, anti-patterns, and release checklist — updated collaboratively and linked from CLAUDE.md

### Fixes
- **Drag stops playback**: dragging a playing sample now stops audio as soon as the drag threshold is crossed

---

## 2026-03-08 — documentation and design session

No code changes. Documentation and design work:

- **`ux.md`**: unified both UX essays (Sample Fine Adjustment, Sample Bank/Slot/Layer Rearrangement) into a single file with TOC. Individual `ux/` folder deleted.
- **`decisions.md`**: unified all 11 existing ADRs into a single file with TOC grouped by status. Individual `decisions/` folder deleted.
- **`KNOWLEDGE.md`** deleted — redundant now that `ux.md` and `decisions.md` are self-indexing with TOCs.
- **`CLAUDE.md`**: project files section updated to reference flat files; added rule to check `USER.md` when a new feature or slice is introduced.
- **`USER.md`**: added workflow note — user expects to rearrange freely after initial assignment; upfront placement doesn't need to be final.
- **`PLAYBOOK.md`**: added guidance on checking for existing mechanisms before proposing new ones, calling out concrete consequences, and comparing against established UX patterns.

### New ADRs added to `decisions.md`

- **ADR-012** (decided, not yet implemented): Missing file detection — re-validate paths on window focus; layer row shows red "file missing" pill + X button; confirmed against Figma design (node 74:13376).
- **ADR-013** (proposed): Drag-hover bank tab switching during slot drag — 600ms hover delay switches active bank mid-drag, enabling cross-bank slot drop without auto-placement ambiguity. Matches macOS Finder hover-to-open convention.

---

## 2026-03-09 — v0.1.6: session restore, audio fixes, trim panel bugs

### Features
- **Session restore (auto-persist)**: Zustand `persist` middleware with `localStorage` — only `cells` persisted (schema version 1); grid state survives full app restart with no explicit save required
- **Tauri fs permissions**: added `fs:allow-read-file` and `fs:allow-exists` scoped to `$HOME/**`; required for reading restored file paths after restart (Tauri dialog-granted scope is not persisted between sessions)

### Fixes
- **Audio silence / delay after sleep/wake**: `visibilitychange` listener proactively resumes or reinitialises the AudioContext on wake; fixes complete silence and playback delay after closing/reopening lid
- **React hooks crash on sample remove**: `useEffect` in `TrimPanelContent` was positioned after an early `return null`, causing "rendered fewer hooks than expected" when a cell was cleared; moved above the guard
- **Trim panel auto-opens after remove+reassign**: clearing a cell now also clears `openTrimId` if it matched; prevents the panel from persisting open on next assignment to the same layer
- **Waveform missing after remove+reassign**: consequence of above fix; proper unmount/remount on clear means the waveform canvas initialises fresh

### Meta
- **PLAYBOOK.md §5 Friction Checkpoint**: three-layer Signal→Framing→Response model with mandatory pause, problem category list, "does this already exist?" step, and unresolved signal holding rule
- **CLAUDE.md**: new rule to decompose mixed signal+solution input before acting on the response
