import { readFileSync, writeFileSync } from "node:fs";

const width = 1024;
const height = 1024;
const purple = "#5d479a";
const white = "#f5feff";

const banana = readFileSync("public/images/bananas.png").toString("base64");
const pixelify400 = readFileSync("assets/fonts/pixelify-sans-400.ttf").toString(
  "base64",
);
const pixelify600 = readFileSync("assets/fonts/pixelify-sans-600.ttf").toString(
  "base64",
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      @font-face {
        font-family: "Pixelify Sans";
        src: url("data:font/ttf;base64,${pixelify400}") format("truetype");
        font-weight: 400;
      }
      @font-face {
        font-family: "Pixelify Sans";
        src: url("data:font/ttf;base64,${pixelify600}") format("truetype");
        font-weight: 600;
      }
      .pixel {
        fill: ${white};
        font-family: "Pixelify Sans", monospace;
        text-anchor: middle;
        dominant-baseline: middle;
      }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${purple}"/>
  <text class="pixel" x="512" y="180" font-size="76" font-weight="600" letter-spacing="4">BANANA</text>
  <image href="data:image/png;base64,${banana}" x="251" y="260" width="520" height="346" preserveAspectRatio="xMidYMid meet"/>
  <text class="pixel" x="512" y="760" font-size="78" font-weight="600" letter-spacing="4">TAP ↑</text>
  <text class="pixel" x="512" y="898" font-size="34" font-weight="600" letter-spacing="1">Snap by @0x94t3z.eth</text>
</svg>`;

writeFileSync("/tmp/banana-hero.svg", svg);
