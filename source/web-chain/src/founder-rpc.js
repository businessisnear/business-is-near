import {TestnetRPC} from './chain.js';

const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const FOUNDER_TESTNET_GENESIS='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b';
// Only this structured, request-bound response means an account is absent.
export class FounderAccountMissing extends Error {
  constructor(accountId,blockHash,blockHeight){super('This testnet account has not been activated.');this.accountId=accountId;this.blockHash=blockHash;this.blockHeight=blockHeight;}
}
export async function checkFounderNetwork(rpc){const status=await rpc.request('status',[]);if(status?.chain_id!=='testnet'||status.genesis_hash!==FOUNDER_TESTNET_GENESIS||status.sync_info?.syncing!==false)throw Error('The provider must be synchronized with the reviewed NEAR testnet genesis.');return status;}
export function assertFounderFinalQuery(value,block){if(!block||!HASH.test(block.hash)||!Number.isSafeInteger(block.height)||value?.block_hash!==block.hash||value.block_height!==block.height)throw Error('The provider returned data outside the reviewed FINAL block. Read the current state again.');return value;}
export async function founderQuery(rpc,params,block){return assertFounderFinalQuery(await rpc.request('query',{...params,block_id:block.hash}),block);}
export async function founderView(rpc,id,method,args,block){const raw=await founderQuery(rpc,{request_type:'call_function',account_id:id,method_name:method,args_base64:btoa(Array.from(new TextEncoder().encode(JSON.stringify(args)),c=>String.fromCharCode(c)).join(''))},block);if(!Array.isArray(raw.result)||raw.result.length>1000000||raw.result.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Invalid finalized company response.');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw.result)));}
// Apply the stricter provenance boundary only to the new guided public journey.
// Existing isolated/local and recorded-demo clients retain their accepted behavior.
export function withFounderFinality(rpc){const blocks=new Map(),scoped=Object.create(rpc);scoped.finalBlock=async()=>{const b=await rpc.finalBlock();blocks.set(b.hash,b);return b;};scoped.checkNetwork=()=>checkFounderNetwork(rpc);scoped.request=async(method,params)=>{const value=await rpc.request(method,params);if(method==='query'){const block=blocks.get(params.block_id);if(!block)throw Error('Read a reviewed FINAL block before its company data.');assertFounderFinalQuery(value,block);}return value;};return scoped;}

// Serialize the new public founder reads. Retry only transport/selected HTTP
// failures; decoding, chain identity and outcome validation stay outside retries.
// A queued read keeps its exact serialized params, FINAL block and JSON-RPC id.
export function createFounderRPC({fetcher=globalThis.fetch.bind(globalThis),now=()=>Date.now(),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const methods=new Set(['status','block','query','tx','EXPERIMENTAL_protocol_config']),retryStatus=new Set([429,502,503,504]);
  let tail=Promise.resolve(),lastStart=-Infinity;
  const transport=(_url,options)=>{
    const wire=JSON.parse(options.body);if(!methods.has(wire.method))throw Error('The founder RPC permits read-only methods only.');
    const body=options.body;
    const run=async()=>{
      for(let attempt=0;attempt<3;attempt++){
        const wait=Math.max(0,(attempt?500*2**attempt:500)-(now()-lastStart));if(wait)await delay(wait);lastStart=now();
        try{
          const response=await fetcher('https://test.rpc.fastnear.com',{...options,body,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
          const raw=await response.text();
          if(retryStatus.has(response.status)){if(attempt<2)continue;throw Error('The testnet provider is temporarily unavailable. Reload this page to retry its reads; keep any saved wallet action for inspection.');}
          if(response.ok&&raw.length<=2000000&&wire.method==='query'&&wire.params?.request_type==='view_account'){
            let body;try{body=JSON.parse(raw);}catch{}
            const info=body?.error?.cause?.info;
            if(body?.jsonrpc==='2.0'&&body.id===wire.id&&!Object.hasOwn(body,'result')&&body.error?.name==='HANDLER_ERROR'&&body.error.cause?.name==='UNKNOWN_ACCOUNT'&&
              info?.requested_account_id===wire.params.account_id&&info.block_hash===wire.params.block_id&&HASH.test(info.block_hash)&&Number.isSafeInteger(info.block_height)&&info.block_height>=0){
              throw new FounderAccountMissing(info.requested_account_id,info.block_hash,info.block_height);
            }
          }
          return {ok:response.ok,status:response.status,text:async()=>raw};
        }catch(error){
          if(!['TypeError','AbortError','TimeoutError'].includes(error?.name))throw error;
          if(attempt===2)throw Error('The testnet provider could not complete this read after three attempts. Reload this page to retry its reads; keep any saved wallet action for inspection.');
        }
      }
      throw Error('The testnet provider could not complete this read. Your original wallet action was retained.');
    };
    const result=tail.then(run);tail=result.then(()=>undefined,()=>undefined);return result;
  };
  return new TestnetRPC(transport);
}

// Polls and explicit refreshes share one read flight. A changed owner/company
// waits for the stale flight to settle, then reads its own current context.
export function createFounderReadFlight({context,run}){
  let flight=null;
  const same=(a,b)=>a.epoch===b.epoch&&a.company===b.company;
  function refresh({forceFresh=false}={}){
    const next=context();
    if(flight){if(!forceFresh&&same(next,flight.context))return flight.promise;return flight.promise.catch(()=>{}).then(()=>refresh({forceFresh}));}
    const active={context:next,promise:null};flight=active;
    active.promise=Promise.resolve().then(run).finally(()=>{if(flight===active)flight=null;});return active.promise;
  }
  return refresh;
}
