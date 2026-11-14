import {t} from './localization.js';
// Call only on a freshly authored static template, before user/source data is
// inserted. Later language changes translate explicit markers, never prose.
export function markStaticTemplate(root,{includeIds=false}={}){
 const skipped='input,textarea,pre,code,script,style,template,[data-i18n-literal]';
 const elements=[...(root.nodeType===1?[root]:[]),...root.querySelectorAll('*')];
 for(const element of elements){
  if(element.closest('[data-i18n-managed]'))continue;
  for(const name of ['placeholder','title','aria-label'])if(element.hasAttribute(name)&&!element.hasAttribute('data-i18n-'+name)&&t(element.getAttribute(name),'es')!==element.getAttribute(name))element.setAttribute('data-i18n-'+name,element.getAttribute(name));
  if(element.closest(skipped))continue;
  const texts=[...element.childNodes].filter(child=>child.nodeType===3&&/[A-Za-z]/.test(child.textContent));
  if(!texts.length)continue;
  // ID-bearing paragraphs/headings are dynamic output slots. Their callers
  // choose a trusted label explicitly; arbitrary later content stays literal.
  if(!includeIds&&element.id&&!['BUTTON','OPTION','LABEL'].includes(element.tagName))continue;
  if(element.childElementCount===0){const key=element.textContent.trim();if(!element.hasAttribute('data-i18n')&&t(key,'es')!==key)element.setAttribute('data-i18n',key);continue;}
  for(const text of texts){const value=text.textContent.trim();if(!value||t(value,'es')===value)continue;const span=element.ownerDocument.createElement('span');span.setAttribute('data-i18n',value);span.textContent=value;text.replaceWith(span);}
 }
}
