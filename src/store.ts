import { create } from "zustand";
import { persist } from "zustand/middleware";

export const BANKS = ["RED", "GREEN", "BLUE", "WHITE", "CYAN", "ORANGE", "YELLOW", "PINK"] as const;
export type Bank = (typeof BANKS)[number];

export const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type Slot = (typeof SLOTS)[number];

export const LAYERS = ["L0", "L1", "L2", "L3", "R0", "R1", "R2", "R3"] as const;
export type Layer = (typeof LAYERS)[number];

export interface CellKey {
  bank: Bank;
  slot: Slot;
  layer: Layer;
}

export interface TrimSettings {
  start: number;   // seconds
  length: number;  // seconds, max 60
}

export type StereoMode = "sum" | "split-L" | "split-R" | "left-only" | "right-only";

export interface CellData {
  filePath: string;
  fileName: string;
  duration?: number;   // seconds
  channels?: number;   // 1 = mono, 2 = stereo
  trim?: TrimSettings;
  stereoMode?: StereoMode; // only relevant when channels === 2
}

function cellId(bank: Bank, slot: Slot, layer: Layer) {
  return `${bank}:${slot}:${layer}`;
}

interface StoreState {
  activeBank: Bank;
  activeSlot: Slot;
  cells: Record<string, CellData>;
  playingCellId: string | null;
  selectedCellId: string | null;
  projectPath: string | null;
  projectName: string;
  isDirty: boolean;
  missingPaths: string[];
  setBank: (bank: Bank) => void;
  setSlot: (slot: Slot) => void;
  assignFile: (key: CellKey, data: CellData) => void;
  clearCell: (key: CellKey) => void;
  clearBank: (bank: Bank) => void;
  clearSlot: (bank: Bank, slot: Slot) => void;
  clearAllBanks: () => void;
  getCell: (key: CellKey) => CellData | undefined;
  setTrim: (key: CellKey, trim: TrimSettings) => void;
  splitStereo: (key: CellKey) => void;
  unsplit: (key: CellKey) => void;
  setPlayingCellId: (id: string | null) => void;
  loopingCellId: string | null;
  setLoopingCellId: (id: string | null) => void;
  setSelectedCellId: (id: string | null) => void;
  openFmtOverlayId: string | null;
  setOpenFmtOverlayId: (id: string | null) => void;
  openTrimId: string | null;
  setOpenTrimId: (id: string | null) => void;
  moveCell: (from: CellKey, to: CellKey) => void;
  swapCells: (a: CellKey, b: CellKey) => void;
  moveSlot: (fromBank: Bank, fromSlot: Slot, toBank: Bank, toSlot: Slot) => void;
  swapSlots: (aBank: Bank, aSlot: Slot, bBank: Bank, bSlot: Slot) => void;
  copySlot: (fromBank: Bank, fromSlot: Slot, toBank: Bank, toSlot: Slot) => void;
  moveBank: (from: Bank, to: Bank) => void;
  swapBanks: (a: Bank, b: Bank) => void;
  copyBank: (from: Bank, to: Bank) => void;
  setProjectMeta: (path: string | null, name: string) => void;
  setDirty: (dirty: boolean) => void;
  setMissingPaths: (paths: string[]) => void;
}

export const useStore = create<StoreState>()(persist((set, get) => ({
  activeBank: "RED",
  activeSlot: 0,
  cells: {},
  playingCellId: null,
  selectedCellId: null,
  projectPath: null,
  projectName: "untitled.json",
  isDirty: false,
  missingPaths: [],
  setBank: (bank) => set({ activeBank: bank }),
  setSlot: (slot) => set({ activeSlot: slot }),
  assignFile: (key, data) =>
    set((s) => ({
      cells: { ...s.cells, [cellId(key.bank, key.slot, key.layer)]: data },
      isDirty: true,
      missingPaths: s.missingPaths.filter(p => p !== data.filePath),
    })),
  clearCell: (key) =>
    set((s) => {
      const cells = { ...s.cells };
      delete cells[cellId(key.bank, key.slot, key.layer)];
      return { cells, isDirty: true };
    }),
  clearBank: (bank) =>
    set((s) => {
      const cells = { ...s.cells };
      Object.keys(cells).forEach(k => { if (k.startsWith(`${bank}:`)) delete cells[k]; });
      return { cells, isDirty: true };
    }),
  clearSlot: (bank, slot) =>
    set((s) => {
      const cells = { ...s.cells };
      const prefix = `${bank}:${slot}:`;
      Object.keys(cells).forEach(k => { if (k.startsWith(prefix)) delete cells[k]; });
      return { cells, isDirty: true };
    }),
  clearAllBanks: () => set({ cells: {}, isDirty: true, missingPaths: [] }),
  getCell: (key) => get().cells[cellId(key.bank, key.slot, key.layer)],
  setTrim: (key, trim) =>
    set((s) => {
      const id = cellId(key.bank, key.slot, key.layer);
      const cell = s.cells[id];
      if (!cell) return s;
      return { cells: { ...s.cells, [id]: { ...cell, trim } }, isDirty: true };
    }),
  splitStereo: (key) =>
    set((s) => {
      const id = cellId(key.bank, key.slot, key.layer);
      const cell = s.cells[id];
      if (!cell) return s;
      const num = parseInt(key.layer[1]);
      const counterpart: Layer = key.layer.startsWith("L")
        ? `R${num}` as Layer
        : `L${num}` as Layer;
      const myMode: StereoMode = key.layer.startsWith("L") ? "split-L" : "split-R";
      const partnerMode: StereoMode = key.layer.startsWith("L") ? "split-R" : "split-L";
      const partnerId = cellId(key.bank, key.slot, counterpart);
      return {
        cells: {
          ...s.cells,
          [id]: { ...cell, stereoMode: myMode },
          [partnerId]: { ...cell, stereoMode: partnerMode },
        },
        isDirty: true,
      };
    }),
  unsplit: (key) =>
    set((s) => {
      const id = cellId(key.bank, key.slot, key.layer);
      const cell = s.cells[id];
      if (!cell) return s;
      const num = parseInt(key.layer[1]);
      const counterpart: Layer = key.layer.startsWith("L")
        ? `R${num}` as Layer
        : `L${num}` as Layer;
      const partnerId = cellId(key.bank, key.slot, counterpart);
      const partner = s.cells[partnerId];
      const newCells = { ...s.cells, [id]: { ...cell, stereoMode: "sum" as StereoMode } };
      // clear counterpart only if it was set by this split (same file)
      if (partner?.filePath === cell.filePath) delete newCells[partnerId];
      return { cells: newCells, isDirty: true };
    }),
  moveCell: (from, to) =>
    set((s) => {
      const fromId = cellId(from.bank, from.slot, from.layer);
      const toId = cellId(to.bank, to.slot, to.layer);
      const cell = s.cells[fromId];
      if (!cell) return s;
      const cells = { ...s.cells, [toId]: cell };
      delete cells[fromId];
      return { cells, isDirty: true };
    }),
  swapCells: (a, b) =>
    set((s) => {
      const aId = cellId(a.bank, a.slot, a.layer);
      const bId = cellId(b.bank, b.slot, b.layer);
      const aCell = s.cells[aId];
      const bCell = s.cells[bId];
      if (!aCell && !bCell) return s;
      const cells = { ...s.cells };
      if (aCell) cells[bId] = aCell; else delete cells[bId];
      if (bCell) cells[aId] = bCell; else delete cells[aId];
      return { cells, isDirty: true };
    }),
  moveSlot: (fromBank, fromSlot, toBank, toSlot) =>
    set((s) => {
      const cells = { ...s.cells };
      const fromPrefix = `${fromBank}:${fromSlot}:`;
      const toPrefix = `${toBank}:${toSlot}:`;
      // delete dest first
      Object.keys(cells).forEach(k => { if (k.startsWith(toPrefix)) delete cells[k]; });
      // move src → dest
      Object.keys(s.cells).forEach(k => {
        if (k.startsWith(fromPrefix)) {
          const layer = k.slice(fromPrefix.length);
          cells[`${toPrefix}${layer}`] = s.cells[k];
          delete cells[k];
        }
      });
      return { cells, isDirty: true };
    }),
  swapSlots: (aBank, aSlot, bBank, bSlot) =>
    set((s) => {
      const cells = { ...s.cells };
      const aPrefix = `${aBank}:${aSlot}:`;
      const bPrefix = `${bBank}:${bSlot}:`;
      const aKeys = Object.keys(s.cells).filter(k => k.startsWith(aPrefix));
      const bKeys = Object.keys(s.cells).filter(k => k.startsWith(bPrefix));
      // move a → b
      aKeys.forEach(k => {
        const layer = k.slice(aPrefix.length);
        cells[`${bPrefix}${layer}`] = s.cells[k];
      });
      // move b → a
      bKeys.forEach(k => {
        const layer = k.slice(bPrefix.length);
        cells[`${aPrefix}${layer}`] = s.cells[k];
      });
      // clear orphans (a had layers b didn't, or vice versa)
      aKeys.forEach(k => { if (!bKeys.some(bk => bk.slice(bPrefix.length) === k.slice(aPrefix.length))) delete cells[k]; });
      bKeys.forEach(k => { if (!aKeys.some(ak => ak.slice(aPrefix.length) === k.slice(bPrefix.length))) delete cells[k]; });
      return { cells, isDirty: true };
    }),
  copySlot: (fromBank, fromSlot, toBank, toSlot) =>
    set((s) => {
      const cells = { ...s.cells };
      const fromPrefix = `${fromBank}:${fromSlot}:`;
      const toPrefix = `${toBank}:${toSlot}:`;
      Object.keys(s.cells).forEach(k => {
        if (k.startsWith(fromPrefix)) {
          const layer = k.slice(fromPrefix.length);
          cells[`${toPrefix}${layer}`] = s.cells[k];
        }
      });
      return { cells, isDirty: true };
    }),
  moveBank: (from, to) =>
    set((s) => {
      const cells = { ...s.cells };
      const fromPrefix = `${from}:`;
      const toPrefix = `${to}:`;
      // delete dest
      Object.keys(cells).forEach(k => { if (k.startsWith(toPrefix)) delete cells[k]; });
      // move src → dest
      Object.keys(s.cells).forEach(k => {
        if (k.startsWith(fromPrefix)) {
          cells[`${toPrefix}${k.slice(fromPrefix.length)}`] = s.cells[k];
          delete cells[k];
        }
      });
      return { cells, isDirty: true };
    }),
  swapBanks: (a, b) =>
    set((s) => {
      const cells = { ...s.cells };
      const aPrefix = `${a}:`;
      const bPrefix = `${b}:`;
      const aKeys = Object.keys(s.cells).filter(k => k.startsWith(aPrefix));
      const bKeys = Object.keys(s.cells).filter(k => k.startsWith(bPrefix));
      aKeys.forEach(k => { cells[`${bPrefix}${k.slice(aPrefix.length)}`] = s.cells[k]; });
      bKeys.forEach(k => { cells[`${aPrefix}${k.slice(bPrefix.length)}`] = s.cells[k]; });
      aKeys.forEach(k => { if (!bKeys.some(bk => bk.slice(bPrefix.length) === k.slice(aPrefix.length))) delete cells[k]; });
      bKeys.forEach(k => { if (!aKeys.some(ak => ak.slice(aPrefix.length) === k.slice(bPrefix.length))) delete cells[k]; });
      return { cells, isDirty: true };
    }),
  copyBank: (from, to) =>
    set((s) => {
      const cells = { ...s.cells };
      const fromPrefix = `${from}:`;
      const toPrefix = `${to}:`;
      Object.keys(s.cells).forEach(k => {
        if (k.startsWith(fromPrefix)) {
          cells[`${toPrefix}${k.slice(fromPrefix.length)}`] = s.cells[k];
        }
      });
      return { cells, isDirty: true };
    }),
  setPlayingCellId: (id) => set({ playingCellId: id }),
  loopingCellId: null,
  setLoopingCellId: (id) => set({ loopingCellId: id }),
  setSelectedCellId: (id) => set({ selectedCellId: id }),
  openFmtOverlayId: null,
  setOpenFmtOverlayId: (id) => set({ openFmtOverlayId: id }),
  openTrimId: null,
  setOpenTrimId: (id) => set({ openTrimId: id }),
  setProjectMeta: (path, name) => set({ projectPath: path, projectName: name }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setMissingPaths: (paths) => set({ missingPaths: paths }),
}), {
  name: "vorber-session",
  version: 1,
  partialize: (state) => ({ cells: state.cells }),
}));
