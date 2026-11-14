// Private immutable finalized-RPC archives. Unknown signed intent stays active.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const HASH=/^[a-f0-9]{64}$/;
const LIMIT=1024*1024, SEGMENTS=8192;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const ACTIVE_LIMIT=128, RETAIN=64;
export async function privateText(file,max=LIMIT){
 const h=await fs.open(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=await h.stat();if(!s.isFile()||(s.mode&0o077)||s.uid!==process.getuid()||s.size>max)throw Error('Unsafe private archive file');const buffer=Buffer.alloc(s.size+1);const {bytesRead}=await h.read(buffer,0,buffer.length,0);if(bytesRead>s.size)throw Error('Private archive changed during read');return buffer.subarray(0,bytesRead).toString('utf8');}finally{await h.close();}
}
async function privateDirectory(dir){
 try{await fs.mkdir(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const s=await fs.lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||s.uid!==process.getuid())throw Error('Unsafe private archive directory');
}
async function syncDirectory(dir){const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function immutable(dir,name,raw){
 await privateDirectory(dir);const final=path.join(dir,name),tmp=path.join(dir,'.'+crypto.randomBytes(16).toString('hex')+'.tmp');
 const h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(raw);await h.sync();}finally{await h.close();}
 try{try{await fs.link(tmp,final);}catch(e){if(e.code!=='EEXIST')throw e;if(await privateText(final)!==raw)throw Error('Immutable archive conflict');}await syncDirectory(dir);}finally{await fs.unlink(tmp);}
}
function validFinal(r){
 if(!r||!['final','failed'].includes(r.status)||typeof r.hash!=='string'||!r.hash||typeof r.method!=='string'||!r.tx||r.tx.hash!==r.hash)throw Error('Invalid finalized archive record');
 if(r.request_id!==undefined&&(!/^[A-Za-z0-9_-]{1,128}$/.test(r.request_id)||!HASH.test(r.args_hash)))throw Error('Invalid archived request identity');
}
export class FinalizedJournal {
 constructor(file,identity){this.file=file;this.dir=file+'.archive';this.requests=file+'.requests';this.identity=identity;}
 async request(record){
  validFinal(record);if(record.request_id===undefined)return;
  const payload={version:1,identity:this.identity,record},data=JSON.stringify(payload);
  await immutable(this.requests,sha(record.request_id)+'.json',JSON.stringify({payload,sha256:sha(data)}));
 }
 async find(requestId,method,argsHash){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(requestId))throw Error('Invalid worker request identity');
  await privateDirectory(this.requests);
  let raw;try{raw=await privateText(path.join(this.requests,sha(requestId)+'.json'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const item=JSON.parse(raw),p=item.payload;if(!p||item.sha256!==sha(JSON.stringify(p))||p.version!==1||!same(p.identity,this.identity))throw Error('Request index identity or integrity mismatch');
  validFinal(p.record);if(p.record.request_id!==requestId||p.record.method!==method||p.record.args_hash!==argsHash)throw Error('Worker request identity was already used');
  return p.record;
 }
 async validate(journal){
  if(journal.pending!==null&&(!journal.pending||typeof journal.pending.hash!=='string'||journal.pending.hash.length>100||typeof journal.pending.method!=='string'||!HASH.test(journal.pending.args_hash)||journal.pending.request_id!==undefined&&!/^[A-Za-z0-9_-]{1,128}$/.test(journal.pending.request_id)))throw Error('Invalid pending RPC intent');
  if(!Array.isArray(journal.history)||journal.history.length>1000)throw Error('Invalid active RPC history');
  const check=async r=>{validFinal(r);if(r.request_id!==undefined){const indexed=await this.find(r.request_id,r.method,r.args_hash);if(!indexed||!same(indexed,r))throw Error('Finalized request index is missing or changed');}};
  for(const r of journal.history)await check(r);
  const a=journal.archive||{count:0,head:null};if(!Number.isSafeInteger(a.count)||a.count<0||a.head!==null&&!HASH.test(a.head)||(a.count===0)!==(a.head===null))throw Error('Invalid RPC archive head');
  let head=a.head,end=a.count,count=0;
  if(head!==null)await privateDirectory(this.dir);
  while(head!==null){
   if(++count>SEGMENTS)throw Error('RPC archive segment capacity exhausted');
   const raw=await privateText(path.join(this.dir,head+'.json'));if(sha(raw)!==head)throw Error('RPC archive integrity mismatch');
   const p=JSON.parse(raw);if(p.version!==1||!same(p.identity,this.identity)||!Array.isArray(p.records)||!p.records.length||p.records.length>64||!Number.isSafeInteger(p.from)||p.from<1||p.to!==end||p.to-p.from+1!==p.records.length||p.previous!==null&&!HASH.test(p.previous)||(p.from===1)!==(p.previous===null))throw Error('Invalid RPC archive chain');
   for(const r of p.records)await check(r);end=p.from-1;head=p.previous;
  }
  if(end!==0)throw Error('Incomplete RPC archive chain');
 }
 async compact(journal){
  while(journal.history.length>=ACTIVE_LIMIT){
   const a=journal.archive||{count:0,head:null},records=journal.history.slice(0,64);
   for(const r of records)validFinal(r);
   if(a.count>=SEGMENTS*64)throw Error('RPC archive segment capacity exhausted');
   const payload={version:1,identity:this.identity,previous:a.head,from:a.count+1,to:a.count+records.length,records};
   const raw=JSON.stringify(payload),head=sha(raw);if(Buffer.byteLength(raw)>LIMIT)throw Error('RPC archive segment too large');
   await immutable(this.dir,head+'.json',raw);
   journal.archive={count:payload.to,head};journal.history=journal.history.slice(records.length);
  }
 }
}
