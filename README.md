# zlh-shader-editor

基于 Next.js + regl 的 Shader 预览项目。所有效果继承 `BaseShaderEffect`，子类用**声明式 uniform**（`Uniform` / `TextureUniform` / `TimeUniform`）挂参数，基类负责绑定、每帧取值与绘制；状态可订阅，React 通过 `useView` 绑定。

## 技术栈

- **Next.js 16**（App Router）
- **React 19**
- **regl**：WebGL 封装，全屏四边形 + 自定义 shader
- **Tailwind CSS 4**

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器（端口 3210） |
| `npm run build` | 生产构建 |
| `npm run start` | 生产模式启动 |
| `npm run lint` | ESLint 检查 |

## 项目结构

```
src/
├── app/
│   ├── page.tsx            # 首页（挂 MaskDemo）
│   └── MaskDemo/           # 示例：主图 + 遮罩图，矩形内显示遮罩并平移动画
│       ├── index.ts        # 导出默认组件
│       ├── shader.ts       # MaskDemoEffect（extends BaseShaderEffect）+ maskDemo
│       └── MaskDemo.tsx    # 页面组件（useView + 主图/遮罩图选择 + 矩形宽高滑条）
└── lib/
    └── core/
        ├── index.ts           # 统一导出
        ├── types.ts           # IUniform、UniformContext
        ├── effectUniforms.ts   # Uniform / TextureUniform / TimeUniform、createParamsProxy
        └── BaseShaderEffect.ts # 基类：state、subscribe、run、unmount、useView
```

## 核心库（`@/lib/core`）

### 声明式 Uniform

所有 uniform 实现 **IUniform** 接口（`bind`、`getValueForFrame`、`dirty`）。基类在首次 `run` 时遍历实例上的 IUniform 做绑定并记名，每帧对每个名字调 `getValueForFrame(state, time, ctx, name)` 得到传给 regl 的值。

- **Uniform&lt;T&gt;**：普通数值/向量，设 `value` 会 `setState` 并置 `dirty`；`getValueForFrame` 返回 `state[key]` 并在用后清 dirty。
- **TextureUniform**：值为 `HTMLImageElement | null`，通过 `ctx.getTexture(key, image, isDirty)` 得到 regl 纹理；**是否上传到 GPU 由各 uniform 的 dirty 决定**，仅在 dirty 时上传。
- **TimeUniform**：每帧按 `time` 计算，不参与 state，无 dirty。

子类在类上声明即可，例如：

```ts
uHalfW = new BaseShaderEffect.Uniform(0.35);
uTex = new BaseShaderEffect.TextureUniform();
uMaskTex = new BaseShaderEffect.TextureUniform();
uOffsetX = new BaseShaderEffect.TimeUniform((time) => 0.6 * Math.sin(time * 2));
```

### BaseShaderEffect 基类

- **状态与订阅**：内部 `state`，`getState()` / `setState(partial)`，`subscribe(listener)`。对外有 `params`（Proxy，读写即 state + emit），React 用 `useSyncExternalStore` 订阅。
- **子类必须实现**：`getVert(): string`、`getFrag(): string`。
- **子类可重写**：`getClearColor()`、`getAttributes()`、`getDepth()`、`getCount()`，基类默认全屏四边形、depth 关、count 6。
- **父类提供**：
  - **run(container)**：创建 regl、按 key 建纹理池（`getTexture(key, image, isDirty)`），每帧对每个 IUniform 调 `getValueForFrame` 拼成 uniform 对象并绘制；支持多纹理（每个 TextureUniform 一个 key）。
  - **unmount()**：取消 frame、销毁纹理与 regl。
  - **useView(viewMap)**：返回 `{ containerRef, ...viewMap(state, effect) }`；ref 上 run/unmount，用 `useSyncExternalStore` 订阅 effect；UI 可 `effect.params.xxx = v`、`effect.uTex.loadFromFile(file)` 等。

### 设计要点

- **声明式 uniform**：子类用字段声明 Uniform/TextureUniform/TimeUniform，基类自动收集、绑定、每帧取值，无需手写 getUniforms。
- **dirty 驱动纹理更新**：纹理是否重新上传由对应 uniform 的 dirty 决定，避免每帧重复上传。
- **多纹理**：每个 TextureUniform 对应一个 key，纹理池按 key 管理。

## 示例：MaskDemo

- **shader.ts**：`MaskDemoEffect` 声明 `uHalfW`、`uHalfH`（Uniform）、`uTex`、`uMaskTex`（TextureUniform）、`uOffsetX`（TimeUniform）。片元里主图用 `uTex`，矩形内用 `uMaskTex` 采样，**遮罩图用矩形局部 UV（0～1）缩放到遮罩块大小**，矩形外为主图。
- **MaskDemo.tsx**：`maskDemo.useView(...)` 暴露 `halfW`/`halfH`、`setHalfW`/`setHalfH`、`onFileChange`（主图）、`onMaskFileChange`（遮罩图）；两个文件选择 + 两个滑条 + `containerRef` 绑 canvas 容器。

首页（`app/page.tsx`）渲染 `<MaskDemo />`。
