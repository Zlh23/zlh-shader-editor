/**
 * 半调处理器：参数类型、常量、WebGL 位置缓存类型。
 */

/** 邻域固定 5×5，不再暴露为参数 */
export const NEIGHBOR_SIZE = 5;

export const FIELD_SCALE = 20.0;

export interface HalftoneProcessorParams {
  n: number;
  n2: number;
  blendValue: number;
  offset2: number;
  baseScale: number;
  gapPercent: number;
  threshold: number;
  soft: number;
  softFineness: number;
  contrast: number;
  contrastOnlyLuma: boolean;
  bgColor: string;
  useColorBlend: number;
  monoColor: string;
  /** Pass2 最后一步：亮度转透明度（亮→透明），用 smoothstep clamp 过渡 */
  lumaToAlpha: boolean;
  /** lumaToAlpha 时亮度区间 [edge0, edge1]，alpha = 1 - smoothstep(edge0, edge1, luma) */
  lumaToAlphaEdge0: number;
  lumaToAlphaEdge1: number;
}

/** Pass1 的 uniform / attrib 位置缓存 */
export interface LocPass1 {
  uSize: WebGLUniformLocation | null;
  uSizeP1: WebGLUniformLocation | null;
  uStep1: WebGLUniformLocation | null;
  uStep2: WebGLUniformLocation | null;
  uArea1: WebGLUniformLocation | null;
  uArea2: WebGLUniformLocation | null;
  uRadiusScale1: WebGLUniformLocation | null;
  uRadiusScale2: WebGLUniformLocation | null;
  uFieldScale: WebGLUniformLocation | null;
  uNeighborRadius1: WebGLUniformLocation | null;
  uNeighborRadius2: WebGLUniformLocation | null;
  uBlendValue: WebGLUniformLocation | null;
  uOffset2: WebGLUniformLocation | null;
  uContrast: WebGLUniformLocation | null;
  uContrastOnlyLuma: WebGLUniformLocation | null;
  uSatTexture: WebGLUniformLocation | null;
  aPosition: number;
}

/** Pass2 的 uniform / attrib 位置缓存 */
export interface LocPass2 {
  uFieldScale: WebGLUniformLocation | null;
  uThreshold: WebGLUniformLocation | null;
  uSoft: WebGLUniformLocation | null;
  uSoftFineness: WebGLUniformLocation | null;
  uBgColor: WebGLUniformLocation | null;
  uUseColorBlend: WebGLUniformLocation | null;
  uMonoColor: WebGLUniformLocation | null;
  uLumaToAlpha: WebGLUniformLocation | null;
  uLumaToAlphaEdge0: WebGLUniformLocation | null;
  uLumaToAlphaEdge1: WebGLUniformLocation | null;
  uPass1Texture: WebGLUniformLocation | null;
  aPosition: number;
}
