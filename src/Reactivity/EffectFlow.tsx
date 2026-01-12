import { createMemo, createEffect, createSignal, type Accessor } from "solid-js";

// Circular *Side* Effect Flow
function selfDependency(max: number) {
  const [a, setA] = createSignal(0);
  const aEffect = createEffect(() => {
    const av = a();
    if (av < 10 || av > max - 100) console.log(`Effect: <${av}`);
    if (av < max) setA(() => av + 1);
    if (av < 10 || av > max - 100) console.log(`Effect: >${av}`);
    return av;
  });
  console.log('aEffect = ', aEffect, ', a = ', a());
  return a;
}

// Circular Effect Flow
function circularDependency(max: Accessor<number>) {
  const [init, setInit] = createSignal(true);

  const aMemo = createMemo((prev): number => {
    if (init()) return 0;
    if (prev && (prev < 10 || prev > max() - 100)) console.log(`aMemo: ${prev}`);
    return prev < max() ? bMemo() + 1 : prev;
  });
  const bMemo = createMemo((prev): number => {
    if (init()) return 0;
    if (prev && (prev < 10 || prev > max() - 100)) console.log(`bMemo: ${prev}`);
    return prev < max() ? aMemo() + 1 : prev;
  });

  return [init, setInit, aMemo, bMemo];
}

export default () => {
  const [maxV, setMaxV] = createSignal(2826); // 2826, 9572
  const [v, setV] = createSignal(0);

  const [maxA, setMaxA] = createSignal(Math.floor(10e5 / 3) - 1); // signal.ts: if (Updates!.length > 10e5) if (IS_DEV) throw new Error("Potential Infinite Loop Detected.");
  const [init, setInit, aMemo, bMemo] = circularDependency(maxA);

  return (
    <div>
      <h2>Effect Flow Test</h2>
      (Check logs in console)
      <p>Self Dependency: v = {v()} &emsp;
        <button onClick={() => { let a = selfDependency(maxV()); setV(a()) }}
          title="This may lead to stack overflow due to infinite loop!">Get value</button>
        &emsp; with max stack size: <input type="number" value={maxV()} style="width:60px;"
          onChange={(e) => setMaxV(Number(e.target.value))} />
      </p>
      <p>Circular Dependency: a = {aMemo()}, &nbsp; b = {bMemo()} &emsp;
        <button onClick={() => setInit(false)}
          title="This will lead to a queue-guarded infinite loop!">Start</button>
        &emsp; with max: <input type="number" value={maxA()} style="width:70px;"
          onChange={(e) => setMaxA(Number(e.target.value))} />
      </p>
    </div>
  )
}
