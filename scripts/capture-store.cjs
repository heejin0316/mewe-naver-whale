// Real extension UI in a presentation frame; fictional local workspaces only.
// No user profile or Firebase requests. The frame is never shipped in the app.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, 'playwright') : 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mewe-store-'));
  const extension = path.join(temp, 'extension'); fs.mkdirSync(extension);
  for (const name of ['manifest.json', 'sidebar.html', 'app.js', 'background.js', 'assets', 'shared', 'features']) fs.cpSync(path.join(root, name), path.join(extension, name), { recursive: true });
  fs.writeFileSync(path.join(extension, 'capture.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>ME:WE 스토어 이미지</title>
  <style>*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;background:#f1f8f6;color:#203b36;font-family:'Malgun Gothic',sans-serif;overflow:hidden}.copy{position:absolute;left:72px;top:100px;width:600px}.brand{display:flex;align-items:center;gap:14px;font-size:25px;font-weight:bold}.brand img{width:48px;height:48px}h1{font-size:49px;letter-spacing:-2.5px;line-height:1.35;margin:55px 0 24px}p{font-size:21px;line-height:1.85;color:#536b66}.note{position:absolute;left:72px;bottom:49px;font-size:13px;color:#647a75}.frame{position:absolute;right:48px;top:24px;width:430px;height:752px;overflow:hidden;border-radius:23px;border:1px solid #d7e6e1;box-shadow:0 14px 45px #173b3020;background:white}iframe{border:0;width:100%;height:100%;display:block}</style>
  <div class="copy"><div class="brand"><img src="assets/icons/mark.svg" alt="">ME:WE</div><h1>하던 공부를 저장하고,<br>다시 이어가세요.</h1><p>열어둔 페이지와 듀얼탭을 한곳에.<br>작업공간을 저장하고, 필요할 때 다시 열어요.</p></div><div class="note">네이버 웨일 사이드바 확장앱 · 실제 앱 화면 / 예시 자료</div><div class="frame"><iframe src="sidebar.html" title="ME:WE 실제 화면"></iframe></div></html>`);
  const appDir = 'C:/Program Files/Naver/Naver Whale/Application';
  const version = fs.readdirSync(appDir).filter(n => /^\d+\./.test(n)).sort((a,b) => b.localeCompare(a,undefined,{numeric:true}))[0];
  const profile = path.join(temp,'profile');
  const context = await chromium.launchPersistentContext(profile, { executablePath:path.join(appDir,version,'whale.exe'),headless:false,ignoreDefaultArgs:true,viewport:{width:1280,height:800},deviceScaleFactor:1,args:[`--user-data-dir=${profile}`,'--remote-debugging-pipe',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--window-position=-32000,-32000','--window-size=1280,900','--no-first-run','--no-default-browser-check','--disable-gpu'] });
  try {
    let worker;
    for(let i=0;i<60&&!worker;i++){for(const w of context.serviceWorkers())if(await w.evaluate(()=>chrome.runtime.getManifest().name.startsWith('ME:WE')).catch(()=>false))worker=w;if(!worker)await new Promise(r=>setTimeout(r,100));}
    if(!worker)throw new Error('ME:WE worker missing');
    await worker.evaluate(async()=>{
      const page=(id,title,url,dual=false)=>({id,title,url,openMode:dual?'dual':'tab',dualGroupId:dual?'A':null});
      await chrome.storage.local.set({'mewe.meta':{workspaceSeeded:true,schemaVersion:2},'mewe.workspaces':[
        {id:'research',name:'논문 읽기',createdAt:1,updatedAt:1,pages:[page('a','논문 원문','https://example.org/paper',true),page('b','논문 정리 노트','https://example.org/notes',true)]},
        {id:'course',name:'이번 주 수업',createdAt:1,updatedAt:1,pages:[page('c','온라인 강의실','https://example.org/class'),page('d','수업 자료','https://example.org/reading')]}
      ]});
    });
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(worker.url().replace('background.js','capture.html'));
    const frame=page.frameLocator('iframe');await frame.locator('.workspace-card').nth(1).waitFor();
    const output=path.join(root,'delivery/screenshots');fs.mkdirSync(output,{recursive:true});
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(output,'01-workspaces.png')});
    await frame.getByRole('button',{name:'작업공간 공유',exact:true}).first().click();
    await frame.getByRole('dialog').waitFor();
    await frame.locator('.share-consent input').first().waitFor();
    await page.locator('h1').evaluate(n=>{n.replaceChildren('함께 볼 페이지를',document.createElement('br'),'코드 하나로 공유해요.');});
    await page.locator('.copy p').evaluate(n=>{n.replaceChildren('공유할 페이지 목록을 확인하고,',document.createElement('br'),'팀원에게 작업공간을 전달하세요.');});
    await page.screenshot({path:path.join(output,'02-sharing.png')});
    if(errors.length)throw new Error(errors.join('\n'));
    for(const name of fs.readdirSync(output)){const b=fs.readFileSync(path.join(output,name));if(b.readUInt32BE(16)!==1280||b.readUInt32BE(20)!==800)throw new Error('Wrong dimensions: '+name);}
    console.log('1280x800 스토어 이미지 2장 생성: 실제 확장앱 UI + 예시 데이터, 공유 코드 발급 없음');
  }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
