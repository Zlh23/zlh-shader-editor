import type { UniformContext, IUniform } from "./types";

/** 具备 getState/setState 的 effect，供 createParamsProxy 与 Uniform 使用，避免与 BaseShaderEffect 循环依赖 */
export interface IEffectWithState {
  getState(): Record<string, unknown>;
  setState(partial: Record<string, unknown>): void;
}

/**
 * 带通知的 params：读写 state，写时由 effect 触发 emit
 */
export function createParamsProxy(effect: IEffectWithState): Record<string, unknown> {
  return new Proxy(
    {} as Record<string, unknown>,
    {
      get(_, key: string) {
        return effect.getState()[key];
      },
      set(_, key: string, value: unknown) {
        effect.setState({ [key]: value });
        return true;
      },
    }
  ) as Record<string, unknown>;
}

/** 普通 uniform，设 value 时会 setState + emit，并标记 dirty */
export class Uniform<T = unknown> implements IUniform {
  readonly __uniformBrand = true as const;
  private _value: T;
  private _effect: IEffectWithState | null = null;
  private _key: string | null = null;
  private _dirty = false;

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }
  set value(v: T) {
    this._value = v;
    this._dirty = true;
    if (this._effect && this._key != null) this._effect.setState({ [this._key]: v });
  }

  get dirty(): boolean {
    return this._dirty;
  }

  bind(effect: IEffectWithState, key: string): void {
    this._effect = effect;
    this._key = key;
  }

  protected clearDirty(): void {
    this._dirty = false;
  }

  getValueForFrame(
    state: Record<string, unknown>,
    _time: number,
    _ctx: UniformContext,
    key: string
  ): unknown {
    const result = state[key];
    this.clearDirty();
    return result;
  }
}

/** 纹理 uniform，value 为 HTMLImageElement | null，由 getValueForFrame 通过 ctx.getTexture 得到 regl 纹理；dirty 时才上传 */
export class TextureUniform extends Uniform<HTMLImageElement | null> {
  constructor() {
    super(null);
  }

  getValueForFrame(
    state: Record<string, unknown>,
    _time: number,
    ctx: UniformContext,
    key: string
  ): unknown {
    const img = state[key];
    const isDirty = this.dirty;
    const result =
      ctx.getTexture?.(
        key,
        (img instanceof HTMLImageElement ? img : null) ?? null,
        isDirty
      ) ?? null;
    this.clearDirty();
    return result;
  }

  /** 从 File 加载图片并设为 value（revoke 旧/新 object URL） */
  loadFromFile(file: File): void {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const prev = this.value;
      if (prev instanceof HTMLImageElement && prev.src) URL.revokeObjectURL(prev.src);
      this.value = img;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
}

/** 每帧按 time 计算值的 uniform，不参与 state/订阅 */
export class TimeUniform implements IUniform {
  readonly __uniformBrand = true as const;
  private _fn: (time: number) => unknown;

  constructor(fn: (time: number) => unknown) {
    this._fn = fn;
  }

  get value(): undefined {
    return undefined;
  }
  set value(_: unknown) {}

  get dirty(): boolean {
    return false;
  }

  bind(_effect: unknown, _key: string): void {}

  getValue(time: number): unknown {
    return this._fn(time);
  }

  getValueForFrame(
    _state: Record<string, unknown>,
    time: number,
    _ctx: UniformContext,
    _key: string
  ): unknown {
    return this._fn(time);
  }
}
