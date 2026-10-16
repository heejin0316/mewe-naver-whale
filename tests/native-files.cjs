// Actual extension messages and local storage in an isolated Whale profile.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = process.env.MEWE_EXTENSION_ROOT || path.resolve(__dirname, "..");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mewe-files-test-"));
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

    const pdfPath=path.join(profile,'강의 #1 100%.pdf');
    const {pathToFileURL}=require('node:url');
    const pdfUrl=pathToFileURL(pdfPath).href;
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const stream='BT /F1 22 Tf 40 320 Td (MEWE local PDF test) Tj ET';
    objects.push('<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
    let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
    const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    fs.writeFileSync(pdfPath,pdf);
    const original=await context.newPage();await original.goto(pdfUrl,{waitUntil:'domcontentloaded'});
    await page.bringToFront();
    console.log('File-scheme access:',await page.evaluate(()=>chrome.extension.isAllowedFileSchemeAccess()));
    await page.getByRole('button',{name:'지금 작업공간 저장',exact:true}).click();
    await page.locator('.page-choice').filter({hasText:'강의'}).waitFor();
    await page.getByLabel('작업공간 이름').fill('열린 PDF');
    await page.getByRole('button',{name:'저장',exact:true}).click();
    const saved=await page.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces']);
    assert.equal(saved[0].pages[0].url,pdfUrl);
    await page.getByRole('button',{name:'＋ 새 작업공간',exact:true}).click();
    await page.getByRole('button',{name:'＋ 링크 직접 추가',exact:true}).click();
    await page.getByLabel('추가할 링크 주소').fill('"'+pdfPath+'"');
    await page.getByRole('button',{name:'추가',exact:true}).click();
    assert.ok((await page.locator('.page-choice strong').allTextContents()).includes('강의 #1 100%.pdf'));
    await page.getByLabel('작업공간 이름').fill('직접 입력');
    await page.getByRole('button',{name:'저장',exact:true}).click();
    const card=page.locator('.workspace-card').filter({has:page.getByRole('heading',{name:'열린 PDF',exact:true})});
    await card.getByRole('button',{name:'작업공간 열기',exact:true}).click();
    await card.getByRole('button',{name:'작업공간 닫기',exact:true}).waitFor();
    const opened=await page.evaluate(async()=>{const {request}=await import('./shared/messages.js');const items=await request('WORKSPACES_LIST');const id=items.find(w=>w.name==='열린 PDF').id;return (await chrome.storage.session.get('mewe.openWorkspaces'))['mewe.openWorkspaces'][id];});
    assert.equal(opened.length,1);
    const tab=await page.evaluate(id=>chrome.tabs.get(id),opened[0]);assert.equal(tab.pendingUrl||tab.url,pdfUrl);
    const reopened=context.pages().find(p=>p!==original&&p.url()===pdfUrl);
    assert.ok(reopened,'new local PDF page exists');
    await reopened.waitForLoadState('domcontentloaded');
    let pdfFrame;for(let i=0;i<50&&!pdfFrame;i++){pdfFrame=reopened.frames().find(f=>f.url().includes('mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'));if(!pdfFrame)await new Promise(r=>setTimeout(r,100));}
    assert.ok(pdfFrame,'native PDF viewer frame loaded');
    await pdfFrame.locator('pdf-viewer').waitFor({state:'attached'});
    await pdfFrame.waitForFunction(() => document.querySelector('pdf-viewer')?.loadState_ === 'success');
    assert.equal(await pdfFrame.locator('#plugin').getAttribute('original-url'),pdfUrl);
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await reopened.screenshot({path:path.join(root,'test-results/local-pdf.png')});
    await page.bringToFront();await card.getByRole('button',{name:'작업공간 닫기',exact:true}).click();
    await card.getByRole('button',{name:'작업공간 닫기',exact:true}).waitFor({state:'hidden'});
    assert.equal(original.isClosed(),false);
    assert.equal(await page.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces'].find(w=>w.name==='직접 입력').pages.at(-1).url),pdfUrl);
    assert.deepEqual(errors,[]);
    console.log('PASS: local PDF capture, manual Windows path including Korean/space/#/%, persisted file URL, actual PDF viewer reopened, workspace close preserves original.');
  } finally { await context.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
