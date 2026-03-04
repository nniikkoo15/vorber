import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { BANKS, SLOTS, LAYERS, useStore, type Bank, type Slot, type Layer, type TrimSettings, type CellData } from "./store";
import "./App.css";

// Shared audio context + gain node for immediate silence on stop
const previewCtx = new AudioContext();
const previewGain = previewCtx.createGain();
previewGain.connect(previewCtx.destination);
let playingSource: AudioBufferSourceNode | null = null;

function stopPreview() {
  // Zero gain immediately — kills audio at current sample, no buffer drain
  previewGain.gain.cancelScheduledValues(previewCtx.currentTime);
  previewGain.gain.setValueAtTime(0, previewCtx.currentTime);
  if (playingSource) {
    try { playingSource.stop(); } catch { /* already stopped */ }
    playingSource = null;
  }
}

function startPreview() {
  // Restore gain before starting
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

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const BANK_COLORS: Record<string, string> = {
  RED: "#c0392b", GREEN: "#27ae60", BLUE: "#2980b9", WHITE: "#bdc3c7",
  CYAN: "#16a085", ORANGE: "#e67e22", YELLOW: "#f1c40f", PINK: "#e91e8c",
};

const AUDIO_EXTENSIONS = ["wav", "aiff", "aif", "flac", "mp3", "m4a", "ogg"];

interface LayerCellProps { bank: Bank; slot: Slot; layer: Layer; }

function LayerCell({ bank, slot, layer }: LayerCellProps) {
  const { getCell, assignFile, clearCell, playingCellId, setPlayingCellId, selectedCellId, setSelectedCellId, splitStereo, unsplit } = useStore();
  const cell = getCell({ bank, slot, layer });
  const id = `${bank}:${slot}:${layer}`;
  const isPlaying = playingCellId === id;
  const isSelected = selectedCellId === id;

  async function handlePreview(e: React.MouseEvent) {
    e.stopPropagation();
    if (!cell) return;
    if (isPlaying) {
      stopPreview();
      setPlayingCellId(null);
      return;
    }
    stopPreview();
    setPlayingCellId(null);
    const bytes = await readFile(cell.filePath);
    const buffer = await previewCtx.decodeAudioData(bytes.buffer);
    const source = previewCtx.createBufferSource();
    source.buffer = buffer;
    startPreview();
    source.connect(previewGain);
    source.onended = () => { setPlayingCellId(null); playingSource = null; };
    playingSource = source;
    setPlayingCellId(id);
    const trimStart = cell.trim?.start ?? 0;
    const trimLen = cell.trim?.length ?? Math.min(buffer.duration, 60);
    source.start(0, trimStart, trimLen);
  }

  async function assign(path: string, fileName: string) {
    assignFile({ bank, slot, layer }, { filePath: path, fileName });
    try {
      const meta = await readAudioMetadata(path);
      assignFile({ bank, slot, layer }, { filePath: path, fileName, ...meta });
    } catch { /* no metadata */ }
  }

  async function handleClick() {
    if (cell) {
      setSelectedCellId(isSelected ? null : id);
      return;
    }
    const path = await open({ multiple: false, filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }] });
    if (typeof path === "string") await assign(path, path.split("/").pop() ?? path);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); }

  return (
    <div
      data-cell-id={id}
      className={`layer-cell ${cell ? "assigned" : "empty"} ${isSelected ? "selected" : ""}`}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span className="layer-label">{layer}</span>
      {cell ? (
        <>
          <span className="cell-filename" title={cell.filePath}>{cell.fileName}</span>
          <div className="cell-meta">
            {cell.duration !== undefined && (() => {
              const effectiveDuration = cell.trim?.length ?? cell.duration;
              const needsTrim = cell.duration > 60 && !cell.trim;
              return (
                <span className={needsTrim ? "meta-duration over60" : "meta-duration"}>
                  {formatDuration(effectiveDuration)}{needsTrim && " ⚠"}
                </span>
              );
            })()}
            {cell.channels !== undefined && (
              <span className="meta-channels">{cell.channels === 1 ? "mono" : "stereo"}</span>
            )}
          </div>
          {cell.channels === 2 && (
            cell.stereoMode && cell.stereoMode !== "sum" ? (
              <button
                className="split-btn active"
                onClick={(e) => { e.stopPropagation(); unsplit({ bank, slot, layer }); }}
                title="Undo split"
              >
                {cell.stereoMode === "split-L" ? "L" : "R"} split ✕
              </button>
            ) : (
              <button
                className="split-btn"
                onClick={(e) => { e.stopPropagation(); splitStereo({ bank, slot, layer }); }}
                title={layer.startsWith("L") ? "Split: L here, R → counterpart" : "Split: R here, L → counterpart"}
              >
                split → {layer.startsWith("L") ? `R${layer[1]}` : `L${layer[1]}`}
              </button>
            )
          )}
          <button className={`preview-btn ${isPlaying ? "playing" : ""}`} onClick={handlePreview}>
            {isPlaying ? "■" : "▶"}
          </button>
          <button className="clear-btn" onClick={(e) => { e.stopPropagation(); clearCell({ bank, slot, layer }); }}>✕</button>
        </>
      ) : (
        <span className="layer-empty">drop or click</span>
      )}
    </div>
  );
}

interface TrimPanelProps { bank: Bank; slot: Slot; layer: Layer; }

function TrimPanel({ bank, slot, layer }: TrimPanelProps) {
  const { getCell, setTrim } = useStore();
  const cell = getCell({ bank, slot, layer });
  if (!cell || !cell.duration || cell.duration <= 60) return null;

  const duration = cell.duration;
  const trim: TrimSettings = cell.trim ?? { start: 0, length: 60 };

  function update(patch: Partial<TrimSettings>) {
    const next = { ...trim, ...patch };
    next.length = Math.min(Math.max(1, next.length), 60);
    next.start = Math.min(Math.max(0, next.start), duration - next.length);
    setTrim({ bank, slot, layer }, next);
  }

  return (
    <div className="trim-panel">
      <div className="trim-header">
        <span>TRIM — {layer}</span>
        <span className="trim-window-display">
          {formatDuration(trim.start)} → {formatDuration(trim.start + trim.length)}
        </span>
      </div>
      <div className="trim-row">
        <label>Start</label>
        <input
          type="range" min={0} max={duration - trim.length} step={0.1}
          value={trim.start}
          onChange={(e) => update({ start: parseFloat(e.target.value) })}
        />
        <input
          type="number" min={0} max={duration - trim.length} step={0.1}
          value={trim.start.toFixed(1)}
          onChange={(e) => update({ start: parseFloat(e.target.value) })}
          className="trim-number"
        />
        <span className="trim-unit">s</span>
      </div>
      <div className="trim-row">
        <label>Length</label>
        <input
          type="range" min={1} max={60} step={0.1}
          value={trim.length}
          onChange={(e) => update({ length: parseFloat(e.target.value) })}
        />
        <input
          type="number" min={1} max={60} step={0.1}
          value={trim.length.toFixed(1)}
          onChange={(e) => update({ length: parseFloat(e.target.value) })}
          className="trim-number"
        />
        <span className="trim-unit">s</span>
      </div>
      <div className="trim-shortcuts">
        <button onClick={() => update({ start: 0 })}>Start</button>
        <button onClick={() => update({ start: Math.max(0, duration / 2 - trim.length / 2) })}>Middle</button>
        <button onClick={() => update({ start: Math.max(0, duration - trim.length) })}>End</button>
      </div>
    </div>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

interface ExportJob {
  file_path: string;
  bank: string;
  slot: number;
  layer: string;
  trim_start: number;
  trim_length: number;
  stereo_mode: string;
  channels: number;
}

interface ExportProgress {
  index: number;
  total: number;
  status: "done" | "skipped" | "error";
  file: string;
}

interface ExportResult {
  completed: number;
  skipped: number;
  errors: string[];
  manifest_path: string | null;
}

function buildJobs(cells: Record<string, CellData>): ExportJob[] {
  return Object.entries(cells).map(([id, cell]) => {
    const [bank, slotStr, layer] = id.split(":");
    const slot = parseInt(slotStr);
    const duration = cell.duration ?? 60;
    const trimStart = cell.trim?.start ?? 0;
    const trimLength = cell.trim?.length ?? Math.min(duration, 60);
    return {
      file_path: cell.filePath,
      bank,
      slot,
      layer,
      trim_start: trimStart,
      trim_length: trimLength,
      stereo_mode: cell.stereoMode ?? "sum",
      channels: cell.channels ?? 1,
    };
  });
}

function ExportPanel() {
  const cells = useStore((s) => s.cells);
  const [phase, setPhase] = useState<"idle" | "conflict" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ index: 0, total: 0, file: "" });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const pending = useRef<{ jobs: ExportJob[]; dir: string } | null>(null);

  async function runExport(jobs: ExportJob[], dir: string, overwrite: boolean) {
    setPhase("running");
    setProgress({ index: 0, total: jobs.length, file: "" });
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<ExportProgress>("export_progress", (e) => {
        setProgress({ index: e.payload.index, total: e.payload.total, file: e.payload.file });
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

  async function handleExportClick() {
    const jobs = buildJobs(cells);
    if (jobs.length === 0) return;
    const dir = await open({ directory: true, multiple: false });
    if (!dir || typeof dir !== "string") return;
    const conflicts: string[] = await invoke("check_export_conflicts", { jobs, outputDir: dir });
    if (conflicts.length > 0) {
      pending.current = { jobs, dir };
      setConflictFiles(conflicts);
      setPhase("conflict");
    } else {
      runExport(jobs, dir, true);
    }
  }

  function handleOverwrite() {
    const p = pending.current!;
    pending.current = null;
    setConflictFiles([]);
    runExport(p.jobs, p.dir, true);
  }

  function handleSkip() {
    const p = pending.current!;
    pending.current = null;
    setConflictFiles([]);
    runExport(p.jobs, p.dir, false);
  }

  function handleCancel() {
    pending.current = null;
    setConflictFiles([]);
    setPhase("idle");
  }

  const cellCount = Object.keys(cells).length;

  return (
    <div className="export-panel">
      {phase === "idle" && (
        <button className="export-btn" disabled={cellCount === 0} onClick={handleExportClick}>
          Export{cellCount > 0 ? ` (${cellCount} file${cellCount > 1 ? "s" : ""})` : " — no files assigned"}
        </button>
      )}

      {phase === "conflict" && (
        <div className="conflict-modal">
          <div className="conflict-msg">
            {conflictFiles.length} file{conflictFiles.length > 1 ? "s" : ""} already exist in destination
          </div>
          <div className="conflict-actions">
            <button onClick={handleOverwrite}>Overwrite all</button>
            <button onClick={handleSkip}>Skip existing</button>
            <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="export-progress">
          <div className="export-bar-wrap">
            <div
              className="export-bar"
              style={{ width: progress.total > 0 ? `${(progress.index / progress.total) * 100}%` : "0%" }}
            />
          </div>
          <div className="export-label">
            {progress.index} / {progress.total}{progress.file ? ` — ${progress.file}` : ""}
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="export-results">
          <div className="export-summary">
            ✓ {result.completed} exported
            {result.skipped > 0 && `, ${result.skipped} skipped`}
            {result.errors.length > 0 && `, ${result.errors.length} errors`}
          </div>
          {result.errors.length > 0 && (
            <div className="export-errors">
              {result.errors.map((e, i) => <div key={i} className="export-error">{e}</div>)}
            </div>
          )}
          <button className="export-btn secondary" onClick={() => { setPhase("idle"); setResult(null); }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { activeBank, activeSlot, setBank, setSlot, selectedCellId } = useStore();

  // Tauri v2: onDragDropEvent gives PhysicalPosition (device pixels).
  // Divide by devicePixelRatio to get CSS pixels for elementFromPoint.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let lastDragTarget: string | null = null;

    function cellFromPos(x: number, y: number): HTMLElement | null {
      const dpr = window.devicePixelRatio || 1;
      // Try logical (physical / dpr) first, fall back to raw
      return (
        (document.elementFromPoint(x / dpr, y / dpr)?.closest("[data-cell-id]") as HTMLElement | null) ??
        (document.elementFromPoint(x, y)?.closest("[data-cell-id]") as HTMLElement | null)
      );
    }

    function clearDragOver() {
      document.querySelectorAll(".layer-cell.drag-over").forEach(c => c.classList.remove("drag-over"));
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

      if (type === "leave") {
        clearDragOver();
        lastDragTarget = null;
        return;
      }

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

  // Parse selected cell id back to parts for TrimPanel
  const selectedParts = selectedCellId?.split(":") as [Bank, string, Layer] | undefined;
  const selectedLayer = selectedParts?.[2];

  return (
    <div className="app">
      <div className="bank-tabs">
        {BANKS.map((bank) => (
          <button
            key={bank}
            className={`bank-tab ${activeBank === bank ? "active" : ""}`}
            style={{ "--bank-color": BANK_COLORS[bank] } as React.CSSProperties}
            onClick={() => setBank(bank)}
          >{bank}</button>
        ))}
      </div>

      <div className="slot-nav">
        {SLOTS.map((slot) => (
          <button key={slot} className={`slot-btn ${activeSlot === slot ? "active" : ""}`} onClick={() => setSlot(slot)}>
            {slot}
          </button>
        ))}
      </div>

      <div className="slot-label">{activeBank} / SLOT{activeSlot}</div>

      <div className="layer-grid">
        {LAYERS.map((layer) => (
          <LayerCell key={layer} bank={activeBank} slot={activeSlot} layer={layer} />
        ))}
      </div>

      {selectedLayer && (
        <TrimPanel bank={activeBank} slot={activeSlot} layer={selectedLayer} />
      )}

      <ExportPanel />
    </div>
  );
}

export default App;
