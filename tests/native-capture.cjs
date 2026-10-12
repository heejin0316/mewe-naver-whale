// Isolated Whale profile: no access to the user's installed extension or tabs.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = process.env.MEWE_EXTENSION_ROOT || path.resolve(__dirname, "..");
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
    // Six real pages, matching the reported selection failure. Exercise the
    // native checkbox, its row label, and keyboard activation in the loaded app.
    for (const suffix of ["one", "two", "three"]) {
      const page = await context.newPage(); await page.goto(base + "/" + suffix);
    }
    await extension.bringToFront();
    for (const [removed, survivor] of [["이화여대", "연세대"], ["연세대", "이화여대"]]) {
      await extension.getByRole("button", { name: "지금 작업공간 저장", exact: true }).click();
      await extension.getByText("6개 페이지 선택 · 듀얼탭 1개", { exact: true }).waitFor();
      const checkbox = extension.getByRole("checkbox", { name: removed + " 작업공간에 넣기", exact: true });
      const kept = extension.getByRole("checkbox", { name: survivor + " 작업공간에 넣기", exact: true });
      const assertIndependent = async () => {
        await extension.getByText("5개 페이지 선택", { exact: true }).waitFor();
        assert.equal(await checkbox.isChecked(), false);
        assert.equal(await kept.isChecked(), true);
        assert.equal(await extension.locator(".dual-badge").count(), 0);
      };
      await checkbox.uncheck(); await assertIndependent();
      await checkbox.check();
      await extension.locator(".page-choice").filter({ has: checkbox }).locator("strong").click();
      await assertIndependent();
      await checkbox.check(); await checkbox.press("Space"); await assertIndependent();
      await extension.getByLabel("작업공간 이름", { exact: true }).fill("한쪽만 저장 " + survivor);
      await extension.getByRole("button", { name: "저장", exact: true }).click();
      await extension.getByRole("dialog").waitFor({ state: "detached" });
      const saved = await extension.evaluate(async () => (await chrome.storage.local.get("mewe.workspaces"))["mewe.workspaces"]);
      const workspace = saved.find(w => w.name === "한쪽만 저장 " + survivor);
      assert.equal(workspace.pages.length, 5);
      assert.equal(workspace.pages.some(p => p.title === removed), false);
      assert.ok(workspace.pages.some(p => p.title === survivor));
      assert.ok(workspace.pages.every(p => p.openMode === "tab" && p.dualGroupId === null));
      console.log(`PASS Whale ${version}: uncheck ${removed} by checkbox/label/keyboard; ${survivor} stays selected and saves as a regular page (6 -> 5)`);
    }
  } finally { if (context) await context.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

