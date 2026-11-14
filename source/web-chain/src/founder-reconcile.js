const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// A pasted or URL hash is only a candidate. Never mutate the durable original
// until the complete FINAL signer/receiver/action/receipt validation succeeds.
export async function inspectWalletCandidate({pending,hash,knownHash,account,rpc,setHash,validate}){
  const selected=hash||knownHash;
  if(!HASH.test(selected||''))throw Error('Use the exact original transaction hash from wallet history.');
  if(knownHash&&selected!==knownHash)throw Error('That hash differs from the original wallet-returned transaction.');
  const candidate=structuredClone(pending);setHash(candidate,selected);
  const out=await rpc.request('tx',{tx_hash:selected,sender_account_id:account,wait_until:'FINAL'});
  if(!HASH.test(out?.transaction_outcome?.block_hash||''))throw Error('The original transaction block is not available yet. Keep the saved action for inspection.');
  const block=await rpc.request('block',{block_id:out.transaction_outcome.block_hash});
  const result=await validate(out,candidate,block.header);
  return {candidate,out,result};
}

// A known FINAL wallet outcome is independent of the following read. Retire its
// approval first, report the confirmation, and never turn a refresh failure into
// an unresolved transaction or leave the original approval available to resend.
export async function refreshAfterKnownFinal({confirm,refresh,notify,current=()=>true}){
  if(!current())return {refreshed:false,stale:true};
  await confirm();if(!current())return {refreshed:false,stale:true};notify(null);
  try{await refresh({forceFresh:true});}
  catch(error){if(current())notify(error);return {refreshed:false,stale:!current()};}
  if(current())notify(null);return {refreshed:current(),stale:!current()};
}
