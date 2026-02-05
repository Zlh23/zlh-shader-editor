import {
  HalftoneProcessor,
  getDefaultHalftonePaneParams,
  toProcessorParams,
  type HalftoneRenderStage,
  type HalftoneShaderSources,
} from "@/Halftone";
import {
  createDebugNodeCard,
  createStageControls,
  createTimeline,
  createParamStore,
  createTimelinePresetsStore,
  applyChannelMask,
  applyRangeRemap,
  type DebugNodeCard,
} from "@/debug-ui";

const DEFAULT_IMAGE_SRC = "/00042-2940631896.webp";

const PIPELINE_STAGES: HalftoneRenderStage[] = ["source", "sat", "pass1", "final"];

const STAGE_CONFIG: { stage: HalftoneRenderStage; label: string; paramsContent?: string }[] = [
  { stage: "source", label: "原图" },
  { stage: "sat", label: "SAT (CPU)", paramsContent: "尺寸同原图" },
  { stage: "pass1", label: "Pass1" },
  { stage: "final", label: "Pass2" },
];

async function fetchShaderSources(): Promise<HalftoneShaderSources | null> {
  try {
    const [vertex, fragmentPass1, fragmentPass2] = await Promise.all([
      fetch("/shaders/vertex.vert").then((r) => r.text()),
      fetch("/shaders/fragmentPass1.frag").then((r) => r.text()),
      fetch("/shaders/fragmentPass2.frag").then((r) => r.text()),
    ]);
    return { vertex, fragmentPass1, fragmentPass2 };
  } catch (e) {
    console.error("Fetch shaders failed:", e);
    return null;
  }
}

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const reloadBtn = document.getElementById("reload-shaders") as HTMLButtonElement;
const pipelineEl = document.getElementById("pipeline") as HTMLElement;

document.body.classList.add("debug-page");

let processor: HalftoneProcessor | null = null;
const paneDisposes: (() => void)[] = [];
let rafId: number | null = null;
let sourceImage: HTMLImageElement | null = null;

const paramStore = createParamStore(getDefaultHalftonePaneParams());

function scheduleRender(): void {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
}

function render(): void {
  if (!sourceImage?.width || !processor || !cardsByStage) return;

  for (const stage of PIPELINE_STAGES) {
    const card = cardsByStage[stage];
    if (!card) continue;
    const resultCanvas = processor.render(
      sourceImage,
      toProcessorParams(paramStore.getParams()),
      stage
    );
    if (!resultCanvas) continue;
    const nodeCanvas = card.canvas;
    nodeCanvas.width = resultCanvas.width;
    nodeCanvas.height = resultCanvas.height;
    const ctx = nodeCanvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(resultCanvas, 0, 0);
    applyChannelMask(ctx, card.channelState);
    const { min, max } = card.rangeState;
    if (min !== 0 || max !== 255) {
      applyRangeRemap(ctx, min, max);
    }
  }
}

let cardsByStage: Record<HalftoneRenderStage, DebugNodeCard> | null = null;

function setReloadStatus(text: string): void {
  reloadBtn.textContent = text;
  if (text === "Reload Shaders") reloadBtn.disabled = false;
  else if (text === "加载中…") reloadBtn.disabled = true;
}

async function handleReloadShaders(): Promise<void> {
  if (!processor) return;
  setReloadStatus("加载中…");
  const sources = await fetchShaderSources();
  if (!sources) {
    setReloadStatus("重载失败");
    setTimeout(() => setReloadStatus("Reload Shaders"), 2000);
    return;
  }
  const ok = processor.reloadShaders(sources);
  setReloadStatus(ok ? "已重载" : "重载失败");
  if (ok) scheduleRender();
  setTimeout(() => setReloadStatus("Reload Shaders"), 2000);
}

function onFileChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      scheduleRender();
    };
    img.src = ev.target?.result as string;
  };
  reader.readAsDataURL(file);
}

reloadBtn.addEventListener("click", handleReloadShaders);
fileInput.addEventListener("change", onFileChange);

(async () => {
  const cards: DebugNodeCard[] = [];
  const byStage: Record<HalftoneRenderStage, DebugNodeCard> = {} as Record<
    HalftoneRenderStage,
    DebugNodeCard
  >;

  for (const config of STAGE_CONFIG) {
    const card = createDebugNodeCard({
      stage: config.stage,
      label: config.label,
      paramsContent: config.paramsContent,
      onScheduleRender: scheduleRender,
    });
    pipelineEl.appendChild(card.root);
    cards.push(card);
    byStage[config.stage] = card;
  }
  cardsByStage = byStage;

  const sources = await fetchShaderSources();
  if (!sources) {
    console.error("Could not load shaders");
    return;
  }
  processor = HalftoneProcessor.create(sources);
  if (!processor) {
    console.error("HalftoneProcessor.create failed");
    return;
  }

  const paramLabels = new Map<string, string>();
  const stageOptions = {
    onScheduleRender: scheduleRender,
    uploadBtn: () => fileInput.click(),
    registerParamLabel: (paramKey: string, label: string) => paramLabels.set(paramKey, label),
  };
  const stages: HalftoneRenderStage[] = ["source", "sat", "pass1", "final"];
  for (const stage of stages) {
    const container = byStage[stage].paramsContainer;
    const { dispose } = createStageControls(
      container,
      paramStore,
      stage,
      stageOptions
    );
    paneDisposes.push(dispose);
  }

  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    sourceImage = img;
    scheduleRender();
  };
  img.src = DEFAULT_IMAGE_SRC;

  const globalInfoBody = document.querySelector(".global-info-card__body");
  if (globalInfoBody) {
    globalInfoBody.textContent = "";
    const presetsStore = createTimelinePresetsStore();
    await presetsStore.init();

    let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const AUTO_SAVE_DELAY_MS = 2000;
    function scheduleAutoSave(): void {
      if (autoSaveTimer != null) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        const id = presetsStore.getCurrentPresetId();
        if (id) presetsStore.savePreset(id, timeline.getState());
      }, AUTO_SAVE_DELAY_MS);
    }

    const timeline = createTimeline({
      paramStore,
      onScheduleRender: scheduleRender,
      getLabelForParamKey: (k) => paramLabels.get(k) ?? k,
      onStateChange: scheduleAutoSave,
    });

    const toolbar = timeline.root.querySelector(".timeline__toolbar") as HTMLElement;
    if (toolbar) {
      const presetWrap = document.createElement("div");
      presetWrap.className = "timeline__toolbar-presets";
      const presetLabel = document.createElement("label");
      presetLabel.className = "timeline__toolbar-presets-label";
      presetLabel.textContent = "预设";
      const comboWrap = document.createElement("div");
      comboWrap.className = "timeline__toolbar-presets-combo";
      const presetInput = document.createElement("input");
      presetInput.type = "text";
      presetInput.className = "timeline__toolbar-presets-input";
      presetInput.setAttribute("aria-label", "预设名称，可输入或从列表选择");
      presetInput.placeholder = "输入或选择预设名";
      const listTrigger = document.createElement("button");
      listTrigger.type = "button";
      listTrigger.className = "timeline__toolbar-presets-trigger";
      listTrigger.textContent = "▼";
      listTrigger.setAttribute("aria-label", "选择已有预设");
      const listDrop = document.createElement("div");
      listDrop.className = "timeline__toolbar-presets-list";
      listDrop.hidden = true;
      function refreshPresetList(): void {
        listDrop.textContent = "";
        for (const p of presetsStore.getPresets()) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "timeline__toolbar-presets-list-item";
          item.textContent = p.name;
          item.addEventListener("click", () => {
            presetInput.value = p.name;
            listDrop.hidden = true;
          });
          listDrop.appendChild(item);
        }
      }
      listTrigger.addEventListener("click", () => {
        refreshPresetList();
        listDrop.hidden = !listDrop.hidden;
      });
      document.addEventListener("click", (e) => {
        if (!comboWrap.contains(e.target as Node)) listDrop.hidden = true;
      });
      comboWrap.appendChild(presetInput);
      comboWrap.appendChild(listTrigger);
      comboWrap.appendChild(listDrop);

      function loadPresetByName(): void {
        const name = presetInput.value.trim();
        if (!name) return;
        const p = presetsStore.getPresets().find((x) => x.name === name);
        if (p) {
          presetsStore.setCurrentPresetId(p.id);
          timeline.loadState(p.state);
        } else {
          window.alert(`未找到预设「${name}」`);
        }
      }
      function saveToCurrentName(): void {
        const name = presetInput.value.trim() || "未命名";
        const p = presetsStore.getPresets().find((x) => x.name === name);
        if (p) {
          presetsStore.savePreset(p.id, timeline.getState());
          presetsStore.setCurrentPresetId(p.id);
        } else {
          const id = presetsStore.saveAsNewPreset(name, timeline.getState());
          presetsStore.setCurrentPresetId(id);
        }
        refreshPresetList();
      }

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "timeline__btn";
      loadBtn.textContent = "加载";
      loadBtn.setAttribute("aria-label", "加载当前名称对应的预设");
      loadBtn.addEventListener("click", loadPresetByName);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "timeline__btn";
      saveBtn.textContent = "保存";
      saveBtn.setAttribute("aria-label", "保存到当前名称（覆盖或新建）");
      saveBtn.addEventListener("click", saveToCurrentName);

      presetWrap.appendChild(presetLabel);
      presetWrap.appendChild(comboWrap);
      presetWrap.appendChild(loadBtn);
      presetWrap.appendChild(saveBtn);
      toolbar.insertBefore(presetWrap, toolbar.firstChild);
    }

    const currentId = presetsStore.getCurrentPresetId();
    const currentPreset = currentId
      ? presetsStore.getPresets().find((x) => x.id === currentId)
      : null;
    if (currentPreset) {
      timeline.loadState(currentPreset.state);
      const input = timeline.root.querySelector(
        ".timeline__toolbar-presets-input"
      ) as HTMLInputElement;
      if (input) input.value = currentPreset.name;
    }

    globalInfoBody.appendChild(timeline.root);
    paneDisposes.push(() => timeline.dispose());
  }
})();

window.addEventListener("beforeunload", () => {
  if (rafId != null) cancelAnimationFrame(rafId);
  processor?.dispose();
  for (const d of paneDisposes) d();
});
