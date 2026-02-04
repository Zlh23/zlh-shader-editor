import {
  HalftoneProcessor,
  createStagePane,
  getDefaultHalftonePaneParams,
  toProcessorParams,
  type HalftonePaneParams,
  type HalftoneRenderStage,
  type HalftoneShaderSources,
  type StagePaneStage,
} from "@/Halftone";

const DEFAULT_IMAGE_SRC = "/00042-2940631896.webp";

const PIPELINE_STAGES: HalftoneRenderStage[] = ["source", "sat", "pass1", "final"];

type ChannelKey = "r" | "g" | "b" | "a";
const CHANNELS: ChannelKey[] = ["r", "g", "b", "a"];

/** 每个阶段卡片的通道显示状态，默认全选 */
function createDefaultChannelState(): Record<ChannelKey, boolean> {
  return { r: true, g: true, b: true, a: true };
}
const channelState: Record<HalftoneRenderStage, Record<ChannelKey, boolean>> = {
  source: createDefaultChannelState(),
  sat: createDefaultChannelState(),
  pass1: createDefaultChannelState(),
  final: createDefaultChannelState(),
};

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

const paneContainers: Record<StagePaneStage, HTMLElement> = {
  source: document.getElementById("pane-source") as HTMLElement,
  sat: document.getElementById("pane-sat") as HTMLElement,
  pass1: document.getElementById("pane-pass1") as HTMLElement,
  final: document.getElementById("pane-final") as HTMLElement,
};

const nodeCanvases: Record<HalftoneRenderStage, HTMLCanvasElement> = {
  source: document.getElementById("node-source") as HTMLCanvasElement,
  sat: document.getElementById("node-sat") as HTMLCanvasElement,
  pass1: document.getElementById("node-pass1") as HTMLCanvasElement,
  final: document.getElementById("node-final") as HTMLCanvasElement,
};

document.body.classList.add("debug-page");

let processor: HalftoneProcessor | null = null;
const paneDisposes: (() => void)[] = [];
let rafId: number | null = null;
let sourceImage: HTMLImageElement | null = null;

const params: HalftonePaneParams & { uploadBtn: () => void } = {
  ...getDefaultHalftonePaneParams(),
  uploadBtn: () => fileInput.click(),
};

/** 根据当前通道选择对 canvas 的像素应用通道遮罩 */
function applyChannelMask(
  ctx: CanvasRenderingContext2D,
  mask: Record<ChannelKey, boolean>
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (!mask.r) data[i] = 0;
    if (!mask.g) data[i + 1] = 0;
    if (!mask.b) data[i + 2] = 0;
    if (!mask.a) data[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

function render(): void {
  if (!sourceImage?.width || !processor) return;

  for (const stage of PIPELINE_STAGES) {
    const resultCanvas = processor.render(sourceImage, toProcessorParams(params), stage);
    const nodeCanvas = nodeCanvases[stage];
    if (!resultCanvas || !nodeCanvas) continue;
    nodeCanvas.width = resultCanvas.width;
    nodeCanvas.height = resultCanvas.height;
    const ctx = nodeCanvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(resultCanvas, 0, 0);
    applyChannelMask(ctx, channelState[stage]);
  }
}

function scheduleRender(): void {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
}

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

function bindChannelButtons(): void {
  document.querySelectorAll<HTMLElement>(".node[data-stage]").forEach((node) => {
    const stage = node.getAttribute("data-stage") as HalftoneRenderStage;
    if (!PIPELINE_STAGES.includes(stage)) return;
    const state = channelState[stage];
    node.querySelectorAll<HTMLButtonElement>(".channel-btn[data-channel]").forEach((btn) => {
      const ch = btn.getAttribute("data-channel") as ChannelKey;
      if (!CHANNELS.includes(ch)) return;
      btn.addEventListener("click", () => {
        state[ch] = !state[ch];
        btn.classList.toggle("active", state[ch]);
        scheduleRender();
      });
    });
  });
}

reloadBtn.addEventListener("click", handleReloadShaders);
fileInput.addEventListener("change", onFileChange);
bindChannelButtons();

(async () => {
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

  const stageOptions = {
    onScheduleRender: scheduleRender,
    uploadBtn: params.uploadBtn,
  };
  const stages: StagePaneStage[] = ["source", "sat", "pass1", "final"];
  for (const stage of stages) {
    const { dispose } = createStagePane(paneContainers[stage], params, stage, stageOptions);
    paneDisposes.push(dispose);
  }

  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    sourceImage = img;
    scheduleRender();
  };
  img.src = DEFAULT_IMAGE_SRC;
})();

window.addEventListener("beforeunload", () => {
  if (rafId != null) cancelAnimationFrame(rafId);
  processor?.dispose();
  for (const d of paneDisposes) d();
});
