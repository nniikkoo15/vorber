# Vorber

An independent, open-source desktop companion app for preparing audio files for the **Veno-Orbit** eurorack sampler module by Venus Instruments.

Vorber lets you assign audio files to banks, slots, and layers, trim and preview them, handle stereo routing, and export an SD-card-ready folder tree in the exact format the module requires — without manual renaming or conversion in a DAW.

---

## Features

- Drag and drop audio files (WAV, AIFF, FLAC, MP3, M4A) onto banks/slots/layers
- Waveform display with draggable trim handles and loop preview
- Stereo handling: sum to mono, left-only, right-only, or stereo split across L/R pair
- Export pipeline: trim → stereo strategy → 5ms fades → 48kHz / 16-bit PCM mono WAV
- Output named and structured exactly to the Veno-Orbit specification
- Project save/load (`.json`)
- `manifest.csv` generated alongside every export for traceability

## Platform

- macOS (Apple Silicon) — available now
- Windows — planned

## Installation

Download the latest `.dmg` from the [Releases](../../releases) page.

> **Note:** Vorber is unsigned. On first open macOS will show "damaged and can't be opened." To bypass, run:
> ```
> xattr -dr com.apple.quarantine /Applications/Vorber.app
> ```
> Or go to **System Settings → Privacy & Security → Open Anyway**.

> **Requirement:** [ffmpeg](https://ffmpeg.org) must be installed (`brew install ffmpeg`).

See [MANUAL.md](MANUAL.md) for full usage instructions.

---

## Credits & Disclaimer

**Veno-Orbit** is a product of [Venus Instruments](https://venusinstruments.com). All product names, trademarks, and brand names are the property of their respective owners.

Vorber is an independent, open-source utility developed by the community to assist with preparing audio files for use with the Veno-Orbit module. It is not affiliated with, endorsed by, or officially supported by Venus Instruments.

Vorber does not modify, distribute, or reproduce any proprietary firmware, software, or intellectual property belonging to Venus Instruments. It only processes audio files provided by the user and writes output in the format documented in the Veno-Orbit user manual.

Use of Vorber is at your own risk. The author(s) make no warranties regarding compatibility, fitness for purpose, or freedom from error.
