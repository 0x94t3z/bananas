import { readFileSync, writeFileSync } from "node:fs";

const width = 1024;
const height = 1024;
const purple = "#5d479a";
const white = "#f5feff";
const banana = readFileSync("public/images/bananas.png").toString("base64");

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "↑": ["00100", "01110", "10101", "00100", "00100", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

const smallGlyphs = {
  ...glyphs,
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["00000", "10000", "10000", "11110", "10001", "10001", "11110"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  h: ["10000", "10000", "10000", "11110", "10001", "10001", "10001"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  t: ["00100", "00100", "11111", "00100", "00100", "00101", "00010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
};

function pixelText(text, x, y, scale, source = glyphs) {
  const spacing = scale;
  const charWidth = 5 * scale + spacing;
  let cursor = x;
  let rects = "";

  for (const char of text) {
    const grid = source[char] ?? source[" "];
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        if (grid[row][col] === "1") {
          rects += `<rect x="${cursor + col * scale}" y="${y + row * scale}" width="${scale}" height="${scale}" fill="${white}"/>`;
        }
      }
    }
    cursor += charWidth;
  }

  return rects;
}

function textWidth(text, scale) {
  return text.length * (5 * scale + scale) - scale;
}

function centered(text, y, scale, source = glyphs) {
  return pixelText(text, (width - textWidth(text, scale)) / 2, y, scale, source);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${purple}"/>
  ${centered("BANANA", 150, 13)}
  <image href="data:image/png;base64,${banana}" x="251" y="260" width="520" height="346" preserveAspectRatio="xMidYMid meet"/>
  ${centered("TAP ↑", 725, 13)}
  ${centered("Frame by @0x94t3z.eth", 880, 6, smallGlyphs)}
</svg>`;

writeFileSync("/tmp/banana-hero.svg", svg);
