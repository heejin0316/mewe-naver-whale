// Browser regression checks with local fixtures; no Firebase or user profile access.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MEWE_NODE_MODULES ? path.join(process.env.MEWE_NODE_MODULES, 'playwright') : 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.MEWE_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    const page = await browser.newPage({viewport:{width:390,height:840}});
    const shot = async name => { if(process.env.MEWE_UI_SCREENSHOTS){fs.mkdirSync(process.env.MEWE_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.MEWE_UI_SCREENSHOTS,name+'.png')});} };
    const origin = `http://127.0.0.1:${server.address().port}`, errors=[];
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const p=(id,dual=false)=>({id,title:`자료 ${id}`,url:`https://example.org/${id}`,openMode:dual?'dual':'tab',dualGroupId:dual?'A':null});
      const state = window.__fixture = {calls:[],items:[
        {id:'existing',name:'기존 논문',createdAt:1,updatedAt:1,openedCount:2,pages:[p('old-a',true),p('old-b',true)]},
        {id:'full',name:'많은 자료',createdAt:1,updatedAt:1,openedCount:0,pages:Array.from({length:9},(_,i)=>p(`full-${i}`))}
      ]};
      const listeners = new Set();
      const tabs = [{id:101,index:0,windowId:1,title:'새 자료 A',url:'https://example.org/new-a'}, {id:102,index:0,windowId:1,title:'새 자료 B',url:'https://example.org/new-b'}, {id:103,index:1,windowId:1,title:'새 자료 C',url:'https://example.org/new-c'}];
      const changed=()=>listeners.forEach(fn=>fn({'mewe.workspaces':{newValue:structuredClone(state.items)}},'local'));
      state.changed=changed;
      globalThis.whale={runtime:{id:'review-ui',getManifest:()=>({version:'0.3.1'}),sendMessage:(message,done)=>{
        state.calls.push(message);
        (async()=>{
          let data;
          if(message.type==='WORKSPACES_LIST') data=structuredClone(state.items);
          else if(message.type==='SHARE_CONSENT_STATUS') data={accepted:true};
          else if(['WORKSPACE_SAVE','WORKSPACE_APPEND'].includes(message.type)){
            const {mutateWorkspaces}=await import('/features/study-widget/controller.js');
            state.items=mutateWorkspaces(state.items,message.type,message.payload);changed();data={};
          } else if(message.type==='WORKSPACE_CLOSE'){
            if(state.closeDelay) await new Promise(resolve=>setTimeout(resolve,state.closeDelay));
            state.items=state.items.map(w=>w.id===message.payload.id?{...w,openedCount:0}:w);changed();data={closed:2,remaining:[],protectedCount:0};
          } else throw new Error('Unexpected request: '+message.type);
          done({requestId:message.requestId,ok:true,data});
        })().catch(error=>done({requestId:message.requestId,ok:false,error:{message:error.message}}));
      }},sidebarAction:{},storage:{onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},
      windows:{getCurrent:(_options,done)=>done({id:1,tabs:[tabs[0],tabs[2]]})},tabs:{query:(_options,done)=>done([tabs[0],tabs[2]]),get:(id,done)=>done(tabs.find(t=>t.id===id))},debugger:{getTargets:done=>done(tabs.map(t=>({type:'page',tabId:t.id})))}};
    });
    await page.goto(origin+'/sidebar.html');
    await page.getByRole('article',{name:'기존 논문',exact:true}).waitFor();
    await shot('main');
    for(const name of ['탭 저장하기','공유 코드 입력','저장한 탭 관리']) assert.equal(await page.getByRole('button',{name,exact:true}).count(),1);
    await page.getByRole('button',{name:'저장한 탭 관리',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H2');
    await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'수정',exact:true}).waitFor();
    assert.equal(await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'삭제',exact:true}).count(),1);
    await shot('management');
    await page.getByRole('button',{name:'관리 완료',exact:true}).click();
    await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'한 번에 닫기'}).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(1800);
    await shot('close-confirmation');
    assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.type==='WORKSPACE_CLOSE').length),0);
    await page.getByRole('button',{name:'취소',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'한 번에 닫기'}).click();
    await page.getByRole('button',{name:'모두 닫기',exact:true}).click();
    await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'한 번에 열기',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.type==='WORKSPACE_CLOSE').length),1);
    console.log('PASS 닫기 확인 유지·취소·확정 후 1회 실행');

    await page.evaluate(()=>{__fixture.closeDelay=600;__fixture.items[0].openedCount=2;__fixture.changed();});
    await page.getByRole('article',{name:'기존 논문',exact:true}).getByRole('button',{name:'한 번에 닫기'}).click();
    await page.getByRole('button',{name:'모두 닫기',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    await page.getByRole('button',{name:'탭 저장하기',exact:true}).click();
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(async()=> (await import('/shared/modal.js')).modal.isOpen),true);
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    console.log('PASS 지연된 닫기 응답이 다음 편집창의 상태를 훼손하지 않음');

    await page.getByRole('button',{name:'탭 저장하기',exact:true}).click();
    const dialog=page.getByRole('dialog');
    assert.equal(await dialog.getByRole('radio',{name:'새 탭 모음 만들기',exact:true}).isChecked(),true);
    await dialog.getByRole('textbox',{name:'탭 모음 이름',exact:true}).fill('새 공부');
    await shot('new-destination');
    await dialog.getByRole('button',{name:'저장',exact:true}).click();
    await page.getByRole('article',{name:'새 공부',exact:true}).waitFor();
    let saved=await page.evaluate(()=>__fixture.items.find(w=>w.name==='새 공부'));
    assert.equal(saved.pages.length,3);assert.equal(saved.pages[0].dualGroupId,saved.pages[1].dualGroupId);

    await page.getByRole('button',{name:'탭 저장하기',exact:true}).click();
    await dialog.getByRole('radio',{name:'기존 탭 모음에 추가하기',exact:true}).check();
    assert.equal(await dialog.getByRole('textbox',{name:'탭 모음 이름',exact:true}).isVisible(),false);
    await dialog.getByRole('combobox',{name:'추가할 탭 모음',exact:true}).selectOption('existing');
    await shot('existing-destination');
    await dialog.getByRole('button',{name:'저장',exact:true}).click();
    await page.waitForFunction(()=>__fixture.items.find(w=>w.id==='existing').pages.length===5);
    saved=await page.evaluate(()=>__fixture.items.find(w=>w.id==='existing'));
    assert.equal(saved.pages[0].id,'old-a');assert.equal(saved.createdAt,1);
    assert.notEqual(saved.pages[0].dualGroupId,saved.pages[2].dualGroupId);
    assert.equal(saved.pages[2].dualGroupId,saved.pages[3].dualGroupId);
    console.log('PASS 새 모음 생성·기존 모음 추가·기존 페이지 보존·듀얼 그룹 분리');

    await page.getByRole('button',{name:'탭 저장하기',exact:true}).click();
    await dialog.getByRole('radio',{name:'기존 탭 모음에 추가하기',exact:true}).check();
    await dialog.getByRole('combobox',{name:'추가할 탭 모음',exact:true}).selectOption('full');
    await dialog.getByRole('button',{name:'저장',exact:true}).click();
    await dialog.getByText('기존 9개에 선택한 3개를 추가하면 10개를 넘어요.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>__fixture.items.find(w=>w.id==='full').pages.length),9);
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await page.locator('.discard-dialog').getByRole('button',{name:'닫기',exact:true}).click();
    console.log('PASS 최대 10개 제한 시 저장 내용 보존');

    await page.evaluate(()=>{__fixture.items=[];__fixture.changed();});
    await page.getByText('첫 탭 모음을 만들어보세요',{exact:true}).waitFor();
    await page.getByRole('button',{name:'탭 저장하기',exact:true}).click();
    await dialog.getByText('저장한 탭 모음이 없어요. 먼저 새 탭 모음을 만들어 주세요.',{exact:true}).waitFor();
    assert.equal(await dialog.getByRole('radio',{name:'기존 탭 모음에 추가하기',exact:true}).isDisabled(),true);
    console.log('PASS 저장한 모음 없는 상태 안내');
    assert.deepEqual(errors,[]);
    console.log('UI 검증 통과: 로컬 모의 데이터, 외부 요청 없음');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
