---
name: regl-api
description: Uses the project's regl API reference when writing or debugging regl/WebGL code. Apply when the user works with regl, draw commands, shaders, buffers, textures, framebuffers, regl.frame, regl.prop, or regl.buffer.
---

# regl API 参考 Skill

## 何时使用

在以下情况使用本 skill 并查阅项目内的 regl API 文档：

- 编写或修改 regl 相关代码（绘制命令、着色器、uniforms、attributes）
- 使用 regl 资源：buffer、texture、framebuffer、elements、renderbuffer
- 使用 regl 生命周期：regl.frame、regl.clear、regl.destroy、context loss
- 调试 regl 报错或行为异常
- 需要确认 regl API 的签名、选项或语义

## 权威文档位置

**docs/reglAPI.md** 是完整的 regl API 文档（含目录与分节）。

- **路径**：`docs/reglAPI.md`（相对于项目根目录）
- **用法**：在回答 regl 相关问题或写 regl 代码时，按需用 Read 或 Grep 查阅该文件中的对应章节，再基于文档给出实现或修正建议。

## 查阅建议

1. **先看目录**：docs/reglAPI.md 开头有 Table of contents，可据此定位到 Initialization、Commands、Resources、Other tasks 等大节。
2. **按需精读**：只读与当前问题相关的小节（如 Shaders、Uniforms、Attributes、Buffers、regl.frame 等），避免整篇加载。
3. **以文档为准**：API 名称、参数、可选字段、行为描述以 docs/reglAPI.md 为准；若与记忆或其它资料冲突，以该文件为准。

## 与本项目的关系

本仓库已包含 regl 教学页（如 `/regl-tutorial`、`/regl-frame`）。修改或扩展这些页面时，应结合 docs/reglAPI.md 确保用法正确。
