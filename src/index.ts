/**
 * 主入口：仅导出 Halftone 模块，供按需使用。
 * 调试页挂载请使用 initShaderDebug：import { initShaderDebug } from 'zlh-realtime-shader-editor/plugin'
 */

export { HalftoneProcessor, renderHalftone, createHalftonePane, getDefaultHalftonePaneParams, toProcessorParams, blendToOffset2 } from "./Halftone";
export type {
  HalftoneProcessorParams,
  HalftoneRenderStage,
  HalftoneShaderSources,
  HalftonePaneParams,
  CreateHalftonePaneOptions,
} from "./Halftone";
