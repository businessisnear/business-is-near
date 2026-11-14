export const TESTNET_RPC='https://rpc.testnet.near.org';
export function usdToNanos(value){if(typeof value!=='string'||value.length>24||!/^(0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value))throw Error('Use a USD amount such as 0.02, with at most 9 decimal places.');const [whole,fraction='']=value.split('.');return (BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'))).toString();}
const ACCOUNT=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
function encoded(obj){const b=encoder.encode(JSON.stringify(obj));return btoa(Array.from(b,x=>String.fromCharCode(x)).join(''));}
export function validContract(value){return typeof value==='string'&&ACCOUNT.test(value);}
export class TestnetRPC {
 constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.sequence=0;}
 async request(method,params){
  const id=++this.sequence,r=await this.fetcher(TESTNET_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('NEAR testnet RPC unavailable.');
  const raw=await r.text();if(raw.length>2_000_000)throw Error('RPC response too large.');
  let body;try{body=JSON.parse(raw)}catch{throw Error('Invalid RPC response.');}
  if(body.id!==id||body.jsonrpc!=='2.0'||body.error||!body.result)throw Error('RPC rejected the request or returned an invalid response.');
  return body.result;
 }
 async checkNetwork(){const status=await this.request('status',[]);if(status.chain_id!=='testnet')throw Error('RPC network is not testnet.');}
 async finalBlock(){const b=await this.request('block',{finality:'final'});if(!b?.header?.hash||!Number.isSafeInteger(b.header.height))throw Error('Invalid final block.');return {hash:b.header.hash,height:b.header.height};}
 async view(id,method,args,block){
  if(!validContract(id))throw Error('Enter a valid .testnet contract account.');
  const r=await this.request('query',{request_type:'call_function',account_id:id,method_name:method,args_base64:encoded(args),block_id:block});
  if(!Array.isArray(r.result)||r.result.length>1_000_000||r.result.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Invalid contract response.');
  try{return JSON.parse(decoder.decode(new Uint8Array(r.result)))}catch{throw Error('Contract returned invalid JSON.');}
 }
 async inspect(id){
  if(!validContract(id))throw Error('Enter a valid .testnet contract account.');
  await this.checkNetwork();const block=await this.finalBlock();
  const [account,treasury,company,history]=await Promise.all([
   this.request('query',{request_type:'view_account',account_id:id,block_id:block.hash}),this.view(id,'state',{},block.hash),this.view(id,'company_state',{},block.hash),this.view(id,'company_history',{from_index:0,limit:20},block.hash)]);
  if(!treasury||typeof treasury.owner!=='string'||typeof treasury.frozen!=='boolean'||
     ['cash','escrow','committed','revenue','reserve','paid','withdrawing'].some(k=>typeof treasury[k]!=='string'||!/^(0|[1-9]\d{0,38})$/.test(treasury[k]))||
     !company||!Array.isArray(history?.items)||history.items.length>20||history.items.some(x=>typeof x!=='string')||typeof account?.code_hash!=='string')throw Error('Account does not expose the expected company views.');
  return {contract:id,block,code_hash:account.code_hash,treasury,company,history};
 }
}

export function formatNear(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value))throw Error('Invalid yoctoNEAR amount.');const n=BigInt(value),unit=10n**24n,whole=n/unit,fraction=(n%unit).toString().padStart(24,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'')+' NEAR';}

export function formatUsdNanos(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value))throw Error('Invalid USD nanos amount.');const n=BigInt(value),whole=n/1000000000n,fraction=(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');return '$'+whole+(fraction?'.'+fraction:'')+' USD';}
