// Sharing UI regression checks with local fixtures; no Firebase or user profile access.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, 'playwright') : 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
 if(req.url === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/shared/base.css"><link rel="stylesheet" href="/features/study-widget/style.css"><link rel="stylesheet" href="/shared/refinement.css"><link rel="stylesheet" href="/features/sharing/style.css"></head><body></body></html>');return;}
 const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/svg+xml');res.end(fs.readFileSync(file));
});
(async()=>{
 let browser;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  browser=await chromium.launch({headless:true,executablePath:process.env.MEWE_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const shot = async name => {
   if(!process.env.MEWE_UI_SCREENSHOTS) return;
   fs.mkdirSync(process.env.MEWE_UI_SCREENSHOTS,{recursive:true});
   await page.screenshot({path:path.join(process.env.MEWE_UI_SCREENSHOTS,name+'.png')});
  };
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.goto(origin+'/');
  await page.evaluate(async()=>{
   window.test={accepted:false,clipboard:' abcd efgh 2345 ',readCalls:0,getCalls:0,saved:0,launched:0,writes:[],toasts:[],clipError:false};
   window.whale={runtime:{sendMessage(message,callback){if(message.type==='SHARE_CONSENT_ACCEPT')test.accepted=true;callback({requestId:message.requestId,ok:true,data:{accepted:test.accepted}});}}};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async readText(){test.readCalls++;if(test.clipError)throw new DOMException('Denied','NotAllowedError');return test.clipboard;},async writeText(text){test.writes.push(text);}}});
   const p=(id,openMode='tab',dualGroupId=null,url=`https://example.com/${id}`)=>({id,title:id,url,openMode,dualGroupId});
   test.workspace={name:'공유받은 자료',pages:[p('자료 A','dual','A'),p('자료 B','dual','A'),p('일반 자료')]};
   const {modal}=await import('/shared/modal.js'),view=await import('/features/sharing/view.js');test.modal=modal;
   test.services={modal,async launch(value){test.launched++;test.launchedId=value.id;},toast:(...args)=>test.toasts.push(args),sharing:{async get(code){test.getCalls++;test.lookupCode=code;return {workspace:test.workspace,previewId:'preview-1'};},async save(id){if(test.failSave)throw new Error('저장 실패');test.saved++;test.savedId=id;return {...test.workspace,id:'saved-1'};},async launch(id){test.launched++;test.launchedId=id;},async create(){return {code:'ABCDEFGH2345',expiresAt:new Date(Date.now()+86400000).toISOString()};}}};
   test.receive=()=>view.openReceive(test.services);test.share=()=>view.openShare(test.services,{name:'공유할 자료',pages:[...test.workspace.pages,p('내 파일','tab',null,'file:///C:/private/lecture.pdf')]});test.receive();
  });
  await page.locator('.share-consent').first().waitFor();
  assert.equal(await page.evaluate(()=>test.readCalls),0,'no automatic clipboard read');
  await page.getByRole('button',{name:'붙여넣기',exact:true}).click();
  assert.equal(await page.getByLabel('공유 코드',{exact:true}).inputValue(),'ABCD-EFGH-2345');assert.equal(await page.evaluate(()=>test.readCalls),1);assert.equal(await page.evaluate(()=>test.getCalls),0,'paste no lookup');
  assert.equal(await page.getByRole('button',{name:'탭 불러오기',exact:true}).isDisabled(),true);
  await page.locator('.share-consent input').first().check();await page.locator('.share-consent input').nth(1).check();
  await page.getByRole('button',{name:'탭 불러오기',exact:true}).click();await page.locator('.share-preview').waitFor();
  assert.equal(await page.locator('.share-preview .saved-dual-group').count(),1);assert.equal((await page.locator('.share-preview .page-side').allTextContents()).join(','),'A,B');assert.equal(await page.locator('.share-preview .single-page').count(),1);assert.equal(await page.evaluate(()=>test.lookupCode),'ABCDEFGH2345');
  await shot('sharing-preview-390');
  await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'저장',exact:true}).click();assert.equal(await page.evaluate(()=>test.saved),1);
  await page.evaluate(()=>test.receive());await page.getByRole('button',{name:'탭 불러오기',exact:true}).waitFor();await page.getByLabel('공유 코드',{exact:true}).fill('ABCD-EFGH-2345');
  await shot('sharing-paste-390');
  for(const fixture of [{clipboard:'',error:false,text:'복사된 내용이 없어요.'},{clipboard:'not-a-code',error:false,text:'복사한 내용이 공유 코드 형식과 달라요.'},{clipboard:'ABCD-EFGH-2345',error:true,text:'클립보드를 읽지 못했어요.'}]){
   await page.evaluate(f=>{test.clipboard=f.clipboard;test.clipError=f.error;},fixture);await page.getByRole('button',{name:'붙여넣기',exact:true}).click();assert.ok((await page.locator('.sheet > .error').textContent()).includes(fixture.text));assert.equal(await page.evaluate(()=>test.getCalls),1);assert.equal(await page.getByLabel('공유 코드',{exact:true}).inputValue(),'ABCD-EFGH-2345');
  }
  await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{test.modal.close(true);test.receive();});
  await page.getByLabel('공유 코드',{exact:true}).fill('ABCD-EFGH-2345');
  await page.getByRole('button',{name:'탭 불러오기',exact:true}).click();
  await page.locator('.share-preview').waitFor();
  await page.evaluate(()=>{test.failSave=true;});
  await page.getByRole('button',{name:'바로 열기',exact:true}).click();
  assert.equal(await page.evaluate(()=>test.launched),0,'failed save must not open any tabs');
  assert.equal(await page.getByRole('dialog').count(),1,'save failure keeps preview available');
  await page.evaluate(()=>{test.failSave=false;});
  await page.getByRole('button',{name:'바로 열기',exact:true}).click();
  assert.equal(await page.evaluate(()=>test.launched),1,'open launches the preview exactly once');
  assert.equal(await page.evaluate(()=>test.launchedId),'saved-1');
  assert.equal(await page.evaluate(()=>test.saved),2,'open saves before launching the saved collection');
  assert.equal(await page.getByRole('dialog').count(),0,'preview closes after open');
  await page.evaluate(()=>{test.modal.close(true);test.clipError=false;test.share();});await page.locator('.share-excluded').waitFor();assert.equal(await page.locator('.share-excluded li').count(),1);assert.ok((await page.locator('.share-guidance').textContent()).includes('받는 사람에게 같은 화면으로 열리지 않을 수 있어요.'));assert.equal((await page.locator('.sharing').innerText()).includes('file:///'),false);
  await page.getByRole('button',{name:'공유 코드 복사',exact:true}).click();assert.deepEqual(await page.evaluate(()=>test.toasts.at(-1)),['이후 수정사항은 자동으로 반영되지 않아요.',{title:'공유된 탭 모음은 독립적인 복사본입니다.',duration:3500,fade:true}]);assert.equal(await page.evaluate(()=>test.writes.at(-1)),'ABCD-EFGH-2345');assert.deepEqual(errors,[]);
  console.log('PASS: explicit paste only; denied/empty/invalid clipboard; no lookup on paste; consent required; dual preview A/B rows; save and save-before-open; pre-copy local/session warnings; exact 3500ms toast; 320px layout.');
  if(process.env.MEWE_UI_SCREENSHOTS) console.log('Screenshots: '+process.env.MEWE_UI_SCREENSHOTS);
 } finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

