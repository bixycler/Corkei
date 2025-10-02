import { createContext, useContext } from "solid-js";
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

export const FabrikContext = createContext<FabrikContextType>();

export function useFabrik() {
  const ctx = useContext(FabrikContext);
  if (!ctx) throw new Error("FabrikContext missing");
  return ctx;
}
