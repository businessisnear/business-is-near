import './company-factory.css';
import '@near-wallet-selector/modal-ui-js/styles.css';
import {setupWalletSelector} from '@near-wallet-selector/core';
import {setupModal} from '@near-wallet-selector/modal-ui-js';
import {setupMyNearWallet} from '@near-wallet-selector/my-near-wallet';
import {internalActionToNaj} from './wallet-sdk.js';
import {TestnetRPC} from './chain.js';
import {createCompanyFactoryUI} from './company-factory-ui.js';
import {sendFactoryWallet} from './company-factory-client.js';

let selector=null,account=null;
const ui=createCompanyFactoryUI({rpc:new TestnetRPC(),getAccount:()=>account,async connectWallet(factory){
 if(!selector){selector=await setupWalletSelector({network:'testnet',modules:[setupMyNearWallet()]});selector.store.observable.subscribe(()=>{const next=selector.store.getState().accounts.find(value=>value.active)?.accountId||null;if(next!==account){account=next;ui.accountChanged();}});}
 setupModal(selector,{contractId:factory}).show();
},async sendTransaction(transaction,assertCurrent){
 return sendFactoryWallet(()=>({selector,account}),transaction,assertCurrent,internalActionToNaj);
}});
