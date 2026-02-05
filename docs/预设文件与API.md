# 预设文件与 API

本文档说明时间轴预设在项目中的文件位置，以及开发环境下写入预设文件的 API 约定。

---

## 文件位置

- **路径**：项目根下的 **`public/presets.json`**。
- **用途**：开发时（`npm run dev`）保存预设会写入该文件；页面加载时优先从此文件读取预设列表。

---

## 开发环境

- **写入方式**：Vite 开发服务器通过自定义插件拦截 **POST `/api/presets`**，将请求体作为 JSON 字符串写入 `public/presets.json`。
- **请求约定**：
  - **Method**：`POST`
  - **Content-Type**：`application/json`
  - **Body**：完整的 **PresetsData** JSON（与 `timelinePresets` 模块中 `PresetsData` 类型一致），包含 `presets` 数组与 `currentPresetId`。通常为格式化后的 JSON（如 `JSON.stringify(data, null, 2)`）。
- **说明**：该接口仅在运行 `npm run dev` 时存在，构建后的 `dist` 中不包含此 API。

---

## 生产环境

- 部署后没有 `/api/presets` 接口，前端无法将预设写入服务器文件。
- 保存操作仍会更新内存与 **localStorage**，因此预设会在当前浏览器内持久化，但不会写入项目目录下的文件。
- 若需在生产环境持久化到文件，需自行实现后端接口或导出流程（例如提供「导出 presets.json」下载，再由用户或运维放入指定路径）。
