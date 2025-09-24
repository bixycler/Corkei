import { createSignal } from "solid-js";
import * as d3 from "d3";

import WelcomeTemplate from "./Welcome-template";

export default () => {
  const [count, setCount] = createSignal(0); // Solid's signal for synchronous communication between components

  // D3's scale to map count → color hue
  const intent = 10.3, domain = [0, intent];
  const scale = d3.scaleLinear().domain(domain)
  const angryRainbow = d3.scaleSequential(t => d3.hsl(t*360, 0.5, 0.3).clamp().toString()).domain(domain);


  return (
    <WelcomeTemplate count={count} setCount={setCount} scale={scale} color={angryRainbow} />
  );
}
