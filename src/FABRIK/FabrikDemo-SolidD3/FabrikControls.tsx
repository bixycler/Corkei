import { Switch, Match } from "solid-js";
import type { JSX } from "solid-js";

import { fabrikContext } from "./FabrikContext";


export default (props: { position: "top" | "bottom" }): JSX.Element => {
  const {
    numSegments, setNumSegments,
    fixedBase, setFixedBase,
    shadow, setShadow,
    target, setTarget,
    fixedTarget, setFixedTarget,

    canvas,
  } = fabrikContext();

  let downloadImage!: HTMLAnchorElement;
  let targetCoords!: HTMLInputElement;

  return (
    <Switch>
    {/* Top controls above canvas */}
    <Match when={props.position === "top" }>
      <label>
        <input type="checkbox" checked={fixedBase()}
          onInput={e => setFixedBase(e.currentTarget.checked)}
        />{" "}
        Fixed Base
      </label>
      &emsp;&emsp;
      <label for="numSegs">
        Number of Segments:{" "}
        <output style={{ display: "inline-block", width: "1em" }}>
          {numSegments()}
        </output>
        <input type="range" id="numSegs" min="1" max="30" style={{ width: "150px" }}
          value={numSegments()}
          onInput={e => setNumSegments(Number(e.currentTarget.value))}
        />
      </label>
      &emsp;
      <label>
        <input type="checkbox" checked={shadow()}
          onInput={e => setShadow(e.currentTarget.checked)}
        />{" "}
        Shadow
      </label>
    </Match>

    {/* Bottom controls below canvas */}
    <Match when={props.position === "bottom" }>
      <label>
        Target:{" "}
        <input ref={targetCoords} type="text" size={7}
          value={`${target().x}, ${target().y}`}
          onInput={e => {
            const [x, y] = e.currentTarget.value.split(",").map(Number);
            if (!isNaN(x) && !isNaN(y)) setTarget({ x, y });
          }}
        />
      </label>
      &ensp;
      <label>
        <input type="checkbox" checked={fixedTarget()}
          onInput={e => setFixedTarget(e.currentTarget.checked)}
        />{" "}
        Fixed Target
      </label>
      &emsp;&emsp;
      <button type="button" onClick={() => {
        // update download filename
        let suffix = (fixedBase() ? '-fixedBase' : '') + (shadow() ? '-sahdow' : '');
        downloadImage.download = `FabrikDemo-${numSegments()}-${targetCoords.value.replace(' ','')}${suffix}.svg`
        // serialize the SVG element
        const svgString = new XMLSerializer().serializeToString(canvas());
        downloadImage.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
        // then click it!
        downloadImage.click();
      }}>
        Save Image
      </button>
      <a ref={downloadImage} download="FabrikDemo.svg" hidden />
    </Match>
    </Switch>
  );
}