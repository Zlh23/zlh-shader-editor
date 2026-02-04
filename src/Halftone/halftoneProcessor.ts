/**
 * WebGL 半调处理：输入图片 + 参数，输出处理后的 canvas。
 * 着色器源码由调用方传入（可从 public/shaders/  fetch），便于 Reload Shaders。
 */

import { FIELD_SCALE, NEIGHBOR_SIZE, type HalftoneProcessorParams, type LocPass1, type LocPass2 } from "./halftoneTypes";
import { hexToRgb, buildSatRgbInto } from "./satRgb";
import { compileShader, createProgram } from "./halftoneGl";

export type { HalftoneProcessorParams } from "./halftoneTypes";

/** 渲染阶段：原图 / CPU SAT / Pass1 / Pass2 最终 */
export type HalftoneRenderStage = "source" | "sat" | "pass1" | "final";

export interface HalftoneShaderSources {
  vertex: string;
  fragmentPass1: string;
  fragmentPass2: string;
}

const BLIT_FRAG = `precision mediump float;
uniform sampler2D uTex;
uniform float uFlipY;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY));
  gl_FragColor = texture2D(uTex, uv);
}
`;

const VERTEX_SHARED = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** 将 float SAT 纹理按 scale 归一化后显示（并可选 flipY） */
const BLIT_SAT_FRAG = `precision mediump float;
uniform sampler2D uTex;
uniform float uScale;
uniform float uFlipY;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY));
  vec4 s = texture2D(uTex, uv);
  vec3 n = clamp(s.rgb * uScale, 0.0, 1.0);
  gl_FragColor = vec4(n, 1.0);
}
`;

interface LocBlit {
  uTex: WebGLUniformLocation | null;
  uFlipY: WebGLUniformLocation | null;
  aPosition: number;
}

interface LocBlitSat {
  uTex: WebGLUniformLocation | null;
  uScale: WebGLUniformLocation | null;
  uFlipY: WebGLUniformLocation | null;
  aPosition: number;
}

export class HalftoneProcessor {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private programPass1: WebGLProgram;
  private programPass2: WebGLProgram;
  private loc1: LocPass1;
  private loc2: LocPass2;
  private readonly programBlit: WebGLProgram;
  private readonly locBlit: LocBlit;
  private readonly programBlitSat: WebGLProgram;
  private readonly locBlitSat: LocBlitSat;
  private readonly quadBuf: WebGLBuffer;
  private satTex: WebGLTexture | null = null;
  private fbTex: WebGLTexture | null = null;
  private fb: WebGLFramebuffer | null = null;
  private sourceTex: WebGLTexture | null = null;
  private cropCanvas: HTMLCanvasElement | null = null;
  private cropCtx: CanvasRenderingContext2D | null = null;
  private currentSize = 0;
  private satBuffer: Float32Array | null = null;
  private lastImage: HTMLImageElement | HTMLCanvasElement | null = null;
  private lastSize = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    programPass1: WebGLProgram,
    programPass2: WebGLProgram,
    programBlit: WebGLProgram,
    locBlit: LocBlit,
    programBlitSat: WebGLProgram,
    locBlitSat: LocBlitSat,
    quadBuf: WebGLBuffer,
    loc1: LocPass1,
    loc2: LocPass2
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.programPass1 = programPass1;
    this.programPass2 = programPass2;
    this.programBlit = programBlit;
    this.locBlit = locBlit;
    this.programBlitSat = programBlitSat;
    this.locBlitSat = locBlitSat;
    this.quadBuf = quadBuf;
    this.loc1 = loc1;
    this.loc2 = loc2;
  }

  private static buildLocations(
    gl: WebGLRenderingContext,
    programPass1: WebGLProgram,
    programPass2: WebGLProgram
  ): { loc1: LocPass1; loc2: LocPass2 } {
    const loc1: LocPass1 = {
      uSize: gl.getUniformLocation(programPass1, "uSize"),
      uSizeP1: gl.getUniformLocation(programPass1, "uSizeP1"),
      uStep1: gl.getUniformLocation(programPass1, "uStep1"),
      uStep2: gl.getUniformLocation(programPass1, "uStep2"),
      uArea1: gl.getUniformLocation(programPass1, "uArea1"),
      uArea2: gl.getUniformLocation(programPass1, "uArea2"),
      uRadiusScale1: gl.getUniformLocation(programPass1, "uRadiusScale1"),
      uRadiusScale2: gl.getUniformLocation(programPass1, "uRadiusScale2"),
      uFieldScale: gl.getUniformLocation(programPass1, "uFieldScale"),
      uNeighborRadius1: gl.getUniformLocation(programPass1, "uNeighborRadius1"),
      uNeighborRadius2: gl.getUniformLocation(programPass1, "uNeighborRadius2"),
      uBlendValue: gl.getUniformLocation(programPass1, "uBlendValue"),
      uOffset2: gl.getUniformLocation(programPass1, "uOffset2"),
      uContrast: gl.getUniformLocation(programPass1, "uContrast"),
      uContrastOnlyLuma: gl.getUniformLocation(programPass1, "uContrastOnlyLuma"),
      uSatTexture: gl.getUniformLocation(programPass1, "uSatTexture"),
      aPosition: gl.getAttribLocation(programPass1, "aPosition"),
    };
    const loc2: LocPass2 = {
      uFieldScale: gl.getUniformLocation(programPass2, "uFieldScale"),
      uThreshold: gl.getUniformLocation(programPass2, "uThreshold"),
      uSoft: gl.getUniformLocation(programPass2, "uSoft"),
      uSoftFineness: gl.getUniformLocation(programPass2, "uSoftFineness"),
      uBgColor: gl.getUniformLocation(programPass2, "uBgColor"),
      uUseColorBlend: gl.getUniformLocation(programPass2, "uUseColorBlend"),
      uMonoColor: gl.getUniformLocation(programPass2, "uMonoColor"),
      uLumaToAlpha: gl.getUniformLocation(programPass2, "uLumaToAlpha"),
      uLumaToAlphaEdge0: gl.getUniformLocation(programPass2, "uLumaToAlphaEdge0"),
      uLumaToAlphaEdge1: gl.getUniformLocation(programPass2, "uLumaToAlphaEdge1"),
      uPass1Texture: gl.getUniformLocation(programPass2, "uPass1Texture"),
      aPosition: gl.getAttribLocation(programPass2, "aPosition"),
    };
    return { loc1, loc2 };
  }

  /**
   * 创建处理器实例。着色器源码由调用方传入（如从 /shaders/*.vert、.frag fetch）。
   * 要求环境支持 OES_texture_float。失败时返回 null。
   */
  static create(sources: HalftoneShaderSources): HalftoneProcessor | null {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { alpha: true });
    if (!gl) return null;
    const ext = gl.getExtension("OES_texture_float");
    if (!ext) {
      console.warn("OES_texture_float not supported");
      return null;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, sources.vertex);
    const fs1 = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragmentPass1);
    const fs2 = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragmentPass2);
    const vsBlit = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHARED);
    const fsBlit = compileShader(gl, gl.FRAGMENT_SHADER, BLIT_FRAG);
    const fsBlitSat = compileShader(gl, gl.FRAGMENT_SHADER, BLIT_SAT_FRAG);
    if (!vs || !fs1 || !fs2 || !vsBlit || !fsBlit || !fsBlitSat) return null;

    const programPass1 = createProgram(gl, vs, fs1);
    const programPass2 = createProgram(gl, vs, fs2);
    const programBlit = createProgram(gl, vsBlit, fsBlit);
    const programBlitSat = createProgram(gl, vsBlit, fsBlitSat);
    if (!programPass1 || !programPass2 || !programBlit || !programBlitSat) return null;

    gl.deleteShader(vs);
    gl.deleteShader(fs1);
    gl.deleteShader(fs2);
    gl.deleteShader(vsBlit);
    gl.deleteShader(fsBlit);
    gl.deleteShader(fsBlitSat);

    const { loc1, loc2 } = HalftoneProcessor.buildLocations(gl, programPass1, programPass2);
    const locBlit: LocBlit = {
      uTex: gl.getUniformLocation(programBlit, "uTex"),
      uFlipY: gl.getUniformLocation(programBlit, "uFlipY"),
      aPosition: gl.getAttribLocation(programBlit, "aPosition"),
    };
    const locBlitSat: LocBlitSat = {
      uTex: gl.getUniformLocation(programBlitSat, "uTex"),
      uScale: gl.getUniformLocation(programBlitSat, "uScale"),
      uFlipY: gl.getUniformLocation(programBlitSat, "uFlipY"),
      aPosition: gl.getAttribLocation(programBlitSat, "aPosition"),
    };

    const quadBuf = gl.createBuffer();
    if (!quadBuf) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return new HalftoneProcessor(canvas, gl, programPass1, programPass2, programBlit, locBlit, programBlitSat, locBlitSat, quadBuf, loc1, loc2);
  }

  private ensureSize(size: number): void {
    if (size === this.currentSize) return;
    const gl = this.gl;

    if (this.satTex) gl.deleteTexture(this.satTex);
    this.satTex = null;
    if (this.fbTex) gl.deleteTexture(this.fbTex);
    this.fbTex = null;
    if (this.fb) gl.deleteFramebuffer(this.fb);
    this.fb = null;
    if (this.sourceTex) gl.deleteTexture(this.sourceTex);
    this.sourceTex = null;
    this.cropCanvas = null;
    this.cropCtx = null;

    this.canvas.width = size;
    this.canvas.height = size;

    const p1 = size + 1;
    this.satTex = gl.createTexture();
    if (!this.satTex) return;
    gl.bindTexture(gl.TEXTURE_2D, this.satTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.fbTex = gl.createTexture();
    this.fb = gl.createFramebuffer();
    if (!this.fbTex || !this.fb) return;
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.sourceTex = gl.createTexture();
    if (this.sourceTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    this.cropCanvas = document.createElement("canvas");
    this.cropCanvas.width = size;
    this.cropCanvas.height = size;
    this.cropCtx = this.cropCanvas.getContext("2d", { willReadFrequently: true });

    const satLen = p1 * p1 * 4;
    if (!this.satBuffer || this.satBuffer.length < satLen) this.satBuffer = new Float32Array(satLen);
    this.currentSize = size;
  }

  private drawQuad(aPosition: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** flipY: 为 true 时对纹理做垂直翻转（用于来自 2D Canvas 的原图，因 WebGL 纹理 y 与 Canvas 相反） */
  private drawBlit(tex: WebGLTexture, flipY = false): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.programBlit);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.locBlit.uTex !== null) gl.uniform1i(this.locBlit.uTex, 0);
    if (this.locBlit.uFlipY !== null) gl.uniform1f(this.locBlit.uFlipY, flipY ? 1 : 0);
    this.drawQuad(this.locBlit.aPosition);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** 将 float SAT 纹理按 scale 归一化后 blit 到屏幕（用于节点「SAT」显示） */
  private drawBlitSatNorm(tex: WebGLTexture, size: number, flipY = true): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.programBlitSat);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.locBlitSat.uTex !== null) gl.uniform1i(this.locBlitSat.uTex, 0);
    const scale = 1.0 / (size * size * 255.0);
    if (this.locBlitSat.uScale !== null) gl.uniform1f(this.locBlitSat.uScale, scale);
    if (this.locBlitSat.uFlipY !== null) gl.uniform1f(this.locBlitSat.uFlipY, flipY ? 1 : 0);
    this.drawQuad(this.locBlitSat.aPosition);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(
    image: HTMLImageElement | HTMLCanvasElement,
    params: HalftoneProcessorParams,
    stage: HalftoneRenderStage = "final"
  ): HTMLCanvasElement | null {
    if (!image?.width) return null;

    const minSide = Math.min(image.width, image.height);
    const n1Log = Math.max(1, Math.floor(Math.log2(minSide)));
    const size = 2 ** n1Log;
    const n = Math.max(0, Math.min(params.n, n1Log));
    const n2 = Math.max(0, Math.min(params.n2, n1Log));
    const step1 = 2 ** (n1Log - n);
    const step2 = 2 ** (n1Log - n2);

    this.ensureSize(size);
    if (!this.satTex || !this.fb || !this.fbTex || !this.cropCtx || !this.satBuffer || !this.sourceTex) return null;

    const gl = this.gl;
    gl.viewport(0, 0, size, size);
    const p1 = size + 1;

    const satCacheHit = this.lastImage === image && this.lastSize === size;
    if (!satCacheHit) {
      const sx = (image.width - size) / 2;
      const sy = (image.height - size) / 2;
      this.cropCtx!.drawImage(image, sx, sy, size, size, 0, 0, size, size);
      const imageData = this.cropCtx!.getImageData(0, 0, size, size);
      buildSatRgbInto(imageData.data, size, this.satBuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.satTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, p1, p1, 0, gl.RGBA, gl.FLOAT, this.satBuffer);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.lastImage = image;
      this.lastSize = size;
    }

    if (stage === "source") {
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cropCanvas!);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.drawBlit(this.sourceTex!, true);
      return this.canvas;
    }

    if (stage === "sat") {
      this.drawBlitSatNorm(this.satTex!, size);
      return this.canvas;
    }

    const neighborRadius = (NEIGHBOR_SIZE - 1) / 2;
    const neighborRadius1 = n === 0 ? 0 : neighborRadius;
    const neighborRadius2 = n2 === 0 ? 0 : neighborRadius;
    const [br, bg, bb] = hexToRgb(params.bgColor);
    const [mr, mg, mb] = hexToRgb(params.monoColor);
    const l1 = this.loc1;
    const l2 = this.loc2;

    gl.viewport(0, 0, size, size);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.programPass1);
    const gap = params.gapPercent / 100;
    const area1 = step1 * step1 * 255;
    const area2 = step2 * step2 * 255;
    const radiusScale1 = params.baseScale * 1.5 * step1 * (1 - gap) * 0.5;
    const radiusScale2 = params.baseScale * 1.5 * step2 * (1 - gap) * 0.5;
    gl.uniform1f(l1.uSize, size);
    gl.uniform1f(l1.uSizeP1, size + 1);
    gl.uniform1f(l1.uStep1, step1);
    gl.uniform1f(l1.uStep2, step2);
    gl.uniform1f(l1.uArea1, area1);
    gl.uniform1f(l1.uArea2, area2);
    gl.uniform1f(l1.uRadiusScale1, radiusScale1);
    gl.uniform1f(l1.uRadiusScale2, radiusScale2);
    gl.uniform1f(l1.uBlendValue, params.blendValue);
    gl.uniform1f(l1.uOffset2, params.offset2);
    gl.uniform1f(l1.uContrast, params.contrast);
    gl.uniform1i(l1.uContrastOnlyLuma, params.contrastOnlyLuma ? 1 : 0);
    gl.uniform1f(l1.uFieldScale, FIELD_SCALE);
    gl.uniform1i(l1.uNeighborRadius1, neighborRadius1);
    gl.uniform1i(l1.uNeighborRadius2, neighborRadius2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.satTex);
    gl.uniform1i(l1.uSatTexture, 0);
    this.drawQuad(l1.aPosition);

    if (stage === "pass1") {
      this.drawBlit(this.fbTex!);
      return this.canvas;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(br, bg, bb, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.programPass2);
    gl.uniform1f(l2.uFieldScale, FIELD_SCALE);
    gl.uniform1f(l2.uThreshold, params.threshold);
    gl.uniform1f(l2.uSoft, params.soft);
    gl.uniform1f(l2.uSoftFineness, params.softFineness);
    gl.uniform3f(l2.uBgColor, br, bg, bb);
    gl.uniform1f(l2.uUseColorBlend, params.useColorBlend);
    gl.uniform3f(l2.uMonoColor, mr, mg, mb);
    gl.uniform1i(l2.uLumaToAlpha, params.lumaToAlpha ? 1 : 0);
    gl.uniform1f(l2.uLumaToAlphaEdge0, params.lumaToAlphaEdge0);
    gl.uniform1f(l2.uLumaToAlphaEdge1, params.lumaToAlphaEdge1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.uniform1i(l2.uPass1Texture, 0);
    this.drawQuad(l2.aPosition);

    return this.canvas;
  }

  reloadShaders(sources: HalftoneShaderSources): boolean {
    const gl = this.gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, sources.vertex);
    const fs1 = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragmentPass1);
    const fs2 = compileShader(gl, gl.FRAGMENT_SHADER, sources.fragmentPass2);
    if (!vs || !fs1 || !fs2) return false;

    const programPass1 = createProgram(gl, vs, fs1);
    const programPass2 = createProgram(gl, vs, fs2);
    if (!programPass1 || !programPass2) {
      gl.deleteShader(vs);
      gl.deleteShader(fs1);
      gl.deleteShader(fs2);
      return false;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs1);
    gl.deleteShader(fs2);
    gl.deleteProgram(this.programPass1);
    gl.deleteProgram(this.programPass2);

    this.programPass1 = programPass1;
    this.programPass2 = programPass2;
    const { loc1, loc2 } = HalftoneProcessor.buildLocations(gl, programPass1, programPass2);
    this.loc1 = loc1;
    this.loc2 = loc2;
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.satTex) gl.deleteTexture(this.satTex);
    if (this.fbTex) gl.deleteTexture(this.fbTex);
    if (this.sourceTex) gl.deleteTexture(this.sourceTex);
    if (this.fb) gl.deleteFramebuffer(this.fb);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteProgram(this.programPass1);
    gl.deleteProgram(this.programPass2);
    gl.deleteProgram(this.programBlit);
    gl.deleteProgram(this.programBlitSat);
  }
}

export function renderHalftone(
  image: HTMLImageElement | HTMLCanvasElement,
  params: HalftoneProcessorParams,
  sources: HalftoneShaderSources
): HTMLCanvasElement | null {
  const processor = HalftoneProcessor.create(sources);
  if (!processor) return null;
  const result = processor.render(image, params);
  processor.dispose();
  return result;
}
