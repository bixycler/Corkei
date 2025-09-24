
import { Motion } from "solid-motionone";

const T = 100; // period/range of the counter

export default (p: {
  count: () => number;
  setCount: (updater: (c: number) => number) => void;
  color: (c: number) => string;
}) => (
  <Motion.button id='counter'
    onClick={() => p.setCount((count) => ++count % T)} /* Change count here... */
    animate={{background: p.color(p.count())}} /* Changed value's reflected right here! */
    transition={{ duration: 1 }} /* Motion's smooth transition to the new color */
  >
    <code>color(</code>{p.count()}<code>) = {p.color(p.count())}</code>
  </Motion.button>
)