precision mediump float;
uniform sampler2D uSatTexture;
uniform float uSize;
uniform float uSizeP1;
uniform float uStep1;
uniform float uStep2;
uniform float uArea1;
uniform float uArea2;
uniform float uRadiusScale1;
uniform float uRadiusScale2;
uniform float uFieldScale;
uniform int uNeighborRadius1;
uniform int uNeighborRadius2;
uniform float uBlendValue;
uniform float uOffset2;
uniform float uContrast;
uniform bool uContrastOnlyLuma;
varying vec2 vUv;

float applyContrast(float v, float factor) {
  return clamp(factor * (v - 0.5) + 0.5, 0.0, 1.0);
}

vec4 sampleCell(float nx, float ny, float step, float area, float radiusScale, float offsetMix, vec2 coord, float invP1, float contrastFactor) {
  float blockCx = (2.0 * floor(nx / 2.0) + 1.0) * step;
  float blockCy = (2.0 * floor(ny / 2.0) + 1.0) * step;
  float cellCx = nx * step + step * 0.5;
  float cellCy = ny * step + step * 0.5;
  float cx = mix(blockCx, cellCx, offsetMix);
  float cy = mix(blockCy, cellCy, offsetMix);
  vec2 center = vec2(cx, cy);
  vec2 d = coord - center;
  float distSq = dot(d, d) + 1e-6;
  float x1 = nx * step;
  float y1 = ny * step;
  float x2 = x1 + step - 1.0;
  float y2 = y1 + step - 1.0;
  vec4 s22 = texture2D(uSatTexture, vec2((x2 + 1.5) * invP1, (y2 + 1.5) * invP1));
  vec4 s02 = texture2D(uSatTexture, vec2((x1 + 0.5) * invP1, (y2 + 1.5) * invP1));
  vec4 s20 = texture2D(uSatTexture, vec2((x2 + 1.5) * invP1, (y1 + 0.5) * invP1));
  vec4 s00 = texture2D(uSatTexture, vec2((x1 + 0.5) * invP1, (y1 + 0.5) * invP1));
  vec3 sumRgb = s22.rgb - s02.rgb - s20.rgb + s00.rgb;
  vec3 avgRgb = sumRgb / area;
  float luma;
  vec3 colorForDot;
  if (uContrastOnlyLuma) {
    float lumaRaw = 0.299 * avgRgb.r + 0.587 * avgRgb.g + 0.114 * avgRgb.b;
    luma = applyContrast(lumaRaw, contrastFactor);
    colorForDot = avgRgb;
  } else {
    vec3 contrasted = vec3(applyContrast(avgRgb.r, contrastFactor), applyContrast(avgRgb.g, contrastFactor), applyContrast(avgRgb.b, contrastFactor));
    luma = 0.299 * contrasted.r + 0.587 * contrasted.g + 0.114 * contrasted.b;
    colorForDot = contrasted;
  }
  float radius = luma * radiusScale;
  float contrib = (radius * radius) / distSq;
  return vec4(contrib, colorForDot.r, colorForDot.g, colorForDot.b);
}

struct GridResult {
  float field;
  vec3 totalColor;
  vec3 centerAvgRgb;
};

GridResult accumulateGrid(float step, float area, float radiusScale, int neighborRadius, float offsetMix, vec2 coord, float invP1, float contrastFactor) {
  float cellX = floor(coord.x / step);
  float cellY = floor(coord.y / step);
  float field = 0.0;
  vec3 totalColor = vec3(0.0);
  vec3 centerAvgRgb = vec3(0.0);
  if (neighborRadius == 0) {
    vec4 r = sampleCell(cellX, cellY, step, area, radiusScale, offsetMix, coord, invP1, contrastFactor);
    field = r.r;
    totalColor = r.r * r.gba;
    centerAvgRgb = r.gba;
  } else {
    for (int dj = -2; dj <= 2; dj++) {
      for (int di = -2; di <= 2; di++) {
        vec4 r = sampleCell(cellX + float(di), cellY + float(dj), step, area, radiusScale, offsetMix, coord, invP1, contrastFactor);
        field += r.r;
        totalColor += r.r * r.gba;
        if (di == 0 && dj == 0) centerAvgRgb = r.gba;
      }
    }
  }
  return GridResult(field, totalColor, centerAvgRgb);
}

void main() {
  vec2 coord = vec2(vUv.x * uSize, (1.0 - vUv.y) * uSize);
  float invP1 = 1.0 / uSizeP1;
  float c = clamp(uContrast, -254.0, 254.0);
  float contrastFactor = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));

  GridResult r1 = accumulateGrid(uStep1, uArea1, uRadiusScale1, uNeighborRadius1, 1.0, coord, invP1, contrastFactor);
  GridResult r2 = accumulateGrid(uStep2, uArea2, uRadiusScale2, uNeighborRadius2, uOffset2, coord, invP1, contrastFactor);

  float field = mix(r1.field, r2.field, uBlendValue);
  vec3 totalColor = mix(r1.totalColor, r2.totalColor, uBlendValue);
  vec3 centerAvgRgb = mix(r1.centerAvgRgb, r2.centerAvgRgb, uBlendValue);
  vec3 outColor = field > 1e-6 ? totalColor / field : centerAvgRgb;
  float outField = min(field / uFieldScale, 1.0);
  gl_FragColor = vec4(outColor.r, outColor.g, outColor.b, outField);
}
