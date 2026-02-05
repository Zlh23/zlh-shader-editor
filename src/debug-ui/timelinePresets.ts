/**
 * 时间轴预设：优先读写项目内 public/presets.json（开发时通过 /api/presets 写入），否则回退到 localStorage
 */

import type { TimelineState } from "./timeline";

const STORAGE_KEY = "shader-debug-timeline-presets";
const PRESETS_JSON_URL = "/presets.json";
const PRESETS_API_URL = "/api/presets";

export interface TimelinePreset {
  id: string;
  name: string;
  state: TimelineState;
}

export interface PresetsData {
  presets: TimelinePreset[];
  currentPresetId: string | null;
}

function generateId(): string {
  return "preset-" + Math.random().toString(36).slice(2, 11);
}

function loadFromStorage(): PresetsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { presets: [], currentPresetId: null };
    const data = JSON.parse(raw) as PresetsData;
    if (!Array.isArray(data.presets)) return { presets: [], currentPresetId: null };
    return {
      presets: data.presets.filter((p) => p && p.id && p.name && p.state),
      currentPresetId: data.currentPresetId ?? null,
    };
  } catch {
    return { presets: [], currentPresetId: null };
  }
}

function saveToStorage(data: PresetsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save presets to localStorage", e);
  }
}

/** 尝试从项目目录 /presets.json 加载（用于开发时放在当前目录） */
export async function loadPresetsFromFile(): Promise<PresetsData | null> {
  try {
    const res = await fetch(PRESETS_JSON_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as PresetsData;
    if (!Array.isArray(data.presets)) return null;
    return {
      presets: data.presets.filter((p) => p && p.id && p.name && p.state),
      currentPresetId: data.currentPresetId ?? null,
    };
  } catch {
    return null;
  }
}

export function createTimelinePresetsStore() {
  let data: PresetsData = loadFromStorage();

  /** 将当前 data 写入文件（开发时 POST 到 /api/presets 写入 public/presets.json） */
  function saveToFile(): void {
    const payload = JSON.stringify(data, null, 2);
    fetch(PRESETS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch((e) => console.warn("保存预设到文件失败（仅开发环境支持）", e));
  }

  /** 初始化：优先从 /presets.json 加载（项目内 public/presets.json），失败则用 localStorage */
  async function init(): Promise<void> {
    const fromFile = await loadPresetsFromFile();
    if (fromFile != null) {
      data = fromFile;
      saveToStorage(data);
    }
  }

  function getPresets(): TimelinePreset[] {
    return data.presets;
  }

  function getCurrentPresetId(): string | null {
    return data.currentPresetId;
  }

  function getCurrentPreset(): TimelinePreset | undefined {
    if (!data.currentPresetId) return undefined;
    return data.presets.find((p) => p.id === data.currentPresetId);
  }

  function setCurrentPresetId(id: string | null): void {
    data.currentPresetId = id;
    saveToStorage(data);
  }

  /** 保存当前状态到指定预设（覆盖） */
  function savePreset(id: string, state: TimelineState): void {
    const idx = data.presets.findIndex((p) => p.id === id);
    if (idx >= 0) {
      data.presets[idx] = { ...data.presets[idx], state };
    } else {
      data.presets.push({ id, name: id, state });
    }
    data.currentPresetId = id;
    saveToStorage(data);
    saveToFile();
  }

  /** 另存为新预设，返回新预设 id */
  function saveAsNewPreset(name: string, state: TimelineState): string {
    const id = generateId();
    data.presets.push({ id, name, state });
    data.currentPresetId = id;
    saveToStorage(data);
    saveToFile();
    return id;
  }

  /** 重命名指定预设 */
  function renamePreset(id: string, name: string): void {
    const p = data.presets.find((x) => x.id === id);
    if (p && name.trim()) {
      p.name = name.trim();
      saveToStorage(data);
      saveToFile();
    }
  }

  /** 导出为 JSON 字符串（可保存为项目下 presets.json） */
  function exportToJSON(): string {
    return JSON.stringify(data, null, 2);
  }

  /** 从 JSON 导入并合并到当前列表 */
  function importFromJSON(json: string): void {
    try {
      const parsed = JSON.parse(json) as PresetsData;
      if (!Array.isArray(parsed.presets)) return;
      const existingIds = new Set(data.presets.map((p) => p.id));
      for (const p of parsed.presets) {
        if (!p || !p.id || !p.name || !p.state) continue;
        if (existingIds.has(p.id)) continue;
        data.presets.push(p);
        existingIds.add(p.id);
      }
      saveToStorage(data);
    } catch {
      // ignore invalid JSON
    }
  }

  return {
    init,
    getPresets,
    getCurrentPresetId,
    getCurrentPreset,
    setCurrentPresetId,
    savePreset,
    saveAsNewPreset,
    renamePreset,
    exportToJSON,
    importFromJSON,
    loadFromStorage,
    saveToStorage,
  };
}

export type TimelinePresetsStore = ReturnType<typeof createTimelinePresetsStore>;
