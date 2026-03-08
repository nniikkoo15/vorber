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

### Windows

1. Download `Vorber_x.x.x_x64-setup.exe` from the GitHub releases page.
2. Run the installer. Windows SmartScreen may warn "Windows protected your PC." This is expected for unsigned apps — the app is not harmful.

**To bypass:**

Click **More info**, then **Run anyway**.

### Requirement: ffmpeg

Vorber uses **ffmpeg** for audio conversion during export. You must have it installed.

**macOS** — install via Homebrew:
```
brew install ffmpeg
```
Vorber will locate it automatically at `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, or wherever `which ffmpeg` reports.

**Windows** — install via winget:
```
winget install ffmpeg
```
Or download a build from [ffmpeg.org](https://ffmpeg.org/download.html) and add the `bin` folder to your system PATH. Vorber will locate it automatically via `where ffmpeg`.

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
 top bar   [new] [open] [clear BANK] [clear SLOT]   filename  [●]
           ────────────────────────────────────────────────────────
 bank tabs  RED   GREEN   BLUE   ...
           ────────────────────────────────────────────────────────
 slot grid     ○ ○ ○ ○   RED \ SLOT 0   ○ ○ ○ ○
           ────────────────────────────────────────────────────────
 layers    [▶] filename   1m23s  stereo  —  mono  1m23s  name  [▶]
           [▶] filename   1m23s  mono    —  mono  1m23s  name  [▶]
           ...
           ────────────────────────────────────────────────────────
 trim      [trim panel]
           ────────────────────────────────────────────────────────
 export    [export]
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

### Rearranging layers

Click and hold the body of an assigned layer side (not on the filename, duration badge, format badge, or ✕) and drag it to another layer side in the same slot.

- **Drop on empty layer** — moves the file to the destination; origin becomes empty
- **Drop on loaded layer** — swaps the two layers; each takes the other's file and settings
- **Hold Option (⌥) + drop on empty layer** — copies the file to the destination; origin is unchanged
- **Hold Option (⌥) + drop on loaded layer** — no action (copy to a loaded slot is ambiguous)

A ghost tooltip follows the cursor showing the current action: `moving L0 file.wav`, `moving L0 file.wav > L3`, `swapping L0 file.wav <> L2 file02.wav`, or `copying L0 file.wav > L3`.

All cell data transfers with the drag: file path, duration, trim settings, and stereo mode. If the dragged cell is a stereo split pair, the split is broken before moving (the moved cell retains its file but reverts to the appropriate mono mode).

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

Click **Export**. If any assigned layers have stereo files set to sum-to-mono, or files longer than 60 seconds that haven't been trimmed into range, a warning bar appears first:

- **"N files will be summed to mono"** — stereo files that will be downmixed on export
- **"N files will be trimmed to 60s"** — files whose trim window still exceeds 60 seconds

Click **export anyway!** to proceed, or **wait a sec!** to return and adjust settings.

After dismissing any warnings, a native folder picker opens — select your SD card root or any output folder.

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
| Move layer | Click-hold layer body → drag → release on empty layer |
| Swap layers | Click-hold layer body → drag → release on loaded layer |
| Copy layer | Option (⌥) + click-hold layer body → drag → release on empty layer |
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

## Credits & Disclaimer

**Veno-Orbit** is a product of [Venus Instruments](https://venusinstruments.com). All product names, trademarks, and brand names are the property of their respective owners.

Vorber is an independent, open-source utility developed by the community to assist with preparing audio files for use with the Veno-Orbit module. It is not affiliated with, endorsed by, or officially supported by Venus Instruments.

Vorber does not modify, distribute, or reproduce any proprietary firmware, software, or intellectual property belonging to Venus Instruments. It only processes audio files provided by the user and writes output files in the format documented in the Veno-Orbit user manual.

Use of Vorber is at your own risk. The author(s) make no warranties regarding compatibility, fitness for purpose, or freedom from error.

---

*Vorber v0.1.5 — an independent companion utility for the Veno-Orbit eurorack module by Venus Instruments*
