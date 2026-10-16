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

    context.setDefaultTimeout(15000);
    await extension.setViewportSize({width:390,height:1000});
    const original = await context.newPage(); await original.goto(base + '/ewha');
    const originalId = await extension.evaluate(async (base) => (await chrome.tabs.query({})).find(t=>t.url===base+'/ewha').id,base);
    await extension.evaluate(async base => {
      const {request}=await import('./shared/messages.js');
      const page=(id,url,dual=false)=>({id,title:id,url:base+url,openMode:dual?'dual':'tab',dualGroupId:dual?'A':null});
      await request('WORKSPACE_SAVE',{name:'학교',pages:[page('이화여대','/ewha',true),page('연세대','/yonsei',true),page('충남대','/chungnam')]});
      await request('WORKSPACE_SAVE',{name:'다른 작업공간',pages:[page('같은 주소','/ewha')]});
    },base);
    const card=name=>extension.locator('.workspace-card').filter({has:extension.getByRole('heading',{name,exact:true})});
    const open=async name=>{await extension.bringToFront();await card(name).getByRole('button',{name:'작업공간 열기',exact:true}).click();};
    const count=async(name,n)=>{let actual;for(let i=0;i<150;i++){actual=await extension.evaluate(async name=>{const {request}=await import('./shared/messages.js');return (await request('WORKSPACES_LIST')).find(w=>w.name===name).openedCount;},name);if(actual===n)return;await new Promise(r=>setTimeout(r,100));}throw new Error(name+' expected '+n+' opened, got '+actual);};
    await open('학교'); await count('학교',3);
    await card('학교').getByRole('button',{name:'작업공간 닫기',exact:true}).waitFor();
    await open('다른 작업공간'); await count('다른 작업공간',1);
    // Exercise existing repeated-launch tracking through the API; the card now toggles to Close.
    await extension.evaluate(async()=>{const {request}=await import('./shared/messages.js');const w=(await request('WORKSPACES_LIST')).find(w=>w.name==='학교');await request('WORKSPACE_LAUNCH',{workspace:w});}); await count('학교',6);
    const saved=await extension.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces']);
    const schoolId=saved.find(w=>w.name==='학교').id;
    await extension.evaluate(async id=>{
      const ids=(await chrome.storage.session.get('mewe.openWorkspaces'))['mewe.openWorkspaces'][id];
      const tabs=await Promise.all(ids.map(id=>chrome.tabs.get(id)));
      const singles=tabs.filter(t=>(t.pendingUrl||t.url).endsWith('/chungnam'));
      await chrome.tabs.remove(singles[0].id);
      await chrome.windows.create({tabId:singles[1].id,focused:false});
    },schoolId);
    await count('학교',5);
    await extension.reload(); await card('학교').getByRole('button',{name:'작업공간 닫기',exact:true}).waitFor();
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await extension.setViewportSize({width:320,height:720});
    assert.equal(await extension.evaluate(()=>document.querySelector('#view').scrollWidth>document.querySelector('#view').clientWidth),false);
    await extension.screenshot({path:path.join(root,'test-results/workspace-close-320.png')});
    await extension.setViewportSize({width:390,height:1000});
    await extension.screenshot({path:path.join(root,'test-results/workspace-close.png')});
    await card('학교').getByRole('button',{name:'작업공간 닫기',exact:true}).click();
    await count('학교',0);
    await card('학교').getByRole('button',{name:'작업공간 닫기',exact:true}).waitFor({state:'hidden'});
    assert.equal(await extension.evaluate(async id=>!!await chrome.tabs.get(id),originalId),true);
    await count('다른 작업공간',1);
    assert.deepEqual(await extension.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces']),saved);
    const schoolTargets=await extension.evaluate(async base=>{const {nativeTabs}=await import('./shared/browser.js');return (await nativeTabs()).filter(t=>t.url===base+'/yonsei'||t.url===base+'/chungnam');},base);
    assert.equal(schoolTargets.length,0,'both native dual sides and relocated tab closed');
    await card('다른 작업공간').getByRole('button',{name:'작업공간 닫기',exact:true}).click();await count('다른 작업공간',0);
    assert.equal(await extension.evaluate(async id=>!!await chrome.tabs.get(id),originalId),true);
    console.log('PASS: actual launch/close UI, two dual-tab launches, manual close, tab moved to another window, sidebar reload, same-URL original and other workspace preserved, saved workspace unchanged.');
  } finally { if (context) await context.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
