// Isolated Whale profile: no access to the user's installed extension or tabs.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mewe-native-test-"));
const server = http.createServer((req, res) => {
  const name = ({ "/ewha": "이화여대", "/yonsei": "연세대", "/chungnam": "충남대" })[req.url] || "테스트";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<html><head><title>${name}</title></head><body><h1>${name}</h1><button>페이지 선택</button><a id="dual" rel="whale-space" href="/yonsei">듀얼탭 열기</a></body></html>`);
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let context;
  try {
    const appDir = "C:/Program Files/Naver/Naver Whale/Application";
    const version = fs.readdirSync(appDir).filter(name => /^\d+\./.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.MEWE_WHALE_EXE || path.join(appDir, version, "whale.exe"), headless: false, ignoreDefaultArgs: true, viewport: null,
      args: [`--user-data-dir=${profile}`, "--remote-debugging-pipe", `--disable-extensions-except=${root}`, `--load-extension=${root}`, "--window-position=-32000,-32000", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check", "--disable-gpu"]
    });
    let worker;
    for (let attempt = 0; attempt < 50 && !worker; attempt++) {
      for (const candidate of context.serviceWorkers()) {
        if (await candidate.evaluate(() => chrome.runtime.getManifest().name.startsWith("ME:WE")).catch(() => false)) worker = candidate;
      }
      if (!worker) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(worker, "ME:WE service worker loaded");
    const base = `http://127.0.0.1:${server.address().port}`;
    const extension = await context.newPage();
    await extension.goto(worker.url().replace("background.js", "sidebar.html"));
    await extension.evaluate(async (base) => {
      const { createDual } = await import("./shared/browser.js");
      const win = await chrome.windows.getCurrent();
      await createDual({ left: base + "/ewha", right: base + "/yonsei", windowId: win.id });
    }, base);
    const left = context.pages().find(p => p.url() === base + "/ewha");
    assert.ok(left, "native left page exists");
    await left.waitForLoadState();
    const single = await context.newPage(); await single.goto(base + "/chungnam");
    const cdp = await context.newCDPSession(extension);
    const targets = (await cdp.send("Target.getTargets")).targetInfos;
    const rightTarget = targets.find(t => t.url === base + "/yonsei");
    assert.ok(rightTarget, "native right page exists");
    for (const [focus, page] of [["regular", single], ["left", left], ["right", null]]) {
      if (page) { await page.bringToFront(); await page.getByRole("button", { name: "페이지 선택" }).click(); }
      else await cdp.send("Target.activateTarget", { targetId: rightTarget.targetId });
      // Empty navigation records model pages already open when the extension reloads.
      const result = await extension.evaluate(async () => {
        await chrome.storage.session.set({ "mewe.observedTabIds": [] });
        const { currentTabs } = await import("./shared/browser.js");
        return currentTabs();
      });
      assert.deepEqual(result.pages.map(p => p.title), ["이화여대", "연세대", "충남대"], focus);
      assert.deepEqual(result.pages.map(p => p.openMode), ["dual", "dual", "tab"], focus);
      assert.equal(result.autoPaired, 1, focus);
      console.log(`PASS Whale ${version}: ${focus} focused, no navigation records, all three pages in left/right/tab order`);
    }
  } finally { if (context) await context.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

