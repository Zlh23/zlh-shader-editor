# Shader 调试器（纯 Vite + TypeScript）

Halftone 半调效果与 Shader 管线调试，无 React / 无 Next.js。

## 开发

```bash
npm install
npm run dev
```

浏览器打开：首页 `http://localhost:5173/`，[Halftone 预设](http://localhost:5173/halftone-preset.html)，[Shader 调试](http://localhost:5173/shader-debug.html)。

## 构建

```bash
npm run build
npm run preview   # 预览 dist
```

## 结构

- `index.html`、`halftone-preset.html`、`shader-debug.html`：多页入口
- `src/pages/*.ts`：各页脚本（原生 TS，无框架）
- `src/Halftone/`：半调模块（WebGL + Tweakpane）
- `public/shaders/*.vert|.frag`：着色器源码，调试页「Reload Shaders」会重新 fetch 并编译

修改 `public/shaders/` 下文件后，在调试页点击「Reload Shaders」即可生效。

---

## 作为 Next.js 插件使用

本仓库可作为依赖被 Next.js 项目引用，在任意页面挂载 Shader 调试 UI。

### 1. 安装依赖

在 Next 项目根目录：

```bash
npm install /path/to/zlh-shader-editor
# 或先发布到 npm 再：npm i zlh-realtime-shader-editor
```

在 Next 的 `next.config.js` 里开启对本地包的转译（若使用本地路径）：

```js
// next.config.mjs
const nextConfig = {
  transpilePackages: ['zlh-realtime-shader-editor'],
};
```

### 2. 提供着色器接口

调试器会通过 `shaderBaseUrl` 请求 `vertex.vert`、`fragmentPass1.frag`、`fragmentPass2.frag`。任选一种方式：

**方式 A：放到 `public`**

把本仓库里的 `public/shaders/` 拷到 Next 项目的 `public/shaders/`，则 `shaderBaseUrl: '/shaders'` 即可。

**方式 B：API 路由**

在 Next 项目里添加接口，例如 `app/api/shaders/[name]/route.ts`：

```ts
// app/api/shaders/[name]/route.ts
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const ALLOWED = ['vertex.vert', 'fragmentPass1.frag', 'fragmentPass2.frag'];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!ALLOWED.includes(name)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const base = process.cwd();
  const content = await readFile(path.join(base, 'public', 'shaders', name), 'utf-8');
  return new NextResponse(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
```

此时在插件里使用 `shaderBaseUrl: '/api/shaders'`（请求路径会变为 `/api/shaders/vertex.vert` 等，需与路由约定一致）。若路由是 `/api/shaders/[name]` 且 name 含扩展名，则 base 填 `/api/shaders` 即可。

### 3. 在页面中挂载

在任意客户端组件中挂一个容器，并调用 `initShaderDebug`：

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { initShaderDebug } from 'zlh-realtime-shader-editor/plugin';

export default function ShaderDebugPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const { dispose } = initShaderDebug(containerRef.current, {
      shaderBaseUrl: '/shaders',           // 或 '/api/shaders'
      defaultImageSrc: '/default.webp',    // 可选
      paneTitle: 'Halftone 调试',
    });
    return () => dispose();
  }, []);

  return <div ref={containerRef} className="min-h-screen" />;
}
```

挂载后即可在同一页使用阶段切换、Reload Shaders、上传图片和 Tweakpane 调参。
