/**
 * 颜色与 SAT（Summed Area Table）工具：hex→RGB、构建 RGBA SAT 到 Float32Array。
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * 将 ImageData.data (RGBA Uint8) 构建为 (size+1)×(size+1) 的 RGBA 前缀和，写入 out（Float32Array）。
 * 两遍法：先按行做水平前缀和到临时缓冲，再按列做垂直前缀和到 out，访问更顺序、缓存友好。
 * out 长度至少 (size+1)*(size+1)*4；内部会先 fill(0)。
 */
export function buildSatRgbInto(data: Uint8ClampedArray, size: number, out: Float32Array): void {
  const p1 = size + 1;
  const len = p1 * p1 * 4;
  out.fill(0);
  const temp = new Float32Array(len);
  temp.fill(0);

  /* Pass1：按行水平前缀和，H(j,i) = sum(data[j-1, 0..i-1])，写入 temp */
  for (let j = 1; j <= size; j++) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const rowDataBase = (j - 1) * size * 4;
    const rowTempBase = j * p1 * 4;
    for (let i = 1; i <= size; i++) {
      const di = rowDataBase + (i - 1) * 4;
      sr += data[di];
      sg += data[di + 1];
      sb += data[di + 2];
      const ti = rowTempBase + i * 4;
      temp[ti] = sr;
      temp[ti + 1] = sg;
      temp[ti + 2] = sb;
      temp[ti + 3] = 0;
    }
  }

  /* Pass2：按列垂直前缀和，out(j,i) = out(j-1,i) + temp(j,i) */
  for (let j = 1; j <= size; j++) {
    const rowOutCurBase = j * p1 * 4;
    const rowOutPrevBase = (j - 1) * p1 * 4;
    const rowTempBase = j * p1 * 4;
    for (let i = 0; i <= size; i++) {
      const idxCur = rowOutCurBase + i * 4;
      const idxUp = rowOutPrevBase + i * 4;
      const ti = rowTempBase + i * 4;
      out[idxCur] = out[idxUp] + temp[ti];
      out[idxCur + 1] = out[idxUp + 1] + temp[ti + 1];
      out[idxCur + 2] = out[idxUp + 2] + temp[ti + 2];
      out[idxCur + 3] = 0;
    }
  }
}
