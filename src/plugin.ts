/**
 * 插件入口：供 Next.js 或其他宿主挂载 Shader 调试 UI。
 * 将调试页逻辑封装为 initShaderDebug(container, options)，返回 dispose 便于卸载。
 */

import {
  HalftoneProcessor,
  createHalftonePane,
  getDefaultHalftonePaneParams,
  toProcessorParams,
  type HalftonePaneParams,
  type HalftoneRenderStage,
  type HalftoneShaderSources,
} from "./Halftone";

export type { HalftoneProcessorParams, HalftoneRenderStage, HalftoneShaderSources } from "./Halftone";
export { HalftoneProcessor, createHalftonePane, getDefaultHalftonePaneParams, toProcessorParams } from "./Halftone";
export type { HalftonePaneParams, CreateHalftonePaneOptions } from "./Halftone";

export interface ShaderDebugPluginOptions {
  /** 着色器请求基础路径，如 '/shaders' 或 '/api/shaders'，会请求 ${base}/vertex.vert 等 */
  shaderBaseUrl: string;
  /** 默认展示的图片 URL */
  defaultImageSrc?: string;
  /** 面板标题 */
  paneTitle?: string;
}

const DEFAULT_IMAGE_SRC = "/00042-2940631896.webp";

/**
 * 在 container 内挂载完整 Shader 调试 UI（画布 + 阶段切换 + Reload + Tweakpane），返回 dispose 用于卸载。
 * 可在 Next.js 页面中：useRef 一个 div，useEffect 里 initShaderDebug(ref.current, options)，卸载时调用 dispose()。
 */
export function initShaderDebug(
  container: HTMLElement,
  options: ShaderDebugPluginOptions
): { dispose: () => void } {
  const {
    shaderBaseUrl,
    defaultImageSrc = DEFAULT_IMAGE_SRC,
    paneTitle = "Halftone 调试",
  } = options;

  const base = shaderBaseUrl.replace(/\/$/, "");

  async function fetchShaderSources(): Promise<HalftoneShaderSources | null> {
    try {
      const [vertex, fragmentPass1, fragmentPass2] = await Promise.all([
        fetch(`${base}/vertex.vert`).then((r) => r.text()),
        fetch(`${base}/fragmentPass1.frag`).then((r) => r.text()),
        fetch(`${base}/fragmentPass2.frag`).then((r) => r.text()),
      ]);
      return { vertex, fragmentPass1, fragmentPass2 };
    } catch (e) {
      console.error("Fetch shaders failed:", e);
      return null;
    }
  }

  const root = document.createElement("div");
  root.className = "shader-debug-plugin";
  root.style.cssText = "min-height:100vh;display:flex;flex-direction:column;background:#e5e5e5;";

  const header = document.createElement("header");
  header.style.cssText = "display:flex;align-items:center;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid #d4d4d4;background:rgba(255,255,255,.9);flex-shrink:0;";
  const title = document.createElement("h1");
  title.textContent = "Shader 调试";
  title.style.cssText = "font-size:1.125rem;font-weight:600;margin:0;";
  const stageLabel = document.createElement("label");
  stageLabel.style.cssText = "display:flex;align-items:center;gap:.5rem;font-size:.875rem;color:#525252;";
  const stageSelect = document.createElement("select");
  stageSelect.innerHTML = '<option value="source">原图</option><option value="sat">SAT</option><option value="pass1">Pass1</option><option value="final">最终</option>';
  stageSelect.style.cssText = "border-radius:4px;border:1px solid #d4d4d4;padding:.25rem .5rem;font-size:.875rem;";
  stageLabel.append("阶段", stageSelect);
  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload Shaders";
  reloadBtn.type = "button";
  reloadBtn.style.cssText = "padding:.375rem .75rem;border-radius:6px;background:#404040;color:#f5f5f5;border:none;font-size:.875rem;cursor:pointer;";
  header.append(title, stageLabel, reloadBtn);

  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "flex:1;display:flex;justify-content:center;align-items:center;padding:1rem;min-height:0;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "max-height:100%;max-width:100%;border-radius:8px;border:1px solid #d4d4d4;";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
  canvasWrap.append(canvas, fileInput);

  const paneContainer = document.createElement("div");
  paneContainer.style.cssText = "position:fixed;right:1rem;top:1rem;z-index:10;border-radius:8px;border:1px solid #d4d4d4;background:#fff;padding:.5rem;box-shadow:0 1px 3px rgba(0,0,0,.1);max-height:calc(100vh - 2rem);overflow:auto;";

  const panelToggle = document.createElement("button");
  panelToggle.textContent = "收起面板";
  panelToggle.type = "button";
  panelToggle.setAttribute("aria-expanded", "true");
  panelToggle.style.cssText = "position:fixed;bottom:1rem;right:22rem;z-index:110;padding:.375rem .75rem;border-radius:6px;background:#404040;color:#f5f5f5;border:none;font-size:.875rem;cursor:pointer;";

  container.appendChild(root);
  root.append(header, canvasWrap);
  container.appendChild(paneContainer);
  container.appendChild(panelToggle);

  let processor: HalftoneProcessor | null = null;
  let paneDispose: (() => void) | null = null;
  let rafId: number | null = null;
  let sourceImage: HTMLImageElement | null = null;
  let currentStage: HalftoneRenderStage = "final";

  const params: HalftonePaneParams & { uploadBtn: () => void } = {
    ...getDefaultHalftonePaneParams(),
    uploadBtn: () => fileInput.click(),
  };

  function render(): void {
    if (!sourceImage?.width || !processor) return;
    const resultCanvas = processor.render(sourceImage, toProcessorParams(params), currentStage);
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

  function setReloadStatus(text: string): void {
    reloadBtn.textContent = text;
    reloadBtn.disabled = text === "加载中…";
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

  stageSelect.addEventListener("change", () => {
    currentStage = stageSelect.value as HalftoneRenderStage;
    scheduleRender();
  });
  reloadBtn.addEventListener("click", handleReloadShaders);
  panelToggle.addEventListener("click", () => {
    const open = paneContainer.style.display === "none";
    paneContainer.style.display = open ? "" : "none";
    panelToggle.textContent = open ? "收起面板" : "参数面板";
    panelToggle.style.right = open ? "22rem" : "1rem";
    panelToggle.setAttribute("aria-expanded", String(open));
  });
  fileInput.addEventListener("change", onFileChange);

  (async () => {
    const sources = await fetchShaderSources();
    if (!sources) return;
    processor = HalftoneProcessor.create(sources);
    if (!processor) return;
    const { dispose } = createHalftonePane(paneContainer, params, {
      onScheduleRender: scheduleRender,
      title: paneTitle,
      withAni: false,
      withUpload: true,
      uploadBtn: params.uploadBtn,
    });
    paneDispose = dispose;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      sourceImage = img;
      scheduleRender();
    };
    img.src = defaultImageSrc;
  })();

  return {
    dispose() {
      if (rafId != null) cancelAnimationFrame(rafId);
      processor?.dispose();
      paneDispose?.();
      root.remove();
      paneContainer.remove();
      panelToggle.remove();
    },
  };
}
