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

import Two from 'https://cdnjs.cloudflare.com/ajax/libs/two.js/0.8.0/two.min.js';

// --- Setup Two.js ---
const twoContainer = twoCanvas;
const two = new Two({
  fullscreen: false, type: Two.Types.svg, //canvas, webgl
  width: 600, height: 600,
  autostart: true,
}).appendTo(twoContainer);
const twoDom = two.renderer.domElement;

// --- kinematic chain setup ---
const size = 20;
const center = new Two.Vector(two.width / 4, two.height / 2);
const chainLength = two.width / 2;
let numSegments = numSegs.value;
let segLength = chainLength / numSegments;
const base = two.makeRectangle(center.x, center.y, size, size);
base.fill = 'blue'; base.noStroke();
const target = two.makeCircle(center.x + chainLength, center.y, size / 2);
target.fill = 'blue'; target.stroke = 'red'; target.linewidth = 2;
const joints = [], jointNodes = [], ojoints = [], ojointNodes = [];
const oline = two.makePath(joints, /*open path*/ true);
oline.stroke = 'Gray'; oline.linewidth = 4; oline.noFill(); oline.visible = shadow.checked;
const line = two.makePath(joints, /*open path*/ true);
line.stroke = 'DodgerBlue'; line.linewidth = 4; line.noFill();
let onHold = false;
const projs = []; // projection lines from the last chain to the current chain

// initialize a straight chain
function setupKinematicChain(numSegs) {
  numSegments = numSegs;
  segLength = chainLength / numSegments;
  // clear remaining chains
  while (joints.length) {
    joints.pop(); jointNodes.pop().remove(); line.vertices.pop();
    ojoints.pop(); ojointNodes.pop().remove(); oline.vertices.pop();
    projs.pop().remove();
  }
  // set up new chains
  target.position.set(center.x + chainLength, center.y, size / 2);
  oline.visible = shadow.checked;
  for (let i = 0; i <= numSegments; i++) {
    // last chain
    let oc = two.makeCircle(center.x + i * segLength, center.y, size / 4);
    oc.fill = 'Black'; oc.noStroke(); oc.visible = shadow.checked;
    ojointNodes.push(oc); ojoints.push(oc.position);
    let oa = new Two.Anchor(oc.position.x, oc.position.y);
    oline.vertices.push(oa);
    // current chain
    let c = two.makeCircle(oc.position.x, oc.position.y, size / 4);
    c.fill = 'cyan'; c.noStroke();
    jointNodes.push(c); joints.push(c.position);
    let a = new Two.Anchor(c.position.x, c.position.y);
    line.vertices.push(a);
    // projection lines
    let prj = two.makePath([oa.clone(), a.clone()], /*open path*/ true)
    prj.stroke = 'Gray'; prj.linewidth = 2; prj.noFill(); prj.dashes = [4]; prj.visible = shadow.checked;
    if (i == numSegments) { prj.stroke = 'DimGray' }
    projs.push(prj);
  }
  // console.log(line.vertices) // relative positions!
}
setupKinematicChain(numSegs.value);
numSegs.addEventListener('change', (e) => { setupKinematicChain(numSegs.value); });
shadow.addEventListener('change', (e) => {
  oline.visible = shadow.checked;
  for (let i in joints) {
    ojointNodes[i].visible = projs[i].visible = shadow.checked;
  }
});


/**
 * FABRIK algorithm: last chain + current target --> current chain
 */
function fabrik(target, forward) {
  // Backward propagation from tip to base
  // last chain --> current chain whose tip = target
  joints[joints.length - 1].set(target.x, target.y);
  for (let i = joints.length - 2; i >= 0; i--) {
    let dx = joints[i + 1].x - ojoints[i].x;
    let dy = joints[i + 1].y - ojoints[i].y;
    let dist = Math.hypot(dx, dy);
    let r = segLength / dist;
    joints[i].set(
      (1 - r) * joints[i + 1].x + r * ojoints[i].x,
      (1 - r) * joints[i + 1].y + r * ojoints[i].y
    );
  }

  if (!forward) return;
  // Forward propagation from base to tip
  // current chain whose tip = target --> current chain whose base = center (fixed)
  joints[0].set(center.x, center.y);
  for (let i = 1; i < joints.length; i++) {
    let dx = joints[i - 1].x - joints[i].x;
    let dy = joints[i - 1].y - joints[i].y;
    let dist = Math.hypot(dx, dy);
    let r = segLength / dist;
    joints[i].set(
      (1 - r) * joints[i - 1].x + r * joints[i].x,
      (1 - r) * joints[i - 1].y + r * joints[i].y
    );
  }
}

function updateKinematicChain(hold) {
  // Handle the last chain
  if (!onHold) { // When not on hold, i.e. last chain released
    // copy the current chain to the last chain
    for (let i in joints) {
      ojoints[i].copy(joints[i]);
      oline.vertices[i].x = ojoints[i].x - oline.position.x;
      oline.vertices[i].y = ojoints[i].y - oline.position.y;
      projs[i].vertices[0].x = ojoints[i].x - projs[i].position.x;
      projs[i].vertices[0].y = ojoints[i].y - projs[i].position.y;
    }
  }
  if (hold) {
    //console.debug('hold!');
    if (!onHold) {
      onHold = true; // put the last chain on hold (visible)
      oline.visible = true;
      for (let i in joints) {
        ojointNodes[i].visible = projs[i].visible = true;
      }
      console.log('Hold: (' + ojoints.join('); (') + ')');
    }
  } else if (onHold) {
    onHold = false; // release (hide) the last chain
    if (!shadow.checked) {
      oline.visible = false;
      for (let i in joints) {
        ojointNodes[i].visible = projs[i].visible = false;
      }
    }
  }

  // Handle the current chain
  if (dragging) {
    fabrik(target.position, fixedBase.checked);
    for (let i in line.vertices) {
      line.vertices[i].x = joints[i].x - line.position.x;
      line.vertices[i].y = joints[i].y - line.position.y;
      projs[i].vertices[1].x = joints[i].x - projs[i].position.x;
      projs[i].vertices[1].y = joints[i].y - projs[i].position.y;
    }
  }
}

// --- Animation loop ---
//two.bind('update', updateKinematicChain)//.play();
// Note: Moved from Two's tick-based animation to mouse-event-based animation

const serializer = new XMLSerializer();
saveImage.addEventListener('click', (e) => {
  // update download filename
  let suffix = (fixedBase.checked ? '-fixedBase' : '') + (shadow.checked ? '-sahdow' : '');
  downloadImage.download = `FabrikDemo-${numSegments}-${targetCoords.value.replace(' ', '')}${suffix}.svg`
  // serialize the SVG element
  const svgString = serializer.serializeToString(twoDom);
  downloadImage.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  // then click it!
  downloadImage.click();
});

targetCoords.addEventListener('change', (e) => {
  updateTarget(true, false);
  let odragging = dragging; dragging = true;
  updateKinematicChain(false);
  dragging = odragging;
});

////// Mouse interaction \\\\\\\\

const mouse = new Two.Vector();
let dragging = false;

function mouseup(e) {
  dragging = false;
  twoDom.removeEventListener('mousemove', mousemove);
  twoDom.removeEventListener('mouseup', mouseup);
}

function mousedown(e) {
  let twoBox = twoDom.getBoundingClientRect();
  mouse.set(e.clientX, e.clientY);
  //console.debug(e, mouse);
  let bound = twoBox; //target.getBoundingClientRect();
  dragging = mouse.x > bound.left && mouse.x < bound.right
    && mouse.y > bound.top && mouse.y < bound.bottom;
  updateTarget(fixedTarget.checked, dragging)
  //console.debug('mousedown: dragging=',dragging,'mouse:',mouse,'bound:',bound);
  twoDom.addEventListener('mousemove', mousemove);
  twoDom.addEventListener('mouseup', mouseup);
  updateKinematicChain(e.ctrlKey);
}

function mousemove(e) {
  mouse.set(e.clientX, e.clientY);
  updateTarget(fixedTarget.checked, dragging)
  updateKinematicChain(e.ctrlKey);
}

function updateTarget(fixed, dragging) {
  let twoBox = twoDom.getBoundingClientRect();
  if (fixed) {
    const coords = targetCoords.value.split(',');
    target.position.set(coords[0], coords[1]);
  } else {
    if (dragging) { target.position.set(Math.round(mouse.x - twoBox.x), Math.round(mouse.y - twoBox.y)); }
    targetCoords.value = target.position;
  }
}

twoDom.addEventListener('mouseup', mouseup);
twoDom.addEventListener('mousedown', mousedown);
twoDom.addEventListener('mousemove', mousemove);


export default function FabrikDemo() {
  ///////////////////////////////////////////
  // Interface
  const self = {
    // Fields:
    get name() { return 'FabrikDemo'; },
    two, mouse,
    joints, jointNodes, line,
    ojoints, ojointNodes, oline, projs,
    // Methods:
    Two, fabrik,
  };
  return self;
}

// Also export to globalThis
Object.assign(globalThis, { FabrikDemo });