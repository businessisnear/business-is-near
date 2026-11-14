import './founder-site.css';
import config from './founder-config.json';
import {createFounderRPC} from './founder-rpc.js';
import {readPublicSite} from './founder-publication.js';

const $=s=>document.querySelector(s),rpc=createFounderRPC();
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
async function load(){
  for(const id of ['site-content','site-unpublished','site-error','site-record'])$('#'+id).hidden=true;$('#site-loading').hidden=false;
  try{
    const id=new URL(location.href).searchParams.get('id'),read=await readPublicSite({config,recordId:id,rpc});
    if(!read.site)throw Error('No website has been published for this company yet.');
    if(read.site.status==='unpublished')$('#site-unpublished').hidden=false;
    else{const content=read.site.content;$('#site-title').textContent=content.title;$('#site-summary').textContent=content.summary;$('#site-sections').replaceChildren(...content.items.map(item=>{const section=document.createElement('section');section.append(node('p',item.text));return section;}));document.title=content.title+' · Business is NEAR';$('#site-content').hidden=false;}
    const dl=$('#site-record-details');dl.replaceChildren();for(const[label,value]of [['Company',read.record.child],['Publisher',read.record.creator],['Current revision',read.site.revision],['Current status',read.site.status],['Content SHA-256',read.site.content_sha256],['FINAL block',read.block.height+' · '+read.block.hash]]){const row=document.createElement('div');row.append(node('dt',label),node('dd',String(value)));dl.append(row);}
    $('#site-explorer').href='https://testnet.nearblocks.io/address/'+encodeURIComponent(read.record.child);$('#site-record').hidden=false;
  }catch(error){$('#site-error-detail').textContent=error.message;$('#site-error').hidden=false;}
  finally{$('#site-loading').hidden=true;}
}
$('#site-retry').addEventListener('click',load);load();
