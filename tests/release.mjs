import assert from 'node:assert/strict';
const host = process.env.CDP_HOST || 'http://127.0.0.1:9223';
const url = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const target = await (await fetch(`${host}/json/new?${encodeURIComponent(url)}`, { method:'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); });
let sequence=0,passed=0; const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data); const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.text);return response.result.value;}
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out: '+expression);}
async function check(expression,label){assert.equal(await evaluate(expression),true,label);passed++;process.stdout.write(`PASS ${label}\n`);}
try{
 await send('Runtime.enable'); await send('Page.enable');
 await wait(`document.readyState==='complete' && !!window.NTBackend`);
 await check(`window.NTBackend.production && !window.NTBackend.configured`,'default route is production and unconfigured');
 await check(`document.querySelector('.js-balance').textContent==='0' && document.querySelector('.js-prize-count').textContent==='0'`,'unconfigured release has no fake credits or rewards');
 await check(`[...document.querySelectorAll('[data-open-admin]')].every(item=>item.hidden)`,'unauthenticated visitors cannot open admin controls');
 await check(`[...document.querySelectorAll('[data-open-demo]')].every(item=>item.hidden)`,'release hides preview controls');
 await evaluate(`localStorage.setItem('neon-ticket-demo-v2',JSON.stringify({version:2,balance:999999,inventory:[]}));location.reload()`);
 await wait(`document.readyState==='complete' && !!window.NTBackend`);
 await check(`document.querySelector('.js-balance').textContent==='0'`,'forged preview balance is ignored by release');
 await evaluate(`document.querySelector('[data-campaign-card=neon] [data-draw]').click()`);
 await check(`document.querySelector('#accountDialog').open && !document.querySelector('#drawDialog').open`,'unauthenticated draw opens login instead of lottery');
 await evaluate(`document.querySelector('[data-account-mode=signup]').click()`);
 await check(`document.querySelector('#accountForm [type=submit]').textContent==='新規登録する'`,'signup mode has a real separate form action');
 await evaluate(`document.querySelector('#accountForm').elements.email.value='test@example.com';document.querySelector('#accountForm').elements.password.value='test-password-123';document.querySelector('#accountForm').requestSubmit()`);
 await wait(`document.querySelector('#accountMessage').textContent.includes('準備中')`);
 await check(`!window.NTBackend.user && document.querySelector('.js-balance').textContent==='0'`,'missing auth configuration cannot fabricate login or credits');
 await evaluate(`document.querySelector('#accountGoogle').click()`);
 await wait(`document.querySelector('#accountMessage').textContent.includes('準備中')`);
 await check(`!window.NTBackend.user`,'Google login fails closed without configuration');
 await evaluate(`document.querySelector('#accountDialog [data-close-dialog]').click()`);
 await check(`document.querySelector('[data-mission=ad] .mission-action').disabled && document.querySelector('[data-mission=app] .mission-action').disabled`,'unconnected external missions are unavailable');
 process.stdout.write(`${passed} release checks passed. Hosted authentication remains untested until configured.\n`);
}finally{socket.close();await fetch(`${host}/json/close/${target.id}`).catch(()=>{});}
