import {createPrivateOwnerClient} from './managed-owner-client.mjs';
import {mountVaultUI} from './vault-ui.mjs';
import {nightlyMessagePort} from './nightly-message-port.mjs';
import {Buffer} from 'buffer';
if(!globalThis.Buffer)globalThis.Buffer=Buffer;
let selector=null,notify=()=>{},boundAccount=null;
const port={subscribe:fn=>{notify=fn;},async connect(company){
 boundAccount=null;
 if(!selector){const[{setupWalletSelector},{setupNightly}]=await Promise.all([import('@near-wallet-selector/core'),import('@near-wallet-selector/nightly')]);selector=await setupWalletSelector({network:'testnet',modules:[setupNightly()]});selector.store.observable.subscribe(value=>{const state=value??selector.store.getState(),next=state.accounts?.find(a=>a.active)?.accountId??null;if(boundAccount!==null&&next!==boundAccount){boundAccount=null;notify(next);}});}
 const wallet=await selector.wallet('nightly');let accounts=await wallet.getAccounts();if(!accounts.length){await wallet.signIn({contractId:company});accounts=await wallet.getAccounts();}
 if(accounts.length!==1)throw Error('Choose one testnet owner');boundAccount=accounts[0].accountId;return{wallet:nightlyMessagePort(wallet,window.nightly?.near),account:boundAccount};
}};
const ui=mountVaultUI({root:document,auth:createPrivateOwnerClient(),walletPort:port});ui.start().catch(()=>{document.querySelector('#status').textContent='The local private service is unavailable. No wallet action was requested.';});
