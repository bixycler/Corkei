
import { Index, createMemo, createEffect } from "solid-js";
import * as d3 from "d3";
import { Motion } from "solid-motionone";
import { animate } from "motion";

const width = 600, height = 100, offset = 20;
// D3's surve: a pointer to the x position
function pointer(x: number):string {
  x = Math.max(0, x);
  const points = [
    {x:0, y:offset},
    {x:x, y:offset}, {x:x+offset, y:height/2}, {x:x+offset*2, y:offset},
    {x:width*2, y:offset}];
  const line = d3.line<{ x: number; y: number }>().x(d => d.x).y(d => d.y).curve(d3.curveBumpY);
  return line(points) || '';
}

export default (p: {
  count: () => number;
  scale: d3.ScaleLinear<number,number>;
  color: (c: number) => string;
}) => {
  // position of tick at c
  const scaleX = createMemo(() =>
    d3.scaleLinear(p.scale.range(), [0, width])
  );
  const x = (c:number) => scaleX()(p.scale(c)) % width;
  // distance between ticks
  const dx = x(1) - x(0)
  // tick indices computed from count()
  const ticks = createMemo(() => {
    const n = Math.max(0, Math.floor(p.count()+1));
    return Array.from({ length: n }, (_, i) => x(i)+offset);
  });

  // animation of the pointer
  let pointerRef;
  createEffect(() => { p.count(); // dependency
    pointerRef && animate(pointerRef, { x: 0 }, { duration: 0.3, from: -dx });
  });

  return (
    <svg width={width + offset*2} height={height}>
      <defs>
      <linearGradient id="angryRainbow" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0.000%" stop-color="hsl(  0, 50%, 50%)" />
        <stop offset="16.66%" stop-color="hsl( 60, 50%, 50%)" />
        <stop offset="33.33%" stop-color="hsl(120, 50%, 50%)" />
        <stop offset="50.00%" stop-color="hsl(180, 50%, 50%)" />
        <stop offset="66.66%" stop-color="hsl(240, 50%, 50%)" />
        <stop offset="83.33%" stop-color="hsl(300, 50%, 50%)" />
        <stop offset="100.0%" stop-color="hsl(360, 50%, 50%)" />
      </linearGradient>
      </defs>
      {/* pointer to color(count) */}
      <path ref={pointerRef} d={pointer(x(p.count()))}
        // initial={{ x: -dx }} animate={{ x: p.count()*1e-5 }} transition={{ duration: 0.3 }}
        fill='none' stroke={p.color(p.count())} stroke-width='2'
      ></path>
      {/* angryRainbow spectrum */}
      <rect x={offset} y={height/2} width={width} height={height/2 - offset}
        fill="url(#angryRainbow)"
      ></rect>
      <Index each={ticks()}>{(t,i) => (
        <line x1={t()} x2={t()} y1={height - offset} y2={height} stroke={p.color(i)} />
      )}</Index>
    </svg>
  )
}