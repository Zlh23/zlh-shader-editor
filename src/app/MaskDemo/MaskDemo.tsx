"use client";

import { maskDemo, MIN_HALF, MAX_HALF_W, MAX_HALF_H, INITIAL_HALF_W, INITIAL_HALF_H } from "./shader";

export default function MaskDemo() {
  const props = maskDemo.useView((state, effect) => ({
    halfW: (state.uHalfW as number | undefined) ?? INITIAL_HALF_W,
    halfH: (state.uHalfH as number | undefined) ?? INITIAL_HALF_H,
    setHalfW: (v: number) => {
      effect.params.uHalfW = v;
    },
    setHalfH: (v: number) => {
      effect.params.uHalfH = v;
    },
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) maskDemo.uTex.loadFromFile(file);
    },
    onMaskFileChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) maskDemo.uMaskTex.loadFromFile(file);
    },
  }));

  const {
    containerRef,
    halfW,
    halfH,
    setHalfW,
    setHalfH,
    onFileChange,
    onMaskFileChange,
  } = props;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-3xl">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">
          <span className="font-medium">选择图片</span>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-200 file:text-zinc-800 dark:file:bg-zinc-700 dark:file:text-zinc-200"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer">
          <span className="font-medium">选择遮罩图</span>
          <input
            type="file"
            accept="image/*"
            onChange={onMaskFileChange}
            className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-200 file:text-zinc-800 dark:file:bg-zinc-700 dark:file:text-zinc-200"
          />
        </label>
      </div>
      <div className="w-full flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm">
        <label className="flex items-center gap-3 flex-1">
          <span className="text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            矩形宽度 {((halfW ?? INITIAL_HALF_W) * 2).toFixed(2)}
          </span>
          <input
            type="range"
            min={MIN_HALF}
            max={MAX_HALF_W}
            step={0.01}
            value={halfW ?? INITIAL_HALF_W}
            onChange={(e) => setHalfW(parseFloat(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-zinc-200 dark:bg-zinc-600 accent-zinc-700 dark:accent-zinc-400"
          />
        </label>
        <label className="flex items-center gap-3 flex-1">
          <span className="text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            矩形高度 {((halfH ?? INITIAL_HALF_H) * 2).toFixed(2)}
          </span>
          <input
            type="range"
            min={MIN_HALF}
            max={MAX_HALF_H}
            step={0.01}
            value={halfH ?? INITIAL_HALF_H}
            onChange={(e) => setHalfH(parseFloat(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-zinc-200 dark:bg-zinc-600 accent-zinc-700 dark:accent-zinc-400"
          />
        </label>
      </div>
      <div
        ref={containerRef}
        className="w-full aspect-video max-h-[70vh] rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-600 bg-zinc-800"
        style={{ minHeight: 280 }}
      />
      <p className="text-xs text-zinc-500 dark:text-zinc-450">
        单 shader：主图 + 矩形区域内显示遮罩图（uTex / uMaskTex，regl）
      </p>
    </div>
  );
}
