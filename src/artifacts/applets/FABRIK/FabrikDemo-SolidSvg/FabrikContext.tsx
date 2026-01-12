import { createContext, useContext, createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";

import { useFabrikChain } from "./FabrikChain";

export type FabrikContextType = {
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

  isCtrlPressed: Accessor<boolean>;
  setIsCtrlPressed: Setter<boolean>;

  canvas: Accessor<SVGElement | null>;
  setCanvas: Setter<SVGElement | null>;
  chain: ReturnType<typeof useFabrikChain>;
};

/** The singleton ref interface to the corresponding context object: context = useContext(FabrikContext)
 * This is the "thick interface" with runtime ref, compared to the "thin interface" FabrikContextType at compile time (erased at runtime).
*/
export const FabrikContext = createContext<FabrikContextType>();

/** Create a new instance of the context object */
export function newFabrikContext() {

  const [numSegments, setNumSegments] = createSignal(10);
  const [fixedBase, setFixedBase] = createSignal(true);
  const [shadow, setShadow] = createSignal(true);
  const [target, setTarget] = createSignal({ x: 400, y: 300 });
  const [fixedTarget, setFixedTarget] = createSignal(false);
  const [isCtrlPressed, setIsCtrlPressed] = createSignal(false);

  const [canvas, setCanvas] = createSignal<SVGElement | null>(null);
  const chain = useFabrikChain();

  return {
    numSegments, setNumSegments,
    fixedBase, setFixedBase,
    shadow, setShadow,
    target, setTarget,
    fixedTarget, setFixedTarget,

    isCtrlPressed, setIsCtrlPressed,

    canvas, setCanvas,
    chain,
  };
}

/** The context object to be used by sub-components */
export function fabrikContext() {
  const ctx = useContext(FabrikContext);
  if (!ctx) throw new Error("FabrikContext missing");
  return ctx;
}
