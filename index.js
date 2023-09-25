//import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

//const d3main = d3.selectAll("#mainSVG");

function scrollRightAll(el){
    // "justify-content: safe right" just falls back to "start", i.e. left alignment.
    // so here we must manually scroll all to the right
    //console.log(`Before: scrollLeft = ${el.scrollLeft}; scrollWidth = ${el.scrollWidth}; clientWidth = ${el.clientWidth}`);
    el.scrollLeft = el.scrollWidth - el.clientWidth;
    //console.log(`After: scrollLeft = ${el.scrollLeft}; scrollWidth = ${el.scrollWidth}; clientWidth = ${el.clientWidth}`);
}
window.scrollRightAll = scrollRightAll;

const breadcrumbs = document.getElementById("breadcrumbs");
breadcrumbs.addEventListener("wheel", function (e) {
    // Map the vertical scroll (e.deltaY) to the horizontal scroll (e.deltaX with Shift-Scroll)
    if (e.deltaY != 0) this.scrollLeft += e.deltaY * 0.2;
});

const indexViewCtrl = document.getElementById("indexViewCtrl");
const resizeObsvr = new ResizeObserver(function (es) {
    for(const e of es) {
        //console.log(`${e.target.id} resized to ${e.contentBoxSize[0].inlineSize}`);
    }
    scrollRightAll(breadcrumbs);
});
resizeObsvr.observe(indexViewCtrl);

