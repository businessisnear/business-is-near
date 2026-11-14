// The pinned selector drops callbackUrl for signMessage. Preserve the signed
// NEP-413 domain through Nightly's declared injected message API, not a tx API.
export function nightlyMessagePort(wallet,nightly){
 if(typeof wallet?.getAccounts!=='function'||typeof nightly?.signMessage!=='function')throw Error('Nightly message signing is unavailable');
 return Object.freeze({getAccounts:()=>wallet.getAccounts(),signMessage:params=>{
  if(!params||Object.keys(params).sort().join(',')!=='callbackUrl,message,nonce,recipient,state'||!(params.nonce instanceof Uint8Array)||params.nonce.length!==32||params.callbackUrl!==params.recipient+'/wallet-auth-callback.html')throw Error('Exact owner message domain required');
  return nightly.signMessage(params);
 }});
}
