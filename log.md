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
