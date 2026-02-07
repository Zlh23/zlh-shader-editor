import MaskDemo from "./MaskDemo";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
      <main className="max-w-4xl mx-auto px-6 py-10 flex flex-col items-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Shader 示例
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-8">
          输入图片，输出带黑色矩形遮罩来回平移动画
        </p>
        <MaskDemo />
      </main>
    </div>
  );
}
