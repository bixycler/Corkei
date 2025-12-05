import { createSignal } from "solid-js";

export type Vector = { x: number; y: number };

export function distance(a: Vector, b: Vector) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function cloneVec(v: Vector): Vector {
  return { x: v.x, y: v.y };
}

export function useFabrikChain(
  initialNumSegments = 10,
  initialLength = 300,
  initialCenter: Vector = { x: 150, y: 300 }
) {
  // Chain state
  const [numSegments, setNumSegments] = createSignal(initialNumSegments);
  const [segLength, setSegLength] = createSignal(initialLength / initialNumSegments);
  const [center, setCenter] = createSignal(cloneVec(initialCenter));
  const [joints, setJoints] = createSignal<Vector[]>([]);
  const [shadowJoints, setShadowJoints] = createSignal<Vector[]>([]);

  // Initialize chain
  function setupChain(n: number, length: number = initialLength, ctr: Vector = initialCenter) {
    setNumSegments(n);
    setSegLength(length / n);
    setCenter(cloneVec(ctr));
    const js: Vector[] = [];
    for (let i = 0; i <= n; ++i) {
      js.push({ x: ctr.x + (length * i) / n, y: ctr.y });
    }
    setJoints(js);
    setShadowJoints(js.map(cloneVec));
  }

  // FABRIK Algorithm (1 or 2-pass)
  function fabrik(
    target: Vector,
    fixedBase: boolean = true
  ) {
    const len = numSegments();
    const seg = segLength();
    let js = joints().map(cloneVec);

    // Backward: tip to base
    js[len] = cloneVec(target);
    for (let i = len - 1; i >= 0; --i) {
      const dx = js[i + 1].x - js[i].x;
      const dy = js[i + 1].y - js[i].y;
      const d = Math.hypot(dx, dy);
      const r = seg / d;
      js[i] = {
        x: (1 - r) * js[i + 1].x + r * js[i].x,
        y: (1 - r) * js[i + 1].y + r * js[i].y,
      };
    }

    // Forward: base to tip (if fixed)
    if (fixedBase) {
      js[0] = cloneVec(center());
      for (let i = 1; i <= len; ++i) {
        const dx = js[i - 1].x - js[i].x;
        const dy = js[i - 1].y - js[i].y;
        const d = Math.hypot(dx, dy);
        const r = seg / d;
        js[i] = {
          x: (1 - r) * js[i - 1].x + r * js[i].x,
          y: (1 - r) * js[i - 1].y + r * js[i].y,
        };
      }
    }

    setJoints(js);
  }

  // Hold/Shadow: Save current joints as shadow
  function holdShadow() {
    setShadowJoints(joints().map(cloneVec));
  }

  // Update on control changes
  function updateNumSegments(n: number) {
    setupChain(n, segLength() * n, center());
  }

  // Initial setup
  setupChain(initialNumSegments, initialLength, initialCenter);

  return {
    numSegments,
    setNumSegments: updateNumSegments,
    segLength,
    center,
    joints,
    shadowJoints,
    holdShadow,
    fabrik,
    setupChain,
  };
}