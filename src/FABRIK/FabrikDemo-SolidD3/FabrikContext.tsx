import { createContext, useContext, createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";

import { useFabrikChain } from "./FabrikChain";

type FabrikContextType = {
  numSegments: Accessor<number>;
  setNumSegments: Setter<number>;
  fixedBase: Accessor<boolean>;
  setFixedBase: Setter<boolean>;
  shadow: Accessor<boolean>;
  setShadow: Setter<boolean>;
  target: Accessor<{ x: number; y: number }>;
  setTarget: Setter<{ x: number; y: number }>;
  fixedTarget: Accessor<boolean>;
  setFixedTarget: Setter<boolean>;

  canvas: Accessor<SVGElement|null>;
  setCanvas: Setter<SVGElement|null>;
  chain: ReturnType<typeof useFabrikChain>;
};

const [numSegments, setNumSegments] = createSignal(10);
const [fixedBase, setFixedBase] = createSignal(true);
const [shadow, setShadow] = createSignal(true);
const [target, setTarget] = createSignal({ x: 400, y: 300 });
const [fixedTarget, setFixedTarget] = createSignal(false);

const [canvas, setCanvas] = createSignal<SVGElement|null>(null);
const chain = useFabrikChain();

export const FabrikContextValue = {
  numSegments, setNumSegments,
  fixedBase, setFixedBase,
  shadow, setShadow,
  target, setTarget,
  fixedTarget, setFixedTarget,

  canvas, setCanvas,
  chain,
};

export const FabrikContext = createContext<FabrikContextType>();

export function fabrikContext() {
  const ctx = useContext(FabrikContext);
  if (!ctx) throw new Error("FabrikContext missing");
  return ctx;
}
