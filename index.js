import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const d3main = d3.selectAll("#mainSVG");

d3main.selectAll("circle")
  .data(d3.range(100))
  .join("circle")
    .attr("cx", -300+50)
    .attr("cy", d => d * 50 - 300)
    .attr("r", d => Math.abs(Math.cos(d)) * 20)
    .attr("fill", "blue")
    .on("mouseover", (e,d)=>{
      d3.select(e.target).style("fill", "orange");
      //console.log(`[${d}] xy(${e.offsetX},${e.offsetY})`,e.target,'from',e.fromElement,  e);
    })
    .on("mouseout", (e)=>{
      d3.select(e.target).style("fill", "");
      //console.log(`out xy(${e.offsetX},${e.offsetY})`,e.target,'to',e.toElement,  e);
    })


