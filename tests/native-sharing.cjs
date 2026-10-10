// Two isolated Whale profiles, demo Firestore emulator, simulated anonymous auth only.
// Production project, user tabs and installed extension are never touched by this test.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MEWE_NODE_MODULES?path.join(process.env.MEWE_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'mewe-sharing-')),copy=path.join(temp,'extension');
const projectId='demo-mewe';
function token(uid){const n=Math.floor(Date.now()/1000);return [Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({aud:projectId,iss:`https://securetoken.google.com/${projectId}`,sub:uid,user_id:uid,iat:n,exp:n+3600,auth_time:n,firebase:{identities:{},sign_in_provider:'anonymous'}})).toString('base64url'),''].join('.');}
(async()=>{
  let users=0;
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/v1/accounts:signUp')){const uid='native-user-'+(++users);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({localId:uid,idToken:token(uid),refreshToken:uid,expiresIn:'3600'}));}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>'+req.url+'</title><h1>Shared web page</h1>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const contexts=[];
  try{
    fs.mkdirSync(copy,{recursive:true});
    for(const name of ['manifest.json','sidebar.html','background.js','app.js','shared','features','assets'])fs.cpSync(path.join(root,name),path.join(copy,name),{recursive:true});
    const manifest=JSON.parse(fs.readFileSync(path.join(copy,'manifest.json'),'utf8'));manifest.host_permissions.push('http://127.0.0.1/*');fs.writeFileSync(path.join(copy,'manifest.json'),JSON.stringify(manifest));
    fs.writeFileSync(path.join(copy,'shared/firebase-config.js'),`export const firebaseConfig={projectId:'demo-mewe',apiKey:'demo'};`);
    const firebaseFile=path.join(copy,'features/sharing/firebase.js');
    fs.writeFileSync(firebaseFile,fs.readFileSync(firebaseFile,'utf8').replace('https://identitytoolkit.googleapis.com/v1',base+'/v1').replace('https://securetoken.googleapis.com/v1',base+'/v1').replace('https://firestore.googleapis.com/v1','http://127.0.0.1:8787/v1'));
    const appDir='C:/Program Files/Naver/Naver Whale/Application';const version=fs.readdirSync(appDir).filter(n=>/^\d+\./.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0];
    async function launch(index){
      const profile=path.join(temp,'profile'+index);
      const context=await chromium.launchPersistentContext(profile,{executablePath:path.join(appDir,version,'whale.exe'),headless:false,ignoreDefaultArgs:true,viewport:null,args:[`--user-data-dir=${profile}`,'--remote-debugging-pipe',`--disable-extensions-except=${copy}`,`--load-extension=${copy}`,'--window-position=-32000,-32000','--window-size=1280,900','--no-first-run','--no-default-browser-check','--disable-gpu']});
      contexts.push(context);context.setDefaultTimeout(15000);let worker;
      for(let i=0;i<100&&!worker;i++){for(const candidate of context.serviceWorkers())if(await candidate.evaluate(()=>chrome.runtime.getManifest().name.startsWith('ME:WE')).catch(()=>false))worker=candidate;if(!worker)await new Promise(r=>setTimeout(r,100));}
      assert.ok(worker);const page=await context.newPage();await page.goto(worker.url().replace('background.js','sidebar.html'));return page;
    }
    const sender=await launch(1),receiver=await launch(2),errors=[];
    sender.on('pageerror',e=>errors.push(e.message));receiver.on('pageerror',e=>errors.push(e.message));
    await sender.evaluate(async base=>{
      const {request}=await import('./shared/messages.js');
      const p=(id,url,group)=>({id,title:id,url,openMode:group?'dual':'tab',dualGroupId:group||null});
      await request('WORKSPACE_SAVE',{name:'공유 실험',pages:[p('네이버 검색',base+'/one','A'),p('내 컴퓨터 PDF','file:///C:/private/lecture.pdf','A'),p('문서',base+'/two','B'),p('자료',base+'/three','B')]});
      await request('WORKSPACE_SAVE',{name:'파일만',pages:[p('강의.pdf','file:///C:/private/lecture.pdf')]});
    },base);
    await sender.bringToFront(); await sender.setViewportSize({width:390,height:844});
    await sender.getByRole('article',{name:'공유 실험',exact:true}).getByRole('button',{name:'작업공간 공유',exact:true}).click();
    assert.equal(await sender.locator('.share-pages li').count(),3);assert.equal(await sender.locator('.share-excluded li').count(),1);
    assert.equal((await sender.locator('.sharing').textContent()).includes('file:///'),false);
    await sender.getByRole('button',{name:'공유 코드 복사',exact:true}).click();
    await sender.getByText('✓ 공유 코드가 복사되었어요.',{exact:true}).waitFor();
    const code=await sender.getByLabel('생성된 공유 코드').inputValue();assert.match(code,/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await sender.screenshot({path:path.join(root,'test-results/sharing-send.png')});
    assert.equal(await sender.locator('dialog #toast').count(),1,'copy toast stays above modal backdrop');
    await sender.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('clipboard unavailable');}}));
    await sender.getByRole('button',{name:'공유 코드 복사',exact:true}).click();
    await sender.getByText('자동 복사를 완료하지 못했어요. 선택된 코드를 Ctrl+C로 복사하거나 다시 눌러 주세요.',{exact:true}).waitFor();
    assert.equal(await sender.getByLabel('생성된 공유 코드').inputValue(),code,'copy retry reuses the same snapshot');
    const original=await sender.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces'][0]);assert.equal(original.pages.length,4);assert.equal(original.pages[0].openMode,'dual');
    await sender.getByRole('button',{name:'닫기',exact:true}).click();
    await sender.getByRole('article',{name:'파일만',exact:true}).getByRole('button',{name:'작업공간 공유',exact:true}).click();
    assert.equal(await sender.getByRole('button',{name:'공유 코드 복사',exact:true}).isDisabled(),true);
    await receiver.bringToFront();await receiver.setViewportSize({width:320,height:720});
    async function receive(){
      await receiver.getByRole('button',{name:'공유 작업공간 받기',exact:true}).click();await receiver.getByLabel('공유 코드',{exact:true}).fill(code);await receiver.getByRole('button',{name:'작업공간 확인',exact:true}).click();await receiver.getByRole('button',{name:'바로 열기',exact:true}).waitFor();
    }
    await receive();
    assert.equal(await receiver.getByLabel('공유 코드',{exact:true}).count(),0);assert.equal(await receiver.locator('.sharing .dual-badge').count(),0);
    assert.equal(await receiver.evaluate(()=>document.querySelector('.sheet-body').scrollWidth>document.querySelector('.sheet-body').clientWidth),false);
    await receiver.screenshot({path:path.join(root,'test-results/sharing-receive-320.png')});
    await receiver.getByRole('button',{name:'저장',exact:true}).click();await receiver.locator('.workspace-card').waitFor();
    const saved=await receiver.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces']);
    assert.equal(saved.length,1);assert.deepEqual(saved[0].pages.map(p=>p.openMode),['tab','dual','dual']);assert.notEqual(saved[0].pages[0].id,'네이버 검색');
    await receive();await receiver.getByRole('button',{name:'바로 열기',exact:true}).click();await receiver.getByText('3개 페이지를 열었어요.',{exact:true}).waitFor();
    assert.equal(await receiver.getByRole('dialog').count(),0);
    assert.deepEqual(await receiver.evaluate(async()=> (await chrome.storage.local.get('mewe.workspaces'))['mewe.workspaces']),saved,'direct open does not save');
    const captured=await receiver.evaluate(async()=>{const {currentTabs}=await import('./shared/browser.js');return currentTabs();});assert.deepEqual(captured.pages.map(p=>p.openMode),['tab','dual','dual']);
    assert.deepEqual(captured.pages.map(p=>p.url),[base+'/one',base+'/two',base+'/three']);
    assert.equal(users,2,'one anonymous identity per isolated profile');assert.deepEqual(errors,[]);
    console.log('PASS: two Whale profiles, real Firestore rules/REST, exclusion, clipboard toast, 320px preview, import, unsaved direct launch with native dual pair, original unchanged.');
  }finally{for(const context of contexts)await context.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
