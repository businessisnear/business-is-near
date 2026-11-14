// Public metadata preparation only. No transaction or private-key storage.
const check=(v,m)=>{if(!v)throw Error(m);};
const profile='near-procurement-delivery-private-v4';
const descriptor=(identity,account)=>identity?.profile===profile&&identity.account_id===account&&typeof identity.key_id==='string'&&/^[a-f0-9]{64}$/.test(identity.key_id)&&identity.key_version==='1'&&typeof identity.public_key_pem==='string'&&identity.private_jwk&&typeof identity.private_jwk==='object';
export function identityCandidatesMatchAccounts(identities,accounts){return Boolean(descriptor(identities?.owner,accounts.owner)&&descriptor(identities?.worker,accounts.operator));}
export function policyPreparationState(state,identities,accounts){
 if(state.m)return 'existing_mandate';
 if(!state.policy)return 'prepare_public_policy';
 if(!identityCandidatesMatchAccounts(identities,accounts))return 'original_keys_unavailable';
 for(const role of ['owner','worker'])for(const k of ['account_id','key_id','key_version','public_key_pem'])if(identities[role][k]!==state.policy.recipient_policy?.[role]?.[k])return 'original_keys_unavailable';
 return 'ready_for_create';
}
export function requireCreateKeyReadiness(state,identities,accounts){check(policyPreparationState(state,identities,accounts)==='ready_for_create','Prepare the original local delivery keys before reviewing a budget; existing public recipients cannot be overwritten');}
export function createPolicyPreparer({validatePublic,getPrepared,readAdmission,buildProposal,commit}){
 check([validatePublic,getPrepared,readAdmission,buildProposal,commit].every(v=>typeof v==='function'),'Explicit policy preparation ports required');let active=false;
 return async recipientPolicy=>{
  recipientPolicy=structuredClone(recipientPolicy);
  await validatePublic(recipientPolicy);
  check(!getPrepared()&&!active,'Original public policy already prepared or preparation in progress');active=true;
  try{await readAdmission();const proposal=await buildProposal(recipientPolicy);check(!getPrepared(),'Original public policy already prepared');commit(proposal);return {prepared:true};}finally{active=false;}
 };
}
