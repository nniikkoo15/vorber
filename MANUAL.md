# Vorber — User Manual

Vorber is a desktop companion app for the **Veno-Orbit** eurorack module. It lets you assign audio files to banks, slots, and layers, preview and trim them, handle stereo, and export an SD-card-ready folder tree in the exact format the module expects.

---

## Installation

### macOS

1. Download `Vorber_x.x.x_aarch64.dmg` from the GitHub releases page.
2. Open the DMG and drag **Vorber.app** to your Applications folder.
3. On first open, macOS will block it with "Vorber.app is damaged and can't be opened." This is a Gatekeeper warning for unsigned apps — the app is not damaged.

**To bypass:**

Option A — Terminal:
```
xattr -dr com.apple.quarantine /Applications/Vorber.app
```

Option B — System Settings:
Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the Vorber warning.

### Requirement: ffmpeg

Vorber uses **ffmpeg** for audio conversion during export. You must have it installed.

Install via Homebrew:
```
brew install ffmpeg
```

Vorber will locate it automatically at `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, or wherever `which ffmpeg` reports.

---

## Concepts

### Structure

The Veno-Orbit module organises samples in a strict hierarchy:

```
Bank (colour)
  └── Slot 0–7
        └── Layer L0, L1, L2, L3  (left channel)
        └── Layer R0, R1, R2, R3  (right channel)
```

There are 8 banks: **RED, GREEN, BLUE, WHITE, CYAN, ORANGE, YELLOW, PINK**.
Each bank has 8 slots, each slot has 8 layers (4 left, 4 right).

All exported files must be mono WAV, 48 kHz, 16-bit PCM, max 60 seconds. Vorber handles all conversion automatically.

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────┐
│  [new] [open] [clear BANK] [clear SLOT]   filename  [●] │  ← top bar
├──────┬──────┬──────┬───────────────────────────────────┤
│ RED  │GREEN │ BLUE │ ...                                │  ← bank tabs
├──────┴──────┴──────┴───────────────────────────────────┤
│        ○ ○ ○ ○   RED \ SLOT 0   ○ ○ ○ ○               │  ← slot grid
├─────────────────────────────────────────────────────────┤
│  [▶] filename    1m23s  stereo  —  mono  1m23s  name [▶]│  ← layer rows
│  [▶] filename    1m23s  mono    —  mono  1m23s  name [▶]│
│  ...                                                    │
├─────────────────────────────────────────────────────────┤
│  [trim panel]                                           │  ← trim panel
├─────────────────────────────────────────────────────────┤
│  [export]                                               │  ← export bar
└─────────────────────────────────────────────────────────┘
```

---

## Navigation

### Bank tabs

Click any bank tab (RED, GREEN, etc.) to switch banks. Each tab shows a **slot count badge** indicating how many slots in that bank have at least one layer assigned. The coloured underline bar reflects the bank colour.

### Slot grid

Below the bank tabs is a 4×2 circle grid representing slots 0–7 (top row: 0–3, bottom row: 4–7). Click a circle to navigate to that slot.

Each circle shows the number of layers assigned in that slot. Circles are filled (coloured) when at least one layer is assigned, grey when empty.

---

## Assigning Files

Each slot shows 4 paired rows. Each row represents one L/R pair (e.g. L0 ↔ R0). The left side of a row is the L layer; the right side is the R layer.

### Drag and drop

Drag any audio file (WAV, AIFF, FLAC, MP3, M4A) from Finder and drop it onto a layer side. The file is assigned immediately.

### Click to pick

Click anywhere on an empty layer side to open the native file picker. Select a file to assign it.

### Removing a file

Hover over an assigned layer side to reveal the **✕** button. Click it to remove the file and clear the layer.

### Supported formats

WAV, AIFF, FLAC, MP3, M4A. All formats are converted to the required WAV output during export.

---

## Layer Display

An assigned layer shows:

- **Filename** (truncated if long)
- **Duration badge** — shows the trimmed duration (e.g. `1m23s` or `45.2s`). Shown in red if the file exceeds 60 seconds and has not yet been trimmed into range.
- **Format badge** — shows the stereo/mono status (see Stereo Handling below)

---

## Preview

Click the **▶** button on either side of a layer row to play that file. Playback uses the raw source file with no processing applied.

Only one file plays at a time — starting a new preview stops the current one. Click **▶** again (now showing as active) to stop.

---

## Trim Panel

The trim panel sits below the layer rows and is always visible. When no layer is selected it shows an empty state.

### Opening the trim panel

Click the **duration badge** on any assigned layer to open its trim panel.

### Controls

```
[cell label]  ·  [format]  ·  start 00m00.00s  ·  length 00.00s  [loop] [✕]
┌──────────────────────────────────────────────────────────┐
│  waveform — drag green handle (start) or orange (end)    │
└──────────────────────────────────────────────────────────┘
source filename · total duration
```

- **Green handle** — drag to move the trim start point. The handle stops when the minimum length (0.5s) is reached; it does not slide the window.
- **Orange handle** — drag to move the trim end point.
- **Region drag** — click and drag the area between the two handles to shift the entire window without changing the length.
- **Loop button** — plays the selected trim region on repeat. Updates live as you drag handles. Click again to stop.
- **✕ button** — closes the trim panel.

### Trim limits

- Minimum trim length: **0.5 seconds**
- Maximum trim length: **60 seconds** (or file duration if shorter)
- Duration badge turns red when the trimmed length exceeds 60 seconds

### Linked trim (split pairs)

When two cells are a stereo split pair (see Stereo Handling), editing the trim in one cell automatically updates the other. The header shows the combined label (e.g. `RED_SLOT0_L1-R1`).

---

## Stereo Handling

When you assign a stereo file, the format badge reads **stereo** and is interactive. Click it to open the format overlay.

### Format overlay options

| Option | Badge after | Export behaviour |
|---|---|---|
| sum to mono | **mono** | 0.5 × L + 0.5 × R |
| mono L | **mono L** | left channel only |
| mono R | **mono R** | right channel only |
| split to R (from L cell) | **L** | L cell = left ch; R cell = right ch |
| split to L (from R cell) | **R** | R cell = right ch; L cell = left ch |

Click outside the overlay or press **✕** to close without changing.

A truly mono source file shows a non-interactive **mono** badge.

### Stereo split

Choosing **split to R** or **split to L** links the two cells in a pair. Both cells use the same source file; the L cell extracts the left channel and the R cell extracts the right channel on export.

A **—X—** connector appears between the two cells when they are a split pair. Click **—X—** to unlink: the cells become independent (L cell = mono L, R cell = mono R) without clearing their files.

### Switching away from split

Selecting any non-split option (sum to mono, mono L, mono R) from a split cell clears the counterpart cell if it still shares the same file.

---

## Project Save / Load

### Top bar

```
[new]  [open]  [clear RED]  [clear SLOT3]        untitled01.json  [unsaved]
```

- **new** — creates a new untitled project. Unsaved changes are not automatically saved.
- **open** — opens the native file picker to load a `.json` project file.
- **clear [BANK]** — clears all layers in the currently selected bank.
- **clear SLOT[n]** — clears all layers in the currently selected slot.
- **Filename** — click to open a save-as dialog.
- **Status badge** — shows the current project state:

| Badge | Meaning |
|---|---|
| `empty` | No layers assigned |
| `unsaved` | Changes since last save |
| `saved` | All changes saved |
| `missing (n)` | n source files could not be found on disk |

Clicking the **unsaved** badge saves immediately if the project already has a file path, or opens save-as if it is a new project.

### Missing files

When loading a project, Vorber checks whether all source file paths still exist on disk. Layers with missing files show a **file missing** badge and cannot be previewed. Their trim and stereo settings are preserved so you can reassign the file or update the path.

---

## Export

The export bar runs across the bottom of the window.

### Starting an export

Click **Export**. A native folder picker opens — select your SD card root or any output folder.

If the destination already contains files matching the expected output names, you will be asked:

- **Overwrite all** — replace existing files
- **Skip existing** — only write files that don't exist yet
- **Cancel** — abort the export

### What gets written

For each filled layer:

```
<output_folder>/<BANK>/<BANK>_SLOT<n>_<L/R><n>.wav
```

Example: `RED/RED_SLOT0_L0.wav`

All files are processed through the full audio pipeline:
1. Decode source (any supported format)
2. Apply trim window
3. Apply stereo strategy (sum / left / right)
4. 5ms fade in + fade out
5. Resample to 48 kHz
6. Convert to 16-bit PCM mono WAV

### manifest.csv

After a successful export, a `manifest.csv` is written to the output folder root. It lists every exported file with: source path, bank, slot, layer, trim start, trim length, stereo mode, and output path. Useful for traceability.

### Progress and errors

The export bar shows a progress fill and a count of files processed. If any file fails (corrupt source, ffmpeg error, etc.), the export continues with the remaining files. A summary of errors is shown on completion.

---

## Tips

- **Start assignments in one bank before exporting** — the export only processes cells that have files assigned; empty cells are skipped.
- **Use the loop button in the trim panel** — it's the fastest way to dial in a trim window for long recordings. Drag handles while it loops to hear changes immediately.
- **Split stereo on the L cell** — splitting from L automatically fills the matching R cell. You only need to initiate split once.
- **Duration badge colour** — if it's red, the trimmed length is over 60 seconds. The module will reject files longer than 60s; fix the trim before exporting.
- **The —X— connector is a quick unlink** — if you split by mistake, click the connector to convert back to independent mono L / mono R without losing the file assignment.
- **Save your project before exporting** — project files capture all assignments, trim settings, and stereo modes so you can revisit or re-export later.

---

## Keyboard & Mouse Reference

| Action | Input |
|---|---|
| Assign file | Click empty layer side, or drag file onto it |
| Remove file | Hover layer side → click ✕ |
| Preview | Click ▶ |
| Stop preview | Click ▶ again |
| Open trim panel | Click duration badge |
| Close trim panel | Click ✕ in trim header |
| Loop trim region | Click loop button in trim header |
| Shift trim window | Drag region between handles |
| Open format overlay | Click format badge (stereo/mono/mono L/mono R) |
| Close format overlay | Click ✕ in overlay, or click outside |
| Unlink split pair | Click —X— connector |
| Navigate bank | Click bank tab |
| Navigate slot | Click slot circle |
| New project | Click new in top bar |
| Open project | Click open in top bar |
| Save project | Click filename or unsaved badge |

---

## Output Naming Reference

```
<BANK>/<BANK>_SLOT<slot>_<side><layer>.wav

BANK   = RED | GREEN | BLUE | WHITE | CYAN | ORANGE | YELLOW | PINK
slot   = 0–7
side   = L | R
layer  = 0–3
```

Examples:
```
RED/RED_SLOT0_L0.wav
BLUE/BLUE_SLOT3_R2.wav
PINK/PINK_SLOT7_L3.wav
```

---

*Vorber v0.1.x — companion app for the Veno-Orbit eurorack module*
