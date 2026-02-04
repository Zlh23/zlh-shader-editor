# Shader 调试组件 — 实施计划

本文档为 **Shader 管线调试器** 的实施计划：先跑通现有代码，再按阶段推进「实时调参 + 多阶段可视化 + 高度自定义」的调试能力。

---

## 一、项目目标（简述）

在独立新项目中实现可复用的 **Shader 管线调试器**：

- **实时调参**：uniform/参数有控件（滑竿、颜色、开关等），修改即生效
- **多阶段可视化**：可切换查看「最终输出 / Pass1 输出 / Pass2 输入 / 原图 / SAT 等」任意中间结果
- **高度自定义**：阶段数量、参数结构、预览方式可配置，可接入不同管线（如 Halftone、其他多 Pass 效果）

---

## 二、第一步：安装 React 并跑通原有代码

在写调试器功能之前，先在本项目中把现有 Halftone 示例页跑起来，确保环境与依赖正确。

### 2.1 目标

- 本地具备 Node.js 与包管理（npm / pnpm / yarn）
- 安装 React 及构建/开发环境（如 Next.js 或 Vite+React）
- 解决 **Halftone 模块引用**：当前 `halftone-preset/page.tsx` 引用的是 `../../../../export/fx/Halftone`，需改为本仓库内的 `Halftone` 或通过 workspace/别名正确指向
- 启动开发服务器后，能打开 Halftone 预设示例页：看到画布、Tweakpane 面板、上传图片与调参生效

### 2.2 可选方案

- **方案 A（推荐）**：在 `zlhRealtimeShaderEditor` 根目录初始化独立前端项目（如 `npm create vite@latest . -- --template react-ts` 或 Next.js），在 `package.json` 中安装 `react`、`tweakpane`、`typescript` 等；将 `halftone-preset/page.tsx` 的 Halftone 引用改为相对路径指向本仓库的 `./Halftone`（或 `@/Halftone`）；配置构建能处理 `.vert`/`.frag` 的导入（若 Halftone 里用 import 读 shader 字符串）。
- **方案 B**：若 Halftone 原本在父级 monorepo（如 `zlhWebTools`）中运行，则可在父项目中增加指向 `zlhRealtimeShaderEditor` 的入口或 workspace，确保 `export/fx/Halftone` 或等价路径指向本仓库的 `Halftone`，再在父项目里 `npm install` 并跑对应脚本。

### 2.3 验收标准

- [ ] `npm install`（或等价）无报错
- [ ] `npm run dev`（或项目约定的启动命令）能启动开发服务器
- [ ] 打开 Halftone 预设页：画布显示、Tweakpane 面板可见、可上传图片
- [ ] 拖动参数（如 n、threshold、contrast）时，画面实时变化
- [ ] 无控制台报错（与 Halftone 功能相关的）

### 2.4 完成后

第一步完成后，再进入「Phase 1：调试页 + 阶段切换 + Reload Shaders」等开发，避免在未跑通的环境上改代码。

---

## 三、后续阶段（概要）

以下为第一步之后的开发阶段，仅列目标与验收，不写具体实现。

| 阶段 | 内容 | 验收 |
|------|------|------|
| **Phase 1** | 调试页 + 全参数 Tweakpane（按 Pass 分组）+ **阶段下拉**（最终 / Pass1 / 原图）+ **Reload Shaders** 按钮 | 改参即时生效，可切换阶段视图，改 shader 后 Reload 生效 |
| **Phase 2** | 阶段抽象（id、名称、数据来源、显示模式）+ 统一预览（RGB/单通道/归一化/伪彩色）+ SAT 等 CPU 缓冲上传为纹理并预览 | 新增阶段视图仅改配置 |
| **Phase 3** | 管线描述接口（Pass、uniform 列表、可预览阶段）+ 预设保存/加载（JSON） | 接入另一多 Pass 效果仅写管线与描述 |
| **Phase 4** | 布局可调、多窗格、自定义控件/预览扩展点 | 满足「高度自定义」 |

---

## 四、参考概念

- **Tweakpane**：轻量 JS 参数面板库（滑竿、颜色、folder）
- **SAT**：Summed Area Table，前缀和纹理，用于 O(1) 矩形区域求和（Halftone 中用于格子平均色）
- **Spector.js**：WebGL 抓帧与纹理查看，用于深度排查

---

## 五、使用方式

- 新对话中可说：「按 SHADER-DEBUGGER-PLAN.md 继续」或「从第一步 / Phase 1 开始」
- 第一步完成后再进入 Phase 1 的详细设计与编码
