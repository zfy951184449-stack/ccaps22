// Generate Apple-style dark-stage background + luminous glow PNGs.
const sharp = require("sharp");
const fs = require("fs");

const OUT = __dirname + "/assets";
fs.mkdirSync(OUT, { recursive: true });

function svgToPng(svg, file, w, h) {
  return sharp(Buffer.from(svg)).resize(w, h).png().toBuffer().then((buf) => {
    fs.writeFileSync(OUT + "/" + file, buf);
    console.log("wrote", file);
  });
}

// Dark stage background (13.33:7.5 -> 2666x1500). Very subtle off-center radial.
const bg = `
<svg xmlns="http://www.w3.org/2000/svg" width="2666" height="1500">
  <defs>
    <radialGradient id="g" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#0E0E16"/>
      <stop offset="55%" stop-color="#08080E"/>
      <stop offset="100%" stop-color="#050507"/>
    </radialGradient>
  </defs>
  <rect width="2666" height="1500" fill="url(#g)"/>
</svg>`;

// Soft round glow, fully transparent at the edge. color = hex.
function glow(color, peak = 0.55) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400">
  <defs>
    <radialGradient id="r" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${peak}"/>
      <stop offset="35%" stop-color="${color}" stop-opacity="${peak * 0.45}"/>
      <stop offset="70%" stop-color="${color}" stop-opacity="${peak * 0.12}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1400" height="1400" fill="url(#r)"/>
</svg>`;
}

Promise.all([
  svgToPng(bg, "bg.png", 2666, 1500),
  svgToPng(glow("#0A84FF"), "glow_blue.png", 1400, 1400),
  svgToPng(glow("#30D158"), "glow_green.png", 1400, 1400),
  svgToPng(glow("#BF5AF2", 0.5), "glow_purple.png", 1400, 1400),
  svgToPng(glow("#FF453A", 0.6), "glow_red.png", 1400, 1400),
  svgToPng(glow("#5AC8FA", 0.5), "glow_cyan.png", 1400, 1400),
]).then(() => console.log("assets done"));
