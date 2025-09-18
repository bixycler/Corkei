import Two from 'https://cdn.skypack.dev/two.js@latest';

// --- Setup Two.js ---
const twoContainer = twoCanvas;
const two = new Two({
  fullscreen: false, type: Two.Types.svg, //canvas, webgl
  width: 600, height: 600,
  autostart: true,
}).appendTo(twoContainer);
const twoDom = two.renderer.domElement;
const twoBox = twoDom.getBoundingClientRect();

// --- kinematic chain setup ---
const size = 20;
const center = new Two.Vector(two.width/4, two.height/2);
const numSegments = 10;
const segLength = 30;
const root = two.makeRectangle(center.x, center.y, size, size);
  root.fill = 'blue'; root.noStroke();
const tip = two.makeCircle(center.x + segLength*numSegments, center.y, size/2);
  tip.fill = 'blue'; tip.stroke = 'red'; tip.linewidth = 2;
const joints = [];

// initialize a straight chain
for (let i = 0; i <= numSegments; i++) {
  let c = two.makeCircle(center.x + i*segLength, center.y, 5);
    c.fill = 'cyan'; c.noStroke();
  joints.push(c.position);
}
const line = two.makePath(joints.map(p => new Two.Anchor(p.x, p.y )), /*open path*/ true);
line.stroke = 'DodgerBlue'; line.linewidth = 4; line.noFill();
// console.log(line.vertices) // relative positions!

// --- FABRIK algorithm ---
function fabrik(target, forward) {
  // backward
  joints[joints.length - 1].set(target.x, target.y);
  for (let i = joints.length - 2; i >= 0; i--) {
    let dx = joints[i].x - joints[i + 1].x;
    let dy = joints[i].y - joints[i + 1].y;
    let dist = Math.hypot(dx, dy);
    let r = segLength / dist;
    joints[i].set(
      (1 - r) * joints[i + 1].x + r * joints[i].x,
      (1 - r) * joints[i + 1].y + r * joints[i].y
    );
  }

  if (!forward) return;
  // forward (anchor base)
  joints[0].set(center.x, center.y);
  for (let i = 1; i < joints.length; i++) {
    let dx = joints[i].x - joints[i - 1].x;
    let dy = joints[i].y - joints[i - 1].y;
    let dist = Math.hypot(dx, dy);
    let r = segLength / dist;
    joints[i].set(
      (1 - r) * joints[i - 1].x + r * joints[i].x,
      (1 - r) * joints[i - 1].y + r * joints[i].y
    );
  }
}


// --- Animation loop ---
two.bind('update', function () {
  if(dragging){
    fabrik(mouse, fixedRoot.checked);
    for (let i in line.vertices) {
      line.vertices[i].x = joints[i].x - line.position.x;
      line.vertices[i].y = joints[i].y - line.position.y;
    }
  }
}).play();


////// Mouse interaction \\\\\\\\

const mouse = new Two.Vector();
let dragging = false;

function mouseup(e) {
  dragging = false;
  twoDom.removeEventListener('mousemove', mousemove);
  twoDom.removeEventListener('mouseup', mouseup);
}

function mousedown(e) {
  mouse.set(e.clientX - twoBox.left, e.clientY - twoBox.top);
  //console.debug(e, mouse);
  let bound = tip.getBoundingClientRect();
  dragging = mouse.x > bound.left && mouse.x < bound.right
    && mouse.y > bound.top && mouse.y < bound.bottom;
  twoDom.addEventListener('mousemove', mousemove);
  twoDom.addEventListener('mouseup', mouseup);
}

function mousemove(e) {
  mouse.set(e.clientX - twoBox.left, e.clientY - twoBox.top);
  if (dragging) { tip.position.copy(mouse); }
}

twoDom.addEventListener('mouseup', mouseup);
twoDom.addEventListener('mousedown', mousedown);
twoDom.addEventListener('mousemove', mousemove);


export default function FabrikDemo() {
  ///////////////////////////////////////////
  // Interface
  const self = {
    // Fields:
    get name(){ return 'FabrikDemo'; },
    two, joints, line, mouse,
    // Methods:
    Two, fabrik,
  };
  return self;
}

// Also export to globalThis
Object.assign(globalThis, {FabrikDemo});