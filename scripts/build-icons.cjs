// Rasterize the approved SVG at each browser/store size; no resized source bitmap.
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.MEWE_BROWSER_EXE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(root, "assets/icons/mark.svg"), "utf8");
    for (const size of [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.screenshot({ path: path.join(root, `assets/icons/icon${size}.png`), omitBackground: true });
    }
    console.log("SVG 원본으로 16~512px, 화면 배율별 11종 PNG 생성 완료");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
