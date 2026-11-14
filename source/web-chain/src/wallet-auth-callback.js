import {PUBLIC_TESTNET} from './public-testnet.js';
// Standard NEP-413 redirect fallback. Consume once; never render or retain the
// signature/nonce/session token on disk. Popup wallets can return directly.
const target=document.querySelector('#auth-status'),fragment=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
async function finish(){
 if(PUBLIC_TESTNET){target.textContent='Private library sign-in is unavailable on this public testnet site. Return to the workspace to inspect public company records. No authentication response was sent.';return;}
 if(fragment.length>2048)throw Error();const params=new URLSearchParams(fragment),fields=['accountId','publicKey','signature','state'];
 if([...params.keys()].length!==fields.length||fields.some(key=>params.getAll(key).length!==1)||[...params.keys()].some(key=>!fields.includes(key)))throw Error();
 const signed=Object.fromEntries(fields.map(key=>[key,params.get(key)]));
 const response=await fetch(new URL('./__private/auth/exchange',location.href),{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({signed}),signal:AbortSignal.timeout(30000)});
 const raw=await response.text();if(!response.ok||raw.length>8192)throw Error();const result=JSON.parse(raw);
 if(!/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(result.account_id)||!/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(result.company_id))throw Error();
 target.textContent='Authenticated '+result.account_id+' for '+result.company_id+'. Return to the workspace and restore owner access.';
}
finish().catch(()=>{target.textContent='Owner authentication did not finish. Return to the workspace and request a fresh wallet challenge.';});
