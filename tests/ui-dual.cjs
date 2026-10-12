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
  res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
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
        runtime: { id: "test" }, sidebarAction: {}, windows: { getCurrent: (_options, done) => done({ id: 1, tabs: [left, single] }) },
        tabs: { query: (_options, done) => done([left, single]), get: (id, done) => done(id === 2 ? right : null) },
        debugger: { getTargets: done => done([{type:"page", tabId:1}, {type:"page", tabId:2}, {type:"page", tabId:3}]) }
      };
      const { mount } = await import("/features/study-widget/view.js");
      const { modal } = await import("/shared/modal.js");
      const { mutateWorkspaces } = await import("/features/study-widget/controller.js");
      const capture = await import("/shared/browser.js");
      window.saved = []; let listener;
      const services = { modal, browser: capture, toast() {},
        async launch(w) { window.saved.find(item => item.id === w.id).openedCount = w.pages.length; await listener(); },
        async closeWorkspace(w) { window.saved.find(item => item.id === w.id).openedCount = 0; await listener(); },
        workspaceStore: {
        list: async () => structuredClone(window.saved), subscribe: fn => { listener = fn; return () => {}; },
        save: async value => { window.saved = mutateWorkspaces(window.saved, "WORKSPACE_SAVE", value); await listener(); },
        remove: async () => {}
      } };
      mount(document.querySelector("#view"), services);
    });
    await page.getByRole("button", { name: "지금 작업공간 저장", exact: true }).click();
    assert.equal(await page.locator(".page-choice").count(), 3);
    assert.deepEqual(await page.locator(".page-choice .dual-badge").allTextContents(), ["듀얼탭 A", "듀얼탭 B"]);
    assert.deepEqual(await page.locator(".page-choice strong").allTextContents(), ["이화여대 : 네이버 검색", "연세대 : 네이버 검색", "충남대 : 네이버 검색"]);
    assert.equal(await page.getByRole("button", {name:/다음 페이지와/}).count(), 0);
    await page.getByLabel("작업공간 이름").fill("학교");
    const pair = page.getByRole("checkbox", { name: "이화여대 : 네이버 검색 작업공간에 넣기" });
    await pair.uncheck();
    await page.getByText("2개 페이지 선택", { exact: true }).waitFor();
    const rightCheckbox = page.getByRole("checkbox", { name: "연세대 : 네이버 검색 작업공간에 넣기" });
    assert.equal(await rightCheckbox.isChecked(), true);
    assert.equal(await page.locator(".page-choice .dual-badge").count(), 0);
    assert.equal(await pair.evaluate(node => document.activeElement === node), true);
    await pair.check();
    await page.getByText("3개 페이지 선택 · 듀얼탭 1개", { exact: true }).waitFor();
    await rightCheckbox.uncheck();
    assert.equal(await pair.isChecked(), true);
    await page.getByText("2개 페이지 선택", { exact: true }).waitFor();
    assert.equal(await page.locator(".page-choice .dual-badge").count(), 0);
    await rightCheckbox.check();
    await page.getByText("3개 페이지 선택 · 듀얼탭 1개", { exact: true }).waitFor();
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results/dual-editor.png") });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.locator(".saved-dual-group").waitFor();
    const saved = await page.evaluate(() => window.saved[0]);
    assert.deepEqual(saved.pages.map(p => p.openMode), ["dual", "dual", "tab"]);
    assert.equal(saved.pages[0].dualGroupId, saved.pages[1].dualGroupId);
    await page.screenshot({ path: path.join(root, "test-results/dual-saved.png") });
    await page.getByRole("button", { name: "작업공간 공유", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.locator(".share-pages li").count(), 3);
    assert.doesNotMatch(await page.locator(".sheet-body").innerText(), /Firebase|익명 사용자 ID/);
    await page.screenshot({ path: path.join(root, "test-results/sharing-concise.png") });
    await page.locator(".privacy-details summary").click();
    assert.match(await page.locator(".sheet-body").innerText(), /Firebase/);
    await page.locator(".privacy-details summary").click();
    assert.equal(await page.locator(".share-pages li").count(), 3);
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "작업공간 열기", exact: true }).click();
    await page.getByRole("button", { name: "작업공간 닫기", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "작업공간 열기", exact: true }).count(), 0);
    await page.setViewportSize({ width: 320, height: 720 });
    const bounds = await page.locator(".workspace-actions .btn").evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { top: rect.top, height: rect.height, width: rect.width, fits: node.scrollWidth <= node.clientWidth };
    }));
    assert.equal(bounds[0].top, bounds[1].top);
    assert.equal(bounds[0].height, bounds[1].height);
    assert.equal(bounds[0].width, bounds[1].width);
    assert.ok(bounds.every(b => b.fits));
    await page.screenshot({ path: path.join(root, "test-results/workspace-actions-320.png") });
    await page.getByRole("button", { name: "작업공간 닫기", exact: true }).click();
    await page.getByRole("button", { name: "작업공간 열기", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "학교 메뉴" }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    assert.deepEqual(await page.locator(".page-choice .dual-badge").allTextContents(), ["듀얼탭 A", "듀얼탭 B"]);
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.sheet-body, .page-choice')].some(node => node.scrollWidth > node.clientWidth)), false);
    await page.screenshot({ path: path.join(root, "test-results/dual-editor-320.png") });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.saved[0].pages.map(p => p.openMode)), ["dual", "dual", "tab"]);
    await page.getByRole("button", { name: "학교 메뉴" }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    assert.equal(await page.getByRole("checkbox").count(), 0);
    const singleMenu = page.getByRole("button", { name: "충남대 : 네이버 검색 메뉴", exact: true });
    await singleMenu.click();
    await page.getByRole("menuitem", { name: "작업공간에서 제거" }).waitFor();
    await page.screenshot({ path: path.join(root, "test-results/page-remove-menu-320.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("menuitem").count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.equal(await singleMenu.evaluate(node => node === document.activeElement), true);
    await singleMenu.click();
    await page.getByRole("menuitem", { name: "작업공간에서 제거" }).click();
    assert.equal(await page.locator(".page-choice").count(), 2);
    assert.equal(await page.evaluate(() => window.saved[0].pages.length), 3);
    await page.getByRole("button", { name: "이화여대 : 네이버 검색 메뉴", exact: true }).click();
    await page.getByRole("menuitem", { name: "작업공간에서 제거" }).click();
    assert.equal(await page.locator(".page-choice .dual-badge").count(), 0);
    assert.deepEqual(await page.locator(".page-choice strong").allTextContents(), ["연세대 : 네이버 검색"]);
    await page.getByRole("button", { name: "＋ 링크 직접 추가", exact: true }).click();
    await page.getByLabel("추가할 링크 주소").fill("javascript:alert(1)");
    await page.getByLabel("추가할 링크 주소").press("Enter");
    assert.equal(await page.locator(".page-menu-toggle").count(), 1);
    assert.equal(await page.getByLabel("추가할 링크 주소").isVisible(), true);
    await page.getByLabel("추가할 링크 주소").fill("https://example.com/notes");
    await page.getByLabel("추가할 링크 주소").dispatchEvent("keydown", { key: "Enter", isComposing: true });
    assert.equal(await page.locator(".page-menu-toggle").count(), 1, "IME confirmation must not add a link");
    await page.getByLabel("추가할 링크 주소").press("Enter");
    assert.equal(await page.locator(".page-menu-toggle").count(), 2);
    const saveButton = page.getByRole("button", { name: "저장", exact: true });
    assert.equal(await saveButton.evaluate(node => document.activeElement === node), true);
    assert.equal(await page.evaluate(() => window.saved[0].pages.length), 3, "first Enter only adds to the editor");
    await saveButton.dispatchEvent("keydown", { key: "Enter", repeat: true });
    assert.equal(await page.getByRole("dialog").count(), 1, "holding Enter must not save");
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.saved[0].pages.map(p => [p.title, p.openMode, p.dualGroupId])), [["연세대 : 네이버 검색", "tab", null], ["example.com", "tab", null]]);
    await page.getByRole("button", { name: "학교 메뉴" }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await page.getByLabel("작업공간 이름").dispatchEvent("keydown", { key: "Enter", isComposing: true });
    assert.equal(await page.getByRole("dialog").count(), 1, "IME confirmation must not save");
    for (const title of ["연세대 : 네이버 검색", "example.com"]) {
      await page.getByRole("button", { name: title + " 메뉴", exact: true }).click();
      await page.getByRole("menuitem", { name: "작업공간에서 제거" }).click();
    }
    await page.getByText("페이지가 없어요. 저장하려면 링크를 추가해 주세요.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "페이지는 1~10개 선택해 주세요." }).waitFor();
    page.on("dialog", dialog => { errors.push("Unexpected browser dialog: " + dialog.message()); dialog.dismiss(); });
    // Sidebar reopen may deliver a click without a pointer press in this document.
    await page.locator("dialog.sheet").dispatchEvent("click", { clientX: -1, clientY: -1, pointerId: 1 });
    assert.equal(await page.locator(".discard-dialog").count(), 0, "unpaired backdrop click must not ask to discard");
    const simulateVisibility = async hidden => page.evaluate(hidden => {
      Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
    await simulateVisibility(true);
    await page.locator("dialog.sheet").dispatchEvent("cancel", { cancelable: true });
    await simulateVisibility(false);
    assert.equal(await page.locator(".discard-dialog").count(), 0, "hide/show must not queue a confirmation");
    assert.equal(await page.locator(".page-menu-toggle").count(), 0, "draft removals survive hide/show");
    assert.equal(await page.evaluate(() => window.saved[0].pages.length), 2, "hiding must not save removals");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    const discard = page.getByRole("dialog", { name: "저장하지 않고 닫을까요?", exact: true });
    await discard.waitFor();
    assert.equal(await discard.getByRole("button", { name: "계속 편집" }).evaluate(node => node === document.activeElement), true);
    const rect = await discard.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 320, "confirmation fits inside a narrow sidebar");
    await page.screenshot({ path: path.join(root, "test-results/discard-confirmation-320.png") });
    await discard.getByRole("button", { name: "계속 편집" }).click();
    assert.equal(await page.locator(".page-menu-toggle").count(), 0, "cancel preserves unsaved removals");
    assert.equal(await page.getByRole("button", { name: "닫기", exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    await discard.waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 1, "Escape returns to editor");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await discard.waitFor();
    await simulateVisibility(true); await simulateVisibility(false);
    assert.equal(await page.locator(".discard-dialog").count(), 0, "existing confirmation is dismissed on hide");
    await page.evaluate(() => { delete document.hidden; });
    const sheetRect = await page.locator("dialog.sheet").boundingBox();
    assert.ok(sheetRect.y > 0);
    await page.mouse.click(10, sheetRect.y / 2);
    await discard.waitFor();
    await discard.getByRole("button", { name: "계속 편집" }).click();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await discard.getByRole("button", { name: "닫기", exact: true }).click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.evaluate(() => window.saved[0].pages.length), 2);
    for (const [removed, remaining] of [["이화여대", "연세대"], ["연세대", "이화여대"]]) {
      await page.getByRole("button", { name: "지금 작업공간 저장", exact: true }).click();
      const name = `${remaining}만 저장`;
      await page.getByLabel("작업공간 이름").fill(name);
      await page.getByRole("checkbox", { name: `${removed} : 네이버 검색 작업공간에 넣기` }).uncheck();
      await page.getByText("2개 페이지 선택", { exact: true }).waitFor();
      assert.equal(await page.getByRole("checkbox", { name: `${remaining} : 네이버 검색 작업공간에 넣기` }).isChecked(), true);
      await page.screenshot({ path: path.join(root, `test-results/dual-one-side-${removed === "이화여대" ? "right" : "left"}.png`) });
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await page.getByRole("button", { name: `${name} 메뉴` }).waitFor();
      const pages = await page.evaluate(name => window.saved.find(w => w.name === name).pages, name);
      assert.deepEqual(pages.map(p => [p.title, p.openMode, p.dualGroupId]), [[`${remaining} : 네이버 검색`, "tab", null], ["충남대 : 네이버 검색", "tab", null]]);
      await page.getByRole("button", { name: `${name} 메뉴` }).click();
      await page.getByRole("button", { name: "수정", exact: true }).click();
      assert.equal(await page.locator(".page-choice .dual-badge").count(), 0);
      await page.getByRole("button", { name: "닫기", exact: true }).click();
    }
    await page.evaluate(async () => {
      const { openAbout } = await import("/features/about/view.js");
      const { modal } = await import("/shared/modal.js");
      openAbout(modal);
    });
    await page.getByRole("heading", { name: "앱 정보", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "h33jin.jeong@gmail.com", exact: true }).getAttribute("href"), "mailto:h33jin.jeong@gmail.com");
    await page.locator(".privacy-details summary").click();
    assert.equal(await page.locator(".privacy-details").getAttribute("open"), "");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.sheet-body, .about-content')].some(node => node.scrollWidth > node.clientWidth)), false);
    await page.screenshot({ path: path.join(root, "test-results/app-info-320.png") });
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/privacy/index.html`);
    await page.getByRole("heading", { name: "ME:WE 개인정보 처리방침", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(root, "test-results/privacy-page-320.png") });
    assert.deepEqual(errors, []);
    console.log("PASS: captured pair UI, independent selection, pair restoration, persistence, edit menus, single removal, dual partner preserved, add after removal, empty save blocked, discard, Escape, 320px layout; simulated Whale API.");
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
