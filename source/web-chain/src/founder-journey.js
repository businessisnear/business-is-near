import {founderNightlyModule,createFounderWalletConnection,shouldRestoreFounderConnection} from './founder-wallet-connectors.js';
import './founder-journey.css';
import '@near-wallet-selector/modal-ui-js/styles.css';
import config from './founder-config.json';
import {showFounderWalletModal} from './founder-wallet-modal.js';
import {createFounderJourneyUI} from './founder-journey-ui.js';

let setupModal=null,lastAccount=null,ui;
const connection=createFounderWalletConnection({loadSelector:async()=>{
  const [{setupWalletSelector},{setupModal:modal},{setupNightly}]=await Promise.all([
    import('@near-wallet-selector/core'),import('@near-wallet-selector/modal-ui-js'),import('@near-wallet-selector/nightly')]);
  setupModal=modal;return setupWalletSelector({network:'testnet',modules:[founderNightlyModule(setupNightly)]});
},changed:state=>{
  ui?.walletSessionChanged();if(state.account!==lastAccount){lastAccount=state.account;ui?.accountChanged().catch(error=>ui.connectionNotice(error.message));}
}});
ui=createFounderJourneyUI({config,getWalletState:()=>connection.getState(),disconnectWallet:()=>connection.disconnect(),connectWallet:async factory=>{
  const selector=await connection.connect();showFounderWalletModal(setupModal(selector,{contractId:factory}),{trigger:document.querySelector('#connect-founder-wallet')});
}});
ui.start();
// Restore the wallet module's public session; only a button opens its chooser.
if(shouldRestoreFounderConnection())connection.initialize().catch(error=>ui.connectionNotice('Wallet connection is unavailable. '+error.message));
