import { createEffect, onCleanup, onMount } from "solid-js";
import { fabrikContext } from "./FabrikContext";
import type { Vector } from "./FabrikChain";

export default function FabrikCanvas() {
  const {
    numSegments,
    fixedBase,
    shadow,
    fixedTarget,
    target,
    setTarget,
    isCtrlPressed,
    setIsCtrlPressed,
    setCanvas,
    chain,
  } = fabrikContext();

  const {
    joints,
    shadowJoints,
    fabrik,
    holdShadow,
  } = chain;

  let svgRef: SVGSVGElement | undefined;
  let dragging = false;

  function toSVGCoords(e: MouseEvent): Vector {
    const rect = svgRef!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onPointerDown(e: MouseEvent) {
    const tip = joints()[numSegments()];
    const mouse = toSVGCoords(e);
    if (Math.abs(mouse.x - tip.x) < 20 && Math.abs(mouse.y - tip.y) < 20) {
      dragging = true;
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    }
  }

  function onPointerMove(e: MouseEvent) {
    if (!dragging) return;
    const mouse = toSVGCoords(e);
    if (!fixedTarget()) {
      setTarget({ x: mouse.x, y: mouse.y });
      fabrik({ x: mouse.x, y: mouse.y }, fixedBase());
    }
  }

  function onPointerUp() {
    dragging = false;
    // If Ctrl is not pressed, shadow should sync with current
    if (!isCtrlPressed()) {
      holdShadow();
    }
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
  }

  // Handle Ctrl key
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Control") {
      setIsCtrlPressed(true);
      // When Ctrl is pressed, we "hold" the shadow at current position
      // (Actually, logic says: if Ctrl pressed, shadow doesn't update. 
      // So we might want to ensure it's at current before freezing? 
      // Original: "Hold Ctrl key down to keep the last position unchanged."
      // So it just stops updating.)
      holdShadow();
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Control") {
      setIsCtrlPressed(false);
      // When released, shadow snaps back to current
      holdShadow();
    }
  }

  onMount(() => {
    if (svgRef) setCanvas(svgRef);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  });

  // FABRIK update on prop changes
  createEffect(() => {
    fabrik(target(), fixedBase());
    // If not holding Ctrl, shadow follows
    if (!isCtrlPressed()) {
      holdShadow();
    }
  });

  // Redraw on numSegments change
  createEffect(() => {
    fabrik(target(), fixedBase());
    holdShadow(); // Always reset shadow on structure change
  });

  // Render chain as SVG
  return (
    <svg
      ref={svgRef}
      width={600}
      height={600}
      style={{ background: "DimGray", display: "block", margin: "0 auto" }}
      onMouseDown={onPointerDown}
    >
      {/* Shadow (ghost) chain */}
      {shadow() && (
        <>
          <polyline
            points={shadowJoints()
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            fill="none"
            stroke="gray"
            stroke-width={4}
            opacity={0.4}
          />
          {/* Projection lines */}
          {shadowJoints().map((sp: Vector, i: number) => {
            const p = joints()[i];
            // Don't draw if they are same or very close
            if (Math.abs(sp.x - p.x) < 1 && Math.abs(sp.y - p.y) < 1) return null;
            return (
              <line
                x1={sp.x} y1={sp.y}
                x2={p.x} y2={p.y}
                stroke="gray"
                stroke-width={1}
                stroke-dasharray="4"
                opacity={0.5}
              />
            );
          })}
        </>
      )}
      {/* Main chain */}
      <polyline
        points={joints()
          .map((p: Vector) => `${p.x},${p.y}`)
          .join(" ")}
        fill="none"
        stroke="dodgerblue"
        stroke-width={4}
      />
      {/* Joints */}
      {joints().map((p: Vector, i: number) => (
        <circle
          cx={p.x}
          cy={p.y}
          r={8}
          fill={i === 0 ? "blue" : i === numSegments() ? "cyan" : "black"}
          stroke={i === numSegments() ? "red" : "none"}
          stroke-width={i === numSegments() ? 2 : 0}
        />
      ))}
      {/* Target */}
      <circle
        cx={target().x}
        cy={target().y}
        r={12}
        fill="blue"
        stroke="red"
        stroke-width={2}
        opacity={0.5}
      />
    </svg>
  );
}