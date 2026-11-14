// Read-only source/relative-import verification. No dependencies, config or node.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(here,'MODULE-SOURCE-MANIFEST.json'),'utf8'));
assert.equal(manifest.profile,'business-is-near-local-procurement-source-v1');
assert.equal(manifest.runtime_material_included,false);
const sha=b=>createHash('sha256').update(b).digest('hex'),files=new Map();
for(const row of manifest.files){
 assert.deepEqual(Object.keys(row).sort(),['bytes','path','sha256']);
 assert.match(row.path,/^[A-Za-z0-9_./-]+$/);
 assert.ok(!path.isAbsolute(row.path)&&!row.path.split('/').some(x=>['..','node_modules','protocol-runs','chain','app-originals'].includes(x)));
 assert.ok(!files.has(row.path));
 const p=path.join(here,row.path),s=await fs.lstat(p);assert.ok(s.isFile()&&!s.isSymbolicLink());
 assert.equal(await fs.realpath(p),p);const b=await fs.readFile(p);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);files.set(row.path,b);
}
const owner=JSON.parse(await fs.readFile(path.join(root,'OWNER-TOOLS-SOURCE.json'),'utf8'));
const shared=new Map(owner.files.map(x=>[path.join(root,x.path),x]));let imports=0;
for(const name of ['contract/package.json','contract/package-lock.json','contract/persistent/sandbox.mjs','executor/outcome.mjs','web-chain/src/crypto.js']){
 const p=path.join(root,name),row=shared.get(p);assert.ok(row,'Missing reviewed shared dependency '+name);
 const b=await fs.readFile(p);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);
}
for(const [name,b]of files){
 if(!/\.(?:mjs|js|ts)$/.test(name))continue;
 for(const ref of [...b.toString().matchAll(/\b(?:from|import)\s*['"](\.[^'"]+)['"]/g)].map(x=>x[1])){
  let p=path.resolve(here,path.dirname(name),ref);
  if(name.endsWith('.ts')&&!path.extname(ref))p+='.ts';
  const local=path.relative(here,p).split(path.sep).join('/');
  if(!local.startsWith('../'))assert.ok(files.has(local),'Missing local module '+local);
  else{
   const row=shared.get(p);assert.ok(row,'Missing reviewed shared source '+ref+' in '+name);
   const v=await fs.readFile(p);assert.equal(v.length,row.bytes);assert.equal(sha(v),row.sha256);
  }
  imports++;
 }
}
assert.equal(sha(files.get('financial-fork/build/shared_procurement_v4.wasm')),'bf13e856506ebfd3e2a532d79e9a3a657436ca299ae34e64654465b00633091d');
for(const name of ['local-app-v2/app.mjs','local-app-v2/index.html','local-app-v2/pending-review.mjs','delivery-envelope.mjs','financial-fork/assignment-client.mjs'])assert.ok(files.has(name));
const html=files.get('local-app-v2/index.html').toString();
assert.match(html,/<script type="module" src="\/app\.mjs"><\/script>/);
assert.match(html,/href="\/app\.css"/);
console.log(JSON.stringify({profile:manifest.profile,files:files.size,relative_imports:imports,wasm_matches_reviewed_source:true,network_requests:0,local_nodes_started:0,configuration_created:false}));
