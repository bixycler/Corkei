import { createMemo, createEffect, createSignal } from "solid-js";

  // Circular *Side* Effect Flow
  function selfDependency(){
    const [a, setA] = createSignal(0);
    const aEffect = createEffect(() => {
      const av = a();
      console.log(`Effect: <${av}`);
      if(av < 2903) setA(()=> av+1);
      console.log(`Effect: >${av}`);
      return av;
    });
    console.log(`aEffect = ${aEffect}: a = ${a()}`);
    return a;
  }

  // Circular Effect Flow
  function circularDependency(){
    const [init, setInit] = createSignal(true);

    const aMemo = createMemo((prev):number => {
      if (init()) return 0;
      if (prev && (prev < 10 || prev > 333303)) console.log(`aMemo: ${prev}`);
      return bMemo() + 1;
    });
    const bMemo = createMemo((prev):number => {
      if (init()) return 0;
      if (prev && (prev < 10 || prev > 333303)) console.log(`bMemo: ${prev}`);
      return aMemo() + 1;
    });

    return [init, setInit, aMemo, bMemo];
  }

export default () => {
  //const a = selfDependency();

  const [init, setInit, aMemo, bMemo] = circularDependency();
  // Kick start
  setInit(false); // This will lead to a queue-guarded infinite loop

  return (
    <div>
      <h2>Effect Flow Test</h2>
      <p>a =  </p>

    </div>
  )
}
