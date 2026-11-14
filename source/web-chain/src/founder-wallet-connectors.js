import {founderAccount,factoryPublicKeyHex} from './founder-journey-core.js';

export function nightlyBrowserHint(windowRef=globalThis.window){
  return windowRef?.nightly?.near?'Nightly is detected. Choose your NEAR testnet account in Nightly and review its approvals in the extension.':'Nightly is not detected in this page. Open the same page in the Mac browser where Nightly is installed, enable it for this site, then reload. If you are in an embedded Orca page, open its URL in that browser.';
}
function testnet(network){
  if(network?.networkId!=='testnet'||network.nodeUrl!=='https://test.rpc.fastnear.com')throw Error('Nightly is enabled only for the reviewed NEAR testnet provider. Choose testnet; your mainnet wallet is not used.');
}
function accounts(value){
  if(!Array.isArray(value)||value.length>1)throw Error('Choose one NEAR testnet account in Nightly.');
  for(const item of value){founderAccount(item.accountId);factoryPublicKeyHex(item.publicKey);}
  return value;
}
// Wrap only discovery, testnet and account metadata checks. The pinned injected
// module keeps its original signing/serialization path and extension approvals.
export function founderNightlyModule(setupNightly,{windowRef=globalThis.window}={}){
  const factory=setupNightly();
  return async input=>{
    testnet(input?.options?.network);const module=await factory(input);
    if(module?.id!=='nightly'||module.type!=='injected')throw Error('The reviewed Nightly connector identity changed.');
    return {...module,metadata:{...module.metadata,available:!!windowRef?.nightly?.near,description:nightlyBrowserHint(windowRef)},init:async context=>{
      testnet(context?.options?.network);if(!windowRef?.nightly?.near)throw Error(nightlyBrowserHint(windowRef));
      const injected=windowRef.nightly.near;const behaviour=await module.init(context);
      const unchanged=()=>{testnet(context.options.network);if(windowRef?.nightly?.near!==injected)throw Error('Nightly changed in this page. Reload, then reconnect your wallet.');};
      return {...behaviour,
        getAccounts:async()=>{unchanged();if(injected.isConnected!==true)return [];const value=accounts(await behaviour.getAccounts());unchanged();return injected.isConnected===true?value:[];},
        signIn:async params=>{
          unchanged();
          // Only an explicit chooser action reaches signIn. Reset stale extension
          // metadata through the pinned adapter so its own interactive signIn
          // can reconnect and register the original account-change callback.
          if(injected.isConnected!==true&&injected.account?.accountId){
            try{await behaviour.signOut();}catch{throw Error('Unlock Nightly, disconnect this site in Nightly, then choose Reconnect Nightly.');}unchanged();
            if(injected.isConnected!==true&&injected.account?.accountId)throw Error('Nightly kept an old account after disconnecting. Disconnect this site in Nightly, then choose Reconnect Nightly.');
          }
          const value=accounts(await behaviour.signIn(params));unchanged();return injected.isConnected===true?value:[];
        }};
    }};
  };
}


// This is a public connection hint, never a credential or an owner proof.
export const FOUNDER_CONNECTION='business-is-near-founder-connection-v1';
const forgotten=JSON.stringify({schema:1,network:'testnet',wallet_id:null,account_id:null});
const wallets=new Set(['nightly']);
// Pinned selector 10.1.4 exposes this public module preference through its
// namespaced JSON storage. Read only an exact known module, never cached accounts.
function selectedWalletHint(storage){try{const raw=storage.getItem('near-wallet-selector:selectedWalletId');return raw==='"nightly"'?'nightly':null;}catch{return null;}}
export function readFounderConnection(storage=globalThis.localStorage){
  try{const raw=storage.getItem(FOUNDER_CONNECTION);if(!raw||raw.length>512)return null;const v=JSON.parse(raw);
    if(Object.keys(v).sort().join(',')!=='account_id,network,schema,wallet_id'||v.schema!==1||v.network!=='testnet'||!wallets.has(v.wallet_id))return null;
    founderAccount(v.account_id);return Object.freeze(v);
  }catch{return null;}
}
export function rememberFounderConnection(walletId,account,storage=globalThis.localStorage){
  if(!wallets.has(walletId))throw Error('Choose a supported testnet wallet.');founderAccount(account);
  const value={schema:1,network:'testnet',wallet_id:walletId,account_id:account};
  try{storage.setItem(FOUNDER_CONNECTION,JSON.stringify(value));}catch{}return value;
}
export function forgetFounderConnection(storage=globalThis.localStorage){try{storage.setItem(FOUNDER_CONNECTION,forgotten);}catch{}}
export function shouldRestoreFounderConnection({storage=globalThis.localStorage,tabStorage=globalThis.sessionStorage,url=globalThis.location?.href}={}){
  try{if(storage.getItem(FOUNDER_CONNECTION)===forgotten)return false;if(readFounderConnection(storage)||selectedWalletHint(storage)||new URL(url).searchParams.has('transactionHashes')||tabStorage.getItem('business-is-near-founder-brief-v1'))return true;
    for(let i=0;i<Math.min(storage.length||0,2048);i++){const key=storage.key(i);if(key?.startsWith('business-is-near-founder-company-v1:')||key?.startsWith('business-is-near-founder-pending-v1:'))return true;}
  }catch{}return false;
}
export function createFounderWalletConnection({loadSelector,changed=()=>{},storage=globalThis.localStorage,windowRef=globalThis.window}){
  let selector=null,initializing=null,revision=0,blocked=false,walletHint=readFounderConnection(storage)?.wallet_id||selectedWalletHint(storage);
  let snapshot={selector:null,account:null,walletId:null,status:readFounderConnection(storage)?'remembered':'disconnected',remembered:readFounderConnection(storage),message:''};
  function publish(value){snapshot={...snapshot,...value,selector,remembered:readFounderConnection(storage)};changed(snapshot);return snapshot;}
  async function refresh(){
    const token=++revision;if(blocked)return snapshot;
    try{
      const selected=selector?.store.getState().selectedWalletId;
      if(!selected){const hint=readFounderConnection(storage);if((hint?.wallet_id||walletHint)==='nightly'&&!windowRef?.nightly?.near)return publish({account:null,walletId:null,status:'missing',message:nightlyBrowserHint(windowRef)});return publish({account:null,walletId:null,status:hint||walletHint?'reconnect':'disconnected',message:hint||walletHint?'Unlock Nightly in your browser, then choose Reconnect Nightly to approve this site.':''});}
      if(!wallets.has(selected))throw Error('Choose a supported NEAR testnet wallet.');
      if(selected==='nightly'&&!windowRef?.nightly?.near)return publish({account:null,walletId:null,status:'missing',message:nightlyBrowserHint(windowRef)});
      const wallet=await selector.wallet(selected);const values=await wallet.getAccounts();
      if(token!==revision||blocked)return snapshot;
      if(selector.store.getState().selectedWalletId!==selected)return refresh();
      if(!Array.isArray(values)||values.length>1)throw Error('Choose one NEAR testnet account in your wallet, then reconnect.');
      if(!values.length)return publish({account:null,walletId:null,status:'reconnect',message:'Unlock Nightly in your browser, then choose Reconnect Nightly to approve this site.'});
      const account=founderAccount(values[0].accountId);walletHint=selected;rememberFounderConnection(selected,account,storage);
      return publish({account,walletId:selected,status:'connected',message:''});
    }catch(error){if(token!==revision||blocked)return snapshot;return publish({account:null,walletId:null,status:'reconnect',message:error.message});}
  }
  async function initialize({explicit=false}={}){
    if(!explicit){try{if(storage.getItem(FOUNDER_CONNECTION)===forgotten)return null;}catch{}}
    if(initializing)return initializing;
    initializing=(async()=>{selector=await loadSelector();selector.store.observable.subscribe(()=>{refresh();});await refresh();return selector;})().catch(error=>{initializing=null;publish({account:null,walletId:null,status:'reconnect',message:error.message});throw error;});return initializing;
  }
  async function connect(){blocked=false;await initialize({explicit:true});await refresh();return selector;}
  async function disconnect(){
    blocked=true;revision++;walletHint=null;const previous=selector?.store.getState().selectedWalletId;
    forgetFounderConnection(storage);publish({account:null,walletId:null,status:'disconnected',message:''});
    // Only the explicit button calls signOut. Company, pending and recovery data stay intact.
    if(selector&&wallets.has(previous)){const wallet=await selector.wallet(previous);await wallet.signOut();}
  }
  return {getState:()=>snapshot,initialize,connect,refresh,disconnect};
}
