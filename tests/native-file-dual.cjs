// Actual extension messages and local storage in an isolated Whale profile.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mewe-files-test-"));
  const appDir = "C:/Program Files/Naver/Naver Whale/Application";
  const version = fs.readdirSync(appDir).filter(name => /^\d+\./.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: path.join(appDir, version, "whale.exe"), headless: false, ignoreDefaultArgs: true, viewport: null,
    args: [`--user-data-dir=${profile}`, "--remote-debugging-pipe", `--disable-extensions-except=${root}`, `--load-extension=${root}`, "--window-position=-32000,-32000", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check", "--disable-gpu"]
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
    const localHtml = path.join(profile, '노트.html');
    fs.writeFileSync(localHtml, '<!doctype html><meta charset="utf-8"><title>Local notes</title><h1>Local notes</h1>');
    const htmlUrl = pathToFileURL(localHtml).href;
    const http = require('node:http');
    const server = http.createServer((req, res) => { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Web notes</title><h1>Web notes</h1>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const webUrl = `http://127.0.0.1:${server.address().port}/`;
      for (const [label,left,right] of [['PDF left',pdfUrl,webUrl],['PDF right',webUrl,pdfUrl],['two files',pdfUrl,htmlUrl],['web pair',webUrl,webUrl+'right']]) {
        const result = await page.evaluate(async ({label,left,right}) => {
          const {request} = await import('./shared/messages.js');
          await request('WORKSPACE_SAVE',{name:label,pages:[left,right].map((url,i)=>({id:label+i,title:label+i,url,openMode:'dual',dualGroupId:'A'}))});
          const w = (await request('WORKSPACES_LIST')).find(w=>w.name===label);
          return {workspaceId:w.id,...await request('WORKSPACE_LAUNCH',{workspace:w})};
        },{label,left,right});
        console.log(label,JSON.stringify(result));
        assert.equal(result.fallbackGroups,0,label+' must not fall back');
        assert.equal(result.dualGroupsOpened,1);
        assert.equal(result.opened.length,2);
        const ids = result.opened.map(p=>p.tabId);
        assert.equal(new Set(ids).size,2);
        await page.waitForFunction(async ({ids,left,right}) => {
          const tabs = await Promise.all(ids.map(id=>chrome.tabs.get(id)));
          return tabs[0].url === left && tabs[1].url === right;
        }, {ids,left,right}, {timeout:10000}).catch(async error=>{console.log('Final tabs',await page.evaluate(ids=>Promise.all(ids.map(id=>chrome.tabs.get(id))),ids));throw error;});
        const tabs = await page.evaluate(ids=>Promise.all(ids.map(id=>chrome.tabs.get(id))),ids);
        assert.equal(tabs[0].windowId,tabs[1].windowId);
        assert.equal(tabs[0].index,tabs[1].index,'both pages occupy one native dual tab');
        assert.deepEqual(tabs.map(t=>t.url),[left,right]);
        if ([left,right].includes(pdfUrl)) {
          // Native right-side targets are not exposed as Playwright pages by Whale.
          // Test-only CDP checks the actual built-in PDF viewer in either pane.
          const cdp = await context.newCDPSession(page);
          let target;
          for(let attempt=0;attempt<100&&!target;attempt++) {
            target = (await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.includes('mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'));
            if(!target) await new Promise(r=>setTimeout(r,100));
          }
          assert.ok(target,'native PDF viewer exists');
          const {sessionId} = await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
          let sequence=0, state;
          for(let attempt=0;attempt<100;attempt++) {
            const id=++sequence;
            const result=await new Promise((resolve,reject)=>{
              const onMessage=event=>{
                if(event.sessionId!==sessionId)return;
                const message=JSON.parse(event.message);
                if(message.id!==id)return;
                clearTimeout(timeout);cdp.off('Target.receivedMessageFromTarget',onMessage);
                if(message.error)reject(new Error(JSON.stringify(message.error)));else resolve(message.result);
              };
              const timeout=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',onMessage);reject(new Error('PDF viewer evaluation timeout'));},5000);
              cdp.on('Target.receivedMessageFromTarget',onMessage);
              cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method:'Runtime.evaluate',params:{expression:'({loaded:document.querySelector("pdf-viewer")?.loadState_,url:document.querySelector("pdf-viewer")?.shadowRoot?.querySelector("#plugin")?.getAttribute("original-url")})',returnByValue:true}})}).catch(reject);
            });
            state=result.result.value;
            if(state?.loaded==='success')break;
            await new Promise(r=>setTimeout(r,100));
          }
          assert.deepEqual(state,{loaded:'success',url:pdfUrl},'PDF actually rendered in native pane');
          await cdp.send('Target.detachFromTarget',{sessionId}); await cdp.detach();
        }
        const captured = await page.evaluate(async()=>{const {currentTabs}=await import('./shared/browser.js'); return currentTabs();});
        assert.deepEqual(captured.pages.map(p=>p.url),[left,right]);
        assert.deepEqual(captured.pages.map(p=>p.openMode),['dual','dual']);
        await page.evaluate(async id=>{const {request}=await import('./shared/messages.js'); await request('WORKSPACE_CLOSE',{id});},result.workspaceId);
        const remaining = await page.evaluate(async()=>{const {nativeTabs}=await import('./shared/browser.js');return (await nativeTabs()).map(t=>t.id);});
        assert.ok(ids.every(id=>!remaining.includes(id)),'both sides close');
        console.log('PASS:',label,'native split, URLs, PDF viewer, capture and close');
      }
    } finally { server.close(); }
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
