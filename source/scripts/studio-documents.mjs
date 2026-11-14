// Explicit local-operator rehearsal only. The fixed directory is the directory
// used by the already configured studio worker, never a request-supplied path.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {localOwner} from './studio-local-workspace.mjs';
const HASH=/^[0-9a-f]{64}$/,FORMATS=new Set(['utf8-text-v1','csv-v1','pdf-native-v1']);
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
export function createLocalDocuments({repository,workerDir,contract,python,environment,uiOrigin}){
 if(typeof workerDir!=='string'||!path.isAbsolute(workerDir))throw Error('Fixed actual worker directory required.');
 return {async handle(action,request,req){
  localOwner(request,req,uiOrigin);if(!['import','preview'].includes(action)||request.company_id!==contract||!FORMATS.has(request.format))throw Error('Use the fixed rehearsal company and an exact supported document format.');
  let input;if(action==='import'){
   if(!exact(request,['actor','company_id','document_base64','format'])||typeof request.document_base64!=='string'||request.document_base64.length>1398104||!request.document_base64.length||Buffer.from(request.document_base64,'base64').toString('base64')!==request.document_base64)throw Error('Exact bounded canonical document import required.');input={document_base64:request.document_base64,format:request.format};
  }else{if(!exact(request,['actor','company_id','asset_sha256','format','parser_sha256'])||!HASH.test(request.asset_sha256)||!HASH.test(request.parser_sha256))throw Error('Exact existing document and parser hashes required.');input={asset_sha256:request.asset_sha256,format:request.format,parser_sha256:request.parser_sha256};}
  return await new Promise((resolve,reject)=>{
   const child=spawn(python,['-m','executor.document_input','--worker-dir',workerDir,'--company-id',contract,'--worker-associated',action],{cwd:repository,env:environment,stdio:['pipe','pipe','pipe']});let chunks=[],size=0,settled=false;const timer=setTimeout(()=>child.kill('SIGTERM'),30000);
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1048576){child.kill('SIGTERM');return;}chunks.push(chunk);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
   child.once('error',()=>{settled=true;clearTimeout(timer);reject(Error('The local document adapter did not start.'));});child.once('exit',code=>{clearTimeout(timer);if(settled)return;try{if(code!==0||size>1048576)throw Error();const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result.profile!=='document-preview-v1'||result.company_id!==contract||result.task_prepare_ready!==true||result.worker_binding?.company_id!==contract)throw Error();resolve(result);}catch{reject(Error('The local document import or preview was refused. Check the documented format, extraction bounds and existing worker configuration.'));}});
   child.stdin.end(JSON.stringify(input));
  });
 }};
}
