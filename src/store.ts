import { create } from "zustand";

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

export type StereoMode = "sum" | "split-L" | "split-R";

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
  setBank: (bank: Bank) => void;
  setSlot: (slot: Slot) => void;
  assignFile: (key: CellKey, data: CellData) => void;
  clearCell: (key: CellKey) => void;
  getCell: (key: CellKey) => CellData | undefined;
  setTrim: (key: CellKey, trim: TrimSettings) => void;
  splitStereo: (key: CellKey) => void;
  unsplit: (key: CellKey) => void;
  setPlayingCellId: (id: string | null) => void;
  setSelectedCellId: (id: string | null) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  activeBank: "RED",
  activeSlot: 0,
  cells: {},
  playingCellId: null,
  selectedCellId: null,
  setBank: (bank) => set({ activeBank: bank }),
  setSlot: (slot) => set({ activeSlot: slot }),
  assignFile: (key, data) =>
    set((s) => ({ cells: { ...s.cells, [cellId(key.bank, key.slot, key.layer)]: data } })),
  clearCell: (key) =>
    set((s) => {
      const cells = { ...s.cells };
      delete cells[cellId(key.bank, key.slot, key.layer)];
      return { cells };
    }),
  getCell: (key) => get().cells[cellId(key.bank, key.slot, key.layer)],
  setTrim: (key, trim) =>
    set((s) => {
      const id = cellId(key.bank, key.slot, key.layer);
      const cell = s.cells[id];
      if (!cell) return s;
      return { cells: { ...s.cells, [id]: { ...cell, trim } } };
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
      return { cells: newCells };
    }),
  setPlayingCellId: (id) => set({ playingCellId: id }),
  setSelectedCellId: (id) => set({ selectedCellId: id }),
}));
