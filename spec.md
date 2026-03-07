## Idea

Build a cross-platform desktop “companion” app that lets me **assign audio files into Veno-Orbit banks/slots/layers**, optionally **split stereo into L/R**, optionally **trim/crop to a 60-second window**, **preview**, and then **export an SD-card-ready folder tree** with strict naming + required WAV format.

The goal is to eliminate manual renaming + conversion in Ableton, while keeping UX fast enough for both:

* **A) pre-trimmed tempo loops (1–2 bars)**
* **B) long recordings where I want to select a 60s window**

---

## Hard Constraints (must match Veno-Orbit)

### Bank folder names (exact, uppercase)

`RED, GREEN, BLUE, WHITE, CYAN, ORANGE, YELLOW, PINK`

### WAV export format

* **WAV**
* **48 kHz**
* **16-bit PCM**
* **mono**
* **<= 60 seconds** (crop if longer)

### File naming (exact)

`<COLOUR>_SLOT<PRESET#>_<L/R><LAYER#>.wav`
Example: `BLUE_SLOT0_L0.wav`

### Slot / Layer structure

* Slots: `SLOT0..SLOT7`
* Layers per slot: exactly **4 layers per channel** in v1 UI:

  * Left: `L0..L3`
  * Right: `R0..R3`

---

## UX Spec

### Navigation

* **Tabs** for each bank color.
* Inside a bank, **pages** for each slot (0–7).
* Inside a slot, an **8-cell grid**: `L0..L3` and `R0..R3`.

### Each layer cell supports:

* Drag & drop audio file (or click to pick file)
* Display: filename, duration, stereo/mono indicator
* Play/pause preview
* Clear/remove file
* Trim controls accessible for all files via duration badge click:

  * Files > 60s: duration badge shows in red until trimmed
  * All files: clicking duration badge opens trim panel
  * Trim panel shows waveform with draggable start (green) and end (orange) handles
  * Start handle: drags left (extends) or right (shortens); stops when length reaches minimum — does not slide the window
  * End handle: drags right (extends) or left (shortens); stops when length reaches minimum
  * Dragging the region between handles shifts the window without changing length
  * Minimum trim length: 0.5s; maximum: 60s (capped at file duration if shorter)
  * Loop playback available in trim panel to preview the selected region
  * Split pairs (L+R, same file) share trim edits — changing one updates both

### Stereo handling

When a dropped file is stereo, the format badge shows **”stereo”** and is clickable. Clicking opens an inline overlay with four options:

| Option | `stereoMode` value | Export behaviour |
|---|---|---|
| sum to mono | `”sum”` | mix 0.5L + 0.5R → mono |
| mono L | `”left-only”` | left channel only → mono |
| mono R | `”right-only”` | right channel only → mono |
| split → R/L | `”split-L”` + `”split-R”` | L cell uses left channel, R cell uses right channel |

**Badge labels by mode:**
- `undefined` (never chosen) → **stereo** (interactive)
- `”sum”` → **mono** (interactive — can reopen overlay)
- `”left-only”` → **mono L** (interactive)
- `”right-only”` → **mono R** (interactive)
- `”split-L”` → **L** (highlighted, interactive)
- `”split-R”` → **R** (highlighted, interactive)
- channels = 1 → **mono** (non-interactive, truly mono file)

**Split pair rules:**
- Splitting from an L cell assigns `split-L` to this cell and `split-R` to the matching R cell (same file, same trim)
- The `—X—` connector appears between the two cells when they are a split pair
- Clicking `—X—` **unlinks** without clearing files: L cell becomes `left-only`, R cell becomes `right-only`
- After unlink, each cell is independent; changing one does not affect the other
- Overlay actions that switch away from split (`sum to mono`, `mono L`, `mono R`) only clear the counterpart cell if it is still in a split state and shares the same file path

### Export

* User chooses an output folder (e.g., SD card root).
* Clicking **Export** processes all filled cells and writes:

  * `/<COLOUR>/<COLOUR>_SLOT<slot>_<L/R><layer>.wav`
* Shows progress + errors.
* Overwrite behavior:

  * Ask if destination already has files: “Overwrite all” / “Skip existing” / “Cancel”

### Project save/load (important but can come after MVP)

* Save mapping + trim settings to `veno_project.json`
* Load restores the entire grid state

### Manifest for traceability

* Export also generates `manifest.csv` listing:

  * source path
  * bank, slot, chan, layer
  * trim start/len
  * stereo mode (sum/split)
  * output path
  * processing settings used

---

## Audio Processing Pipeline (deterministic)

For each filled cell:

1. Decode source file (support wav/aiff/flac/mp3/m4a, etc.)
2. Apply trim window (start, duration)
3. Apply stereo strategy:

   * `split-L` → use left channel only
   * `split-R` → use right channel only
   * `left-only` → use left channel only
   * `right-only` → use right channel only
   * `sum` or `undefined` → mix 0.5L + 0.5R
   * mono source → pass through unchanged
4. Apply tiny fades to avoid clicks (default 5 ms in/out)
5. Resample to 48kHz
6. Convert to 16-bit PCM
7. Write mono WAV
8. Ensure final duration ≤ 60 seconds

---

## Non-goals (avoid scope creep)

* No BPM detection, key detection
* No auto transient slicing
* No waveform editor required for v1 (nice-to-have later)
* No time-stretch/pitch-shift
* No cloud sync

---

## Implementation

### Primary goals for the tool

This is a community-friendly utility (Eurorack companion app) focused on:

- fast workflow (drag/drop → preview → export)
- deterministic output (strict naming + audio format constraints)
- cross-platform availability
- minimal friction to build and share

### Tech stack preference (but recommend and justify)

Prefer **Tauri + React** (cross-platform) and use **ffmpeg** for conversion/cropping/mono, ideally bundled so users don’t install dependencies. If bundling is too heavy at first, allow external ffmpeg path for dev/testing.

### Packaging preference

macOS:
- ship a .dmg or zipped .app
- unsigned is acceptable for v1; document the user steps to open it

Windows:
- ship an installer or portable build
- unsigned is acceptable; document SmartScreen bypass steps if needed

### Non-goals (explicit)

Do not optimize for app-store distribution.
Do not require user accounts or online services.
Do not require users to install additional runtime dependencies.


