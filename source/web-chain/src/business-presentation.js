import {t} from './localization.js';

// Presentation only: no persistence, requests, wallet authority or task changes.
// The original components retain their IDs, event handlers and approval flows.
export function createWorkspacePresentation({getState,showTab,root=document}){
 const $=selector=>root.querySelector(selector);
 const work=$('[data-panel="work"]');
 // Capture authored empty-state labels before any RPC data is rendered.
 const disconnectedDefaults=new Map(['connection-label','metric-completed','metric-queued','metric-revenue','metric-ai','metric-ai-caption','worker-title','worker-description','worker-detail','activity','task-list','mandate-list','inbox-list','slot-list','booking-list','final-block'].map(id=>{const element=$('#'+id);return [element,{text:element.textContent.trim(),className:element.className}];}));
 const tools=[
  {key:'goal',id:'owner-goal-planning',title:'Plan a goal',description:'Turn an outcome into bounded, separately approved steps.',icon:'↗'},
  {key:'conversation',id:'owner-conversation',title:'Ask your worker',description:'Explore a question using a menu of work you permit.',icon:'✳'},
  {key:'leads',id:'owner-lead-discovery',title:'Find leads',description:'Inspect only approved public directories and contact domains.',icon:'⌕'},
  {key:'document',id:'owner-document-input',title:'Use a document',description:'Import privately, inspect the text, then approve an exact excerpt.',icon:'▤'}
 ];
 const fixed=(tag,key,className)=>{const element=root.createElement(tag);element.dataset.i18n=key;element.textContent=t(key,getState().locale);if(className)element.className=className;return element;};
 const menu=$('#mobile-workspace-menu'),sidebar=$('.sidebar');
 function closeMenu({focus=false}={}){sidebar?.classList.remove('mobile-nav-open');menu?.setAttribute('aria-expanded','false');if(focus)menu?.focus();}
 menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';sidebar.classList.toggle('mobile-nav-open',open);menu.setAttribute('aria-expanded',String(open));});
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){closeMenu({focus:true});event.preventDefault();}});
 // Required inputs remain native validation gates even inside a disclosure.
 root.addEventListener('invalid',event=>{for(let parent=event.target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;},true);
 const advanced=root.createElement('div');advanced.className='work-advanced';advanced.id='advanced-work-tools';
 const heading=root.createElement('div');heading.className='section-heading';
 const headingText=root.createElement('div');headingText.append(fixed('p','YOUR WORK, ORGANIZED','eyebrow'),fixed('h2','Advanced work tools'));heading.append(headingText);advanced.append(heading,fixed('p','Choose a guided tool for a bigger goal or a specific source. Each action still needs your review.','hint'));
 const disclosures=new Map();
 for(const item of tools){
  const component=$('#'+item.id);if(!component)continue;
  const disclosure=root.createElement('details');disclosure.className='work-tool';disclosure.id='work-tool-'+item.key;
  const summary=root.createElement('summary');summary.id='open-work-'+item.key;summary.setAttribute('aria-controls',item.id);
  const icon=root.createElement('span');icon.className='work-tool-icon';icon.setAttribute('aria-hidden','true');icon.textContent=item.icon;
  const words=root.createElement('span');words.append(fixed('span',item.title,'work-tool-title'),fixed('span',item.description,'work-tool-description'));summary.append(icon,words);
  disclosure.append(summary,component);advanced.append(disclosure);disclosures.set(item.key,disclosure);
  disclosure.addEventListener('toggle',()=>{if(disclosure.open)setMode(item.key);});
 }
 if(work)work.append(advanced);
 function setMode(name){for(const button of root.querySelectorAll('[data-work-mode]')){const current=button.dataset.workMode===name;button.classList.toggle('active',current);button.setAttribute('aria-pressed',String(current));}}
 function revealWork(name,{focus=true}={}){
  showTab('work');setMode(name);
  const target=name==='simple'?$('#simple-work-anchor'):disclosures.get(name);
  if(!target)return;
  if(name!=='simple')target.open=true;
  target.scrollIntoView({behavior:'auto',block:'start'});
  if(focus){const control=name==='simple'?$('#work-brief'):target.querySelector('summary');control?.focus({preventScroll:true});}
 }
 function currentPanel(){return [...root.querySelectorAll('[data-panel]')].find(panel=>!panel.hidden)?.dataset.panel??'overview';}
 function syncNavigation(){const current=currentPanel();for(const button of root.querySelectorAll('[data-tab]')){if(button.dataset.tab===current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}return current;}
 function writeLocation(panel,mode){const value='#'+panel+(mode&&mode!=='simple'?'/'+mode:'');if(location.hash!==value)history.replaceState(null,'',location.pathname+location.search+value);}
 root.addEventListener('click',event=>{
  const mode=event.target.closest('[data-work-mode]');
  if(mode){queueMicrotask(()=>{revealWork(mode.dataset.workMode);writeLocation('work',mode.dataset.workMode);syncNavigation();});return;}
  const navigation=event.target.closest('[data-tab],[data-go]');
  if(!navigation)return;
  closeMenu();
  queueMicrotask(()=>{const panel=syncNavigation();writeLocation(panel);const title=$('[data-panel="'+panel+'"] h1');if(title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}$('#workspace-main')?.scrollIntoView({block:'start'});});
 });
 function fromLocation({focus=false}={}){const [panel,mode]=location.hash.slice(1).split('/');if(!panel||!$('[data-panel="'+CSS.escape(panel)+'"]'))return;if(panel==='work'&&disclosures.has(mode))revealWork(mode,{focus});else{showTab(panel);$('#workspace-main')?.scrollIntoView({block:'start'});}syncNavigation();}
 addEventListener('hashchange',()=>fromLocation({focus:true}));
 const navObserver=new MutationObserver(syncNavigation);for(const panel of root.querySelectorAll('[data-panel]'))navObserver.observe(panel,{attributes:true,attributeFilter:['hidden']});
 // A newly prepared approval is always discoverable, including below a long
 // technical form on a phone. Its original safety gates remain unchanged.
 const approval=$('#approval');if(approval)new MutationObserver(()=>{if(!approval.hidden){const card=approval.closest('.panel');card?.scrollIntoView({block:'nearest'});}}).observe(approval,{attributes:true,attributeFilter:['hidden']});
 const notice=$('#notice');if(notice)new MutationObserver(()=>{if(!notice.hidden&&notice.classList.contains('error'))notice.scrollIntoView({block:'nearest'});}).observe(notice,{attributes:true,childList:true,attributeFilter:['hidden','class']});
 setMode('simple');fromLocation();syncNavigation();
 function update(){
  const state=getState(),connected=!!state.ready&&!!state.company;
  const start=$('#workspace-start');if(start)start.hidden=connected;
  root.body.dataset.companyConnected=String(connected);
  if(!connected){
   for(const [element,empty]of disconnectedDefaults){element.removeAttribute('data-i18n');element.textContent=t(empty.text,state.locale);element.className=empty.className;}
   $('#restart-worker').hidden=true;$('#appointments-app').hidden=true;$('#appointments-connection').hidden=false;$('#app-accounting').replaceChildren();
   const option=root.createElement('option');option.value='';option.textContent=t('Connect a company first',state.locale);$('#message-inbox').replaceChildren(option);
  }
  for(const panel of root.querySelectorAll('[data-panel]'))panel.setAttribute('aria-label',t(({overview:'Overview',work:'Work & plans',inbox:'Customer inbox',apps:'Booking app',tools:'Workspace tools',settings:'Connection',library:'Media & export'})[panel.dataset.panel]??'Company workspace',state.locale));
  syncNavigation();
 }
 return {update,revealWork};
}
