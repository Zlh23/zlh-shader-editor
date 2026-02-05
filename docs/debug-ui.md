# debug-ui 模块用法

`src/debug-ui/` 提供 Shader 调试页所需的 UI 组件与状态管理，不依赖 Tweakpane，纯 DOM + TypeScript。

## 包概览

从 `@/debug-ui`（即 `src/debug-ui/index.ts`）可导入：

- **节点卡片**：`createDebugNodeCard`、`applyChannelMask`、`applyRangeRemap`、类型 `DebugNodeCard`、`ChannelState`、`AlphaMode` 等
- **阶段控件**：`createStageControls`、`CreateStageControlsOptions`
- **参数存储**：`createParamStore`、`ParamStore`
- **时间轴**：`createTimeline`、`Timeline`、`TimelineState`、`TimelineTrack`、`Keyframe`、`Interpolation`
- **预设**：`createTimelinePresetsStore`、`loadPresetsFromFile`、`TimelinePreset`、`PresetsData`、`TimelinePresetsStore`
- **控件**：`createSlider`、`createCheckbox`、`createColorInput`、`createNumberInput`、`createButton`、`createFieldset`、`createSection`、`createSeparator`、`DRAG_PARAM_TYPE`、`DragParamPayload`

---

## ParamStore

单一数据源，存放 Halftone 参数，与 UI 分离。

- **创建**：`createParamStore(initial: HalftonePaneParams)`，返回 `ParamStore`。
- **读**：`getParams()` 取完整对象，`get(key)` 取单键。
- **写**：`set(key, value)`；写 `blendValue` 时会自动更新 `offset2`。
- **订阅**：`subscribe(key, fn)` 监听某键变化；`subscribeToSet(fn)` 监听任意一次 set（参数名回调）。
- **“已改变”状态**（用于时间轴与关键帧）：`getChangedKeys()`、`setChangedKeys(Set)`、`subscribeChangedKeys(fn)`。时间轴会根据当前时间插值计算“应与参数一致”的值，不一致的键会放入 changedKeys，控件据此高亮。

---

## Controls（控件）

`createSlider`、`createCheckbox`、`createColorInput`、`createNumberInput` 等。

- **无 ParamStore**：传入 `value`、`onChange` 等，行为与普通表单控件一致。
- **带 ParamStore**：传入 `paramStore`、`paramKey`、`onScheduleRender`、`registerDispose` 时，控件从 store 初值渲染，用户操作时调用 `paramStore.set`，并订阅 store 以同步更新；同时订阅 `subscribeChangedKeys`，在 changedKeys 包含该 paramKey 时加上 `debug-control--changed` 类（如黄色背景）。
- **拖拽到时间轴**：传入 `dragPayload: { paramKey, label, stage? }`（或通过 options 中的 `paramKey` + `label`）时，标签可拖拽；时间轴通过 `DRAG_PARAM_TYPE` 和 `JSON.parse(e.dataTransfer.getData(DRAG_PARAM_TYPE))` 得到 `DragParamPayload` 并添加轨道。

---

## StageControls

`createStageControls(container, paramStore, stage, options)` 在指定容器内为某一阶段（source / pass1 / final 等）创建一组合适的控件（滑块、颜色、复选框等），并注入 `paramStore`、`onScheduleRender`、`registerDispose`。

- **options**：`onScheduleRender`、`uploadBtn`（可选）、`registerParamLabel(paramKey, label)`（可选）。若提供 `registerParamLabel`，每个参数在创建控件时会回调一次，便于页面收集 `paramKey → label` 映射，供时间轴 `getLabelForParamKey` 使用。

---

## Timeline

`createTimeline(config)` 返回带 `root` 的 `Timeline` 实例。

- **config**：`paramStore`、`onScheduleRender` 必填；`duration`、`frameStep`、`onTrackSelect`、`getLabelForParamKey`、`onStateChange` 可选。`getLabelForParamKey` 用于轨道标签与自动加轨道时的名称；`onStateChange` 在 setTime、addTrack、removeTrack、updateTrack 时调用，可用于防抖写入预设。
- **返回值**：`root`（挂到 DOM）、`getState()`、`loadState(state)`、`setTime(t)`、`play()`、`pause()`、`addTrack()`、`removeTrack()`、`getTrack()`、`updateTrack()`、`applyKeyframes(t)`、`dispose()`。`loadState` 会替换 duration、tracks、currentTime 等并刷新标尺与轨道 UI。
- **行为**：播放时按当前时间对每条轨道插值，将结果写回 `paramStore`；轨道无关键帧时该参数会视为“已改变”。工具栏吸附会对 setTime 与播放头拖拽生效。

---

## TimelinePresetsStore

`createTimelinePresetsStore()` 返回预设存储实例。

- **init()**：异步。优先请求 `/presets.json`，成功则用其覆盖内存与 localStorage；失败则沿用 localStorage。
- **getPresets()**、**getCurrentPresetId()**、**getCurrentPreset()**、**setCurrentPresetId(id)**：读写当前列表与当前选中 id。
- **savePreset(id, state)**：覆盖指定 id 的预设并写入 localStorage；开发环境下会 POST `/api/presets` 写入 `public/presets.json`。
- **saveAsNewPreset(name, state)**：新增预设并设为当前，同样会触发写文件（开发环境）。
- **renamePreset(id, name)**：重命名指定预设并持久化。
- **exportToJSON()**、**importFromJSON(json)**：导出/导入 JSON 字符串（当前 Shader 调试页未暴露导入/导出按钮，但 API 保留）。

---

## DebugNodeCard

`createDebugNodeCard(options)` 创建单张管线节点卡片（画布 + 参数容器 + 通道按钮 + 范围条）。

- **options**：`stage`、`label`、`paramsContent`（可选说明）、`onScheduleRender` 等。
- **返回**：`root`、`canvas`、`paramsContainer`、`channelState`、`rangeState`、`dispose`。渲染由页面负责（如把 Halftone 输出画到 `canvas`）；`applyChannelMask(ctx, channelState)`、`applyRangeRemap(ctx, min, max)` 可在绘制后对同一 canvas 的 2D 上下文做通道遮罩与范围映射。

---

## 在 Shader 调试页中的集成方式

参考 `src/pages/shader-debug.ts`：

1. 使用 `createParamStore(getDefaultHalftonePaneParams())` 创建全局参数存储。
2. 为每个阶段调用 `createStageControls(container, paramStore, stage, { onScheduleRender, uploadBtn, registerParamLabel })`，用 `registerParamLabel` 收集 `paramLabels: Map<string, string>`。
3. 使用 `createDebugNodeCard` 为各阶段创建卡片，把 Halftone 渲染结果画到卡片 `canvas`，并按需调用 `applyChannelMask`、`applyRangeRemap`。
4. 使用 `createTimeline({ paramStore, onScheduleRender, getLabelForParamKey: k => paramLabels.get(k) ?? k, onStateChange })` 创建时间轴，将 `timeline.root` 挂到「时间轴」卡片内；在 `onStateChange` 中做防抖并调用预设 store 的保存（如保存到当前名称）。
5. 使用 `createTimelinePresetsStore()`，先 `await presetsStore.init()`，再在时间轴工具栏前插入预设 UI（输入框 + ▼ 列表 + 加载 + 保存），按名称加载时调用 `timeline.loadState(preset.state)`，保存时根据输入框名称调用 `savePreset` 或 `saveAsNewPreset`。

更细的时间轴/预设数据与文件 API 约定见 [时间轴与预设](时间轴与预设.md)、[预设文件与 API](预设文件与API.md)。
