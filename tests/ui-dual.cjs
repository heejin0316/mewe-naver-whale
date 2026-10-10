// UI regression test with simulated Whale tab data; does not verify native split detection.
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  if (req.url === "/fixture") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shared/base.css"><link rel="stylesheet" href="/features/study-widget/style.css"><link rel="stylesheet" href="/shared/refinement.css"><body><header class="app-header"><div class="brand"><img src="/assets/icons/mark.svg" width="32" height="32" alt=""><strong>ME:WE</strong></div></header><main id="view"></main></body></html>');
  }
  const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.MEWE_BROWSER_EXE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    await page.evaluate(async () => {
      const tab = (id, title, query, index) => ({ id, title, url: `https://search.naver.com/search.naver?query=${query}`, windowId: 1, index });
      const left = tab(1, "이화여대 : 네이버 검색", "ewha", 0), right = tab(2, "연세대 : 네이버 검색", "yonsei", 0), single = tab(3, "충남대 : 네이버 검색", "chungnam", 1);
      globalThis.whale = {
        runtime: { id: "test" }, sidebarAction: {}, windows: { getCurrent: (_options, done) => done({ id: 1 }) },
        tabs: { query: (_options, done) => done([left, single]), get: (id, done) => done(id === 2 ? right : null) },
        storage: { session: { get: (key, done) => done({ [key]: [1, 2, 3] }) } }
      };
      const { mount } = await import("/features/study-widget/view.js");
      const { modal } = await import("/shared/modal.js");
      const { mutateWorkspaces } = await import("/features/study-widget/controller.js");
      const capture = await import("/shared/browser.js");
      window.saved = []; let listener;
      const services = { modal, browser: capture, toast() {}, launch() {}, workspaceStore: {
        list: async () => structuredClone(window.saved), subscribe: fn => { listener = fn; return () => {}; },
        save: async value => { window.saved = mutateWorkspaces(window.saved, "WORKSPACE_SAVE", value); await listener(); },
        remove: async () => {}
      } };
      mount(document.querySelector("#view"), services);
    });
    await page.getByRole("button", { name: "지금 작업공간 저장", exact: true }).click();
    assert.equal(await page.locator(".dual-page-group").count(), 1);
    assert.equal(await page.locator(".dual-page-group .page-choice").count(), 2);
    await page.getByLabel("작업공간 이름").fill("학교");
    const pair = page.getByRole("checkbox", { name: /듀얼탭 함께 저장/ });
    await pair.uncheck();
    await page.getByText("1개 페이지 선택", { exact: true }).waitFor();
    await pair.check();
    await page.getByText("3개 페이지 선택 · 듀얼탭 1개", { exact: true }).waitFor();
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results/dual-editor.png") });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.locator(".saved-dual-group").waitFor();
    const saved = await page.evaluate(() => window.saved[0]);
    assert.deepEqual(saved.pages.map(p => p.openMode), ["dual", "dual", "tab"]);
    assert.equal(saved.pages[0].dualGroupId, saved.pages[1].dualGroupId);
    await page.screenshot({ path: path.join(root, "test-results/dual-saved.png") });
    await page.getByRole("button", { name: "학교 메뉴" }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    assert.equal(await page.locator(".dual-page-group").count(), 1);
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.sheet-body, .dual-page-group')].some(node => node.scrollWidth > node.clientWidth)), false);
    await page.getByRole("button", { name: /듀얼탭 해제/ }).click();
    assert.equal(await page.locator(".dual-page-group").count(), 0);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.saved[0].pages.map(p => p.openMode)), ["tab", "tab", "tab"]);
    assert.deepEqual(errors, []);
    console.log("PASS: captured pair UI, joint selection, persistence, edit, unpair, 320px layout; simulated Whale API.");
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
