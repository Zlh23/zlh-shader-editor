/**
 * 调试页用自定义控件：不依赖 Tweakpane，纯 DOM
 */

import type { ParamStore } from "./paramStore";
import type { HalftonePaneParams } from "@/Halftone";

const CONTROL_ROW_CLASS = "debug-control-row";
const CONTROL_LABEL_CLASS = "debug-control-label";
const CONTROL_INPUT_CLASS = "debug-control-input";
const FIELDSET_CLASS = "debug-control-fieldset";
const FIELDSET_LEGEND_CLASS = "debug-control-legend";

export const DRAG_PARAM_TYPE = "application/x-shader-param";

export interface DragParamPayload {
  paramKey: string;
  label: string;
  stage?: string;
}

function setupLabelDraggable(
  labelEl: HTMLElement,
  payload: { paramKey: string; label: string; stage?: string }
): void {
  labelEl.draggable = true;
  labelEl.setAttribute("data-param-key", payload.paramKey);
  labelEl.setAttribute("data-param-label", payload.label);
  if (payload.stage != null) labelEl.setAttribute("data-stage", payload.stage);
  labelEl.classList.add("debug-control-label--draggable");
  labelEl.setAttribute("aria-label", `可拖拽到时间轴：${payload.label}`);
  labelEl.addEventListener("dragstart", (e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(DRAG_PARAM_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  });
}

/** 三列行：标题 | 控制一 | 控制二，未用到的格用空 span 占位以对齐 */
function rowThree(
  labelText: string,
  control1: HTMLElement,
  control2?: HTMLElement,
  dragPayload?: { paramKey: string; label: string; stage?: string }
): HTMLElement {
  const rowEl = document.createElement("div");
  rowEl.className = CONTROL_ROW_CLASS;
  const label = document.createElement("span");
  label.className = CONTROL_LABEL_CLASS;
  label.textContent = labelText;
  if (dragPayload) setupLabelDraggable(label, dragPayload);
  rowEl.appendChild(label);
  rowEl.appendChild(control1);
  rowEl.appendChild(control2 ?? document.createElement("span"));
  return rowEl;
}

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  label: string;
  onChange: (value: number) => void;
  paramKey?: keyof HalftonePaneParams;
  stage?: string;
  paramStore?: ParamStore;
  onScheduleRender?: () => void;
  registerDispose?: (fn: () => void) => void;
}

/** 输入框显示统一保留小数点后 2 位 */
function formatSliderValue(v: number, _step?: number): string {
  return Number(v).toFixed(2);
}

export function createSlider(options: SliderOptions): HTMLElement {
  const {
    min,
    max,
    step,
    value: valueOpt,
    label,
    onChange: onChangeOpt,
    paramKey,
    stage,
    paramStore,
    onScheduleRender,
    registerDispose,
  } = options;

  const useStore = paramStore && paramKey != null;
  const value = useStore ? (paramStore.get(paramKey) as number) : valueOpt;
  const onChange = useStore
    ? (v: number) => {
        paramStore.set(paramKey!, v);
        onScheduleRender?.();
      }
    : onChangeOpt;

  const wrap = document.createElement("div");
  wrap.className = CONTROL_ROW_CLASS;
  const labelEl = document.createElement("span");
  labelEl.className = CONTROL_LABEL_CLASS;
  labelEl.textContent = label;
  if (paramKey) setupLabelDraggable(labelEl, { paramKey: String(paramKey), label, stage });
  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.className = CONTROL_INPUT_CLASS;
  rangeInput.min = String(min);
  rangeInput.max = String(max);
  rangeInput.step = String(step);
  rangeInput.value = String(value);
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.className = "debug-control-value-input";
  valueInput.min = String(min);
  valueInput.max = String(max);
  valueInput.step = String(step);
  valueInput.value = String(formatSliderValue(value, step));

  const syncDom = (v: number) => {
    rangeInput.value = String(v);
    valueInput.value = formatSliderValue(v, step);
  };

  rangeInput.addEventListener("input", () => {
    const v = rangeInput.valueAsNumber;
    valueInput.value = formatSliderValue(v, step);
    onChange(v);
  });
  valueInput.addEventListener("change", () => {
    let v = Number(valueInput.value);
    if (Number.isFinite(v)) {
      v = Math.min(max, Math.max(min, v));
      syncDom(v);
      onChange(v);
    } else {
      valueInput.value = formatSliderValue(rangeInput.valueAsNumber, step);
    }
  });

  if (useStore && paramKey != null) {
    const unsub = paramStore.subscribe(paramKey, (v) => {
      const n = v as number;
      syncDom(n);
    });
    registerDispose?.(unsub);
    const unsubChanged = paramStore.subscribeChangedKeys((keys) => {
      wrap.classList.toggle("debug-control--changed", keys.has(paramKey as string));
    });
    registerDispose?.(unsubChanged);
  }

  wrap.append(labelEl, valueInput, rangeInput);
  return wrap;
}

export interface NumberInputOptions {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  label: string;
  onChange: (value: number) => void;
  paramKey?: keyof HalftonePaneParams;
  stage?: string;
  paramStore?: ParamStore;
  onScheduleRender?: () => void;
  registerDispose?: (fn: () => void) => void;
}

export function createNumberInput(options: NumberInputOptions): HTMLElement {
  const {
    min,
    max,
    step,
    value: valueOpt,
    label,
    onChange: onChangeOpt,
    paramKey,
    stage,
    paramStore,
    onScheduleRender,
    registerDispose,
  } = options;
  const useStore = paramStore && paramKey != null;
  const value = useStore ? (paramStore.get(paramKey) as number) : valueOpt;
  const onChange = useStore
    ? (v: number) => {
        paramStore.set(paramKey!, v);
        onScheduleRender?.();
      }
    : onChangeOpt;
  const input = document.createElement("input");
  input.type = "number";
  input.className = CONTROL_INPUT_CLASS;
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  if (step != null) input.step = String(step);
  input.value = Number(value).toFixed(2);
  input.addEventListener("input", () => onChange(input.valueAsNumber));
  input.addEventListener("blur", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) input.value = n.toFixed(2);
  });
  const payload = paramKey ? { paramKey: String(paramKey), label, stage } : undefined;
  const row = rowThree(label, input, undefined, payload);
  if (useStore && paramKey != null) {
    const unsub = paramStore.subscribe(paramKey, (v) => {
      input.value = Number(v as number).toFixed(2);
    });
    registerDispose?.(unsub);
    const unsubChanged = paramStore.subscribeChangedKeys((keys) => {
      row.classList.toggle("debug-control--changed", keys.has(paramKey as string));
    });
    registerDispose?.(unsubChanged);
  }
  return row;
}

export interface CheckboxOptions {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  paramKey?: keyof HalftonePaneParams;
  stage?: string;
  paramStore?: ParamStore;
  onScheduleRender?: () => void;
  registerDispose?: (fn: () => void) => void;
}

export function createCheckbox(options: CheckboxOptions): HTMLElement {
  const {
    label: labelText,
    checked: checkedOpt,
    onChange: onChangeOpt,
    paramKey,
    stage,
    paramStore,
    onScheduleRender,
    registerDispose,
  } = options;
  const useStore = paramStore && paramKey != null;
  const checked = useStore ? (paramStore.get(paramKey) as boolean) : checkedOpt;
  const onChange = useStore
    ? (v: boolean) => {
        paramStore.set(paramKey!, v);
        onScheduleRender?.();
      }
    : onChangeOpt;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = CONTROL_INPUT_CLASS;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  if (useStore && paramKey != null) {
    const unsub = paramStore.subscribe(paramKey, (v) => {
      input.checked = v as boolean;
    });
    registerDispose?.(unsub);
    const row = rowThree(labelText, input, undefined, paramKey ? { paramKey: String(paramKey), label: labelText, stage } : undefined);
    const unsubChanged = paramStore.subscribeChangedKeys((keys) => {
      row.classList.toggle("debug-control--changed", keys.has(paramKey as string));
    });
    registerDispose?.(unsubChanged);
    return row;
  }
  const payload = paramKey ? { paramKey: String(paramKey), label: labelText, stage } : undefined;
  return rowThree(labelText, input, undefined, payload);
}

export interface ColorInputOptions {
  label: string;
  value: string;
  onChange: (value: string) => void;
  paramKey?: keyof HalftonePaneParams;
  stage?: string;
  paramStore?: ParamStore;
  onScheduleRender?: () => void;
  registerDispose?: (fn: () => void) => void;
}

export function createColorInput(options: ColorInputOptions): HTMLElement {
  const {
    label: labelText,
    value: valueOpt,
    onChange: onChangeOpt,
    paramKey,
    stage,
    paramStore,
    onScheduleRender,
    registerDispose,
  } = options;
  const useStore = paramStore && paramKey != null;
  const value = useStore ? (paramStore.get(paramKey) as string) : valueOpt;
  const onChange = useStore
    ? (v: string) => {
        paramStore.set(paramKey!, v);
        onScheduleRender?.();
      }
    : onChangeOpt;
  const wrap = document.createElement("div");
  wrap.className = CONTROL_ROW_CLASS;
  const labelEl = document.createElement("label");
  labelEl.className = CONTROL_LABEL_CLASS;
  labelEl.textContent = labelText;
  if (paramKey) setupLabelDraggable(labelEl, { paramKey: String(paramKey), label: labelText, stage });
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = CONTROL_INPUT_CLASS;
  colorInput.value = value.startsWith("#") ? value : "#000000";
  if (value.length === 7) colorInput.value = value;
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = CONTROL_INPUT_CLASS;
  textInput.value = value;
  textInput.style.width = "5em";

  const syncToParams = (v: string) => {
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      colorInput.value = v;
      textInput.value = v;
      onChange(v);
    }
  };
  const syncFromStore = (v: string) => {
    const hex = v.startsWith("#") ? v : "#" + v;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      colorInput.value = hex;
      textInput.value = hex;
    }
  };
  colorInput.addEventListener("input", () => syncToParams(colorInput.value));
  textInput.addEventListener("change", () => syncToParams(textInput.value));
  if (useStore && paramKey != null) {
    const unsub = paramStore.subscribe(paramKey, (v) => syncFromStore(v as string));
    registerDispose?.(unsub);
    const unsubChanged = paramStore.subscribeChangedKeys((keys) => {
      wrap.classList.toggle("debug-control--changed", keys.has(paramKey as string));
    });
    registerDispose?.(unsubChanged);
  }
  wrap.append(labelEl, colorInput, textInput);
  return wrap;
}

export interface ButtonOptions {
  label: string;
  onClick: () => void;
}

export function createButton(options: ButtonOptions): HTMLElement {
  const { label, onClick } = options;
  const wrap = document.createElement("div");
  wrap.className = CONTROL_ROW_CLASS;
  const span1 = document.createElement("span");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "debug-control-btn debug-control-span-2";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  const span2 = document.createElement("span");
  wrap.append(span1, btn, span2);
  return wrap;
}

export interface FieldsetOptions {
  title: string;
  children: HTMLElement[];
}

export function createFieldset(options: FieldsetOptions): HTMLElement {
  const { title, children } = options;
  const fieldset = document.createElement("fieldset");
  fieldset.className = FIELDSET_CLASS;
  const legend = document.createElement("legend");
  legend.className = FIELDSET_LEGEND_CLASS;
  legend.textContent = title;
  fieldset.appendChild(legend);
  for (const el of children) fieldset.appendChild(el);
  return fieldset;
}

/** 分组：仅标题 + 子控件，无边框，分类清晰不占视觉 */
export interface SectionOptions {
  title: string;
  children: HTMLElement[];
}

export function createSection(options: SectionOptions): HTMLElement {
  const { title, children } = options;
  const wrap = document.createElement("div");
  wrap.className = "debug-control-section";
  const titleEl = document.createElement("div");
  titleEl.className = "debug-control-section-title";
  titleEl.textContent = title;
  wrap.appendChild(titleEl);
  for (const el of children) wrap.appendChild(el);
  return wrap;
}

export function createSeparator(): HTMLElement {
  const el = document.createElement("hr");
  el.className = "debug-control-sep";
  return el;
}
