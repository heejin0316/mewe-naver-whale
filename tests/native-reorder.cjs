// Actual extension messages and local storage in an isolated Whale profile.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = process.env.MEWE_EXTENSION_ROOT || path.resolve(__dirname, "..");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mewe-reorder-test-"));
  const appDir = "C:/Program Files/Naver/Naver Whale/Application";
  const version = fs.readdirSync(appDir).filter(name => /^\d+\./.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: path.join(appDir, version, "whale.exe"), headless: false, ignoreDefaultArgs: true, viewport: { width: 390, height: 1100 },
    args: [`--user-data-dir=${profile}`, "--remote-debugging-pipe", `--disable-extensions-except=${root}`, `--load-extension=${root}`, "--window-position=-32000,-32000", "--window-size=600,1200", "--no-first-run", "--no-default-browser-check", "--disable-gpu"]
  });
  context.setDefaultTimeout(10000);
  try {
    let worker;
    for (let attempt = 0; attempt < 50 && !worker; attempt++) {
      for (const candidate of context.serviceWorkers()) {
        if (await candidate.evaluate(() => chrome.runtime.getManifest().name.startsWith("ME:WE")).catch(() => false)) worker = candidate;
      }
      if (!worker) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(worker);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(worker.url().replace("background.js", "sidebar.html"));
    await page.evaluate(async () => {
      const items = ["학교", "빅테크", "실험"].map((name, i) => ({ id: String(i), name, createdAt: 1, updatedAt: 1, pages: [
        { id: "left" + i, title: "왼쪽 페이지", url: "https://example.com/left", openMode: "dual", dualGroupId: "A" },
        { id: "right" + i, title: "오른쪽 페이지", url: "https://example.com/right", openMode: "dual", dualGroupId: "A" }
      ] }));
      await chrome.storage.local.set({ "mewe.workspaces": items });
    });
    const names = () => page.locator(".workspace-card h3").allTextContents();
    const stored = () => page.evaluate(async () => (await chrome.storage.local.get("mewe.workspaces"))["mewe.workspaces"].map(w => w.name));
    const card = name => page.locator(".workspace-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card("실험").waitFor();
    await card("실험").dragTo(card("학교"), { sourcePosition: { x: 60, y: 30 }, targetPosition: { x: 60, y: 8 } });
    await page.waitForFunction(() => document.querySelector(".workspace-card h3").textContent === "실험" && !document.querySelector(".workspace-list[aria-busy]"));
    assert.deepEqual(await stored(), ["실험", "학교", "빅테크"]);
    await page.reload(); await card("실험").waitFor();
    assert.deepEqual(await names(), ["실험", "학교", "빅테크"]);
    const box = await card("빅테크").boundingBox();
    await card("실험").dragTo(card("빅테크"), { sourcePosition: { x: 60, y: 30 }, targetPosition: { x: 60, y: box.height - 8 } });
    await page.waitForFunction(() => document.querySelector(".workspace-card h3").textContent === "학교" && !document.querySelector(".workspace-list[aria-busy]"));
    assert.deepEqual(await stored(), ["학교", "빅테크", "실험"]);
    await card("실험").focus();
    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForFunction(() => !document.querySelector(".workspace-list[aria-busy]"));
    assert.deepEqual(await stored(), ["학교", "실험", "빅테크"]);
    await page.getByRole("button", { name: "학교 메뉴" }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    assert.deepEqual(await page.locator(".page-choice .dual-badge").allTextContents(), ["듀얼탭 A", "듀얼탭 B"]);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.deepEqual(await stored(), ["학교", "실험", "빅테크"]);
    await page.setViewportSize({ width: 390, height: 844 });
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results/workspace-reorder.png") });
    await page.setViewportSize({ width: 390, height: 600 });
    await page.evaluate(() => { window.dragTrace = []; for (const type of ["dragstart", "drop", "dragend"]) document.addEventListener(type, event => window.dragTrace.push({ type, target: event.target.className, y: event.clientY })); });
    await card("학교").scrollIntoViewIfNeeded();
    const start = await card("학교").boundingBox();
    await page.mouse.move(start.x + 60, start.y + 30); await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 50, { steps: 5 });
    await page.mouse.move(180, 585, { steps: 10 }); await page.mouse.move(180, 586);
    await page.waitForFunction(() => { const view = document.querySelector("#view"); return view.scrollTop > 150 && view.scrollHeight - view.clientHeight - view.scrollTop < 3; }).catch(async error => {
      console.log(await page.evaluate(() => { const view = document.querySelector("#view"); return { scrollTop: view.scrollTop, height: view.clientHeight, full: view.scrollHeight, dragging: !!document.querySelector(".is-dragging"), markers: document.querySelectorAll(".drop-before,.drop-after").length }; }));
      throw error;
    });
    // Refresh the native drag target after scrolling has moved the DOM beneath it.
    await page.mouse.move(180, 583); await page.mouse.move(180, 584);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".workspace-card h3").textContent === "실험" && !document.querySelector(".workspace-list[aria-busy]")).catch(async error => { console.log(await page.evaluate(() => ({trace:window.dragTrace,names:[...document.querySelectorAll('.workspace-card h3')].map(n=>n.textContent)}))); throw error; });
    assert.deepEqual(await stored(), ["실험", "빅테크", "학교"]);
    await card("실험").scrollIntoViewIfNeeded();
    const cancelStart = await card("실험").boundingBox();
    await page.mouse.move(cancelStart.x + 60, cancelStart.y + 30); await page.mouse.down();
    await page.mouse.move(cancelStart.x + 60, cancelStart.y + 90, { steps: 5 });
    await page.keyboard.press("Escape"); await page.mouse.up();
    assert.deepEqual(await stored(), ["실험", "빅테크", "학교"]);
    assert.equal(await page.locator(".is-dragging, .drop-before, .drop-after").count(), 0);
    assert.deepEqual(errors, []);
    console.log("PASS: native mouse drag up/down, auto-scroll, cancel, keyboard move, persisted order after reload, menu/edit and dual-tab data preserved.");
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
