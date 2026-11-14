// Same-origin private media client. Wallet signatures authenticate only; this
// module never constructs a transaction or reads an HttpOnly session cookie.
import {Buffer} from 'buffer';

const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ALLOWED=new Set(['inventory','import','import_audio','asset','reuse']);
const DOCUMENTS=new Set(['import','preview']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,fields){if(!object(value)||Object.keys(value).sort().join(',')!==[...fields].sort().join(','))throw Error('Unexpected owner authentication fields.');}
function account(value){if(typeof value!=='string'||!ACCOUNT.test(value))throw Error('Invalid owner or company account.');return value;}
function cookie(document,name){const entries=String(document?.cookie||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));if(entries.length!==1)throw Error('Authenticate this owner workspace first.');const value=entries[0].slice(name.length+1);if(!TOKEN.test(value))throw Error('Invalid owner CSRF cookie.');return value;}
function challenge(value,company,owner,origin,now){
 exact(value,['state','company_id','account_id','nonce','recipient','callback_url','issued_at','expires_at','message']);
 const message='Sign in to the private business workspace. Company: '+company+'. Account: '+owner+'. Origin: '+origin+'. Expires at Unix '+value.expires_at+'. This grants no transactions, payments or provider actions.';
 if(value.company_id!==company||value.account_id!==owner||value.recipient!==origin||value.callback_url!==origin+'/wallet-auth-callback.html'||value.message!==message||!TOKEN.test(value.state)||!Number.isSafeInteger(value.issued_at)||value.expires_at!==value.issued_at+120||now<value.issued_at-30||now>=value.expires_at)throw Error('Owner challenge differs from this account, origin or expiry.');
 const nonce=Buffer.from(value.nonce,'base64');if(nonce.length!==32||nonce.toString('base64')!==value.nonce)throw Error('Invalid owner nonce.');return nonce;
}

export function createPrivateOwnerClient({fetcher=globalThis.fetch.bind(globalThis),document=globalThis.document,origin=globalThis.location?.origin,now=()=>Math.floor(Date.now()/1000),onChange=()=>{}}={}){
 if(typeof origin!=='string'||!/^https:\/\/[^/]+$|^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(origin))throw Error('Exact HTTPS or numeric loopback workspace origin required.');
 let configuration=null,company=null,identity=null,epoch=0;
 function clear(){identity=null;epoch++;onChange(null);}
 function ticket(){return {company,epoch};}
 function current(value){if(value.company!==company||value.epoch!==epoch)throw Error('Owner workspace changed; authenticate it again.');}
 async function api(route,body,{csrf=false}={}){
  const response=await fetcher('/__private/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'X-Proof-CSRF':cookie(document,'proofwork_owner_csrf')}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const raw=await response.text();if(raw.length>3*1024*1024)throw Error('Private workspace response exceeds its bound.');let value;try{value=JSON.parse(raw);}catch{throw Error('Private owner service returned an incomplete response.');}
  if(!response.ok){if(response.status===403)clear();throw Error('Private owner access was denied. Recheck the connected account and authenticate again.');}return value;
 }
 async function configure(){
  const value=await api('config');if(!object(value)||value.schema!==1||value.origin!==origin||!['sandbox','testnet','mainnet'].includes(value.network)||typeof value.chain_id!=='string'||!object(value.companies)||value.signs_transactions!==false||value.calls_models!==false||Object.keys(value.companies).length<1||Object.keys(value.companies).length>16)throw Error('Unexpected private owner service configuration.');
  for(const [id,code]of Object.entries(value.companies)){account(id);if(typeof code!=='string'||!HASH.test(code))throw Error('Invalid reviewed owner company pin.');}configuration=Object.freeze(value);return configuration;
 }
 function bind(result,owner){
  if(!object(result)||result.company_id!==company||result.account_id!==owner||result.boundary?.owner!==owner||result.boundary?.account_id!==owner||result.boundary?.company_id!==company||result.boundary?.permission!=='FullAccess'||result.boundary?.code_hash!==configuration.companies[company]||result.boundary?.chain_id!==configuration.chain_id)throw Error('Authenticated owner differs from the selected company and reviewed identity.');
  identity=Object.freeze({company_id:company,account_id:owner,boundary:Object.freeze({...result.boundary})});onChange(identity);return identity;
 }
 return Object.freeze({
  get identity(){return identity;},get companyId(){return company;},get configuration(){return configuration;},
  configure,
  clear,
  selectCompany(value){account(value);if(company!==value){clear();company=value;}return company;},
  async signIn(wallet,owner){
   account(owner);if(!company)throw Error('Select the intended company first.');clear();const captured=ticket(),config=configuration||await configure();current(captured);if(!Object.hasOwn(config.companies,company))throw Error('This company is not enabled for private access.');
   const accounts=await wallet.getAccounts();current(captured);if(!Array.isArray(accounts)||!accounts.some(value=>value.accountId===owner))throw Error('Connect the intended owner wallet first.');
   const value=await api('auth/challenge',{company_id:company,account_id:owner});current(captured);const nonce=challenge(value,company,owner,origin,now());
   const signed=await wallet.signMessage({message:value.message,nonce,recipient:value.recipient,callbackUrl:value.callback_url,state:value.state});current(captured);
   if(!signed)throw Error('Finish the wallet message-signing callback, then return to this workspace.');
   if(signed.accountId!==owner||typeof signed.publicKey!=='string'||!signed.publicKey.startsWith('ed25519:')||typeof signed.signature!=='string'||signed.state!==undefined&&signed.state!==value.state)throw Error('Wallet signed with a different owner or state.');
   const result=await api('auth/exchange',{signed:{accountId:signed.accountId,publicKey:signed.publicKey,signature:signed.signature,state:value.state}});current(captured);return bind(result,owner);
  },
  async restore(owner){account(owner);if(!company)throw Error('Select the intended company first.');clear();const captured=ticket();if(!configuration)await configure();current(captured);const result=await api('auth/session',{company_id:company},{csrf:true});current(captured);return bind(result,owner);},
  async media(action,payload={}){if(!ALLOWED.has(action)||!object(payload)||Object.hasOwn(payload,'company_id')||!identity||identity.company_id!==company)throw Error('Authenticate the selected owner workspace first.');const captured=ticket(),result=await api('media/'+action,{company_id:company,...payload},{csrf:true});current(captured);return result;},
  async documents(action,payload={}){if(!DOCUMENTS.has(action)||!object(payload)||Object.hasOwn(payload,'company_id')||!identity||identity.company_id!==company)throw Error('Authenticate the selected owner workspace first.');const captured=ticket(),result=await api('documents/'+action,{company_id:company,...payload},{csrf:true});current(captured);return result;},
  async logout(){const previous=identity,target=company;clear();if(previous)await api('auth/logout',{company_id:target},{csrf:true});},
 });
}
