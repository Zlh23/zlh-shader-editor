/**
 * 时间轴状态与播放：currentTime、playing、duration、轨道、按 t 采样写回 params
 */

import type { HalftonePaneParams } from "@/Halftone";
import { DRAG_PARAM_TYPE } from "./controls";
import type { ParamStore } from "./paramStore";

export type Interpolation = "linear" | "step";

export interface Keyframe {
  t: number;
  value: number | string | boolean;
}

export interface TimelineTrack {
  id: string;
  paramKey: keyof HalftonePaneParams;
  label: string;
  keyframes: Keyframe[];
  interpolation: Interpolation;
}

export interface TimelineState {
  currentTime: number;
  playing: boolean;
  duration: number;
  frameStep: number;
  tracks: TimelineTrack[];
}

const DEFAULT_DURATION = 10;
const DEFAULT_FRAME_STEP = 1 / 30;

function generateId(): string {
  return "track-" + Math.random().toString(36).slice(2, 11);
}

function sampleTrack(
  track: TimelineTrack,
  t: number,
  fallback: number | string | boolean
): number | string | boolean {
  const kf = track.keyframes;
  if (!kf.length) return fallback;
  const sorted = [...kf].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].value;
  let i = 0;
  while (i + 1 < sorted.length && sorted[i + 1].t <= t) i++;
  const a = sorted[i];
  const b = sorted[i + 1];
  if (track.interpolation === "step") return a.value;
  const frac = (t - a.t) / (b.t - a.t);
  if (typeof a.value === "number" && typeof b.value === "number") {
    return a.value + frac * (b.value - a.value);
  }
  if (typeof a.value === "boolean" && typeof b.value === "boolean") {
    return frac < 0.5 ? a.value : b.value;
  }
  if (typeof a.value === "string" && typeof b.value === "string") {
    if (/^#[0-9A-Fa-f]{6}$/.test(a.value) && /^#[0-9A-Fa-f]{6}$/.test(b.value)) {
      const parse = (s: string) => ({
        r: parseInt(s.slice(1, 3), 16),
        g: parseInt(s.slice(3, 5), 16),
        b: parseInt(s.slice(5, 7), 16),
      });
      const va = parse(a.value as string);
      const vb = parse(b.value as string);
      const r = Math.round(va.r + frac * (vb.r - va.r));
      const g = Math.round(va.g + frac * (vb.g - va.g));
      const blue = Math.round(va.b + frac * (vb.b - va.b));
      return "#" + [r, g, blue].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
    return frac < 0.5 ? a.value : b.value;
  }
  return a.value;
}

function valueEquals(a: number | string | boolean, b: number | string | boolean): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

export interface CreateTimelineConfig {
  paramStore: ParamStore;
  onScheduleRender: () => void;
  duration?: number;
  frameStep?: number;
  onTrackSelect?: (trackId: string) => void;
  getLabelForParamKey?: (paramKey: string) => string;
  /** 状态变更时回调（轨道/关键帧/时间等），用于预设自动保存 */
  onStateChange?: () => void;
}

export interface Timeline {
  root: HTMLElement;
  getState: () => TimelineState;
  loadState: (state: TimelineState) => void;
  setTime: (t: number) => void;
  play: () => void;
  pause: () => void;
  addTrack: (payload: { paramKey: keyof HalftonePaneParams; label: string }) => TimelineTrack | null;
  removeTrack: (id: string) => void;
  getTrack: (id: string) => TimelineTrack | undefined;
  updateTrack: (id: string, upd: Partial<Pick<TimelineTrack, "keyframes" | "interpolation">>) => void;
  applyKeyframes: (t: number) => void;
  dispose: () => void;
}

export function createTimeline(config: CreateTimelineConfig): Timeline {
  const {
    paramStore,
    onScheduleRender,
    duration = DEFAULT_DURATION,
    frameStep = DEFAULT_FRAME_STEP,
    onTrackSelect,
    getLabelForParamKey = (k) => String(k),
    onStateChange,
  } = config;

  const state: TimelineState = {
    currentTime: 0,
    playing: false,
    duration,
    frameStep,
    tracks: [],
  };

  let onTracksChange: () => void = () => {};
  let rafId: number | null = null;
  let lastTick = 0;

  function clampTime(t: number): number {
    return Math.max(0, Math.min(state.duration, t));
  }

  function applyKeyframes(t: number): void {
    const tClamped = clampTime(t);
    for (const track of state.tracks) {
      const fallback = paramStore.get(track.paramKey);
      const value = sampleTrack(
        track,
        tClamped,
        fallback as number | string | boolean
      );
      paramStore.set(track.paramKey, value as HalftonePaneParams[typeof track.paramKey]);
    }
    onScheduleRender();
  }

  function recomputeChangedKeys(): void {
    const changed = new Set<string>();
    for (const track of state.tracks) {
      // 轨道尚无关键帧时，当前值视为“已改变”，便于用户点击「添加关键帧」
      if (track.keyframes.length === 0) {
        changed.add(track.paramKey as string);
        continue;
      }
      const current = paramStore.get(track.paramKey);
      const sampled = sampleTrack(
        track,
        state.currentTime,
        current as number | string | boolean
      );
      if (!valueEquals(current as number | string | boolean, sampled)) {
        changed.add(track.paramKey as string);
      }
    }
    paramStore.setChangedKeys(changed);
  }

  function tick(now: number): void {
    if (!state.playing) return;
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    let next = state.currentTime + delta;
    if (next >= state.duration) next = next % state.duration;
    state.currentTime = clampTime(next);
    applyKeyframes(state.currentTime);
    refreshTimeDisplay();
    refreshPlayhead();
    rafId = requestAnimationFrame(tick);
  }

  function play(): void {
    if (state.playing) return;
    state.playing = true;
    lastTick = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function pause(): void {
    state.playing = false;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  const setTimeOrig = (t: number): void => {
    state.currentTime = clampTime(t);
    applyKeyframes(state.currentTime);
    recomputeChangedKeys();
    onStateChange?.();
  };

  paramStore.subscribeToSet((paramKey) => {
    const hasTrack = state.tracks.some((t) => t.paramKey === paramKey);
    if (!hasTrack) {
      addTrack({
        paramKey: paramKey as keyof HalftonePaneParams,
        label: getLabelForParamKey(paramKey),
      });
    }
    recomputeChangedKeys();
  });

  function addTrack(payload: {
    paramKey: keyof HalftonePaneParams;
    label: string;
  }): TimelineTrack | null {
    const exists = state.tracks.some((tr) => tr.paramKey === payload.paramKey);
    if (exists) return null;
    const track: TimelineTrack = {
      id: generateId(),
      paramKey: payload.paramKey,
      label: payload.label,
      keyframes: [],
      interpolation: "linear",
    };
    state.tracks.push(track);
    onTracksChange();
    recomputeChangedKeys();
    onStateChange?.();
    return track;
  }

  function removeTrack(id: string): void {
    state.tracks = state.tracks.filter((tr) => tr.id !== id);
    onTracksChange();
    onStateChange?.();
  }

  function getTrack(id: string): TimelineTrack | undefined {
    return state.tracks.find((tr) => tr.id === id);
  }

  function updateTrack(
    id: string,
    upd: Partial<Pick<TimelineTrack, "keyframes" | "interpolation">>
  ): void {
    const tr = state.tracks.find((t) => t.id === id);
    if (tr) {
      if (upd.keyframes !== undefined) tr.keyframes = upd.keyframes;
      if (upd.interpolation !== undefined) tr.interpolation = upd.interpolation;
      onTracksChange();
      recomputeChangedKeys();
      onStateChange?.();
    }
  }

  function getState(): TimelineState {
    return state;
  }

  function dispose(): void {
    pause();
  }

  function formatTime(t: number): string {
    return t.toFixed(2);
  }

  const root = document.createElement("div");
  root.className = "timeline";
  root.setAttribute("aria-label", "时间轴");

  const toolbar = document.createElement("div");
  toolbar.className = "timeline__toolbar";
  toolbar.setAttribute("aria-label", "时间轴工具栏");

  /** 吸附网格：null 关闭，1 / 0.5 / 0.1 吸附到整数 / 0.5 / 0.1 */
  let snapGrid: number | null = null;
  function snapTime(t: number): number {
    if (snapGrid == null) return t;
    return Math.round(t / snapGrid) * snapGrid;
  }

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "timeline__btn timeline__btn--play";
  playBtn.textContent = "播放";
  playBtn.setAttribute("aria-label", "播放");
  playBtn.addEventListener("click", () => play());

  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.className = "timeline__btn timeline__btn--pause";
  pauseBtn.textContent = "暂停";
  pauseBtn.setAttribute("aria-label", "暂停");
  pauseBtn.addEventListener("click", () => pause());

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "timeline__btn timeline__btn--next";
  nextBtn.textContent = "下一帧";
  nextBtn.setAttribute("aria-label", "下一帧");
  nextBtn.addEventListener("click", () => {
    const next = Math.min(state.duration, state.currentTime + state.frameStep);
    setTime(next >= state.duration ? 0 : next);
  });

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "timeline__btn timeline__btn--prev";
  prevBtn.textContent = "上一帧";
  prevBtn.setAttribute("aria-label", "上一帧");
  prevBtn.addEventListener("click", () => {
    const prev = Math.max(0, state.currentTime - state.frameStep);
    setTime(prev);
  });

  const seekStartBtn = document.createElement("button");
  seekStartBtn.type = "button";
  seekStartBtn.className = "timeline__btn timeline__btn--seek-start";
  seekStartBtn.textContent = "跳到开始";
  seekStartBtn.setAttribute("aria-label", "跳到开始");
  seekStartBtn.addEventListener("click", () => setTime(0));

  const addKeyframeBtn = document.createElement("button");
  addKeyframeBtn.type = "button";
  addKeyframeBtn.className = "timeline__btn timeline__btn--add-keyframe";
  addKeyframeBtn.textContent = "添加关键帧";
  addKeyframeBtn.setAttribute("aria-label", "为当前已改变的参数在当前时间添加关键帧");
  addKeyframeBtn.addEventListener("click", () => {
    const changed = paramStore.getChangedKeys();
    for (const paramKey of changed) {
      const track = state.tracks.find((t) => t.paramKey === paramKey);
      if (!track) continue;
      const value = paramStore.get(track.paramKey as keyof HalftonePaneParams);
      const next = [
        ...track.keyframes,
        { t: state.currentTime, value: value as number | string | boolean },
      ];
      next.sort((a, b) => a.t - b.t);
      updateTrack(track.id, { keyframes: next });
    }
    paramStore.setChangedKeys(new Set());
  });

  const timeDisplay = document.createElement("span");
  timeDisplay.className = "timeline__time-display";
  timeDisplay.setAttribute("aria-live", "polite");
  let refreshTimeDisplay: () => void = () => {
    timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)} s`;
  };
  refreshTimeDisplay();

  const snapWrap = document.createElement("div");
  snapWrap.className = "timeline__toolbar-snap";
  const snapLabel = document.createElement("label");
  snapLabel.className = "timeline__toolbar-snap-label";
  snapLabel.textContent = "吸附";
  const snapSelect = document.createElement("select");
  snapSelect.className = "timeline__toolbar-snap-select";
  snapSelect.setAttribute("aria-label", "吸附到时间网格");
  const snapOptions: { value: string; text: string }[] = [
    { value: "", text: "无" },
    { value: "1", text: "1" },
    { value: "0.5", text: "0.5" },
    { value: "0.1", text: "0.1" },
  ];
  snapOptions.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.text;
    snapSelect.appendChild(o);
  });
  snapSelect.addEventListener("change", () => {
    const v = snapSelect.value;
    snapGrid = v === "" ? null : Number(v);
    setTime(state.currentTime);
  });
  snapWrap.appendChild(snapLabel);
  snapWrap.appendChild(snapSelect);

  toolbar.append(
    playBtn,
    pauseBtn,
    prevBtn,
    nextBtn,
    seekStartBtn,
    addKeyframeBtn,
    snapWrap,
    timeDisplay
  );

  const body = document.createElement("div");
  body.className = "timeline__body";

  const workspace = document.createElement("div");
  workspace.className = "timeline__workspace";

  const rulerRow = document.createElement("div");
  rulerRow.className = "timeline__ruler-row";
  const rulerLabel = document.createElement("span");
  rulerLabel.className = "timeline__track-label";
  rulerLabel.textContent = "时间";
  const rulerStrip = document.createElement("div");
  rulerStrip.className = "timeline__ruler-strip";
  for (let i = 0; i <= state.duration; i++) {
    const tick = document.createElement("span");
    tick.className = "timeline__ruler-tick";
    tick.textContent = String(i);
    const pct = state.duration > 0 ? (i / state.duration) * 100 : 0;
    tick.style.left = `${pct}%`;
    rulerStrip.appendChild(tick);
  }
  rulerRow.appendChild(rulerLabel);
  rulerRow.appendChild(rulerStrip);
  workspace.appendChild(rulerRow);

  const rulerLinesLayer = document.createElement("div");
  rulerLinesLayer.className = "timeline__ruler-lines";
  rulerLinesLayer.setAttribute("aria-hidden", "true");
  for (let i = 0; i <= state.duration; i++) {
    const line = document.createElement("div");
    line.className = "timeline__ruler-line";
    const pct = state.duration > 0 ? (i / state.duration) * 100 : 0;
    line.style.left = `${pct}%`;
    rulerLinesLayer.appendChild(line);
  }

  function refreshRuler(): void {
    rulerStrip.textContent = "";
    for (let i = 0; i <= state.duration; i++) {
      const tick = document.createElement("span");
      tick.className = "timeline__ruler-tick";
      tick.textContent = String(i);
      const pct = state.duration > 0 ? (i / state.duration) * 100 : 0;
      tick.style.left = `${pct}%`;
      rulerStrip.appendChild(tick);
    }
    rulerLinesLayer.textContent = "";
    for (let i = 0; i <= state.duration; i++) {
      const line = document.createElement("div");
      line.className = "timeline__ruler-line";
      const pct = state.duration > 0 ? (i / state.duration) * 100 : 0;
      line.style.left = `${pct}%`;
      rulerLinesLayer.appendChild(line);
    }
    playheadHandle.setAttribute("aria-valuemax", String(state.duration));
  }

  const playheadRow = document.createElement("div");
  playheadRow.className = "timeline__playhead-row";
  const playheadLabel = document.createElement("span");
  playheadLabel.className = "timeline__track-label";
  playheadLabel.setAttribute("aria-hidden", "true");
  const playheadStrip = document.createElement("div");
  playheadStrip.className = "timeline__playhead-strip";
  playheadStrip.setAttribute("aria-label", "时间轴，点击或拖动播放头可移动当前时间");
  const playheadHandle = document.createElement("div");
  playheadHandle.className = "timeline__playhead-handle";
  playheadHandle.setAttribute("role", "slider");
  playheadHandle.setAttribute("aria-valuenow", String(state.currentTime));
  playheadHandle.setAttribute("aria-valuemin", "0");
  playheadHandle.setAttribute("aria-valuemax", String(state.duration));
  playheadHandle.setAttribute("aria-label", "播放头，可拖动");
  playheadStrip.appendChild(playheadHandle);
  playheadRow.appendChild(playheadLabel);
  playheadRow.appendChild(playheadStrip);
  workspace.appendChild(playheadRow);

  const playheadLayer = document.createElement("div");
  playheadLayer.className = "timeline__playhead-layer";
  playheadLayer.setAttribute("aria-hidden", "true");
  const playheadLine = document.createElement("div");
  playheadLine.className = "timeline__playhead-line";
  playheadLayer.appendChild(playheadLine);

  function refreshPlayhead(): void {
    const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    playheadLine.style.left = `${pct}%`;
    playheadHandle.style.left = `${pct}%`;
    playheadHandle.setAttribute("aria-valuenow", String(state.currentTime));
  }
  refreshPlayhead();

  function timeFromStripX(stripEl: HTMLElement, clientX: number): number {
    const rect = stripEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const t = (x / rect.width) * state.duration;
    return Math.max(0, Math.min(state.duration, t));
  }

  playheadStrip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const onMove = (e2: MouseEvent) => {
      const t = timeFromStripX(playheadStrip, e2.clientX);
      setTime(t);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    onMove(e);
  });

  const tracksContainer = document.createElement("div");
  tracksContainer.className = "timeline__tracks";
  tracksContainer.setAttribute("aria-label", "轨道列表，可将参数拖入");

  function refreshTracksUI(): void {
    tracksContainer.textContent = "";
    if (state.tracks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "timeline__tracks-empty";
      empty.textContent = "将上方参数标题拖拽到此处添加轨道";
      tracksContainer.appendChild(empty);
      return;
    }
    for (const track of state.tracks) {
      const row = document.createElement("div");
      row.className = "timeline__track";
      row.setAttribute("data-track-id", track.id);
      const labelEl = document.createElement("span");
      labelEl.className = "timeline__track-label";
      labelEl.textContent = track.label;
      const strip = document.createElement("div");
      strip.className = "timeline__track-strip";
      strip.setAttribute("aria-hidden", "true");
      for (const kf of track.keyframes) {
        const dot = document.createElement("span");
        dot.className = "timeline__keyframe-dot";
        dot.style.left = `${(kf.t / state.duration) * 100}%`;
        strip.appendChild(dot);
      }
      row.appendChild(labelEl);
      row.appendChild(strip);
      row.addEventListener("click", () => {
        selectedTrackId = track.id;
        renderKeyframeEditor(track.id);
        onTrackSelect?.(track.id);
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showTrackContextMenu(track.id, e.clientX, e.clientY);
      });
      tracksContainer.appendChild(row);
    }
  }

  let selectedTrackId: string | null = null;

  const keyframeEditorPanel = document.createElement("div");
  keyframeEditorPanel.className = "timeline__keyframe-editor";
  keyframeEditorPanel.setAttribute("aria-label", "关键帧编辑");

  function renderKeyframeEditor(trackId: string | null): void {
    keyframeEditorPanel.textContent = "";
    if (!trackId) {
      const hint = document.createElement("p");
      hint.className = "timeline__keyframe-editor-hint";
      hint.textContent = "点击上方轨道以编辑关键帧";
      keyframeEditorPanel.appendChild(hint);
      keyframeEditorPanel.classList.remove("timeline__keyframe-editor--open");
      return;
    }
    const track = getTrack(trackId);
    if (!track) {
      selectedTrackId = null;
      keyframeEditorPanel.classList.remove("timeline__keyframe-editor--open");
      return;
    }
    keyframeEditorPanel.classList.add("timeline__keyframe-editor--open");

    const title = document.createElement("div");
    title.className = "timeline__keyframe-editor-title";
    title.textContent = `关键帧：${track.label}`;
    keyframeEditorPanel.appendChild(title);

    const interpRow = document.createElement("div");
    interpRow.className = "timeline__keyframe-editor-row";
    const interpLabel = document.createElement("label");
    interpLabel.textContent = "插值：";
    const interpSelect = document.createElement("select");
    interpSelect.innerHTML = '<option value="linear">线性</option><option value="step">步进</option>';
    interpSelect.value = track.interpolation;
    interpSelect.addEventListener("change", () => {
      updateTrack(trackId, { interpolation: interpSelect.value as Interpolation });
    });
    interpRow.append(interpLabel, interpSelect);
    keyframeEditorPanel.appendChild(interpRow);

    const listWrap = document.createElement("div");
    listWrap.className = "timeline__keyframe-list";
    const listTitle = document.createElement("div");
    listTitle.className = "timeline__keyframe-list-title";
    listTitle.textContent = "关键帧列表";
    listWrap.appendChild(listTitle);
    for (let i = 0; i < track.keyframes.length; i++) {
      const kf = track.keyframes[i];
      const row = document.createElement("div");
      row.className = "timeline__keyframe-list-row";
      const timeDisplay = document.createElement("span");
      timeDisplay.className = "timeline__keyframe-time";
      timeDisplay.textContent = `t = ${Number(kf.t).toFixed(2)}`;
      const valueCell = document.createElement("div");
      valueCell.className = "timeline__keyframe-value-cell";
      const setKeyframeValue = (newValue: number | string | boolean) => {
        const next = [...track.keyframes];
        next[i] = { ...next[i], value: newValue };
        updateTrack(trackId, { keyframes: next });
        renderKeyframeEditor(trackId);
      };
      if (typeof kf.value === "number") {
        const valueInput = document.createElement("input");
        valueInput.type = "number";
        valueInput.step = "0.01";
        valueInput.value = String(kf.value);
        valueInput.addEventListener("change", () => {
          const v = Number(valueInput.value);
          if (Number.isFinite(v)) setKeyframeValue(v);
        });
        valueCell.appendChild(valueInput);
      } else if (typeof kf.value === "boolean") {
        const valueInput = document.createElement("input");
        valueInput.type = "checkbox";
        valueInput.checked = kf.value;
        valueInput.addEventListener("change", () => setKeyframeValue(valueInput.checked));
        valueCell.appendChild(valueInput);
      } else {
        const valueInput = document.createElement("input");
        valueInput.type = /^#[0-9A-Fa-f]{6}$/.test(kf.value) ? "color" : "text";
        valueInput.value = kf.value;
        valueInput.addEventListener("change", () => setKeyframeValue(valueInput.value));
        valueCell.appendChild(valueInput);
      }
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => {
        const next = track.keyframes.filter((_, j) => j !== i);
        updateTrack(trackId, { keyframes: next });
        renderKeyframeEditor(trackId);
      });
      row.append(timeDisplay, valueCell, delBtn);
      listWrap.appendChild(row);
    }
    keyframeEditorPanel.appendChild(listWrap);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "timeline__btn";
    addBtn.textContent = "在当前时间添加关键帧";
    addBtn.addEventListener("click", () => {
      const t = state.currentTime;
      const value = paramStore.get(track.paramKey);
      const next = [...track.keyframes, { t, value: value as number | string | boolean }];
      next.sort((a, b) => a.t - b.t);
      updateTrack(trackId, { keyframes: next });
      renderKeyframeEditor(trackId);
    });
    keyframeEditorPanel.appendChild(addBtn);
  }

  function showTrackContextMenu(trackId: string, clientX: number, clientY: number): void {
    const menu = document.createElement("div");
    menu.className = "timeline__context-menu";
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    item.type = "button";
    item.className = "timeline__context-menu-item";
    item.textContent = "从时间轴移除轨道";
    item.setAttribute("role", "menuitem");
    item.addEventListener("click", () => {
      removeTrack(trackId);
      selectedTrackId = null;
      renderKeyframeEditor(null);
      close();
    });
    menu.appendChild(item);
    document.body.appendChild(menu);
    const padding = 4;
    menu.style.left = `${clientX + padding}px`;
    menu.style.top = `${clientY + padding}px`;
    const close = () => {
      document.body.removeChild(menu);
      document.removeEventListener("click", close);
    };
    requestAnimationFrame(() => document.addEventListener("click", close));
    item.focus();
  }

  onTracksChange = () => {
    refreshTracksUI();
    if (selectedTrackId && !state.tracks.some((t) => t.id === selectedTrackId)) {
      selectedTrackId = null;
      renderKeyframeEditor(null);
    } else if (selectedTrackId) {
      renderKeyframeEditor(selectedTrackId);
    }
  };

  tracksContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    tracksContainer.classList.add("timeline__tracks--drag-over");
  });
  tracksContainer.addEventListener("dragleave", () => {
    tracksContainer.classList.remove("timeline__tracks--drag-over");
  });
  tracksContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    tracksContainer.classList.remove("timeline__tracks--drag-over");
    const raw = e.dataTransfer?.getData(DRAG_PARAM_TYPE);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { paramKey: string; label: string; stage?: string };
      addTrack({ paramKey: payload.paramKey as keyof HalftonePaneParams, label: payload.label });
    } catch {
      // ignore invalid payload
    }
  });

  workspace.appendChild(tracksContainer);
  workspace.appendChild(rulerLinesLayer);
  workspace.appendChild(playheadLayer);
  body.appendChild(workspace);

  const main = document.createElement("div");
  main.className = "timeline__main";
  main.appendChild(body);
  main.appendChild(keyframeEditorPanel);
  root.appendChild(toolbar);
  root.appendChild(main);
  refreshTracksUI();
  renderKeyframeEditor(null);

  const setTime = (t: number): void => {
    t = Math.max(0, Math.min(state.duration, snapTime(t)));
    setTimeOrig(t);
    refreshTimeDisplay();
    refreshPlayhead();
  };

  function loadState(newState: TimelineState): void {
    pause();
    state.duration = Math.max(0.1, newState.duration);
    state.frameStep = newState.frameStep > 0 ? newState.frameStep : state.frameStep;
    state.tracks = newState.tracks.map((tr) => ({
      ...tr,
      id: tr.id || generateId(),
    }));
    state.currentTime = Math.max(0, Math.min(newState.currentTime, state.duration));
    state.playing = false;
    selectedTrackId = null;
    refreshRuler();
    onTracksChange();
    setTimeOrig(state.currentTime);
    refreshTimeDisplay();
    refreshPlayhead();
    renderKeyframeEditor(null);
  }

  return {
    root,
    getState,
    loadState,
    setTime,
    play,
    pause,
    addTrack,
    removeTrack,
    getTrack,
    updateTrack,
    applyKeyframes,
    dispose,
  };
}
