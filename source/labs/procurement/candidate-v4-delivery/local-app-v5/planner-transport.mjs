// Explicit opt-in finite local Gemma adapter. No hosted provider, key or retry.
import {MODEL,deterministicCompletionMock} from './company-loop.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
export function createPlanner({url=null,fetchImpl=globalThis.fetch}={}){
 if(url===null)return{complete:deterministicCompletionMock,provenance:()=>({backend:'deterministic_api_contract_mock',model_contract:MODEL,attempted_calls:0,completed_calls:0,actual_model_calls:0,cloud_verified:false})};
 const u=new URL(url);check(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024&&Number(u.port)<=65535&&u.pathname==='/v1/chat/completions'&&!u.username&&!u.password&&!u.search&&!u.hash,'Explicit finite loopback completion URL required');
 let attempted=0,completed=0;
 return{
  provenance:()=>({backend:'local_gemma_api_contract',model_contract:MODEL,attempted_calls:attempted,completed_calls:completed,actual_model_calls:attempted===completed?completed:null,original_call_unknown:attempted>completed,cloud_verified:false,max_calls:1,max_tokens:512}),
  async complete(request){
   check(attempted===0,'Original planner call already attempted; no automatic or manual replay in this run');check(request.model===MODEL&&request.messages?.length===2,'Pinned advisory planner contract required');attempted++;
   const r=await fetchImpl(u.href,{method:'POST',redirect:'error',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({...request,max_tokens:512,stream:false}),signal:AbortSignal.timeout(45000)});
   check(r.ok&&r.body,'Original local planner result unavailable; do not retry this run');let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;check(size<=16000,'Bounded local model response required');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   check(body.model===MODEL&&Array.isArray(body.choices)&&body.choices.length===1&&body.choices[0].finish_reason==='stop','One complete pinned model result required');
   const m=body.choices[0].message;check(m?.role==='assistant'&&typeof m.content==='string'&&(!m.tool_calls||Array.isArray(m.tool_calls)&&m.tool_calls.length===0),'Model tool calls cannot become company authority');completed++;
   return{choices:[{message:{role:'assistant',content:m.content}}]};
  }
 };
}
