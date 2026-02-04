import {
  HalftoneProcessor,
  createHalftonePane,
  getDefaultHalftonePaneParams,
  toProcessorParams,
  type HalftonePaneParams,
  type HalftoneShaderSources,
} from "@/Halftone";

const DEFAULT_IMAGE_SRC = "/00042-2940631896.webp";

const PRESET_PARAMS: Partial<HalftonePaneParams> = {
  aniMax: 12,
  cycleTimeSec: 15.5,
  n: 8,
  n2: 9,
  blendValue: 0.01,
  offset2: 0.01,
  timeValue: 0.9,
  baseScale: 0.6,
  gapPercent: 10,
  contrast: 34,
  contrastOnlyLuma: false,
  threshold: 1,
  soft: 0.1,
  softFineness: 1,
  bgColor: "#111111",
  useColorBlend: 0.67,
  monoColor: "#ffffff",
  lumaToAlphaEdge0: 0,
  lumaToAlphaEdge1: 1,
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

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const paneContainer = document.getElementById("pane-container") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;

let processor: HalftoneProcessor | null = null;
let paneDispose: (() => void) | null = null;
let rafId: number | null = null;
let sourceImage: HTMLImageElement | null = null;

const params = {
  ...getDefaultHalftonePaneParams(PRESET_PARAMS),
  uploadBtn: () => fileInput.click(),
};

function render(): void {
  if (!sourceImage?.width || !processor) return;
  const resultCanvas = processor.render(sourceImage, toProcessorParams(params));
  if (!resultCanvas) return;
  canvas.width = resultCanvas.width;
  canvas.height = resultCanvas.height;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(resultCanvas, 0, 0);
}

function scheduleRender(): void {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    render();
  });
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

panelToggle.addEventListener("click", () => {
  const open = paneContainer.classList.toggle("hidden");
  panelToggle.textContent = open ? "面板" : "收起面板";
  panelToggle.setAttribute("aria-expanded", String(!open));
});

fileInput.addEventListener("change", onFileChange);

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

  const { dispose } = createHalftonePane(paneContainer, params, {
    onScheduleRender: scheduleRender,
    title: "Halftone 圆点",
    withAni: true,
    withUpload: true,
    uploadBtn: params.uploadBtn,
    autoPlay: true,
  });
  paneDispose = dispose;

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
  paneDispose?.();
});
