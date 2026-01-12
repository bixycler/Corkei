import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { Motion } from "solid-motionone";
import * as d3 from "d3";


import viteLogo from '../assets/vite.svg'
import solidLogo from '../assets/solid.svg'
import motionLogo from '../assets/motion.svg'
import d3Logo from '../assets/d3.svg'
import '../assets/Welcome.css'

export default function ViteMotionSolidD3DemoWelcome() {
  const [count, setCount] = createSignal(0); // Solid's signal

  // D3's scale to map count → color
  const intent = 10.3
  const colorStr = d3.scaleOrdinal(d3.schemeCategory10).domain([0, intent].map(n => n.toString()));
  const color = (c: number) => colorStr(String(c));

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} class="logo" alt="Vite logo" />
        </a>
        <a href="https://motion.dev/" target="_blank">
          <img src={motionLogo} class="logo motion" alt="Motion logo" />
        </a>
        <a href="https://solidjs.com" target="_blank">
          <img src={solidLogo} class="logo solid" alt="Solid logo" />
        </a>
        <a href="https://d3js.org/" target="_blank">
          <img src={d3Logo} class="logo" alt="D3 logo" />
        </a>
      </div>
      <h1>Vite Motion <i>Solid</i> D3</h1>
      <div class="card">
        <p> Click to see the color change smoothly: </p>
        <Motion.button id='counter'
          onClick={() => setCount((count) => ++count % 100)} /* Change count here... */
          animate={{ background: color(count()) }} /* Changed value's reflected right here! */
          transition={{ duration: 1 }} /* Motion's smooth transition to the new color */
        >
          <code>color(</code>{count()}<code>) = {color(count())}</code>
        </Motion.button>
        <p>
          HMR with <code>rpm run dev:hmr</code>: Edit <code>src/*</code> and save to see the hot update!
        </p>
      </div>
      <p class="read-the-docs">
        Click on the logos above to learn more.
      </p>
    </>
  )
}

// Also export this component as a custom element for direct vanilla use without Solid's render()
class ViteMotionSolidD3DemoWelcomeElement extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    render(() => <ViteMotionSolidD3DemoWelcome />, shadowRoot);
  }
  disconnectedCallback() {
    // clean up, if any...
  }
}
customElements.define("vite-motion-solid-3d-demo-welcome", ViteMotionSolidD3DemoWelcomeElement);
//console.debug(`customElements.get('vite-motion-solid-3d-demo-welcome'): ${customElements.get('vite-motion-solid-3d-demo-welcome')}`)
