/**
 * 调试页 UI：节点卡片 + 自定义参数控件（无 Tweakpane）
 */

export {
  createDebugNodeCard,
  applyChannelMask,
  applyRangeRemap,
  type DebugNodeCard,
  type CreateDebugNodeCardOptions,
  type ChannelState,
  type ChannelKey,
  type AlphaMode,
} from "./DebugNodeCard";

export {
  createStageControls,
  type CreateStageControlsOptions,
} from "./stage-controls";

export {
  createParamStore,
  type ParamStore,
} from "./paramStore";

export {
  createTimeline,
  type Timeline,
  type TimelineState,
  type TimelineTrack,
  type Keyframe,
  type Interpolation,
} from "./timeline";

export {
  createTimelinePresetsStore,
  loadPresetsFromFile,
  type TimelinePreset,
  type PresetsData,
  type TimelinePresetsStore,
} from "./timelinePresets";

export {
  createSlider,
  createNumberInput,
  createCheckbox,
  createColorInput,
  createButton,
  createFieldset,
  createSection,
  createSeparator,
  DRAG_PARAM_TYPE,
  type DragParamPayload,
} from "./controls";
