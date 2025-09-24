import * as d3 from "d3";

import Counter from "./Welcome-counter";
import SvgDemo from "./Welcome-svg";

import viteLogo from './assets/vite.svg'
import solidLogo from './assets/solid.svg'
import motionLogo from './assets/motion.svg'
import d3Logo from './assets/d3.svg'
import './Welcome.css'

export default (p: {
  count: () => number;
  setCount: (updater: (c: number) => number) => void;
  scale: d3.ScaleLinear<number,number>;
  color: (c: number) => string;
}) => (<>
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
  <h3>The framework for <i>solid data-driven documents</i> enriched with quick motion</h3>
  <div class="card">
    <Counter count={p.count} setCount={p.setCount} color={p.color} /><br/>
    <SvgDemo count={p.count} scale={p.scale} color={p.color} />
    <p>
      <a href="https://solidjs.com" target="_blank">Solid</a> for reactivity,&ensp;
      <a href="https://d3js.org/" target="_blank">D3</a> for graphic math,&ensp;
      <a href="https://motion.dev/" target="_blank">Motion</a> for smooth transitions,&ensp;
      <a href="https://vite.dev" target="_blank">Vite</a> for quick development & deployment.
    </p>
  </div>
  <p class="read-the-docs">
    Click on the logos above to learn more.
  </p>
</>)

