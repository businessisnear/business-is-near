import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvisorySession,DEFAULT_INPUT,MODEL_DIGEST,decodeProxyJSON} from './model-proxy.mjs';
import {MODEL,PLANNER_RESPONSE_SCHEMA,deterministicCompletionMock} from './company-loop.mjs';
const tags={models:[{name:MODEL,digest:MODEL_DIGEST}]};
async function answer(request){const c=await deterministicCompletionMock(request);return{model:MODEL,done:true,done_reason:'stop',message:c.choices[0].message,prompt_eval_count:100,eval_count:200};}
test('portable proxy reproduces exact schema/thinkfalse/token contract and forwards unchanged content once',async()=>{
 const calls=[];let original;
 const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439',transport:async(url,options)=>{calls.push({url,options});if(options.method==='GET')return tags;assert.equal(options.body.think,false);assert.deepEqual(options.body.format,PLANNER_RESPONSE_SCHEMA);assert.deepEqual(options.body.options,{temperature:0,num_ctx:4096,num_predict:512});original=await answer(session.expectedRequest());return original;}});
 const result=await session.complete(session.expectedRequest());assert.equal(calls.length,2);assert.equal(result.choices[0].message.content,original.message.content);assert.equal(result.usage.completion_tokens,200);assert.equal(session.status().completed,true);await assert.rejects(session.complete(session.expectedRequest()),/never replayed/);assert.equal(calls.length,2);
});
test('external origins or a different cached model cannot reach inference',async()=>{
 for(const u of ['https://cloud-api.near.ai','http://localhost:11439','http://127.0.0.1:11439/api/chat'])assert.throws(()=>createAdvisorySession({ollamaOrigin:u}));
 let calls=0;const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439',transport:async()=>{calls++;return{models:[{name:MODEL,digest:'wrong'}]};}});await assert.rejects(session.complete(session.expectedRequest()),/digest/);assert.equal(session.status().model_attempted,false);await assert.rejects(session.complete(session.expectedRequest()),/never replayed/);assert.equal(calls,1);
});
test('changed goal/body or hidden tools are refused before local transport',async()=>{
 let calls=0;const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439',transport:async()=>{calls++;}});for(const mutate of [x=>x.max_tokens=513,x=>x.tools=[{name:'pay'}],x=>x.messages[1].content=JSON.stringify({...DEFAULT_INPUT,goal:'different'})]){const request=session.expectedRequest();mutate(request);await assert.rejects(session.complete(request),/Exact/);}assert.equal(calls,0);assert.equal(session.status().accepted,false);
});
test('lost original model response stays unknown and does not retry',async()=>{
 let calls=0;const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439',transport:async(url,options)=>{calls++;if(options.method==='GET')return tags;throw Error('synthetic lost model result');}});await assert.rejects(session.complete(session.expectedRequest()),/lost/);assert.equal(session.status().original_model_call_unknown,true);await assert.rejects(session.complete(session.expectedRequest()),/never replayed/);assert.equal(calls,2);
});
test('truncation, tool calls, wrong model and over-budget result cannot become a company plan',async()=>{
 for(const change of [x=>x.done_reason='length',x=>x.message.tool_calls=[{name:'withdraw'}],x=>x.model='other',x=>x.eval_count=513,x=>x.message.content='{}']){
  const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439',transport:async(url,options)=>{if(options.method==='GET')return tags;const value=await answer(session.expectedRequest());change(value);return value;}});await assert.rejects(session.complete(session.expectedRequest()));assert.equal(session.status().completed,false);assert.equal(session.status().result_received,true);
 }
});
test('invalid and truncated response bytes reject through the real transport decoder without inference retry',async t=>{
 const good=await answer({model:MODEL,messages:[{role:'system',content:'fixture'},{role:'user',content:JSON.stringify(DEFAULT_INPUT)}]}),raw=Buffer.from(JSON.stringify(good)),at=raw.indexOf('Offer');assert.ok(at>0);
 for(const invalid of [Buffer.from([0xff]),Buffer.from([0xe2,0x82])]){
  let requests=0;const bytes=Buffer.concat([raw.subarray(0,at),invalid,raw.subarray(at+1)]);
  t.mock.method(globalThis,'fetch',async url=>{requests++;return new Response(String(url).endsWith('/api/tags')?JSON.stringify(tags):bytes);});
  const session=createAdvisorySession({ollamaOrigin:'http://127.0.0.1:11439'});await assert.rejects(session.complete(session.expectedRequest()),/encoded data|encoding|UTF/i);assert.equal(session.status().completed,false);assert.equal(session.status().original_model_call_unknown,true);await assert.rejects(session.complete(session.expectedRequest()),/never replayed/);assert.equal(requests,2);t.mock.restoreAll();
 }
});
test('request decoder rejects malformed/truncated UTF8 before accepting a model request',async()=>{
 const raw=Buffer.from(JSON.stringify({name:'Harbor Studio'})),at=raw.indexOf('Harbor');assert.ok(at>0);
 for(const invalid of [Buffer.from([0xff]),Buffer.from([0xe2,0x82])])assert.throws(()=>decodeProxyJSON(Buffer.concat([raw.subarray(0,at),invalid,raw.subarray(at+1)])),/encoded data|encoding|UTF/i);
 assert.deepEqual(decodeProxyJSON(Buffer.from('{"name":"Valid � content"}')),{name:'Valid � content'});
});
