# Halftone - 设计文档

## 设计概述

Halftone 是基于 WebGL 的圆点半调图像效果，将输入图片按亮度转换为圆点网格，支持双粒度混合、对比度、亮度转透明度（clamp blend）等。

## 核心特性

- **圆点半调**：按格子内平均亮度控制圆点半径，双粒度（粗/细）可混合
- **SAT 加速**：CPU 预计算 RGB 二维前缀和，GPU Pass1 用 4 次采样 O(1) 取格子平均
- **对比度**：支持全局或仅亮度，在 Pass1 着色器内完成
- **亮度转透明度**：Pass2 最后一步，smoothstep 区间可调（亮→透明）
- **Tweakpane 面板**：可选 ani 联动、上传图、自动播放、周期时间与 ani 上限

## 视觉效果

### 主要参数

| 参数 | 说明 |
|------|------|
| n / n2 | 粗/细粒度级别（0～n1Log） |
| blendValue | 双粒度混合比例 0～1 |
| baseScale | 圆点缩放 |
| gapPercent | 间隙占比 |
| threshold / soft | 粘合阈值与边缘软化 |
| lumaToAlpha | 亮度转透明度（clamp blend） |

### 动画

- ani 滑块 0～aniMax 联动：粒度、对比度、原图颜色混合
- 播放/暂停：线性来回 ani，周期由「一个来回(秒)」控制

## 使用场景

- 图片艺术化、海报风格
- 透明叠加（开启 lumaToAlpha 后叠加到背景）
- 与 Tweakpane 配合做实时调参与自动动画
