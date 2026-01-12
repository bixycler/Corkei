import { createSignal } from "solid-js";
import { render } from 'solid-js/web'
import * as d3 from "d3";

import WelcomeTemplate from "./Welcome-template.tsx";

export default function ViteMotionSolidD3DemoWelcomeModular() {
  const [count, setCount] = createSignal(0); // Solid's signal for synchronous communication between components

  // D3's scale to map count → color hue
  const intent = 10.3, domain = [0, intent];
  const scale = d3.scaleLinear().domain(domain)
  const angryRainbow = d3.scaleSequential(t => d3.hsl(t * 360, 0.5, 0.3).clamp().toString()).domain(domain);


  return (
    <WelcomeTemplate count={count} setCount={setCount} scale={scale} color={angryRainbow} />
  );
}


// Also export this component as a custom element for direct vanilla use without Solid's render()
class ViteMotionSolidD3DemoWelcomeModularElement extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    render(() => <ViteMotionSolidD3DemoWelcomeModular />, shadowRoot);
  }
  disconnectedCallback() {
    // clean up, if any...
  }
}
customElements.define("vite-motion-solid-3d-demo-welcome-modular", ViteMotionSolidD3DemoWelcomeModularElement);
//console.debug(`customElements.get('vite-motion-solid-3d-demo-welcome-modular'): ${customElements.get('vite-motion-solid-3d-demo-welcome-modular')}`)
