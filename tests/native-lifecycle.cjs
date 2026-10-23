// Restart and in-place update in a disposable Whale profile. No production requests.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const candidate = process.env.MEWE_EXTENSION_ROOT || path.resolve(__dirname, "..");
const baseline = process.env.MEWE_BASELINE_EXTENSION_ROOT || candidate;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mewe-lifecycle-"));
const installed = path.join(temp, "extension"), profile = path.join(temp, "profile");
const runtime = ["manifest.json", "sidebar.html", "app.js", "background.js", "LICENSE", "assets", "shared", "features"];
function install(source) {
  fs.mkdirSync(installed, { recursive: true });
  for (const name of runtime) fs.cpSync(path.join(source, name), path.join(installed, name), { recursive: true });
}
(async () => {
  const appDir = "C:/Program Files/Naver/Naver Whale/Application";
  const version = fs.readdirSync(appDir).filter(name => /^\d+\./.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  let context;
  async function launch() {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: path.join(appDir, version, "whale.exe"), headless: false, ignoreDefaultArgs: true, viewport: { width: 390, height: 844 },
      args: [`--user-data-dir=${profile}`, "--remote-debugging-pipe", `--disable-extensions-except=${installed}`, `--load-extension=${installed}`, "--window-position=-32000,-32000", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check", "--disable-gpu"]
    });
    let worker;
    for (let i = 0; i < 80 && !worker; i++) {
      for (const w of context.serviceWorkers()) if (await w.evaluate(() => chrome.runtime.getManifest().name.startsWith("ME:WE")).catch(() => false)) worker = w;
      if (!worker) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(worker, "extension worker loaded after restart/update");
    const page = await context.newPage();
    await page.goto(worker.url().replace("background.js", "sidebar.html"));
    await page.getByRole("button", { name: /^(지금 작업공간 저장|탭 저장하기)$/ }).waitFor();
    return page;
  }
  const stored = page => page.evaluate(async () => chrome.storage.local.get(["mewe.workspaces", "mewe.sharingConsent"]));
  try {
    install(baseline);
    let page = await launch();
    await page.evaluate(async () => {
      const { request } = await import("./shared/messages.js");
      const { CONSENT_VERSION } = await import("./features/sharing/consent.js");
      await request("WORKSPACE_SAVE", { name: "업데이트 보존 확인", pages: [
        { id: "left", title: "자료", url: "https://example.org/material", openMode: "dual", dualGroupId: "A" },
        { id: "right", title: "노트", url: "https://example.org/notes", openMode: "dual", dualGroupId: "A" }
      ] });
      await request("SHARE_CONSENT_ACCEPT", { version: CONSENT_VERSION, processing: true, overseas: true });
    });
    const before = await stored(page);
    await context.close();
    page = await launch();
    assert.deepEqual(await stored(page), before, "browser restart preserves workspaces and consent");
    await context.close();
    install(candidate);
    page = await launch();
    await page.getByRole("article", { name: "업데이트 보존 확인", exact: true }).waitFor();
    assert.deepEqual(await stored(page), before, "in-place update preserves data, IDs, order, pairing and consent timestamp");
    await page.getByRole("button", { name: "공유 코드 입력", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".sheet-footer button")?.disabled);
    assert.equal(await page.locator(".share-consent input").count(), 0, "same consent scope is reused after update");
    const auth = await page.evaluate(async () => (await chrome.storage.local.get("mewe.firebaseAuth"))["mewe.firebaseAuth"]);
    assert.equal(auth, undefined, "this lifecycle test never authenticates or sends data to Firebase");
    console.log(`PASS: Whale ${version}; browser restart and in-place package update preserve workspaces and first-use consent; no server requests.`);
  } finally { if (context) await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
