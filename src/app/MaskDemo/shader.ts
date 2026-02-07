import { BaseShaderEffect } from "@/lib/core";

export const MIN_HALF = 0.05;
export const MAX_HALF_W = 0.5;
export const MAX_HALF_H = 0.4;
export const INITIAL_HALF_W = 0.35;
export const INITIAL_HALF_H = 0.2;

export class MaskDemoEffect extends BaseShaderEffect {
  uHalfW = new BaseShaderEffect.Uniform(INITIAL_HALF_W);
  uHalfH = new BaseShaderEffect.Uniform(INITIAL_HALF_H);
  uTex = new BaseShaderEffect.TextureUniform();
  uMaskTex = new BaseShaderEffect.TextureUniform();
  uOffsetX = new BaseShaderEffect.TimeUniform((time) => 0.6 * Math.sin(time * 2));

  override getVert(): string {
    return `
      precision mediump float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vPosition;

      void main() {
        vUv = 0.5 * (aPosition + 1.0);
        vPosition = aPosition;
        gl_Position = vec4(aPosition, 0, 1);
      }
    `;
  }

  override getFrag(): string {
    return `
      precision mediump float;
      uniform sampler2D uTex;
      uniform sampler2D uMaskTex;
      uniform float uOffsetX;
      uniform float uHalfW;
      uniform float uHalfH;
      varying vec2 vUv;
      varying vec2 vPosition;

      void main() {
        vec4 texColor = texture2D(uTex, vUv);
        float inRect = step(uOffsetX - uHalfW, vPosition.x) * step(vPosition.x, uOffsetX + uHalfW)
                     * step(-uHalfH, vPosition.y) * step(vPosition.y, uHalfH);
        vec2 maskUv = vec2(
          (vPosition.x - uOffsetX + uHalfW) / (2.0 * uHalfW),
          (vPosition.y + uHalfH) / (2.0 * uHalfH)
        );
        vec4 maskColor = texture2D(uMaskTex, maskUv);
        gl_FragColor = mix(texColor, maskColor, inRect);
      }
    `;
  }
}

export const maskDemo = new MaskDemoEffect();
