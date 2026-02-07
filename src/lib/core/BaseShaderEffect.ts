"use client";

import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import createREGL from "regl";
import type { UniformContext, IUniform } from "./types";
import {
  createParamsProxy,
  Uniform,
  TextureUniform,
  TimeUniform,
} from "./effectUniforms";

const FULLSCREEN_QUAD: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function isIUniform(obj: unknown): obj is IUniform {
  return obj != null && typeof obj === "object" && (obj as IUniform).__uniformBrand === true;
}

/** 所有 shader 效果的「爸爸类」：子类只要写顶点/片元着色器，就能在页面上画出来 */
export abstract class BaseShaderEffect {
  // 把三种 uniform 挂在类上，这样写 BaseShaderEffect.Uniform(...) 就能用
  static Uniform = Uniform;
  static TextureUniform = TextureUniform;
  static TimeUniform = TimeUniform;

  // 存所有「可调参数」的当前值，比如 uHalfW、uHalfH、uTex 等
  private state: Record<string, unknown>;
  // 谁想在我们数据变的时候被通知？都放进这个列表
  private listeners = new Set<() => void>();
  // 对外暴露的「参数对象」：读写在背后都会动到 state，并通知 listeners
  private readonly _params: Record<string, unknown>;

  // 有没有已经扫过一遍身上的 uniform 并绑好了？只绑一次
  private _bound = false;
  // 身上有哪些属性是 uniform？记下名字，每帧按这个名字去取值
  private _uniformNames: string[] = [];

  // WebGL 的「遥控器」，没有它就不能画
  private regl: ReturnType<typeof createREGL> | null = null;
  // 一块默认的小纹理（灰格子），有的地方需要占位就用它
  private defaultTex: ReturnType<ReturnType<typeof createREGL>["texture"]> | null = null;
  // 每个「纹理类 uniform」对应一块 GPU 纹理，按名字存；是否上传由 uniform 的 dirty 决定
  private _textureMap = new Map<
    string,
    { tex: ReturnType<ReturnType<typeof createREGL>["texture"]> }
  >();
  // 每帧调用的动画句柄，要停掉动画就调它的 cancel
  private cancelFrame: { cancel: () => void } | null = null;

  /** 创建一个效果实例时：先准备空 state，再做一个「代理」当 params */
  constructor() {
    this.state = {};
    this._params = createParamsProxy(this);
  }

  /** 别人要调参数就通过 effect.params，这里把 _params 交出去 */
  get params(): Record<string, unknown> {
    return this._params;
  }

  /** 把当前所有参数（state）整份读出来 */
  getState(): Record<string, unknown> {
    return this.state;
  }

  /** 更新一部分参数，然后通知所有「在听」的人：数据变了 */
  setState(partial: Record<string, unknown>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  /** 内部方法：叫一遍所有 listener，告诉他们「数据更新了」 */
  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** 订阅数据变化：传一个回调，数据变就会调；返回一个「取消订阅」的函数 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 子类必须实现：顶点着色器代码字符串 */
  abstract getVert(): string;
  /** 子类必须实现：片元着色器代码字符串 */
  abstract getFrag(): string;

  /**
   * 第一次要画之前：把自己身上所有「是 uniform」的属性找出来，
   * 告诉它们「你是哪个 key、挂在哪个 effect 上」，并把初始值写进 state，记下名字。
   */
  private _bindUniforms(): void {
    if (this._bound) return;
    for (const key of Object.getOwnPropertyNames(this)) {
      // 这个属性是 uniform 吗？不是就跳过
      const val = (this as Record<string, unknown>)[key];
      if (!isIUniform(val)) continue;
      val.bind(this, key);
      if (!(val instanceof TimeUniform)) this.state[key] = val.value;
      this._uniformNames.push(key);
    }
    this._bound = true;
  }

  /** 清屏用啥颜色？默认是深灰 [R, G, B, 不透明度] */
  getClearColor(): [number, number, number, number] {
    return [0.15, 0.15, 0.18, 1];
  }

  /** 顶点用啥数据？默认就是全屏大四边形 aPosition */
  getAttributes(): Record<string, number[][]> {
    return { aPosition: FULLSCREEN_QUAD };
  }

  /** 要不要开深度测试？默认关 */
  getDepth(): { enable: boolean } {
    return { enable: false };
  }

  /** 画几个顶点？全屏两个三角形一共 6 个顶点 */
  getCount(): number {
    return 6;
  }

  /**
   * 在某个 DOM 容器里「跑起来」：建 WebGL、绑 uniform、每帧画一帧。
   */
  run(container: HTMLElement): void {
    if (this.regl) return;

    this._bindUniforms();

    const regl = createREGL(container);
    this.regl = regl;

    this.defaultTex = regl.texture({
      // 1x1 的灰色像素，用来当「还没图的时候」的占位
      width: 1,
      height: 1,
      data: new Uint8Array([128, 128, 128, 255]),
    });

    // 更新图片由各 uniform 的 dirty 决定：只有 isDirty 且 image 有效时才上传，避免每帧重复上传
    const getTexture = (
      key: string,
      image: HTMLImageElement | null,
      isDirty?: boolean
    ): unknown => {
      let entry = this._textureMap.get(key);
      if (!entry) {
        entry = {
          tex: regl.texture({
            width: 1,
            height: 1,
            data: new Uint8Array([128, 128, 128, 255]),
          }),
        };
        this._textureMap.set(key, entry);
      }
      if (isDirty && image instanceof HTMLImageElement) {
        entry.tex({ data: image, flipY: true });
      }
      return entry.tex;
    };

    const ctx: UniformContext = { texture: this.defaultTex, getTexture };

    // 给定当前时间 time，算出这一帧要传给 shader 的所有 uniform 值
    const getUniformsForFrame = (time: number) => {
      const state = this.getState();
      const result: Record<string, unknown> = {};
      for (const name of this._uniformNames) {
        const uniform = (this as unknown as Record<string, IUniform>)[name];
        result[name] = uniform.getValueForFrame(state, time, ctx, name);
      }
      return result;
    };

    const attributes = this.getAttributes();
    const count = this.getCount();
    const clearColor = this.getClearColor();

    type Props = Record<string, unknown>;
    const sample = getUniformsForFrame(0);
    const uniformNames = Object.keys(sample);
    const uniforms: Props = {};
    for (const name of uniformNames) {
      uniforms[name] = regl.prop<Props, keyof Props>(name as keyof Props);
    }
    // 告诉 regl：这些名字的 uniform 每帧由我们传进去，别在创建时就要

    const draw = regl({
      // 用我们的顶点/片元着色器、顶点数据、uniform 定义，组出一个「画一笔」的命令
      frag: this.getFrag(),
      vert: this.getVert(),
      attributes,
      uniforms,
      depth: this.getDepth(),
      count,
    });

    this.cancelFrame = regl.frame(({ time }: { time: number }) => {
      regl.clear({ color: clearColor });
      draw(getUniformsForFrame(time) as Props);
    });
    // 上面这句的意思是：每一帧先清屏，再按这一帧的 time 算出 uniform 并画一帧
  }

  /** 不再画了：停动画、删掉所有纹理、关掉 WebGL */
  unmount(): void {
    if (this.cancelFrame) {
      this.cancelFrame.cancel();
      this.cancelFrame = null;
    }
    for (const entry of this._textureMap.values()) entry.tex.destroy();
    this._textureMap.clear();
    if (this.defaultTex) {
      this.defaultTex.destroy();
      this.defaultTex = null;
    }
    if (this.regl) {
      this.regl.destroy();
      this.regl = null;
    }
  }

  /**
   * React 里用：挂一个 div 当画布，把 state 和 effect 交给 viewMap，返回 containerRef + viewMap 的结果。
   * state 会随 effect 的 setState 自动更新，触发重渲染。
   */
  useView<P extends Record<string, unknown>>(
    viewMap: (state: Record<string, unknown>, effect: BaseShaderEffect) => P
  ): { containerRef: React.RefObject<HTMLDivElement | null> } & P {
    const containerRef = useRef<HTMLDivElement>(null);
    const effectRef = useRef(this);
    effectRef.current = this;

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      effectRef.current.run(el);
      return () => effectRef.current.unmount();
    }, []);

    const state = useSyncExternalStore(
      useCallback((onStoreChange) => effectRef.current.subscribe(onStoreChange), []),
      useCallback(() => effectRef.current.getState(), []),
      useCallback(() => effectRef.current.getState(), [])
    );

    return {
      containerRef,
      ...viewMap(state, effectRef.current),
    } as { containerRef: React.RefObject<HTMLDivElement | null> } & P;
  }
}
