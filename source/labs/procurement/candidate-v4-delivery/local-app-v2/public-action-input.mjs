// This pure, local gate runs before RPC-capable state reads or persistence.
import {assignmentPreview,PUBLIC_ACK,canonical} from '../financial-fork/assignment-client.mjs';
import {verifyDelivery} from '../delivery-envelope.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(','),'Exact public action fields required');
const other=new Set(['create','post','bid','award','claim','accept','pay','close','refund']);
export async function validatePublicActionInput(action,data,recipientPolicy){
 if(action==='share'){
  exact(data,['packet','public_share_ack']);check(data.public_share_ack===PUBLIC_ACK,'Explicit permanent public-copy approval required');
  check(data.packet&&canonical(await assignmentPreview({context:data.packet.context,source_evidence_sha256:data.packet.source_evidence_sha256,text:data.packet.text}))===canonical(data.packet),'Exact locally reviewed public brief required');
 }else if(action==='deliver'){
  exact(data,['delivery']);check(recipientPolicy,'Original public recipients required');
  // Current job identity is checked AGAIN after a trusted same-FINAL read. This
  // first pass only excludes clear/retargeted/extra transport fields locally.
  await verifyDelivery(data.delivery,{expectedContext:data.delivery?.context,recipientPolicy});
 }else{check(other.has(action),'Unsupported local action');exact(data,[]);}
}
