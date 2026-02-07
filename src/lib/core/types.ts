/**
 * 仅保留基类/子类可能用到的类型；原 ShaderNodeConfig / createShaderNode 已移除
 */
export type UniformContext = {
  /** 占位纹理，供子类或扩展使用 */
  texture?: unknown;
  /** 按 key 获取/更新纹理并返回 regl 纹理；isDirty 为 true 时才上传 image 到 GPU */
  getTexture?(key: string, image: HTMLImageElement | null, isDirty?: boolean): unknown;
};

/** 所有 Uniform 类型实现的接口：绑定 + 按帧提供传给 regl 的值 + dirty 标记 */
export interface IUniform {
  readonly __uniformBrand: true;
  bind(effect: unknown, key: string): void;
  /** 声明式 uniform 的当前值；TimeUniform 为 undefined，不参与 state */
  readonly value?: unknown;
  /** 自上次「用过」以来有没有被改过；纹理据此决定是否重新上传 */
  readonly dirty: boolean;
  /** 本帧该 uniform 传给 regl 的值；由基类每帧对每个 name 调用 */
  getValueForFrame(
    state: Record<string, unknown>,
    time: number,
    ctx: UniformContext,
    key: string
  ): unknown;
}
