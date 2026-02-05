/**
 * 按阶段创建调试用参数控件（替代 Tweakpane 的 createStagePane）
 */

import type { StagePaneStage } from "@/Halftone";
import {
  createSlider,
  createCheckbox,
  createColorInput,
  createButton,
  createSection,
  createSeparator,
} from "./controls";
import type { ParamStore } from "./paramStore";

export interface CreateStageControlsOptions {
  onScheduleRender: () => void;
  uploadBtn?: () => void;
  registerParamLabel?: (paramKey: string, label: string) => void;
}

/** 为单个阶段在 container 内创建控件，返回 dispose 清理 */
export function createStageControls(
  container: HTMLElement,
  paramStore: ParamStore,
  stage: StagePaneStage,
  options: CreateStageControlsOptions
): { dispose: () => void } {
  const { onScheduleRender, uploadBtn, registerParamLabel } = options;
  const disposes: (() => void)[] = [];
  const registerDispose = (fn: () => void) => disposes.push(fn);
  const common = { paramStore, onScheduleRender, registerDispose };
  const commonWithLabel = (paramKey: string, label: string) => {
    registerParamLabel?.(paramKey, label);
    return common;
  };

  if (stage === "sat") {
    return { dispose: () => {} };
  }

  if (stage === "source") {
    container.appendChild(
      createSlider({
        label: "粒度 1 (粗)",
        min: 0,
        max: 16,
        step: 1,
        value: paramStore.get("n"),
        onChange: () => {},
        paramKey: "n",
        stage,
        ...commonWithLabel("n", "粒度 1 (粗)"),
      })
    );
    container.appendChild(
      createSlider({
        label: "粒度 2 (细)",
        min: 0,
        max: 16,
        step: 1,
        value: paramStore.get("n2"),
        onChange: () => {},
        paramKey: "n2",
        stage,
        ...commonWithLabel("n2", "粒度 2 (细)"),
      })
    );
    if (uploadBtn) {
      container.appendChild(createSeparator());
      container.appendChild(createButton({ label: "上传图片", onClick: uploadBtn }));
    }
    return { dispose: () => disposes.forEach((d) => d()) };
  }

  if (stage === "pass1") {
    container.appendChild(
      createSection({
        title: "尺寸与步长",
        children: [
          createSlider({
            label: "粒度 1 (粗)",
            min: 0,
            max: 16,
            step: 1,
            value: paramStore.get("n"),
            onChange: () => {},
            paramKey: "n",
            stage,
            ...commonWithLabel("n", "粒度 1 (粗)"),
          }),
          createSlider({
            label: "粒度 2 (细)",
            min: 0,
            max: 16,
            step: 1,
            value: paramStore.get("n2"),
            onChange: () => {},
            paramKey: "n2",
            stage,
            ...commonWithLabel("n2", "粒度 2 (细)"),
          }),
        ],
      })
    );
    container.appendChild(
      createSection({
        title: "Pass1 场+颜色",
        children: [
          createSlider({
            label: "对比度",
            min: -100,
            max: 100,
            step: 1,
            value: paramStore.get("contrast"),
            onChange: () => {},
            paramKey: "contrast",
            stage,
            ...commonWithLabel("contrast", "对比度"),
          }),
          createCheckbox({
            label: "对比度仅影响亮度",
            checked: paramStore.get("contrastOnlyLuma"),
            onChange: () => {},
            paramKey: "contrastOnlyLuma",
            stage,
            ...commonWithLabel("contrastOnlyLuma", "对比度仅影响亮度"),
          }),
          createSlider({
            label: "圆点缩放",
            min: 0.1,
            max: 3,
            step: 0.05,
            value: paramStore.get("baseScale"),
            onChange: () => {},
            paramKey: "baseScale",
            stage,
            ...commonWithLabel("baseScale", "圆点缩放"),
          }),
          createSlider({
            label: "间隙 %",
            min: 0,
            max: 100,
            step: 1,
            value: paramStore.get("gapPercent"),
            onChange: () => {},
            paramKey: "gapPercent",
            stage,
            ...commonWithLabel("gapPercent", "间隙 %"),
          }),
          createSlider({
            label: "渐变 0→1",
            min: 0,
            max: 1,
            step: 0.01,
            value: paramStore.get("blendValue"),
            onChange: () => {},
            paramKey: "blendValue",
            stage,
            ...commonWithLabel("blendValue", "渐变 0→1"),
          }),
          createSlider({
            label: "粒度2 圆心",
            min: 0,
            max: 1.5,
            step: 0.01,
            value: paramStore.get("offset2"),
            onChange: () => {},
            paramKey: "offset2",
            stage,
            ...commonWithLabel("offset2", "粒度2 圆心"),
          }),
        ],
      })
    );
    return { dispose: () => disposes.forEach((d) => d()) };
  }

  if (stage === "final") {
    container.appendChild(
      createSlider({
        label: "粘合阈值",
        min: 0.1,
        max: 3,
        step: 0.05,
        value: paramStore.get("threshold"),
        onChange: () => {},
        paramKey: "threshold",
        stage,
        ...commonWithLabel("threshold", "粘合阈值"),
      })
    );
    container.appendChild(
      createSlider({
        label: "边缘软化",
        min: 0,
        max: 2,
        step: 0.01,
        value: paramStore.get("soft"),
        onChange: () => {},
        paramKey: "soft",
        stage,
        ...commonWithLabel("soft", "边缘软化"),
      })
    );
    container.appendChild(
      createSlider({
        label: "边缘软化细度",
        min: 0.2,
        max: 3,
        step: 0.01,
        value: paramStore.get("softFineness"),
        onChange: () => {},
        paramKey: "softFineness",
        stage,
        ...commonWithLabel("softFineness", "边缘软化细度"),
      })
    );
    container.appendChild(
      createColorInput({
        label: "背景色",
        value: paramStore.get("bgColor"),
        onChange: () => {},
        paramKey: "bgColor",
        stage,
        ...commonWithLabel("bgColor", "背景色"),
      })
    );
    container.appendChild(
      createSlider({
        label: "原图颜色混合",
        min: 0,
        max: 1,
        step: 0.01,
        value: paramStore.get("useColorBlend"),
        onChange: () => {},
        paramKey: "useColorBlend",
        stage,
        ...commonWithLabel("useColorBlend", "原图颜色混合"),
      })
    );
    container.appendChild(
      createColorInput({
        label: "单色",
        value: paramStore.get("monoColor"),
        onChange: () => {},
        paramKey: "monoColor",
        stage,
        ...commonWithLabel("monoColor", "单色"),
      })
    );
    container.appendChild(
      createCheckbox({
        label: "亮度转透明度",
        checked: paramStore.get("lumaToAlpha"),
        onChange: () => {},
        paramKey: "lumaToAlpha",
        stage,
        ...commonWithLabel("lumaToAlpha", "亮度转透明度"),
      })
    );
    container.appendChild(
      createSlider({
        label: "亮度区间起点",
        min: 0,
        max: 1,
        step: 0.01,
        value: paramStore.get("lumaToAlphaEdge0"),
        onChange: () => {},
        paramKey: "lumaToAlphaEdge0",
        stage,
        ...commonWithLabel("lumaToAlphaEdge0", "亮度区间起点"),
      })
    );
    container.appendChild(
      createSlider({
        label: "亮度区间终点",
        min: 0,
        max: 1,
        step: 0.01,
        value: paramStore.get("lumaToAlphaEdge1"),
        onChange: () => {},
        paramKey: "lumaToAlphaEdge1",
        stage,
        ...commonWithLabel("lumaToAlphaEdge1", "亮度区间终点"),
      })
    );
    return { dispose: () => disposes.forEach((d) => d()) };
  }

  return { dispose: () => disposes.forEach((d) => d()) };
}
