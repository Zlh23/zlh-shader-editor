/**
 * 半调控制台：Tweakpane 面板创建与绑定，可被示例页等复用。
 */

import { Pane } from "tweakpane";
import type { HalftoneProcessorParams } from "./halftoneProcessor";

export interface HalftonePaneParams extends HalftoneProcessorParams {
  timeValue: number;
  /** ani 滑块与动画的上限，默认 8 */
  aniMax: number;
  /** 一个来回(秒)，仅面板用，默认 4 */
  cycleTimeSec?: number;
  /** 渐变+粒度2圆心 曲线的极值（0~timeValue→0~offset2Peak，timeValue~1→offset2Peak~1），默认 1.05 */
  offset2Peak: number;
}

/** 从 Pane 用到的 params 转为处理器参数 */
export function toProcessorParams(p: HalftonePaneParams): HalftoneProcessorParams {
  return {
    n: p.n,
    n2: p.n2,
    blendValue: p.blendValue,
    offset2: p.offset2,
    baseScale: p.baseScale,
    gapPercent: p.gapPercent,
    threshold: p.threshold,
    soft: p.soft,
    softFineness: p.softFineness,
    contrast: p.contrast,
    contrastOnlyLuma: p.contrastOnlyLuma,
    bgColor: p.bgColor,
    useColorBlend: p.useColorBlend,
    monoColor: p.monoColor,
    lumaToAlpha: p.lumaToAlpha,
    lumaToAlphaEdge0: p.lumaToAlphaEdge0,
    lumaToAlphaEdge1: p.lumaToAlphaEdge1,
  };
}

/** 渐变 x(0~1) 映射到 粒度2圆心：0~timeValue→0~peak，timeValue~1→peak~1；peak 默认 1.05 */
export function blendToOffset2(x: number, timeValue: number, peak: number = 1.05): number {
  if (timeValue <= 0) return peak - (peak - 1) * x;
  if (timeValue >= 1) return 1 + (peak - 1) * x;
  if (x <= timeValue) return (x / timeValue) * peak;
  return peak + ((x - timeValue) / (1 - timeValue)) * (1 - peak);
}

interface TweakPaneFolderLike {
  addBinding<T>(object: T, key: keyof T, opts?: Record<string, unknown>): {
    on(event: string, fn: (ev: { value: number }) => void): void;
  };
  addFolder(params: { title: string }): TweakPaneFolderLike;
  addButton(params: { title: string }): { on(event: string, fn: () => void): void; title: string };
  addBlade(params: { view: string }): void;
  refresh(): void;
  dispose(): void;
}

export interface CreateHalftonePaneOptions {
  onScheduleRender: () => void;
  title?: string;
  withAni?: boolean;
  withUpload?: boolean;
  uploadBtn?: () => void;
  /** 后处理开/关：getLabel 返回当前按钮文案，onToggle 切换后调用 */
  effectToggle?: { getLabel: () => string; onToggle: () => void };
  /** withAni 时是否默认自动开始播放 */
  autoPlay?: boolean;
}

export function createHalftonePane(
  container: HTMLElement,
  params: HalftonePaneParams,
  options: CreateHalftonePaneOptions
): { dispose: () => void } {
  const { onScheduleRender: scheduleRender, title = "Halftone", withAni = false, withUpload = false, uploadBtn, effectToggle, autoPlay = false } = options;
  const pane = new Pane({ container, title }) as unknown as TweakPaneFolderLike;
  const blendAndOffset2 = { value: params.blendValue };

  const folderSize = pane.addFolder({ title: "1. 尺寸与步长" }) as unknown as TweakPaneFolderLike;

  let animating = false;
  let startTime = 0;
  let rafId: number | null = null;

  const applyAni = (v: number) => {
    const max = params.aniMax;
    const effectiveV = Math.min(v, max);
    const fl = Math.floor(effectiveV);
    params.n = fl;
    params.n2 = Math.min(fl + 1, Math.floor(max));
    const frac = effectiveV - fl;
    params.blendValue = frac;
    params.offset2 = blendToOffset2(frac, params.timeValue, params.offset2Peak);
    params.contrast = (effectiveV / max) * 200 - 100;
    params.useColorBlend = effectiveV / max;
    blendAndOffset2.value = frac;
  };

  if (withAni) {
    const aniControl = { ani: 4 };
    const cycleTime = { cycleTimeSec: params.cycleTimeSec ?? 4 };
    folderSize.addBinding(params, "aniMax", {
      min: 1,
      max: 16,
      step: 1,
      label: "ani 上限",
    }).on("change", () => {
      applyAni(aniControl.ani);
      pane.refresh();
      scheduleRender();
    });
    folderSize.addBinding(cycleTime, "cycleTimeSec", {
      min: 0.5,
      max: 30,
      step: 0.5,
      label: "一个来回(秒)",
    });
    folderSize.addBinding(aniControl, "ani", {
      min: 0,
      max: 16,
      step: 0.01,
      label: "ani (0→上限, 联动对比度/原图混合)",
    }).on("change", (ev) => {
      applyAni(ev.value);
      aniControl.ani = ev.value;
      pane.refresh();
      scheduleRender();
    });

    const playBtn = pane.addButton({ title: "播放" });
    const startAnimation = () => {
      if (animating) return;
      animating = true;
      startTime = Date.now();
      playBtn.title = "暂停";
      pane.refresh();
      const tick = () => {
        if (!animating) return;
        const elapsed = (Date.now() - startTime) / 1000;
        const cycleSec = cycleTime.cycleTimeSec;
        const max = params.aniMax;
        const t = (elapsed / cycleSec) % 2;
        const ani = t <= 1 ? t * max : (2 - t) * max;
        applyAni(ani);
        aniControl.ani = ani;
        pane.refresh();
        scheduleRender();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };
    playBtn.on("click", () => {
      if (!animating) startAnimation();
      else {
        animating = false;
        if (rafId != null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        playBtn.title = "播放";
        pane.refresh();
      }
    });
    if (autoPlay) setTimeout(startAnimation, 0);
  }

  folderSize.addBinding(params, "n", { min: 0, max: 16, step: 1, label: "粒度 1 (粗)" }).on("change", scheduleRender);
  folderSize.addBinding(params, "n2", { min: 0, max: 16, step: 1, label: "粒度 2 (细)" }).on("change", scheduleRender);

  const folderPass1 = pane.addFolder({ title: "2. Pass1 场+颜色" }) as unknown as TweakPaneFolderLike;
  folderPass1.addBinding(params, "contrast", { min: -100, max: 100, step: 1, label: "对比度" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "contrastOnlyLuma", { label: "对比度仅影响亮度" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "baseScale", { min: 0.1, max: 3, step: 0.05, label: "圆点缩放" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "gapPercent", { min: 0, max: 100, step: 1, label: "间隙 %" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "blendValue", { min: 0, max: 1, step: 0.01, label: "渐变 0→1" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "offset2", { min: 0, max: 1.5, step: 0.01, label: "粒度2 圆心 0=四合一" }).on("change", scheduleRender);
  folderPass1.addBinding(params, "offset2Peak", { min: 0.5, max: 2, step: 0.05, label: "粒度2圆心极值" }).on("change", () => {
    params.offset2 = blendToOffset2(params.blendValue, params.timeValue, params.offset2Peak);
    pane.refresh();
    scheduleRender();
  });
  folderPass1.addBinding(blendAndOffset2, "value", { min: 0, max: 1, step: 0.01, label: "渐变+粒度2圆心" }).on("change", (ev) => {
    params.blendValue = ev.value;
    params.offset2 = blendToOffset2(ev.value, params.timeValue, params.offset2Peak);
    pane.refresh();
    scheduleRender();
  });
  folderPass1.addBinding(params, "timeValue", { min: 0, max: 1, step: 0.01, label: "时间值 (offset2 分段)" }).on("change", () => {
    params.offset2 = blendToOffset2(params.blendValue, params.timeValue, params.offset2Peak);
    pane.refresh();
    scheduleRender();
  });

  const folderPass2 = pane.addFolder({ title: "3. Pass2 最终图像" }) as unknown as TweakPaneFolderLike;
  folderPass2.addBinding(params, "threshold", { min: 0.1, max: 3, step: 0.05, label: "粘合阈值" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "soft", { min: 0, max: 2, step: 0.01, label: "边缘软化" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "softFineness", { min: 0.2, max: 3, step: 0.01, label: "边缘软化细度" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "bgColor", { label: "背景色" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "useColorBlend", { min: 0, max: 1, step: 0.01, label: "原图颜色混合" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "monoColor", { label: "单色" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "lumaToAlpha", { label: "亮度转透明度（clamp blend）" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "lumaToAlphaEdge0", { min: 0, max: 1, step: 0.01, label: "亮度区间起点" }).on("change", scheduleRender);
  folderPass2.addBinding(params, "lumaToAlphaEdge1", { min: 0, max: 1, step: 0.01, label: "亮度区间终点" }).on("change", scheduleRender);

  if (withUpload && uploadBtn) {
    pane.addBlade({ view: "separator" });
    pane.addButton({ title: "上传图片" }).on("click", uploadBtn);
  }
  if (effectToggle) {
    pane.addBlade({ view: "separator" });
    const btn = pane.addButton({ title: effectToggle.getLabel() });
    btn.on("click", () => {
      effectToggle.onToggle();
      btn.title = effectToggle.getLabel();
      pane.refresh();
    });
  }

  return {
    dispose: () => {
      animating = false;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pane.dispose();
    },
  };
}

export type StagePaneStage = "source" | "sat" | "pass1" | "final";

export interface CreateStagePaneOptions {
  onScheduleRender: () => void;
  uploadBtn?: () => void;
}

/**
 * 为单个阶段创建 Tweakpane，只添加该阶段用到的参数。用于调试页「图左参数右」的节点布局。
 * sat 阶段无参数，返回空 dispose（容器可由调用方放说明文案）。
 */
export function createStagePane(
  container: HTMLElement,
  params: HalftonePaneParams,
  stage: StagePaneStage,
  options: CreateStagePaneOptions
): { dispose: () => void } {
  const { onScheduleRender: scheduleRender, uploadBtn } = options;

  if (stage === "sat") {
    return { dispose: () => {} };
  }

  const pane = new Pane({ container, title: "" }) as unknown as TweakPaneFolderLike;
  const blendAndOffset2 = { value: params.blendValue };

  if (stage === "source") {
    pane.addBinding(params, "n", { min: 0, max: 16, step: 1, label: "粒度 1 (粗)" }).on("change", scheduleRender);
    pane.addBinding(params, "n2", { min: 0, max: 16, step: 1, label: "粒度 2 (细)" }).on("change", scheduleRender);
    if (uploadBtn) {
      pane.addBlade({ view: "separator" });
      pane.addButton({ title: "上传图片" }).on("click", uploadBtn);
    }
    return { dispose: () => pane.dispose() };
  }

  if (stage === "pass1") {
    const folderSize = pane.addFolder({ title: "尺寸与步长" }) as unknown as TweakPaneFolderLike;
    folderSize.addBinding(params, "n", { min: 0, max: 16, step: 1, label: "粒度 1 (粗)" }).on("change", scheduleRender);
    folderSize.addBinding(params, "n2", { min: 0, max: 16, step: 1, label: "粒度 2 (细)" }).on("change", scheduleRender);

    const folderPass1 = pane.addFolder({ title: "Pass1 场+颜色" }) as unknown as TweakPaneFolderLike;
    folderPass1.addBinding(params, "contrast", { min: -100, max: 100, step: 1, label: "对比度" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "contrastOnlyLuma", { label: "对比度仅影响亮度" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "baseScale", { min: 0.1, max: 3, step: 0.05, label: "圆点缩放" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "gapPercent", { min: 0, max: 100, step: 1, label: "间隙 %" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "blendValue", { min: 0, max: 1, step: 0.01, label: "渐变 0→1" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "offset2", { min: 0, max: 1.5, step: 0.01, label: "粒度2 圆心" }).on("change", scheduleRender);
    folderPass1.addBinding(params, "offset2Peak", { min: 0.5, max: 2, step: 0.05, label: "粒度2圆心极值" }).on("change", () => {
      params.offset2 = blendToOffset2(params.blendValue, params.timeValue, params.offset2Peak);
      pane.refresh();
      scheduleRender();
    });
    folderPass1.addBinding(blendAndOffset2, "value", { min: 0, max: 1, step: 0.01, label: "渐变+粒度2圆心" }).on("change", (ev) => {
      params.blendValue = ev.value;
      params.offset2 = blendToOffset2(ev.value, params.timeValue, params.offset2Peak);
      pane.refresh();
      scheduleRender();
    });
    folderPass1.addBinding(params, "timeValue", { min: 0, max: 1, step: 0.01, label: "时间值 (offset2 分段)" }).on("change", () => {
      params.offset2 = blendToOffset2(params.blendValue, params.timeValue, params.offset2Peak);
      pane.refresh();
      scheduleRender();
    });
    return { dispose: () => pane.dispose() };
  }

  if (stage === "final") {
    pane.addBinding(params, "threshold", { min: 0.1, max: 3, step: 0.05, label: "粘合阈值" }).on("change", scheduleRender);
    pane.addBinding(params, "soft", { min: 0, max: 2, step: 0.01, label: "边缘软化" }).on("change", scheduleRender);
    pane.addBinding(params, "softFineness", { min: 0.2, max: 3, step: 0.01, label: "边缘软化细度" }).on("change", scheduleRender);
    pane.addBinding(params, "bgColor", { label: "背景色" }).on("change", scheduleRender);
    pane.addBinding(params, "useColorBlend", { min: 0, max: 1, step: 0.01, label: "原图颜色混合" }).on("change", scheduleRender);
    pane.addBinding(params, "monoColor", { label: "单色" }).on("change", scheduleRender);
    pane.addBinding(params, "lumaToAlpha", { label: "亮度转透明度" }).on("change", scheduleRender);
    pane.addBinding(params, "lumaToAlphaEdge0", { min: 0, max: 1, step: 0.01, label: "亮度区间起点" }).on("change", scheduleRender);
    pane.addBinding(params, "lumaToAlphaEdge1", { min: 0, max: 1, step: 0.01, label: "亮度区间终点" }).on("change", scheduleRender);
    return { dispose: () => pane.dispose() };
  }

  return { dispose: () => {} };
}

export function getDefaultHalftonePaneParams(overrides?: Partial<HalftonePaneParams>): HalftonePaneParams {
  return {
    n: 2,
    n2: 3,
    blendValue: 0.3,
    offset2: 0.3,
    timeValue: 0.5,
    aniMax: 8,
    offset2Peak: 1.05,
    baseScale: 0.9,
    gapPercent: 10,
    threshold: 1.0,
    soft: 0.1,
    softFineness: 1,
    contrast: 0,
    contrastOnlyLuma: false,
    bgColor: "#111111",
    useColorBlend: 1,
    monoColor: "#ffffff",
    lumaToAlpha: false,
    lumaToAlphaEdge0: 0,
    lumaToAlphaEdge1: 1,
    ...overrides,
  };
}
