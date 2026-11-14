import {captureBusinessAnalytics,analyticsSource} from './business-analytics.js';
import {t,localizedError,statusLabel,formatNear,formatUsdNanos,translateMarked} from './localization.js';
import {markStaticTemplate} from './localization-dom.js';

// An explicit, public read. The captured block is a historical snapshot, and
// task ciphertext/private records are never retained by the report helper.
export function createBusinessAnalyticsUI({getState,notice,lockControl=()=>{},setControlDisabled=(control,value)=>control.disabled=value,setBusy=()=>{},mount=document.querySelector('[data-panel="overview"]')}){
 if(!mount)return {update(){},clear(){}};
 let report=null,binding=null,revision=0;
 const locale=()=>getState().locale??'en',tr=(key,parameters={})=>t(key,locale(),parameters);
 const element=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [name,value]of Object.entries(attrs))node.setAttribute(name,value);if(text!==undefined)node.textContent=text;lockControl(node);return node;};
 const panel=element('article',{id:'business-analytics',class:'panel'});
 panel.innerHTML='<h2>Public business snapshot</h2><p class="hint">Read reservation outcomes and exact public ledgers at one reviewed FINAL block. This does not read private prompts or call a model.</p><div class="button-row analytics-actions"><button id="analytics-refresh" class="button secondary" type="button">Read public snapshot</button><button id="analytics-download" class="text-button" type="button" disabled>Download public report</button><button id="analytics-source" class="text-button" type="button" disabled>Download bounded source</button></div><p id="analytics-status" class="hint"></p><div id="analytics-result"></div>';
 markStaticTemplate(panel);panel.dataset.i18nManaged='true';mount.append(panel);
 const $=selector=>panel.querySelector(selector);
 const capture=()=>{const s=getState();return {revision,epoch:s.epoch,account:s.account,company:s.company?.contract,pin:s.pin,app:s.app,appPin:s.appPin,rpc:s.rpc};};
 const current=context=>{const now=capture();return Object.keys(now).every(key=>now[key]===context[key]);};
 function clear(){revision++;report=null;binding=null;$('#analytics-result').replaceChildren();$('#analytics-status').textContent='';setControlDisabled($('#analytics-download'),true);setControlDisabled($('#analytics-source'),true);}
 function update(){if(binding&&!current(binding))clear();translateMarked(panel,locale());setControlDisabled($('#analytics-refresh'),!(getState().ready&&getState().company&&getState().app&&getState().appPin));if(report)render();else $('#analytics-status').textContent=tr('No public snapshot captured.');}
 function render(){
  const body=$('#analytics-result');body.replaceChildren();
  $('#analytics-status').textContent=tr('Final block {height} · {hash}',{height:report.boundary.block_height,hash:report.boundary.block_hash});
  body.append(element('p',{class:'hint'},report.boundary.company_id+' · '+report.boundary.appointments_id),element('p',{},tr(report.history.complete?'Complete task history: {observed} of {total} records.':'Partial task history: {observed} of {total} records.',report.history)),element('p',{},tr('Reservations: {count}; distinct customer accounts: {customers}.',{count:report.reservations.total,customers:report.reservations.distinct_customer_accounts})),element('p',{class:'hint'},Object.entries(report.reservations.statuses).map(([status,count])=>statusLabel(status,locale())+': '+count).join(' · ')));
  const money=element('dl');for(const [label,key]of [['Service deposits','service_deposits_total'],['Customer escrow','escrow'],['Earned revenue','earned_total'],['Available earned revenue','earned_balance'],['Refunded deposits','refunded_total'],['Withdrawn earned funds','withdrawn_total'],['Pending earned withdrawal','withdrawing'],['Nonwithdrawable storage','retained_storage']])money.append(element('dt',{},tr(label)),element('dd',{},formatNear(report.money[key],locale())));body.append(money);
  body.append(element('p',{class:'hint'},tr('AI authorization reservations: {count}; estimated reserved amount: {amount}. Reservation estimates are not invoices.',{count:report.inference.reservation_count,amount:formatUsdNanos(report.inference.authorization_reserved_nanos,locale())})),element('p',{class:'hint'},tr('Network fees, provider invoices, local compute cost and net profit remain unknown.')),element('p',{class:'hint'},tr('Reservation outcomes only. Visitor conversion, sales attribution and causal effects are unproven.')),element('p',{class:'hint',id:'analytics-report-hash'},'SHA-256 '+report.report_sha256));
 }
 function download(bytes,type,filename){const url=URL.createObjectURL(new Blob([bytes],{type})),anchor=element('a',{href:url,download:filename});anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('#analytics-refresh').addEventListener('click',async()=>{if(getState().busy)return;setBusy(true);try{const s=getState();if(!s.ready||!s.company||!s.app||!s.appPin)throw Error('Connect the reviewed company and booking app first.');const context=capture(),value=await captureBusinessAnalytics(context.rpc,{companyId:context.company,companyCodeHash:context.pin,appointmentsId:context.app,appointmentsCodeHash:context.appPin});if(!current(context))return;report=value;binding=context;render();setControlDisabled($('#analytics-download'),false);setControlDisabled($('#analytics-source'),false);}catch(error){notice(localizedError(error,locale()),true);}finally{setBusy(false);}});
 $('#analytics-download').addEventListener('click',()=>{if(!report||!binding||!current(binding))return clear();download(JSON.stringify(report,null,2)+'\n','application/json','public-business-report-'+report.boundary.block_height+'.json');});
 $('#analytics-source').addEventListener('click',async()=>{try{if(!report||!binding||!current(binding))return clear();const selected=report,context=binding,source=await analyticsSource(selected);if(report!==selected||!current(context))return;download(JSON.stringify(source,null,2)+'\n','application/json','public-business-source-'+selected.boundary.block_height+'.json');}catch(error){notice(localizedError(error,locale()),true);}});
 update();return {update,clear};
}
