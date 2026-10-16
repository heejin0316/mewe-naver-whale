// Renders the real sidebar with fictional sample workspaces and a read-only API stub.
// All requests stay on the local server. No real Firebase requests or user data.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.MEWE_BROWSER_EXE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 920 }, deviceScaleFactor: 2 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const sample = (id, title, url, dual = false) => ({ id, title, url, openMode: dual ? "dual" : "tab", dualGroupId: dual ? "A" : null });
      const workspaces = [
        { id: "sample-research", name: "논문 읽기", pages: [sample("p1", "논문 원문", "https://example.org/paper", true), sample("p2", "논문 정리 노트", "https://example.org/notes", true), sample("p3", "참고 자료 모음", "https://example.org/references")], openedCount: 0 },
        { id: "sample-course", name: "수업 자료", pages: [sample("p4", "온라인 강의실", "https://example.org/class"), sample("p5", "이번 주 읽을거리", "https://example.org/reading")], openedCount: 0 }
      ];
      globalThis.whale = {
        runtime: { id: "readme-preview", getManifest: () => ({ version: "0.3.0" }), sendMessage: (message, done) => {
          if (message.type === "SHARE_CONSENT_STATUS") return done({ requestId: message.requestId, ok: true, data: { accepted: false } });
          if (message.type !== "WORKSPACES_LIST") throw new Error("화면 촬영 중 변경 요청 금지");
          done({ requestId: message.requestId, ok: true, data: structuredClone(workspaces) });
        } }, sidebarAction: {}, storage: { onChanged: { addListener() {}, removeListener() {} } }
      };
    });
    await page.goto(origin + "/sidebar.html");
    await page.locator(".workspace-card").nth(1).waitFor();
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.join(root, "docs/images"), { recursive: true });
    await page.screenshot({ path: path.join(root, "docs/images/workspaces.png") });
    await page.getByRole("button", { name: "작업공간 공유", exact: true }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.locator(".share-consent input").first().waitFor();
    await page.screenshot({ path: path.join(root, "docs/images/sharing.png") });
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "앱 정보", exact: true }).click();
    if (!(await page.getByRole("dialog").innerText()).includes("운영팀 ewhale · 개발자 정희진")) throw new Error("앱 정보 표시 불일치");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("실제 사이드바의 예시 화면 2장 저장, 앱 정보 운영자 표시 확인 완료");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
