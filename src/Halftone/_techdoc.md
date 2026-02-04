# Halftone - 技术文档

## 概述

Halftone 提供 WebGL 圆点半调处理：`HalftoneProcessor` 与一次性 `renderHalftone`，以及 Tweakpane 面板 `createHalftonePane`、默认参数 `getDefaultHalftonePaneParams`、参数转换 `toProcessorParams`。着色器源码由调用方传入（通常从 `/shaders/*.vert`、`/shaders/*.frag` fetch），便于 Reload Shaders。

## 依赖

- 项目内：无
- 外部：`tweakpane`（仅使用面板时）

## API

### HalftoneProcessor

| 方法 | 说明 |
|------|------|
| `static create(sources: HalftoneShaderSources): HalftoneProcessor \| null` | 创建处理器，需传入 vertex / fragmentPass1 / fragmentPass2 源码 |
| `render(image, params, stage?): HTMLCanvasElement \| null` | 渲染；stage 可选 final / pass1 / source |
| `reloadShaders(sources): boolean` | 重新编译 Pass1/Pass2 着色器 |
| `dispose()` | 释放 WebGL 资源 |

### renderHalftone

```ts
function renderHalftone(
  image: HTMLImageElement | HTMLCanvasElement,
  params: HalftoneProcessorParams,
  sources: HalftoneShaderSources
): HTMLCanvasElement | null;
```

一次性渲染，无实例复用。连续多次渲染请用 `HalftoneProcessor.create(sources)` + `.render()`。

### createHalftonePane

在 `container` 上挂载 Tweakpane，绑定 `params`（就地修改）。选项含 `onScheduleRender`、`withAni`、`withUpload`、`uploadBtn`、`effectToggle`、`autoPlay` 等。

### 类型

- `HalftoneShaderSources`：{ vertex, fragmentPass1, fragmentPass2 } 字符串
- `HalftoneProcessorParams`：处理器参数
- `HalftonePaneParams`：在处理器参数基础上增加 `timeValue`、`aniMax`、`cycleTimeSec?`
- `HalftoneRenderStage`：`"source"` | `"sat"` | `"pass1"` | `"final"`

## 管线简述

1. **输入**：图片居中裁成 2^n 正方形，CPU 建 RGB SAT，上传为浮点纹理。
2. **Pass1**：按 SAT 取格子平均 RGB，算亮度与对比度，双粒度圆点场叠加，输出 field + 颜色到 FBO。
3. **Pass2**：smoothstep 得到圆点内外，混背景色与圆点色，可选 lumaToAlpha，输出 RGBA。

## 样式

- 半调效果无内置样式；画布与 Tweakpane 布局由使用方自行编写。
