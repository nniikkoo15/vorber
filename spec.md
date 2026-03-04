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
* Trim controls **only when needed**:

  * If file duration ≤ 60s: no trim UI (or disabled)
  * If duration > 60s: show trim window

    * Start time (slider + numeric input)
    * Window length (default 60s, allow <=60)
    * Convenience buttons: “Start”, “Middle”, “End (last 60s)”

### Stereo handling

When a dropped file is stereo:

* Default behavior: **sum to mono** for the assigned cell (0.5L + 0.5R)
* Show a button: **“Split stereo → fill matching Right layer”**

  * If file placed in `Lx`: on split, export left channel to `Lx` and right channel to `Rx`
  * Same trim window applies to both
* (Optional) also allow “use left only” / “use right only” as mono strategy, but v1 can keep just sum + split

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
3. If split mode:

   * L cell uses left channel only
   * R cell uses right channel only
     Else:
   * sum stereo to mono (or pass through if already mono)
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


