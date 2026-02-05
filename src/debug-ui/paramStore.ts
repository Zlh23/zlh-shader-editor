/**
 * 参数存储：单一数据源，支持订阅，数据与 UI 分离
 */

import { blendToOffset2 } from "@/Halftone";
import type { HalftonePaneParams } from "@/Halftone";

type ParamKey = keyof HalftonePaneParams;
type Subscriber = (value: unknown) => void;

export interface ParamStore {
  getParams: () => HalftonePaneParams;
  get: <K extends ParamKey>(key: K) => HalftonePaneParams[K];
  set: <K extends ParamKey>(key: K, value: HalftonePaneParams[K]) => void;
  subscribe: <K extends ParamKey>(key: K, fn: (value: HalftonePaneParams[K]) => void) => () => void;
  subscribeToSet: (fn: (paramKey: string) => void) => () => void;
  setChangedKeys: (keys: Set<string>) => void;
  getChangedKeys: () => Set<string>;
  subscribeChangedKeys: (fn: (keys: Set<string>) => void) => () => void;
}

export function createParamStore(
  initial: HalftonePaneParams
): ParamStore {
  const params = { ...initial } as HalftonePaneParams;
  const subs: Record<string, Subscriber[] | undefined> = {};
  let setListeners: ((paramKey: string) => void)[] = [];
  let changedKeys = new Set<string>();
  let changedKeysListeners: ((keys: Set<string>) => void)[] = [];

  function getParams(): HalftonePaneParams {
    return params;
  }

  function get<K extends ParamKey>(key: K): HalftonePaneParams[K] {
    return params[key];
  }

  function set<K extends ParamKey>(key: K, value: HalftonePaneParams[K]): void {
    (params as unknown as Record<string, unknown>)[key] = value;
    if (key === "blendValue") {
      params.offset2 = blendToOffset2(
        value as number,
        params.timeValue,
        params.offset2Peak
      );
      notify("offset2", params.offset2);
      setListeners.forEach((fn) => fn("offset2"));
    }
    notify(key, value);
    setListeners.forEach((fn) => fn(key as string));
  }

  function notify(key: string, value: unknown): void {
    const list = subs[key];
    if (list) for (const fn of list) fn(value);
  }

  function subscribe<K extends ParamKey>(
    key: K,
    fn: (value: HalftonePaneParams[K]) => void
  ): () => void {
    const k = key as string;
    if (!subs[k]) subs[k] = [];
    subs[k].push(fn as Subscriber);
    return () => {
      subs[k] = subs[k]!.filter((f) => f !== fn);
    };
  }

  function subscribeToSet(fn: (paramKey: string) => void): () => void {
    setListeners.push(fn);
    return () => {
      setListeners = setListeners.filter((f) => f !== fn);
    };
  }

  function setChangedKeys(keys: Set<string>): void {
    changedKeys = new Set(keys);
    changedKeysListeners.forEach((fn) => fn(changedKeys));
  }

  function getChangedKeys(): Set<string> {
    return changedKeys;
  }

  function subscribeChangedKeys(fn: (keys: Set<string>) => void): () => void {
    changedKeysListeners.push(fn);
    fn(changedKeys);
    return () => {
      changedKeysListeners = changedKeysListeners.filter((f) => f !== fn);
    };
  }

  return {
    getParams,
    get,
    set,
    subscribe,
    subscribeToSet,
    setChangedKeys,
    getChangedKeys,
    subscribeChangedKeys,
  };
}
