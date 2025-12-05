/*
⛩️ Monument to the Ancestor 🕌

In Macromedia Flash I saw,
a chain that reached, then yielded, raw.
No force was named, no sums were done,
just step by step till rest was won.

Simple strokes, yet deeply true,
the wave that flows, the world I knew.
Today I draw its motion here,
a living monument, held dear.
*/

import { createSignal, onMount, onCleanup } from "solid-js";
import { render } from 'solid-js/web'

import { FabrikContext, newFabrikContext } from "./FabrikDemo-SolidD3/FabrikContext";
import FabrikCanvas from "./FabrikDemo-SolidD3/FabrikCanvas";
import FabrikControls from "./FabrikDemo-SolidD3/FabrikControls";

import { syncHeight } from './window-message-channel';
import css from "./fabrik.css?inline";

export default function FabrikDemoSolidD3() {

  let Explanation!: HTMLDetailsElement;
  let FabrikExplanation!: HTMLIFrameElement;

  onMount(() => {
    // Apply fabrik.css

    // Remove all other styles
    const indexStyle = document.querySelectorAll('style');
    if (indexStyle) indexStyle.forEach(e => { e.remove() });

    // Inject fabrik.css
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    // Cleanup if component unmounts
    onCleanup(() => style.remove());

    // Inject fabrik.css to FabrikExplanation
    FabrikExplanation.addEventListener("load", () => {
      const doc = FabrikExplanation.contentDocument;
      if (doc) {
        const style = doc.createElement("style");
        style.textContent = css;
        doc.head.appendChild(style);
      }
    });

    // Sync Explanation's height with FabrikExplanation's
    syncHeight(Explanation!, FabrikExplanation!);
  });

  return (
    <FabrikContext.Provider value={newFabrikContext()}>
      <div style="max-width: 800px; margin: 10px auto 30px;">
        <FabrikControls position="top" />
        <FabrikCanvas />
        <FabrikControls position="bottom" />

        <p>
          Instruction:
        </p>
        <ul>
          <li><b>Drag</b> the tip <span style="color:red;">◉</span> (red-circled end) to see the effect 😉. This tip is the end effector which will (try to) follow the red-circled target.</li>
          <li>Its base (the other end) can be released by unchecking “Fixed Base”.</li>
          <li>Number of segments: Increase to see smoother transformation; Decrease to see its mechanism, esp. the basic with a single segment.</li>
          <li>The last position can be shown as a shadow chain (<a href="https://en.wikipedia.org/wiki/Ghosting_(television)" target="_blank">ghost</a>) by checking “Shadow”.</li>
          <li>Hold <b>Ctrl</b> key down to keep the last position unchanged.</li>
          <li>For more details, see the Explantion below.</li>
        </ul>

        <details ref={Explanation} style="margin-top:2em;">
          <summary>Explantion</summary>
          <iframe ref={FabrikExplanation} src={new URL("./FabrikExplanation.html", import.meta.url).href}
            style="border:0;"
            width="100%" height="100%"></iframe>
        </details>
      </div>
    </FabrikContext.Provider>
  );
}


// Also export this component as a custom element for direct vanilla use without Solid's render()
class FabrikDemoSolidD3Element extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    render(() => <FabrikDemoSolidD3 />, shadowRoot);
  }
  disconnectedCallback() {
    // clean up, if any...
  }
}
customElements.define("fabrik-demo-solid-3d", FabrikDemoSolidD3Element);
//console.debug(`customElements.get('fabrik-demo-solid-3d'): ${customElements.get('fabrik-demo-solid-3d')}`)
