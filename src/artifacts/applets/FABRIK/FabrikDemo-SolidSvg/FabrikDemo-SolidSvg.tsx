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

import { FabrikContext, newFabrikContext } from "./FabrikContext";
import FabrikCanvas from "./FabrikCanvas";
import FabrikControls from "./FabrikControls";


import { syncHeight } from '../window-message-channel';
import css from "../assets/fabrik.css?inline";

export default function FabrikDemoSolidSvg(props: { explanationUrl?: string }) {

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
          <iframe ref={FabrikExplanation} src={props.explanationUrl || "../FabrikExplanation.html"}
            style="border:0;"
            width="100%" height="100%"></iframe>
        </details>
      </div>
    </FabrikContext.Provider>
  );
}


// Also export this component as a custom element for direct vanilla use without Solid's render()
class FabrikDemoSolidSvgElement extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    const explanationUrl = this.getAttribute("explanation-url") || undefined;
    render(() => <FabrikDemoSolidSvg explanationUrl={explanationUrl} />, shadowRoot);
  }
  disconnectedCallback() {
    // clean up, if any...
  }
}
customElements.define("fabrik-demo-solid-svg", FabrikDemoSolidSvgElement);
//console.debug(`customElements.get('fabrik-demo-solid-svg'): ${customElements.get('fabrik-demo-solid-svg')}`)
