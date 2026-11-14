// One owner lease coordinates every guided wallet action across same-origin tabs.
export const founderWalletLeaseKey=owner=>'business-is-near-wallet-v1:'+owner;

// Reserve MyNearWallet's own named window during the approval click. The SDK
// navigates it after RPC preparation; this helper never signs or retries.
export function reserveMyNearWalletPopup(selector,windowRef=globalThis.window){
  if(selector?.store?.getState?.().selectedWalletId!=='my-near-wallet')return null;
  const popup=windowRef.open('','MyNearWallet','width=720,height=800');
  if(!popup)throw Error('Your browser blocked the wallet window. Allow pop-ups for this site, then review and approve again. No wallet request was sent.');
  const token=crypto.randomUUID();let ownsBlank=false;
  try{
    if(popup.location.href==='about:blank'){
      const element=popup.document.documentElement;
      if(element.dataset.nearWalletReservation)throw Error('Another wallet approval is preparing in this window. Finish it or close its window before approving again. No wallet request was sent.');
      element.dataset.nearWalletReservation=token;ownsBlank=true;
      popup.document.title='Preparing your NEAR wallet';
      if(popup.document.body)popup.document.body.textContent='Preparing the transaction you approved. Your official NEAR wallet will open here. Keep this window open while the app checks the current chain state.';
    }
  }catch(error){if(error.name!=='SecurityError')throw error;/* Existing wallet-origin window belongs to the wallet. */}
  return {
    assertOpen(){if(popup.closed)throw Error('The reserved wallet window was closed before signing. Review the action again when you are ready. No wallet request was sent.');},
    closeIfBlank(){try{if(ownsBlank&&!popup.closed&&popup.location.href==='about:blank'&&popup.document.documentElement.dataset.nearWalletReservation===token)popup.close();}catch{/* Never close a wallet-origin window. */}},
  };
}
