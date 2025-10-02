import { onMount } from "solid-js";

import { useFabrik } from "./FabrikContext";
import { useFabrikChain } from "./FabrikChain";



export default ()=>{
  const {
    numSegments, setNumSegments,
    fixedBase, setFixedBase,
    shadow, setShadow,
    target, setTarget,
    fixedTarget, setFixedTarget,

    canvas, setCanvas,
  } = useFabrik();


  // Use onMount for D3 or imperative actions if needed
  onMount(() => {
    console.log('numSegments:',numSegments());
    // Setup D3, mouse handlers, etc., using canvas()
    // The logic for FABRIK should be handled via props.chain
    // Redraw on prop changes as needed
  });

  // Render SVG chain, joints, links, shadow, and target
  // (This is just a stub - you would fill this in with your drawing logic)
  return (
    <svg ref={el=>{setCanvas(el)}} width={600} height={600}
      style={{ background: "DimGray", display: "block", margin: "0" }}
      // Add event handlers for drag, etc.
    >
      {/* Render joints, links, shadow, and target here */}
      {/* Example: <circle cx={...} cy={...} r={...} /> */}
    </svg>
  );
}