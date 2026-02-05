/**
 * 调试页单张节点卡片组件：图 + 参数区 + RGBA 通道按钮 + min/max 范围条
 * 纯 TS 无框架，创建 DOM、内部状态并绑定事件
 */

export type ChannelKey = "r" | "g" | "b" | "a";
const CHANNELS: ChannelKey[] = ["r", "g", "b", "a"];

/** A 通道显示模式 */
export type AlphaMode = "normal" | "off" | "viewOnly";
const ALPHA_MODE_ORDER: AlphaMode[] = ["normal", "off", "viewOnly"];

export interface ChannelState {
  r: boolean;
  g: boolean;
  b: boolean;
  a: AlphaMode;
}

function createDefaultChannelState(): ChannelState {
  return { r: true, g: true, b: true, a: "normal" };
}

function getAlphaButtonLabel(mode: AlphaMode): string {
  switch (mode) {
    case "normal":
      return "A";
    case "off":
      return "A(关)";
    case "viewOnly":
      return "A(仅)";
  }
}

/** 根据通道状态对 canvas 应用通道遮罩；A 为三态 */
export function applyChannelMask(
  ctx: CanvasRenderingContext2D,
  state: ChannelState
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (!state.r) data[i] = 0;
    if (!state.g) data[i + 1] = 0;
    if (!state.b) data[i + 2] = 0;
    switch (state.a) {
      case "off":
        data[i + 3] = 255;
        break;
      case "viewOnly": {
        const alpha = data[i + 3];
        data[i] = alpha;
        data[i + 1] = alpha;
        data[i + 2] = alpha;
        data[i + 3] = 255;
        break;
      }
      default:
        break;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/** 将 [min, max] 映射到 0–255 */
export function applyRangeRemap(
  ctx: CanvasRenderingContext2D,
  min: number,
  max: number
): void {
  if (min >= max) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const scale = 255 / (max - min);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.max(0, Math.min(255, (data[i] - min) * scale)));
    data[i + 1] = Math.round(Math.max(0, Math.min(255, (data[i + 1] - min) * scale)));
    data[i + 2] = Math.round(Math.max(0, Math.min(255, (data[i + 2] - min) * scale)));
    data[i + 3] = Math.round(Math.max(0, Math.min(255, (data[i + 3] - min) * scale)));
  }
  ctx.putImageData(imageData, 0, 0);
}

export interface CreateDebugNodeCardOptions {
  /** 阶段 id，用于 data-stage */
  stage: string;
  /** 卡片标题，如「原图」「Pass1」 */
  label: string;
  /** 参数区初始内容（如 SAT 的「尺寸同原图」），空则留空 */
  paramsContent?: string;
  /** 需要重绘时回调 */
  onScheduleRender: () => void;
}

export interface DebugNodeCard {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  paramsContainer: HTMLElement;
  channelState: ChannelState;
  rangeState: { min: number; max: number };
}

export function createDebugNodeCard(
  options: CreateDebugNodeCardOptions
): DebugNodeCard {
  const { stage, label, paramsContent = "", onScheduleRender } = options;

  const channelState = createDefaultChannelState();
  const rangeState = { min: 0, max: 255 };

  const root = document.createElement("div");
  root.className = "node";
  root.setAttribute("data-stage", stage);

  const labelEl = document.createElement("span");
  labelEl.className = "node-label";
  labelEl.textContent = label;
  root.appendChild(labelEl);

  /* 上方容器：图 + 通道 + min/max，竖着排 */
  const previewBlock = document.createElement("div");
  previewBlock.className = "node-preview";

  const imageWrap = document.createElement("div");
  imageWrap.className = "node-image-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "node-canvas";
  canvas.id = `node-${stage}`;
  imageWrap.appendChild(canvas);
  previewBlock.appendChild(imageWrap);

  const controlsWrap = document.createElement("div");
  controlsWrap.className = "node-preview-controls-wrap preview-controls-hidden";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "node-preview-toggle-btn";
  toggleBtn.setAttribute("aria-label", "展开");
  toggleBtn.textContent = "▼";
  toggleBtn.addEventListener("click", () => {
    const hidden = controlsWrap.classList.toggle("preview-controls-hidden");
    toggleBtn.textContent = hidden ? "▼" : "▲";
    toggleBtn.setAttribute("aria-label", hidden ? "展开" : "收起");
  });

  const channelsWrap = document.createElement("div");
  channelsWrap.className = "node-channels";
  channelsWrap.setAttribute("aria-label", "通道显示");
  for (const ch of CHANNELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "channel-btn" + (ch !== "a" ? " active" : "");
    btn.setAttribute("data-channel", ch);
    btn.textContent = ch.toUpperCase();
    if (ch === "a") btn.textContent = getAlphaButtonLabel(channelState.a);
    channelsWrap.appendChild(btn);
  }

  const rangeWrap = document.createElement("div");
  rangeWrap.className = "node-range";
  rangeWrap.setAttribute("aria-label", "显示范围映射");
  for (const kind of ["min", "max"] as const) {
    const labelRow = document.createElement("label");
    labelRow.className = "range-row";
    const lab = document.createElement("span");
    lab.className = "range-label";
    lab.textContent = kind;
    const rangeInput = document.createElement("input");
    rangeInput.type = "range";
    rangeInput.className = `range-input range-${kind}`;
    rangeInput.min = "0";
    rangeInput.max = "255";
    rangeInput.value = kind === "min" ? "0" : "255";
    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.className = "range-value-input";
    valueInput.setAttribute("data-range", kind);
    valueInput.min = "0";
    valueInput.max = "255";
    valueInput.value = kind === "min" ? "0" : "255";
    /* 前面：标签 + 可输入数值，后面：进度条 */
    labelRow.append(lab, valueInput, rangeInput);
    rangeWrap.appendChild(labelRow);
  }

  controlsWrap.appendChild(toggleBtn);
  controlsWrap.appendChild(channelsWrap);
  controlsWrap.appendChild(rangeWrap);
  previewBlock.appendChild(controlsWrap);

  root.appendChild(previewBlock);

  /* 下方：参数控制区，竖着排 */
  const paramsContainer = document.createElement("div");
  paramsContainer.className = "node-params";
  paramsContainer.id = `pane-${stage}`;
  if (paramsContent) paramsContainer.textContent = paramsContent;
  root.appendChild(paramsContainer);

  // 绑定通道按钮
  root.querySelectorAll<HTMLButtonElement>(".channel-btn[data-channel]").forEach((btn) => {
    const ch = btn.getAttribute("data-channel") as ChannelKey;
    if (!CHANNELS.includes(ch)) return;
    if (ch === "a") {
      btn.addEventListener("click", () => {
        const idx = ALPHA_MODE_ORDER.indexOf(channelState.a);
        channelState.a = ALPHA_MODE_ORDER[(idx + 1) % ALPHA_MODE_ORDER.length];
        btn.textContent = getAlphaButtonLabel(channelState.a);
        btn.classList.remove("active", "alpha-off", "alpha-view");
        if (channelState.a === "off") btn.classList.add("alpha-off");
        else {
          btn.classList.add("active");
          if (channelState.a === "viewOnly") btn.classList.add("alpha-view");
        }
        onScheduleRender();
      });
      btn.classList.remove("alpha-off", "alpha-view");
      if (channelState.a === "off") btn.classList.add("alpha-off");
      else {
        btn.classList.add("active");
        if (channelState.a === "viewOnly") btn.classList.add("alpha-view");
      }
    } else {
      btn.addEventListener("click", () => {
        channelState[ch] = !channelState[ch];
        btn.classList.toggle("active", channelState[ch]);
        onScheduleRender();
      });
    }
  });

  // 绑定范围滑块与可输入数值框
  const minRange = root.querySelector<HTMLInputElement>(".range-min");
  const maxRange = root.querySelector<HTMLInputElement>(".range-max");
  const minValueInput = root.querySelector<HTMLInputElement>(".range-value-input[data-range=min]");
  const maxValueInput = root.querySelector<HTMLInputElement>(".range-value-input[data-range=max]");

  const clamp255 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

  if (minRange && minValueInput) {
    minRange.addEventListener("input", () => {
      rangeState.min = minRange.valueAsNumber;
      minValueInput.value = String(rangeState.min);
      onScheduleRender();
    });
    minValueInput.addEventListener("change", () => {
      const v = clamp255(Number(minValueInput.value));
      rangeState.min = v;
      minRange.value = String(v);
      minValueInput.value = String(v);
      onScheduleRender();
    });
  }
  if (maxRange && maxValueInput) {
    maxRange.addEventListener("input", () => {
      rangeState.max = maxRange.valueAsNumber;
      maxValueInput.value = String(rangeState.max);
      onScheduleRender();
    });
    maxValueInput.addEventListener("change", () => {
      const v = clamp255(Number(maxValueInput.value));
      rangeState.max = v;
      maxRange.value = String(v);
      maxValueInput.value = String(v);
      onScheduleRender();
    });
  }

  return {
    root,
    canvas,
    paramsContainer,
    channelState,
    rangeState,
  };
}
