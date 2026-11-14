// Read-only display projection. No chain validation, storage writes, RPC/wallet
// ports, fingerprint recomputation, pending reset or transaction authority.
export const PENDING_METADATA_MAX_BYTES=24000;
const UNKNOWN_NOTE='Outcome UNKNOWN. Saved browser metadata is not proof that an action was unsigned, cancelled or finalized.';
const HASH_NOTE='No transaction hash is displayed. A missing hash does not prove that nothing was signed or broadcast.';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const account=x=>typeof x==='string'&&/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(x);
const hash=x=>typeof x==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const amount=x=>typeof x==='string'&&/^(?:0|[1-9][0-9]{0,38})$/.test(x)&&BigInt(x)<2n**128n;
const requestId=x=>typeof x==='string'&&(/^[a-f0-9]{32}$/.test(x)||/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x));
const projectedViews=new WeakSet();
const sealed=(visible,reason,rows=[],hashNotice=HASH_NOTE,connectionNote='')=>{const view=Object.freeze({visible,status:'UNKNOWN',reason,title:'Saved wallet action · read only',note:UNKNOWN_NOTE,hashNotice,connectionNote,rows:Object.freeze(rows.map(row=>Object.freeze(row)))});projectedViews.add(view);return view;};
const unknown=reason=>sealed(true,reason,[],'Metadata cannot be displayed safely. Keep the original saved request.');
export function pendingOriginalMetadata(raw,context){
 if(raw===null)return sealed(false,'not_observed',[],'Nothing is displayed from this workspace snapshot. This is not an unsigned or completed classification.');
 try{
  if(typeof raw!=='string')return unknown('malformed');
  if(raw.length>PENDING_METADATA_MAX_BYTES||new TextEncoder().encode(raw).length>PENDING_METADATA_MAX_BYTES)return unknown('oversize');
  if(!plain(context)||!['testnet','sandbox'].includes(context.network)||!account(context.company)||(context.account!==null&&!account(context.account))||(context.appContract!==null&&!account(context.appContract)))return unknown('context_unavailable');
  const value=JSON.parse(raw);
  if(!plain(value)||value.version!==1||!plain(value.intent)||!account(value.account)||!account(value.contract)||!['testnet','sandbox'].includes(value.network))return unknown('malformed');
  if(value.network!==context.network||![context.company,context.appContract].includes(value.contract)||(context.account!==null&&value.account!==context.account))return unknown('identity_mismatch');
  const rows=[{label:'Saved network',value:value.network},{label:'Saved approving account',value:value.account},{label:'Saved receiver',value:value.contract}];
  const optional=(object,key,valid,label)=>{
   if(!Object.hasOwn(object,key)||object[key]===null)return;
   if(!valid(object[key]))throw Error('Invalid public metadata');
   rows.push({label,value:object[key]});
  };
  optional(value,'request_id',requestId,'Saved request ID');
  optional(value.intent,'method',x=>typeof x==='string'&&/^[a-z_][a-z0-9_]{0,63}$/.test(x),'Saved method');
  optional(value.intent,'deposit',amount,'Attached deposit (saved yoctoNEAR)');
  optional(value.intent,'gas',amount,'Gas limit (saved gas units)');
  optional(value,'tx_hash',hash,'Saved transaction hash (unverified)');
  optional(value,'fingerprint',hex,'Saved intent fingerprint (UNVERIFIED; not recomputed; not a transaction hash)');
  return sealed(true,'display_only',rows,value.tx_hash?'A recorded hash is a candidate only; this panel does not check its FINAL outcome.':HASH_NOTE,context.account===null?'No connected-wallet identity match is asserted.':'Saved account matches this page’s connected account; this is not transaction finality.');
 }catch{return unknown('malformed');}
}
export function readPendingOriginalMetadata({read,context}){
 try{if(typeof read!=='function')return unknown('unreadable');return pendingOriginalMetadata(read(),context);}catch{return unknown('unreadable');}
}
export function renderPendingOriginalMetadata(mount,view){
 if(!mount)return;
 if(!projectedViews.has(view))view=unknown('malformed');
 // Only this module's projected views render; forged rows/raw journals do not.
 const detailsOpen=mount.querySelector?.('details')?.open===true;
 const document=mount.ownerDocument;
 const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
 mount.replaceChildren();mount.hidden=!view.visible;if(!view.visible)return;
 const title=node('h2',view.title),note=node('p',view.note,'pending-metadata-note');mount.append(title,note);
 if(view.rows.length){const details=node('details');details.open=detailsOpen;const summary=node('summary','Public request metadata'),list=node('dl',undefined,'pending-metadata-list');for(const row of view.rows){list.append(node('dt',row.label),node('dd',row.value));}details.append(summary,list);mount.append(details);}
 mount.append(node('p',view.hashNotice,'pending-metadata-note'));if(view.connectionNote)mount.append(node('p',view.connectionNote,'pending-metadata-note'));
 mount.append(node('p','You may keep reading existing records and use the app’s separate flow to open an already recorded result. This panel needs no wallet approval.','pending-metadata-note'));
 mount.append(node('p','Display only. This panel does not contact the wallet or network and cannot clear, retry or change the saved action.','pending-metadata-note'));
}
