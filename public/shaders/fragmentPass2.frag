precision mediump float;
uniform sampler2D uPass1Texture;
uniform float uFieldScale;
uniform float uThreshold;
uniform float uSoft;
uniform float uSoftFineness;
uniform vec3 uBgColor;
uniform float uUseColorBlend;
uniform vec3 uMonoColor;
uniform bool uLumaToAlpha;
uniform float uLumaToAlphaEdge0;
uniform float uLumaToAlphaEdge1;
varying vec2 vUv;

void main() {
  vec4 pass1 = texture2D(uPass1Texture, vUv);
  float field = pass1.a * uFieldScale;
  vec3 sampledColor = pass1.rgb;
  float s = smoothstep(uThreshold, uThreshold + uSoft, field);
  float inBlob = pow(s, uSoftFineness);
  vec3 dotColor = mix(uMonoColor, sampledColor, clamp(uUseColorBlend, 0.0, 1.0));
  vec3 color = mix(uBgColor, dotColor, inBlob);
  float luma = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  float t = smoothstep(uLumaToAlphaEdge0, uLumaToAlphaEdge1, luma);
  float alpha = mix(1.0, 1.0 - t, float(uLumaToAlpha));
  gl_FragColor = vec4(color, alpha);
}
