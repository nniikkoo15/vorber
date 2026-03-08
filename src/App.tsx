import { useState, useRef, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { BANKS, SLOTS, LAYERS, useStore, type Bank, type Slot, type Layer, type TrimSettings, type CellData, type StereoMode } from "./store";
import "./App.css";

// Shared audio context + gain node for immediate silence on stop
const previewCtx = new AudioContext();
const previewGain = previewCtx.createGain();
previewGain.connect(previewCtx.destination);
let playingSource: AudioBufferSourceNode | null = null;
let isDecoding = false;

// Pointer-event drag state (replaces HTML5 DnD, which is unreliable in WKWebView)
let pDragSrc: string | null = null;
let pDragStartX = 0;
let pDragStartY = 0;
let pDragActive = false;
let pDragGhost: HTMLElement | null = null;

function pClearDragOver() {
  document.querySelectorAll(".layer-side.drag-over").forEach((c) => {
    c.classList.remove("drag-over");
  });
}

function pDragCleanup() {
  if (pDragSrc) {
    (document.querySelector(`[data-cell-id="${pDragSrc}"]`) as HTMLElement | null)?.classList.remove("dragging");
  }
  pClearDragOver();
  pDragGhost?.remove();
  pDragGhost = null;
  pDragSrc = null;
  pDragActive = false;
}

function performCellDrop(srcId: string, destId: string, cmdKey: boolean) {
  const [srcBankStr, srcSlotStr, srcLayerStr] = srcId.split(":");
  const srcBank = srcBankStr as Bank;
  const srcSlot = parseInt(srcSlotStr) as Slot;
  const srcLayer = srcLayerStr as Layer;
  const srcKey = { bank: srcBank, slot: srcSlot, layer: srcLayer };
  const s = useStore.getState();
  const srcCell = s.cells[srcId];
  if (!srcCell) return;
  if (srcCell.stereoMode === "split-L" || srcCell.stereoMode === "split-R") {
    const num = parseInt(srcLayer[1]);
    const partnerLayer = (srcLayer.startsWith("L") ? `R${num}` : `L${num}`) as Layer;
    const partner = s.cells[`${srcBank}:${srcSlotStr}:${partnerLayer}`];
    const newMode: StereoMode = srcLayer.startsWith("L") ? "left-only" : "right-only";
    s.assignFile(srcKey, { ...srcCell, stereoMode: newMode });
    if (partner?.filePath === srcCell.filePath) s.clearCell({ bank: srcBank, slot: srcSlot, layer: partnerLayer });
  }
  if (s.openTrimId === srcId) s.setOpenTrimId(null);
  const s2 = useStore.getState();
  const [destBankStr, destSlotStr, destLayerStr] = destId.split(":");
  const destKey = { bank: destBankStr as Bank, slot: parseInt(destSlotStr) as Slot, layer: destLayerStr as Layer };
  const destCell = s2.cells[destId];
  if (cmdKey && destCell) return; // Option + loaded target = no action
  if (cmdKey && !destCell) {
    s2.assignFile(destKey, s2.cells[srcId]!);
  } else if (destCell) {
    s2.swapCells(srcKey, destKey);
  } else {
    s2.moveCell(srcKey, destKey);
  }
}

function stopPreview() {
  previewGain.gain.cancelScheduledValues(previewCtx.currentTime);
  previewGain.gain.setValueAtTime(0, previewCtx.currentTime);
  if (playingSource) {
    try { playingSource.stop(); } catch { /* already stopped */ }
    playingSource = null;
  }
}

function startPreview() {
  previewGain.gain.cancelScheduledValues(previewCtx.currentTime);
  previewGain.gain.setValueAtTime(1, previewCtx.currentTime);
}

async function readAudioMetadata(filePath: string): Promise<{ duration: number; channels: number }> {
  const bytes = await readFile(filePath);
  const audioCtx = new AudioContext();
  const buffer = await audioCtx.decodeAudioData(bytes.buffer);
  await audioCtx.close();
  return { duration: buffer.duration, channels: buffer.numberOfChannels };
}

// ── Waveform cache ────────────────────────────────────────────────────────────

const waveformCache = new Map<string, Float32Array>();
const PEAK_RESOLUTION = 2000;

async function buildPeaks(filePath: string): Promise<Float32Array> {
  const cached = waveformCache.get(filePath);
  if (cached) return cached;
  const bytes = await readFile(filePath);
  const audioCtx = new AudioContext();
  const buffer = await audioCtx.decodeAudioData(bytes.buffer);
  await audioCtx.close();
  const peaks = new Float32Array(PEAK_RESOLUTION);
  const numChannels = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  for (let i = 0; i < PEAK_RESOLUTION; i++) {
    const s0 = Math.floor((i / PEAK_RESOLUTION) * totalSamples);
    const s1 = Math.floor(((i + 1) / PEAK_RESOLUTION) * totalSamples);
    let peak = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let s = s0; s < s1; s++) {
        const v = Math.abs(data[s]);
        if (v > peak) peak = v;
      }
    }
    peaks[i] = peak;
  }
  waveformCache.set(filePath, peaks);
  return peaks;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}


function formatTrimTime(secs: number): string {
  const total = Math.round(secs * 100); // hundredths of a second
  const m = Math.floor(total / 6000);
  const sInt = Math.floor((total % 6000) / 100);
  const ms = total % 100;
  if (m > 0) {
    return `${String(m).padStart(2, "0")}m${String(sInt).padStart(2, "0")}.${String(ms).padStart(2, "0")}s`;
  }
  return `${sInt}.${String(ms).padStart(2, "0")}s`;
}

const BANK_COLORS: Record<string, string> = {
  RED: "#c03a2b", GREEN: "#138243", BLUE: "#155c8b", WHITE: "#929292",
  CYAN: "#139b99", ORANGE: "#b9651d", YELLOW: "#ac8f19", PINK: "#af1468",
};

const BANK_COLORS_DIM: Record<string, string> = {
  RED: "#811d12", GREEN: "#0d3318", BLUE: "#0d2535", WHITE: "#2a2a2a",
  CYAN: "#072820", ORANGE: "#4a2208", YELLOW: "#4a3c08", PINK: "#4a0824",
};

const BANK_COLORS_BRIGHT: Record<string, string> = {
  RED: "#c03a2b", GREEN: "#26ad60", BLUE: "#0f98f1", WHITE: "#dddddd",
  CYAN: "#10deda", ORANGE: "#ff7904", YELLOW: "#ffce0b", PINK: "#e91e8c",
};

const BANK_TEXT_DARK = new Set(["WHITE", "CYAN", "YELLOW"]);

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Derived from BANK_COLORS — stays in sync if base hex values change
const BANK_COLORS_OUTLINE = Object.fromEntries(
  Object.entries(BANK_COLORS).map(([k, v]) => [k, hexToRgba(v, 0.35)])
) as Record<string, string>;

function bankSlotCount(cells: Record<string, unknown>, bank: Bank): number {
  const slots = new Set<string>();
  Object.keys(cells).forEach(k => { if (k.startsWith(`${bank}:`)) slots.add(k.split(":")[1]); });
  return slots.size;
}

function slotLayerCount(cells: Record<string, unknown>, bank: Bank, slot: Slot): number {
  return LAYERS.filter(l => cells[`${bank}:${slot}:${l}`]).length;
}

const AUDIO_EXTENSIONS = ["wav", "aiff", "aif", "flac", "mp3", "m4a", "ogg"];

// ── Project Save / Load ───────────────────────────────────────────────────────

async function handleSaveAs() {
  const state = useStore.getState();
  const chosen = await save({
    defaultPath: state.projectName,
    filters: [{ name: "Vorber Project", extensions: ["json"] }],
  });
  if (!chosen) return;
  const data = JSON.stringify({ version: "1", cells: state.cells }, null, 2);
  await invoke("write_project", { path: chosen, content: data });
  const name = chosen.replace(/\\/g, "/").split("/").pop() ?? "untitled.json";
  state.setProjectMeta(chosen, name);
  state.setDirty(false);
}

async function handleSaveOverwrite() {
  const state = useStore.getState();
  if (!state.projectPath) { await handleSaveAs(); return; }
  const data = JSON.stringify({ version: "1", cells: state.cells }, null, 2);
  await invoke("write_project", { path: state.projectPath, content: data });
  state.setDirty(false);
}

function handleNew() {
  const { projectName, projectPath } = useStore.getState();
  let newName = "untitled.json";
  if (projectPath) {
    const m = projectName.match(/^untitled(\d*)\.json$/i);
    if (m) {
      const num = m[1] ? parseInt(m[1]) : 0;
      newName = `untitled${String(num + 1).padStart(2, "0")}.json`;
    }
  }
  stopPreview();
  useStore.setState({ cells: {}, isDirty: false, missingPaths: [], playingCellId: null });
  useStore.getState().setProjectMeta(null, newName);
}


async function handleLoadProject() {
  const chosen = await open({
    multiple: false,
    filters: [{ name: "Vorber Project", extensions: ["json"] }],
  });
  if (!chosen) return;
  const path = typeof chosen === "string" ? chosen : chosen[0];
  const text = await invoke<string>("read_project", { path });
  let data: { version?: string; cells?: Record<string, CellData> };
  try { data = JSON.parse(text); } catch { return; }
  if (!data?.cells) return;
  const cells = data.cells;
  const allPaths = [...new Set(Object.values(cells).map(c => c.filePath))];
  const missing = await invoke<string[]>("check_files_exist", { paths: allPaths });
  const name = path.replace(/\\/g, "/").split("/").pop() ?? "untitled.json";
  useStore.setState({ cells, isDirty: false });
  useStore.getState().setProjectMeta(path, name);
  useStore.getState().setMissingPaths(missing);
}

// ── Top Bar ───────────────────────────────────────────────────────────────────

function TopBar() {
  const { projectName, projectPath, isDirty, missingPaths, cells, activeBank, activeSlot, clearBank, clearSlot } = useStore();
  const hasAnyCells = Object.keys(cells).length > 0;

  let status: "empty" | "unsaved" | "saved" | "missing";
  if (missingPaths.length > 0) status = "missing";
  else if (!isDirty && !projectPath && !hasAnyCells) status = "empty";
  else if (!isDirty && !!projectPath) status = "saved";
  else status = "unsaved";

  function onStatusClick() {
    if (status !== "unsaved") return;
    if (!projectPath) handleSaveAs();
    else handleSaveOverwrite();
  }

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <button className="project-open-btn" onClick={handleNew}>new</button>
        <button className="project-open-btn" onClick={handleLoadProject}>open</button>
        <button className="project-open-btn" onClick={() => clearBank(activeBank)}>clear {activeBank}</button>
        <button className="project-open-btn" onClick={() => clearSlot(activeBank, activeSlot)}>clear {activeBank}/SLOT{activeSlot}</button>
      </div>
      <div className="top-bar-right">
        <button className="project-name-btn" onClick={handleSaveAs} title="Save as...">{projectName}</button>
        {status === "unsaved" ? (
          <button className="status-badge unsaved" onClick={onStatusClick}>unsaved</button>
        ) : status === "missing" ? (
          <span className="status-badge missing">{missingPaths.length} file{missingPaths.length !== 1 ? "s" : ""} missing</span>
        ) : status === "saved" ? (
          <span className="status-badge saved">saved</span>
        ) : (
          <span className="status-badge empty">empty</span>
        )}
      </div>
    </div>
  );
}

// ── Format Overlay ────────────────────────────────────────────────────────────

interface FmtOverlayProps { bank: Bank; slot: Slot; layer: Layer; cell: CellData; side: "left" | "right"; onClose: () => void; }

function FmtOverlay({ bank, slot, layer, cell, side, onClose }: FmtOverlayProps) {
  const { assignFile, clearCell, splitStereo } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const key = { bank, slot, layer };
  const num = parseInt(layer[1]);
  const counterpartLayer = (layer.startsWith("L") ? `R${num}` : `L${num}`) as Layer;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function setSum() { assignFile(key, { ...cell, stereoMode: "sum" }); onClose(); }

  function keepChannel(m: "left-only" | "right-only") {
    assignFile(key, { ...cell, stereoMode: m });
    const partner = useStore.getState().getCell({ bank, slot, layer: counterpartLayer });
    const partnerIsSplit = partner?.stereoMode === "split-L" || partner?.stereoMode === "split-R";
    if (partner?.filePath === cell.filePath && partnerIsSplit) clearCell({ bank, slot, layer: counterpartLayer });
    onClose();
  }

  function doSplit() { splitStereo(key); onClose(); }

  const splitLabel = layer.startsWith("L") ? "split to R" : "split to L";

  const actions: { label: string; fn: () => void; accent?: boolean }[] = [
    { label: "sum to mono", fn: setSum },
    { label: "mono L",      fn: () => keepChannel("left-only") },
    { label: "mono R",      fn: () => keepChannel("right-only") },
    { label: splitLabel,    fn: doSplit, accent: true },
    { label: "✕",           fn: onClose },
  ];

  return (
    <div ref={ref} className={`fmt-overlay ${side}`}>
      {actions.map(({ label, fn, accent }) => (
        <button key={label} className={`fmt-action${accent ? " accent" : ""}${label === "✕" ? " close" : ""}`} onClick={(e) => { e.stopPropagation(); fn(); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Layer Side ────────────────────────────────────────────────────────────────

interface LayerSideProps { bank: Bank; slot: Slot; layer: Layer; side: "left" | "right"; isInEdit?: boolean; }

function LayerSide({ bank, slot, layer, side, isInEdit }: LayerSideProps) {
  const { getCell, assignFile, clearCell, selectedCellId, setSelectedCellId, openFmtOverlayId, setOpenFmtOverlayId, setOpenTrimId, missingPaths } = useStore();
  const cell = getCell({ bank, slot, layer });
  const isMissing = cell ? missingPaths.includes(cell.filePath) : false;
  const id = `${bank}:${slot}:${layer}`;
  const isSelected = selectedCellId === id;
  const overlayOpen = openFmtOverlayId === id;

  async function assign(path: string, fileName: string) {
    assignFile({ bank, slot, layer }, { filePath: path, fileName });
    try {
      const meta = await readAudioMetadata(path);
      assignFile({ bank, slot, layer }, { filePath: path, fileName, ...meta });
    } catch { /* no metadata */ }
  }

  async function handleClick() {
    if (cell) { setSelectedCellId(isSelected ? null : id); return; }
    const path = await open({ multiple: false, filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }] });
    if (typeof path === "string") await assign(path, path.split("/").pop() ?? path);
  }

  // Format badge
  let fmtLabel: string | null = null;
  let fmtSplit = false;
  let fmtInteractive = false;
  let fmtWarning = false;
  if (cell) {
    const ch = cell.channels ?? 1;
    if (ch === 1) {
      fmtLabel = "mono";
    } else if (cell.stereoMode === "sum") {
      fmtLabel = "mono"; fmtInteractive = true;
    } else if (cell.stereoMode === "split-L") {
      fmtLabel = "L"; fmtSplit = true; fmtInteractive = true;
    } else if (cell.stereoMode === "split-R") {
      fmtLabel = "R"; fmtSplit = true; fmtInteractive = true;
    } else if (cell.stereoMode === "left-only") {
      fmtLabel = "mono L"; fmtInteractive = true;
    } else if (cell.stereoMode === "right-only") {
      fmtLabel = "mono R"; fmtInteractive = true;
    } else {
      fmtLabel = "stereo"; fmtInteractive = true; fmtWarning = true;
    }
  }

  // Duration badge
  let durLabel: string | null = null;
  let durOver60 = false;
  let isLong = false;
  if (cell?.duration !== undefined) {
    const effective = cell.trim?.length ?? cell.duration;
    isLong = cell.duration > 60;
    durOver60 = isLong && !cell.trim; // red only until first trim is set
    durLabel = formatDuration(effective);
  }

  if (!cell) {
    return (
      <div
        data-cell-id={id}
        className={`layer-side ${side} empty`}
        onClick={handleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <span className="side-empty">no file. drop or click</span>
      </div>
    );
  }

  if (overlayOpen) {
    return (
      <div data-cell-id={id} className={`layer-side ${side} assigned overlay-open${isInEdit ? " in-edit" : ""}`}>
        <FmtOverlay bank={bank} slot={slot} layer={layer} cell={cell} side={side} onClose={() => setOpenFmtOverlayId(null)} />
      </div>
    );
  }

  const clearBtn = (
    <button className="clear-side-btn" onClick={(e) => {
      e.stopPropagation();
      if (useStore.getState().playingCellId === id) { stopPreview(); useStore.getState().setPlayingCellId(null); }
      clearCell({ bank, slot, layer });
    }}>✕</button>
  );
  async function handleReplaceFile(e: React.MouseEvent) {
    e.stopPropagation();
    const path = await open({ multiple: false, filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }] });
    if (typeof path === "string") await assign(path, path.split("/").pop() ?? path);
  }
  const nameEl = (
    <div className="side-filename-wrap">
      <button className="side-filename" title={cell.filePath} onClick={handleReplaceFile}>{cell.fileName}</button>
    </div>
  );
  const durEl = durLabel ? (
    <button className={`dur-badge${durOver60 ? " over60" : ""} interactive`} onClick={(e) => {
      e.stopPropagation();
      const { playingCellId } = useStore.getState();
      if (playingCellId && playingCellId !== id) { stopPreview(); useStore.getState().setPlayingCellId(null); }
      setOpenTrimId(id);
    }}>{durLabel}</button>
  ) : null;
  const fmtEl = fmtLabel ? (
    <button
      className={`fmt-badge${fmtSplit ? " split" : ""}${fmtWarning ? " warning" : ""}${fmtInteractive ? " interactive" : ""}`}
      onClick={fmtInteractive ? (e) => { e.stopPropagation(); setOpenFmtOverlayId(id); } : undefined}
    >{fmtLabel}</button>
  ) : null;
  const missingEl = <span className="file-missing-badge">file missing</span>;

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const srcId = id;
    pDragSrc = srcId;
    pDragStartX = e.clientX;
    pDragStartY = e.clientY;
    pDragActive = false;
    const onMove = (ev: MouseEvent) => {
      if (!pDragSrc) return;
      if (!pDragActive && Math.hypot(ev.clientX - pDragStartX, ev.clientY - pDragStartY) > 5) {
        pDragActive = true;
        const s0 = useStore.getState();
        if (s0.playingCellId === srcId) { stopPreview(); s0.setPlayingCellId(null); }
        (document.querySelector(`[data-cell-id="${srcId}"]`) as HTMLElement | null)?.classList.add("dragging");
        pDragGhost = document.createElement("div");
        pDragGhost.className = "pointer-drag-ghost";
        pDragGhost.textContent = `${ev.altKey ? "copying" : "moving"} ${layer} ${cell?.fileName ?? ""}`;
        document.body.appendChild(pDragGhost);
      }
      if (pDragActive) {
        if (pDragGhost) { pDragGhost.style.left = `${ev.clientX + 12}px`; pDragGhost.style.top = `${ev.clientY - 10}px`; }
        pClearDragOver();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-cell-id]") as HTMLElement | null;
        if (target && target.dataset.cellId !== srcId) {
          const targetId = target.dataset.cellId!;
          const targetCell = useStore.getState().cells[targetId];
          const targetLayer = targetId.split(":")[2];
          if (targetCell && ev.altKey) {
            // Option + loaded target = no action, no overlay
          } else {
            target.classList.add("drag-over");
            if (pDragGhost) {
              if (targetCell) {
                pDragGhost.textContent = `swapping ${layer} ${cell?.fileName ?? ""} <> ${targetLayer} ${targetCell.fileName}`;
              } else {
                pDragGhost.textContent = `${ev.altKey ? "copying" : "moving"} ${layer} ${cell?.fileName ?? ""} > ${targetLayer}`;
              }
            }
          }
        } else if (pDragGhost) {
          pDragGhost.textContent = `${ev.altKey ? "copying" : "moving"} ${layer} ${cell?.fileName ?? ""}`;
        }
      }
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!pDragActive) { pDragCleanup(); return; }
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-cell-id]") as HTMLElement | null;
      const destId = target?.dataset.cellId;
      const savedSrc = pDragSrc;
      pDragCleanup();
      if (savedSrc && destId && destId !== savedSrc) performCellDrop(savedSrc, destId, ev.altKey);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      data-cell-id={id}
      className={`layer-side ${side} assigned${isSelected ? " selected" : ""}${isMissing ? " missing" : ""}${isInEdit ? " in-edit" : ""}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {side === "left" ? (
        <>{nameEl}{isMissing ? missingEl : durEl}{isMissing ? null : fmtEl}{clearBtn}</>
      ) : (
        <>{clearBtn}{isMissing ? null : fmtEl}{isMissing ? missingEl : durEl}{nameEl}</>
      )}
    </div>
  );
}

// ── Layer Row ─────────────────────────────────────────────────────────────────

function LayerRow({ bank, slot, num }: { bank: Bank; slot: Slot; num: number }) {
  const lLayer = `L${num}` as Layer;
  const rLayer = `R${num}` as Layer;
  const { getCell, assignFile, playingCellId, setPlayingCellId, setOpenTrimId, loopingCellId, missingPaths, openTrimId } = useStore();
  const lCell = getCell({ bank, slot, layer: lLayer });
  const rCell = getCell({ bank, slot, layer: rLayer });
  const lMissing = lCell ? missingPaths.includes(lCell.filePath) : false;
  const rMissing = rCell ? missingPaths.includes(rCell.filePath) : false;
  const lId = `${bank}:${slot}:${lLayer}`;
  const rId = `${bank}:${slot}:${rLayer}`;

  const isSplitPair =
    lCell?.stereoMode === "split-L" &&
    rCell?.stereoMode === "split-R" &&
    lCell.filePath === rCell.filePath;

  async function handlePlay(e: React.MouseEvent, id: string, cell: CellData) {
    e.stopPropagation();
    if (playingCellId === id) { stopPreview(); setPlayingCellId(null); return; }
    if (isDecoding) return;
    stopPreview();
    setPlayingCellId(null);
    isDecoding = true;
    try {
      if (previewCtx.state === "suspended") await previewCtx.resume();
      const bytes = await readFile(cell.filePath);
      const buffer = await previewCtx.decodeAudioData(bytes.buffer);
      const source = previewCtx.createBufferSource();
      source.buffer = buffer;
      startPreview();
      source.connect(previewGain);
      source.onended = () => { setPlayingCellId(null); playingSource = null; };
      playingSource = source;
      setPlayingCellId(id);
      setOpenTrimId(id);
      const trimStart = cell.trim?.start ?? 0;
      const trimLen = cell.trim?.length ?? Math.min(buffer.duration, 60);
      source.start(0, trimStart, trimLen);
    } finally { isDecoding = false; }
  }

  function handleUnlink() {
    if (lCell) assignFile({ bank, slot, layer: lLayer }, { ...lCell, stereoMode: "left-only" });
    if (rCell) assignFile({ bank, slot, layer: rLayer }, { ...rCell, stereoMode: "right-only" });
  }

  const lLooping = loopingCellId === lId || (isSplitPair && loopingCellId === rId);
  const rLooping = loopingCellId === rId || (isSplitPair && loopingCellId === lId);
  const lPlaying = playingCellId === lId || (isSplitPair && playingCellId === rId);
  const rPlaying = playingCellId === rId || (isSplitPair && playingCellId === lId);
  const isInEdit = openTrimId === lId || openTrimId === rId;

  return (
    <div className="layer-row">
      <div
        className={`layer-num${lCell ? " has-file" : ""}${lPlaying || lLooping ? " playing" : ""}${lLooping ? " looping" : ""}${lMissing ? " missing" : ""}${isInEdit && lCell ? " in-edit" : ""}`}
        onClick={lCell && !lMissing ? (e) => handlePlay(e, lId, lCell) : undefined}
      >
        {lCell ? (lMissing ? "!" : lLooping ? "⟳" : lPlaying ? "■" : "▶") : `L${num}`}
      </div>
      <LayerSide bank={bank} slot={slot} layer={lLayer} side="left" isInEdit={isInEdit} />
      <div className="layer-connector">
        {isSplitPair && (
          <div className="layer-connector-inner">
            <span className="connector-line" />
            <button className="unlink-btn" onClick={handleUnlink}>X</button>
            <span className="connector-line" />
          </div>
        )}
      </div>
      <LayerSide bank={bank} slot={slot} layer={rLayer} side="right" isInEdit={isInEdit} />
      <div
        className={`layer-num${rCell ? " has-file" : ""}${rPlaying || rLooping ? " playing" : ""}${rLooping ? " looping" : ""}${rMissing ? " missing" : ""}${isInEdit && rCell ? " in-edit" : ""}`}
        onClick={rCell && !rMissing ? (e) => handlePlay(e, rId, rCell) : undefined}
      >
        {rCell ? (rMissing ? "!" : rLooping ? "⟳" : rPlaying ? "■" : "▶") : `R${num}`}
      </div>
    </div>
  );
}

// ── Trim Panel ────────────────────────────────────────────────────────────────

// ── Trim Panel ────────────────────────────────────────────────────────────────

function TrimPanel() {
  const openTrimId = useStore(s => s.openTrimId);
  return (
    <div className="trim-outer">
      {openTrimId
        ? (() => {
            const [bankStr, slotStr, layerStr] = openTrimId.split(":");
            return <TrimPanelContent bank={bankStr as Bank} slot={parseInt(slotStr) as Slot} layer={layerStr as Layer} />;
          })()
        : (
          <div className="trim-panel trim-panel-empty">
            <div className="trim-header">
              <div className="trim-info-pills">
                <span className="trim-empty-label">No layer selected</span>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
}

function TrimPanelContent({ bank, slot, layer }: { bank: Bank; slot: Slot; layer: Layer }) {
  const { getCell, setTrim, setOpenTrimId, setPlayingCellId, setLoopingCellId } = useStore();
  const playingCellId = useStore(s => s.playingCellId);
  const cellId = `${bank}:${slot}:${layer}`;
  const cell = getCell({ bank, slot, layer });
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const dragging = useRef<"start" | "end" | "region" | null>(null);
  const trimRef = useRef<TrimSettings>({ start: 0, length: 60 });
  const linkedRef = useRef<{ bank: Bank; slot: Slot; layer: Layer } | null>(null);
  const dragAnchorRef = useRef<{ x: number; start: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(() =>
    cell?.filePath ? waveformCache.get(cell.filePath) ?? null : null
  );
  const trimDrawRef = useRef({ startPct: 0, endPct: 100 });
  const redrawRef = useRef<(() => void) | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [isPlayingOnce, setIsPlayingOnce] = useState(false);
  const loopSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
  const loopStartTimeRef = useRef<number>(0);
  const playbackStartRef = useRef<number>(0);
  const durationRef = useRef<number>(1);

  // Stop loop on unmount
  useEffect(() => {
    return () => {
      if (loopSourceRef.current) {
        try { loopSourceRef.current.stop(); } catch { /* already stopped */ }
        loopSourceRef.current = null;
      }
    };
  }, []);

  // Compute trim pcts for waveform coloring (safe with optional chaining, before early return)
  const rawDuration = cell?.duration ?? 1;
  const rawTrimStart = cell?.trim?.start ?? 0;
  const rawTrimLength = cell?.trim?.length ?? Math.min(60, rawDuration);
  const trimStartPct = (rawTrimStart / rawDuration) * 100;
  const trimEndPct = ((rawTrimStart + rawTrimLength) / rawDuration) * 100;
  trimDrawRef.current = { startPct: trimStartPct, endPct: trimEndPct };

  // Load waveform peaks when file changes
  useEffect(() => {
    const fp = cell?.filePath;
    if (!fp) return;
    const cached = waveformCache.get(fp);
    if (cached) { setPeaks(cached); return; }
    setPeaks(null);
    let cancelled = false;
    buildPeaks(fp).then(p => { if (!cancelled) setPeaks(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [cell?.filePath]);

  // Draw waveform onto canvas, redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const peaksData = peaks;
    function draw() {
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (W === 0 || H === 0) return;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#c4c4c4";
      ctx.fillRect(0, 0, W, H);
      const { startPct, endPct } = trimDrawRef.current;
      const sX = Math.floor((startPct / 100) * W);
      const eX = Math.floor((endPct / 100) * W);
      const mid = H / 2;
      // Dark background for selected region
      ctx.fillStyle = "#2b2b2b";
      ctx.fillRect(sX, 0, eX - sX, H);
      // Bars outside the selected region
      ctx.fillStyle = "#929292";
      for (let x = 0; x < W; x++) {
        if (x >= sX && x < eX) continue;
        const pi = Math.floor((x / W) * peaksData.length);
        const bh = Math.max(1, peaksData[pi] * H * 0.9);
        ctx.fillRect(x, mid - bh / 2, 1, bh);
      }
      // Bars inside the selected region
      ctx.fillStyle = "#d5d5d5";
      for (let x = sX; x < eX; x++) {
        const pi = Math.floor((x / W) * peaksData.length);
        const bh = Math.max(1, peaksData[pi] * H * 0.9);
        ctx.fillRect(x, mid - bh / 2, 1, bh);
      }
    }
    redrawRef.current = draw;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => { ro.disconnect(); redrawRef.current = null; };
  }, [peaks]);

  // Redraw when trim region moves (during drag)
  useEffect(() => {
    redrawRef.current?.();
  }, [trimStartPct, trimEndPct]);

  const isLayerPlaying = playingCellId === cellId && !isLooping && !isPlayingOnce;

  // Record start time when layer play button activates this cell
  useEffect(() => {
    if (isLayerPlaying) {
      loopStartTimeRef.current = previewCtx.currentTime;
      playbackStartRef.current = trimRef.current.start;
    }
  }, [isLayerPlaying]);

  // Animate playhead while looping, playing once, or layer play button active
  useEffect(() => {
    if (!isLooping && !isPlayingOnce && !isLayerPlaying) {
      const phc = playheadCanvasRef.current;
      if (phc) { const ctx = phc.getContext("2d"); if (ctx) ctx.clearRect(0, 0, phc.width, phc.height); }
      return;
    }
    let rafId: number;
    let active = true;
    function animate() {
      if (!active) return;
      const canvas = playheadCanvasRef.current;
      if (!canvas) { rafId = requestAnimationFrame(animate); return; }
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      if (W > 0 && H > 0) {
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          const { start, length } = trimRef.current;
          const dur = durationRef.current;
          if (dur > 0 && length > 0) {
            const elapsed = previewCtx.currentTime - loopStartTimeRef.current;
            const pbStart = playbackStartRef.current;
            const posInFile = isLooping
              ? pbStart + (elapsed % length)
              : Math.min(pbStart + elapsed, pbStart + length);

            // Stop if region has been dragged past the playhead
            if (posInFile < start - 0.01 || posInFile > start + length + 0.01) {
              stopPreview();
              setIsLooping(false);
              setIsPlayingOnce(false);
              ctx2d.clearRect(0, 0, W, H);
              return;
            }

            const x = Math.floor((posInFile / dur) * W);
            ctx2d.clearRect(0, 0, W, H);
            ctx2d.fillStyle = "#ffffff";
            ctx2d.fillRect(x, 0, 2, H);
          }
        }
      }
      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);
    return () => { active = false; cancelAnimationFrame(rafId); };
  }, [isLooping, isPlayingOnce, isLayerPlaying]);

  if (!cell || !cell.duration) return null;
  const duration = cell.duration;
  const trim: TrimSettings = cell.trim ?? { start: 0, length: Math.min(duration, 60) };
  trimRef.current = trim;
  durationRef.current = duration;

  // detect linked split pair
  const isSplit = cell.stereoMode === "split-L" || cell.stereoMode === "split-R";
  const num = parseInt(layer[1]);
  const counterpartLayer: Layer = layer.startsWith("L") ? `R${num}` as Layer : `L${num}` as Layer;
  const counterpartKey = { bank, slot, layer: counterpartLayer };
  const counterpartCell = isSplit ? getCell(counterpartKey) : undefined;
  const isLinked = isSplit && counterpartCell?.filePath === cell.filePath;
  linkedRef.current = isLinked ? counterpartKey : null;

  const cellLabel = isLinked
    ? (layer.startsWith("L")
      ? `${bank}_SLOT${slot}_${layer}-${counterpartLayer}`
      : `${bank}_SLOT${slot}_${counterpartLayer}-${layer}`)
    : `${bank}_SLOT${slot}_${layer}`;

  function clamp(t: TrimSettings): TrimSettings {
    const maxLen = Math.min(60, duration);
    const len = Math.min(maxLen, Math.max(Math.min(0.5, duration), t.length));
    const start = Math.min(Math.max(0, t.start), Math.max(0, duration - len));
    return { start, length: len };
  }


  function xToSec(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }

  function stopLoop() {
    stopPreview();
    setIsLooping(false);
    setIsPlayingOnce(false);
    setLoopingCellId(null);
    setPlayingCellId(null);
    loopSourceRef.current = null;
  }

  async function playOnce() {
    if (isPlayingOnce) { stopLoop(); return; }
    if (!cell || isDecoding) return;
    stopLoop();
    isDecoding = true;
    try {
      if (previewCtx.state === "suspended") await previewCtx.resume();
      const bytes = await readFile(cell.filePath);
      const buffer = await previewCtx.decodeAudioData(bytes.buffer);
      const source = previewCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(previewGain);
      source.onended = () => { loopSourceRef.current = null; setIsPlayingOnce(false); setPlayingCellId(null); };
      loopSourceRef.current = source;
      playingSource = source;
      startPreview();
      source.start(0, trim.start, trim.length);
      loopStartTimeRef.current = previewCtx.currentTime;
      playbackStartRef.current = trim.start;
      setPlayingCellId(cellId);
      setIsPlayingOnce(true);
    } catch { /* file read or decode failed */ }
    finally { isDecoding = false; }
  }

  async function toggleLoop() {
    if (isLooping) { stopLoop(); return; }
    if (!cell || isDecoding) return;
    stopLoop();
    isDecoding = true;
    try {
      if (previewCtx.state === "suspended") await previewCtx.resume();
      const bytes = await readFile(cell.filePath);
      const buffer = await previewCtx.decodeAudioData(bytes.buffer);
      const source = previewCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = trim.start;
      source.loopEnd = trim.start + trim.length;
      source.connect(previewGain);
      source.onended = () => { loopSourceRef.current = null; setIsLooping(false); setLoopingCellId(null); };
      loopSourceRef.current = source;
      playingSource = source;
      startPreview();
      source.start(0, trim.start);
      loopStartTimeRef.current = previewCtx.currentTime;
      playbackStartRef.current = trim.start;
      setLoopingCellId(cellId);
      setIsLooping(true);
    } catch { /* file read or decode failed */ }
    finally { isDecoding = false; }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const cur = trimRef.current;
      let newTrim: TrimSettings;
      if (dragging.current === "region") {
        const anchor = dragAnchorRef.current;
        if (!anchor) return;
        const barWidth = barRef.current?.getBoundingClientRect().width ?? 1;
        const deltaSec = ((e.clientX - anchor.x) / barWidth) * duration;
        const newStart = Math.max(0, Math.min(duration - cur.length, anchor.start + deltaSec));
        newTrim = { start: newStart, length: cur.length };
      } else {
        const t = xToSec(e.clientX);
        if (dragging.current === "start") {
          const end = cur.start + cur.length; // end point is fixed
          const minLen = Math.min(0.5, duration);
          const maxLen = Math.min(60, duration);
          const clampedLen = Math.min(maxLen, Math.max(minLen, end - t));
          const newStart = Math.max(0, end - clampedLen);
          newTrim = { start: newStart, length: end - newStart };
        } else {
          newTrim = clamp({ start: cur.start, length: t - cur.start });
        }
      }
      setTrim({ bank, slot, layer }, newTrim);
      if (linkedRef.current) setTrim(linkedRef.current, newTrim);
      if (loopSourceRef.current) {
        loopSourceRef.current.loopStart = newTrim.start;
        loopSourceRef.current.loopEnd = newTrim.start + newTrim.length;
      }
    }
    function onUp() { dragging.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [bank, slot, layer]);

  // format badge label
  let fmtLabel = "mono";
  if ((cell.channels ?? 1) > 1) {
    if (cell.stereoMode === "split-L") fmtLabel = "L";
    else if (cell.stereoMode === "split-R") fmtLabel = "R";
    else if (cell.stereoMode === "left-only") fmtLabel = "mono L";
    else if (cell.stereoMode === "right-only") fmtLabel = "mono R";
    else if (cell.stereoMode === "sum") fmtLabel = "mono";
    else fmtLabel = "stereo";
  }

  const startPct = (trim.start / duration) * 100;
  const endPct = ((trim.start + trim.length) / duration) * 100;

  return (
    <div className="trim-panel" ref={panelRef}>
      <div className="trim-header">
        <div className="trim-info-pills">
          <span className="trim-pill">{cellLabel}</span>
          <span className="trim-pill">{fmtLabel}</span>
          <span className="trim-pill">start {formatTrimTime(trim.start)}</span>
          <span className="trim-pill">length {formatTrimTime(trim.length)}</span>
        </div>
        <div className="trim-header-actions">
          <button className="trim-pill trim-pill-btn" onClick={playOnce}>
            {isPlayingOnce ? "stop" : "play once"}
          </button>
          <button className="trim-pill trim-pill-btn" onClick={toggleLoop}>
            {isLooping ? "stop" : "play as loop"}
          </button>
          <button className="trim-pill trim-pill-btn trim-close" onClick={() => { stopLoop(); setOpenTrimId(null); }}>✕</button>
        </div>
      </div>

      <div className="trim-bar-wrap" ref={barRef}>
        <div className="trim-bar-bg">
          <canvas ref={canvasRef} className="trim-waveform" />
          <canvas ref={playheadCanvasRef} className="trim-playhead" />
        </div>
        <div className="trim-bar-region" style={{ left: `${startPct}%`, width: `${endPct - startPct}%`, cursor: "grab" }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "region"; dragAnchorRef.current = { x: e.clientX, start: trim.start }; }} />
        <div className="trim-handle start" style={{ left: `${startPct}%` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "start"; }} />
        <div className="trim-handle end" style={{ left: `${endPct}%` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "end"; }} />
      </div>


      <div className="trim-footer">
        <span className="trim-pill trim-filename">{cell.fileName}</span>
        <span className="trim-pill">length {formatDuration(duration)}</span>
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface ExportJob {
  file_path: string; bank: string; slot: number; layer: string;
  trim_start: number; trim_length: number; stereo_mode: string; channels: number;
}
interface ExportProgress { index: number; total: number; status: "done" | "skipped" | "error"; file: string; }
interface ExportResult { completed: number; skipped: number; errors: string[]; manifest_path: string | null; }

function buildJobs(cells: Record<string, CellData>): ExportJob[] {
  return Object.entries(cells).map(([id, cell]) => {
    const [bank, slotStr, layer] = id.split(":");
    const slot = parseInt(slotStr);
    const duration = cell.duration ?? 60;
    return {
      file_path: cell.filePath, bank, slot, layer,
      trim_start: cell.trim?.start ?? 0,
      trim_length: cell.trim?.length ?? Math.min(duration, 60),
      stereo_mode: cell.stereoMode ?? "sum",
      channels: cell.channels ?? 1,
    };
  });
}

function computeExportStats(cells: Record<string, CellData>) {
  const keys = Object.keys(cells);
  const values = Object.values(cells);
  return {
    banks: new Set(keys.map(k => k.split(":")[0])).size,
    slots: new Set(keys.map(k => k.split(":").slice(0, 2).join(":"))).size,
    layers: keys.length,
    files: new Set(values.map(c => c.filePath)).size,
  };
}

function computeWarnings(cells: Record<string, CellData>) {
  let monoCount = 0;
  let over60Count = 0;
  for (const cell of Object.values(cells)) {
    if ((cell.channels ?? 1) > 1) monoCount++;
    const trimLen = cell.trim?.length ?? (cell.duration ?? 0);
    if (trimLen > 60) over60Count++;
  }
  return { monoCount, over60Count };
}

function ExportPanel() {
  const cells = useStore((s) => s.cells);
  const [phase, setPhase] = useState<"idle" | "warn" | "conflict" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [warnStats, setWarnStats] = useState({ monoCount: 0, over60Count: 0 });
  const pending = useRef<{ jobs: ExportJob[]; dir: string } | null>(null);

  const stats = computeExportStats(cells);
  const hasFiles = stats.layers > 0;

  function statsLabel() {
    const { banks, slots, layers, files } = stats;
    return `${banks} bank${banks !== 1 ? "s" : ""}. ${slots} slot${slots !== 1 ? "s" : ""}. ${layers} layer${layers !== 1 ? "s" : ""}. ${files} file${files !== 1 ? "s" : ""}.`;
  }

  const infoText = (() => {
    if (!hasFiles) return "No file assigned.";
    if (phase === "conflict") return `${conflictFiles.length} file${conflictFiles.length !== 1 ? "s" : ""} already exist in destination.`;
    if (phase === "running") return `${progress.index} / ${progress.total} files`;
    if (phase === "done" && result) {
      const parts: string[] = [`${result.completed} exported`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`);
      return parts.join(". ") + ".";
    }
    return statsLabel();
  })();

  const fillPct =
    phase === "running" && progress.total > 0 ? (progress.index / progress.total) * 100
    : phase === "done" ? 100
    : 0;

  async function runExport(jobs: ExportJob[], dir: string, overwrite: boolean) {
    setPhase("running");
    setProgress({ index: 0, total: jobs.length });
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<ExportProgress>("export_progress", (e) => {
        setProgress({ index: e.payload.index, total: e.payload.total });
      });
      const res = await invoke<ExportResult>("export_cells", { jobs, outputDir: dir, overwrite });
      setResult(res);
    } catch (err) {
      setResult({ completed: 0, skipped: 0, errors: [String(err)], manifest_path: null });
    } finally {
      unlisten?.();
      setPhase("done");
    }
  }

  async function proceedToFolder() {
    const jobs = buildJobs(cells);
    if (jobs.length === 0) return;
    const dir = await open({ directory: true, multiple: false });
    if (!dir || typeof dir !== "string") { setPhase("idle"); return; }
    const conflicts: string[] = await invoke("check_export_conflicts", { jobs, outputDir: dir });
    if (conflicts.length > 0) {
      pending.current = { jobs, dir };
      setConflictFiles(conflicts);
      setPhase("conflict");
    } else {
      runExport(jobs, dir, true);
    }
  }

  async function handleExportClick() {
    const jobs = buildJobs(cells);
    if (jobs.length === 0) return;
    const warnings = computeWarnings(cells);
    if (warnings.monoCount > 0 || warnings.over60Count > 0) {
      setWarnStats(warnings);
      setPhase("warn");
      return;
    }
    await proceedToFolder();
  }

  function handleOverwrite() { const p = pending.current!; pending.current = null; setConflictFiles([]); runExport(p.jobs, p.dir, true); }
  function handleSkip() { const p = pending.current!; pending.current = null; setConflictFiles([]); runExport(p.jobs, p.dir, false); }
  function handleCancel() { pending.current = null; setConflictFiles([]); setPhase("idle"); }

  return (
    <div
      className={`export-bar${phase === "running" ? " running" : ""}${phase === "done" ? " done" : ""}${phase === "warn" ? " warn" : ""}`}
      onClick={phase === "done" ? () => { setPhase("idle"); setResult(null); } : undefined}
    >
      <div className="export-bar-info">
        {fillPct > 0 && <div className="export-bar-fill" style={{ width: `${fillPct}%` }} />}
        {phase === "done" ? (
          <span className="export-bar-text done-text">done!</span>
        ) : phase === "running" ? (
          <>
            <span className="export-bar-text">{infoText}</span>
            <span className="export-bar-pct">{Math.round(fillPct)}%</span>
          </>
        ) : phase === "warn" ? (
          <>
            {warnStats.monoCount > 0 && (
              <span className="export-bar-text">{warnStats.monoCount} file{warnStats.monoCount !== 1 ? "s" : ""} will be summed to mono.</span>
            )}
            {warnStats.over60Count > 0 && (
              <span className="export-bar-text">{warnStats.over60Count} file{warnStats.over60Count !== 1 ? "s" : ""} will be trimmed to 60s.</span>
            )}
            <button className="export-action-btn" onClick={proceedToFolder}>export anyway!</button>
            <button className="export-action-btn" onClick={() => setPhase("idle")}>wait a sec!</button>
          </>
        ) : (
          <>
            <span className={`export-bar-text${!hasFiles ? " empty" : ""}`}>{infoText}</span>
            {phase === "idle" && hasFiles && (
              <button className="export-action-btn" onClick={handleExportClick}>export!</button>
            )}
            {phase === "conflict" && (
              <div className="export-conflict-btns">
                <button onClick={handleOverwrite}>overwrite all</button>
                <button onClick={handleSkip}>skip existing</button>
                <button className="cancel" onClick={handleCancel}>cancel</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { activeBank, activeSlot, cells, setBank, setSlot } = useStore();

  useEffect(() => {
    stopPreview();
    useStore.getState().setPlayingCellId(null);
    useStore.getState().setOpenTrimId(null);
  }, [activeBank, activeSlot]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastDragTarget: string | null = null;

    function cellFromPos(x: number, y: number): HTMLElement | null {
      const dpr = window.devicePixelRatio || 1;
      return (
        (document.elementFromPoint(x / dpr, y / dpr)?.closest("[data-cell-id]") as HTMLElement | null) ??
        (document.elementFromPoint(x, y)?.closest("[data-cell-id]") as HTMLElement | null)
      );
    }

    function clearDragOver() {
      document.querySelectorAll(".layer-side.drag-over").forEach(c => c.classList.remove("drag-over"));
    }

    getCurrentWebview().onDragDropEvent(async (event) => {
      const type = event.payload.type;

      if (type === "over") {
        const { position } = event.payload as { type: "over"; position: { x: number; y: number } };
        const el = cellFromPos(position.x, position.y);
        clearDragOver();
        if (el) el.classList.add("drag-over");
        lastDragTarget = el?.dataset.cellId ?? null;
        return;
      }

      if (type === "leave") { clearDragOver(); lastDragTarget = null; return; }
      if (type !== "drop") return;

      const { paths, position } = event.payload as { type: "drop"; paths: string[]; position: { x: number; y: number } };
      clearDragOver();
      if (!paths?.length) return;
      const path = paths[0];
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      if (!AUDIO_EXTENSIONS.includes(ext)) return;

      const el = cellFromPos(position.x, position.y);
      const targetId = el?.dataset.cellId ?? lastDragTarget;
      lastDragTarget = null;
      if (!targetId) return;

      const fileName = path.split("/").pop() ?? path;
      const [bank, slotStr, layer] = targetId.split(":") as [Bank, string, Layer];
      const slot = parseInt(slotStr) as Slot;
      const { assignFile } = useStore.getState();
      assignFile({ bank, slot, layer }, { filePath: path, fileName });
      try {
        const meta = await readAudioMetadata(path);
        assignFile({ bank, slot, layer }, { filePath: path, fileName, ...meta });
      } catch { /* no metadata */ }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="bank-tabs">
        {BANKS.map((bank) => {
          const slotCount = bankSlotCount(cells, bank);
          const isActive = activeBank === bank;
          const hasFiles = slotCount > 0;
          return (
            <button
              key={bank}
              className={`bank-tab${isActive ? " active" : ""}${hasFiles ? " assigned" : ""}`}
              style={{
                "--category-accent": BANK_COLORS[bank],
                "--category-accent-outline": BANK_COLORS_OUTLINE[bank],
              } as React.CSSProperties}
              onClick={() => setBank(bank)}
            >
              <span className="bank-tab-name">{bank}</span>
              <span className="bank-tab-count">{slotCount} {slotCount === 1 ? "slot" : "slots"}</span>
              <span className="bank-tab-bar" />
            </button>
          );
        })}
      </div>

      <div className="slot-circles">
        {SLOTS.map((slot) => {
          const count = slotLayerCount(cells, activeBank, slot);
          const isActive = activeSlot === slot;
          const hasLayers = count > 0;
          return (
            <div
              key={slot}
              className={`slot-circle${isActive ? " active" : ""}${hasLayers ? " has-layers" : ""}`}
              style={{
                background: hasLayers ? BANK_COLORS_BRIGHT[activeBank] : BANK_COLORS_DIM[activeBank],
                color: hasLayers
                  ? (BANK_TEXT_DARK.has(activeBank) ? "#000000" : "#ffffff")
                  : (isActive ? "#ffffff" : "#bebebe"),
              }}
              onClick={() => setSlot(slot)}
            >
              {count}
            </div>
          );
        })}
      </div>

      <div className="layer-section">
        <div className="layer-section-label">{activeBank}\SLOT{activeSlot}</div>
        <div className="layer-rows">
          {[3, 2, 1, 0].map((num) => (
            <LayerRow key={num} bank={activeBank} slot={activeSlot} num={num} />
          ))}
        </div>
      </div>

      <TrimPanel />

      <ExportPanel />
    </div>
  );
}

export default App;
