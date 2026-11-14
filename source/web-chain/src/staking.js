// Read-only NEAR AI catalog inspection. No wallet, secret, deposit or transaction.
export const STAKING_RPC='https://rpc.mainnet.near.org';
export const STAKING_CONTRACT='stake.dao';
export const STAKING_POOL='nearai.pool.near';
export const STAKING_SOURCE='https://github.com/nearai/house-of-stake-contracts/tree/056fb6e61ae9cbad1480fc5a8cc3138afa50c97b';
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(value)&&BigInt(value)<2n**128n;
const id=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9_-]{1,80}$').test(value);
const label=value=>typeof value==='string'&&value.length<=1000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
async function jsonResponse(response){
 if(!response.ok)throw Error('Staking RPC unavailable; no catalog is approved.');
 const reader=response.body?.getReader();if(!reader)throw Error('RPC streaming response required.');
 let length=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>262144)throw Error('Staking RPC response exceeds limit.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(decoder.decode(bytes));}catch{throw Error('Invalid staking RPC JSON.');}
}
export class StakingCatalog {
 constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.sequence=0;}
 async request(method,params){
  if(!['status','block','query'].includes(method))throw Error('Only read-only catalog RPC is allowed.');
  const id=++this.sequence,response=await this.fetcher(STAKING_RPC,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)}),body=await jsonResponse(response);
  if(body.jsonrpc!=='2.0'||body.id!==id||body.error||body.result===undefined)throw Error('Staking RPC rejected or mismatched the request.');return body.result;
 }
 async view(method,args,block){
  if(!['get_products','get_price','get_config','is_paused'].includes(method))throw Error('Unsupported catalog view.');
  const bytes=encoder.encode(JSON.stringify(args)),args_base64=btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
  const value=await this.request('query',{request_type:'call_function',account_id:STAKING_CONTRACT,method_name:method,args_base64,block_id:block.hash});
  if(value.block_hash!==block.hash||value.block_height!==block.height||!Array.isArray(value.result)||value.result.length>131072||value.result.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Catalog view is not pinned to the finalized block.');
  try{return JSON.parse(decoder.decode(new Uint8Array(value.result)));}catch{throw Error('Invalid catalog view JSON.');}
 }
 async inspect(expectedCodeHash=null){
  if(expectedCodeHash!==null&&!HASH.test(expectedCodeHash))throw Error('Invalid independent code hash.');
  if((await this.request('status',[])).chain_id!=='mainnet')throw Error('Catalog endpoint is not mainnet.');
  const head=(await this.request('block',{finality:'final'})).header;
  if(!head||!HASH.test(head.hash)||!Number.isSafeInteger(head.height)||head.height<=0)throw Error('Invalid finalized catalog block.');
  const block={hash:head.hash,height:head.height},account=await this.request('query',{request_type:'view_account',account_id:STAKING_CONTRACT,block_id:block.hash});
  if(account.block_hash!==block.hash||account.block_height!==block.height||!HASH.test(account.code_hash))throw Error('Invalid staking account identity.');
  if(expectedCodeHash!==null&&account.code_hash!==expectedCodeHash)throw Error('Staking contract code changed; review independently.');
  const [paused,config,products]=await Promise.all([this.view('is_paused',{},block),this.view('get_config',{},block),this.view('get_products',{from_index:0,limit:21},block)]);
  if(typeof paused!=='boolean'||!config||!Array.isArray(products)||products.length>20)throw Error('Unsupported or oversized staking catalog.');
  const terms={};for(const key of ['min_storage_deposit','per_lock_storage_stake','per_farm_position_storage_stake','per_purchase_storage_stake','min_lock_amount','min_lock_duration_ns','max_lock_duration_ns']){if(!decimal(config[key]))throw Error('Invalid staking terms.');terms[key]=config[key];}
  if(!Number.isSafeInteger(config.epoch_unstake_settle_epochs)||config.epoch_unstake_settle_epochs<0)throw Error('Invalid unstaking terms.');terms.epoch_unstake_settle_epochs=config.epoch_unstake_settle_epochs;
  const found=[],seen=new Set();let priceCount=0;
  for(const product of products){
   if(!product||!id(product.product_id,'prod')||seen.has(product.product_id)||!Array.isArray(product.price_ids)||product.price_ids.length>10||!label(product.name)||!['Active','Archived'].includes(product.status))throw Error('Invalid product.');seen.add(product.product_id);
   if(product.validator_id!==STAKING_POOL)continue;
   const prices=[];for(const price_id of product.price_ids){
    if(!id(price_id,'price')||prices.some(x=>x.price_id===price_id)||++priceCount>40)throw Error('Invalid price index.');
    const price=await this.view('get_price',{price_id},block);
    if(!price||price.price_id!==price_id||price.product_id!==product.product_id||!label(price.name)||!decimal(price.amount)||!decimal(price.lock_factor_near_months)||!['Active','Archived'].includes(price.status)||!['OneOff','Recurring','Farm'].includes(price.price_type)||![null,'Monthly'].includes(price.billing_period))throw Error('Catalog price mismatch.');
    const metadata=price.metadata;if(metadata!==null&&(typeof metadata!=='object'||Array.isArray(metadata)||!['max_amount','farm_reward_rate'].every(k=>metadata[k]===null||decimal(metadata[k]))))throw Error('Invalid price metadata.');
    prices.push({price_id,product_id:product.product_id,name:price.name,status:price.status,amount:price.amount,price_type:price.price_type,billing_period:price.billing_period,lock_factor_near_months:price.lock_factor_near_months,metadata});
   }
   if(product.default_price_id!==null&&!prices.some(x=>x.price_id===product.default_price_id&&x.status==='Active'))throw Error('Invalid default catalog price.');
   found.push({product_id:product.product_id,name:product.name,validator_id:product.validator_id,status:product.status,default_price_id:product.default_price_id,prices});
  }
  if(!found.length)throw Error('No NEAR AI catalog products found.');
  return {format:1,kind:'read_only_staking_catalog',network:'mainnet',rpc:STAKING_RPC,contract:STAKING_CONTRACT,block,code_hash:account.code_hash,independent_code_pin:expectedCodeHash!==null,source_abi_reference:STAKING_SOURCE,source_matches_deployed_code:'not established',paused,terms,products:found,approval:false,hosted_agent:'not provisioned',notes:['RPC-reported finalized catalog, not a verified light-client proof or executable quote.','Amounts are exact yoctoNEAR catalog terms; provider credits, actual eligibility, total fees and withdrawal timing require separate review.','No wallet, signature, transaction, stake or provider request was made.']};
 }
}
