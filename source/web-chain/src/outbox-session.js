// Volatile tickets only. No storage, wallet, provider or key material is exported.
import {canonicalDelivery,outboxAccount,OUTBOX_GAS} from './outbox-actions.js';
export function captureOutboxTicket(state){return Object.freeze({epoch:state.epoch,config:state.config,config_json:canonicalDelivery(state.config),account:state.account,selector:state.selector,channel:state.channel});}
export function outboxTicketCurrent(state,ticket){return state.epoch===ticket.epoch&&state.config===ticket.config&&canonicalDelivery(state.config)===ticket.config_json&&state.account===ticket.account&&state.selector===ticket.selector&&state.channel===ticket.channel;}
export function assertOutboxTicket(state,ticket){if(!outboxTicketCurrent(state,ticket))throw Error('Outbox workspace or wallet changed. Private work was discarded; inspect the original request.');}
function freeze(value){if(value&&typeof value==='object'){for(const x of Object.values(value))freeze(x);Object.freeze(value);}return value;}
export async function sendOutboxWallet({selector,principal,expectedOwner,action,isCurrent,toWalletAction}){
 outboxAccount(principal);if(principal!==expectedOwner||!selector||typeof selector.wallet!=='function'||typeof isCurrent!=='function'||typeof toWalletAction!=='function')throw Error('Exact owner wallet required.');if(!Object.hasOwn(OUTBOX_GAS,action.method)||action.gas!==OUTBOX_GAS[action.method]||typeof action.deposit!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(action.deposit)||action.method==='approve'&&BigInt(action.deposit)===0n||action.method!=='approve'&&action.deposit!=='0')throw Error('Only exact scoped outbox wallet actions are supported.');outboxAccount(action.receiverId);
 const original=canonicalDelivery(action),copy=freeze(JSON.parse(original));
 const current=()=>{if(!isCurrent()||canonicalDelivery(action)!==original)throw Error('Wallet/account or exact reviewed intent changed before dispatch. Inspect the original pending request.');};
 current();const wallet=await selector.wallet();current();if(!wallet||typeof wallet.getAccounts!=='function'||typeof wallet.signAndSendTransaction!=='function')throw Error('Wallet cannot confirm the exact owner account.');const accounts=await wallet.getAccounts();current();if(!Array.isArray(accounts)||!accounts.some(x=>x&&x.accountId===principal))throw Error('Wallet no longer provides the exact owner account.');
 const internal=freeze({type:'FunctionCall',params:{methodName:copy.method,args:copy.args,gas:copy.gas,deposit:copy.deposit}}),converted=toWalletAction(internal);current();
 // No await occurs between this final check and the single wallet invocation.
 return wallet.signAndSendTransaction({signerId:principal,receiverId:copy.receiverId,actions:[converted]});
}
