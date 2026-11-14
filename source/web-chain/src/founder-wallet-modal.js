import {nightlyBrowserHint} from './founder-wallet-connectors.js';
// Supply dialog and keyboard semantics missing from the installed modal module.
// Wallet selection still calls the module's own click handler, after user input.
export function showFounderWalletModal(modal,{root=globalThis.document,trigger=root.activeElement}={}){
  modal.show();const container=root.querySelector('#near-wallet-selector-modal');
  if(!container)throw Error('The wallet chooser could not open. Try connecting again.');
  let closed=false,observer;
  const focusable=()=>[...container.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length);
  const restore=()=>{if(closed)return;closed=true;observer?.disconnect();container.removeEventListener('keydown',key);container.removeEventListener('click',click);container.removeEventListener('animationend',focusInside);if(trigger?.isConnected&&!trigger.disabled)trigger.focus();};
  const focusInside=()=>{if(!closed&&!container.contains(root.activeElement))focusable()[0]?.focus();};
  const click=event=>{if(event.target.closest('button.close-button')){event.stopPropagation();modal.hide();restore();}};
  const key=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();modal.hide();restore();return;}
    if(['Enter',' '].includes(event.key)&&event.target.matches('.single-wallet,.single-wallet-get,#get-a-wallet-button')){event.preventDefault();event.target.click();return;}
    if(event.key==='Tab'){const nodes=focusable(),first=nodes[0],last=nodes.at(-1);if(!first)return;if(event.shiftKey&&(root.activeElement===first||!container.contains(root.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(root.activeElement===last||!container.contains(root.activeElement))){event.preventDefault();first.focus();}}
  };
  const normalize=()=>{
    const wrapper=container.querySelector('.nws-modal-wrapper');if(!wrapper?.classList.contains('open')){restore();return;}
    const dialog=container.querySelector('.nws-modal-background'),title=container.querySelector('.nws-modal-title');
    if(container.querySelector('#module-nightly')){let hint=container.querySelector('#nightly-browser-hint');if(!hint){hint=root.createElement('p');hint.id='nightly-browser-hint';hint.setAttribute('role','status');hint.style.cssText='font:13px/1.5 system-ui;margin:0 20px 14px;color:#425640;max-width:600px';container.querySelector('.nws-modal-title-wrapper')?.after(hint);}const text=nightlyBrowserHint(root.defaultView);if(hint.textContent!==text)hint.textContent=text;}

    if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',title?.textContent.trim()||'Connect your NEAR wallet');}
    for(const close of container.querySelectorAll('button.close-button')){close.setAttribute('aria-label','Close wallet chooser');close.style.minWidth='44px';close.style.minHeight='44px';}
    for(const option of container.querySelectorAll('.single-wallet,.single-wallet-get,#get-a-wallet-button')){option.setAttribute('role','button');option.tabIndex=0;option.setAttribute('aria-label',option.querySelector('.title')?.textContent.trim()||option.textContent.trim());}
    root.defaultView.requestAnimationFrame(()=>{if(!closed&&!container.contains(root.activeElement))focusable()[0]?.focus();});
  };
  normalize();container.addEventListener('keydown',key);container.addEventListener('click',click);container.addEventListener('animationend',focusInside);
  observer=new MutationObserver(normalize);observer.observe(container,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  focusable()[0]?.focus();return restore;
}
