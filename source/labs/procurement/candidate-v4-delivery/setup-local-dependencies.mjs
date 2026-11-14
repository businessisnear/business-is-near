// Explicit local development setup only. Installs nothing and starts no node.
// The generated dependency link is ignored by Git and is not distributable source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('./',import.meta.url));
const contract=fileURLToPath(new URL('../../../contract/',import.meta.url));
const deps=path.join(contract,'node_modules'),link=path.join(here,'financial-fork/node_modules');
const lock=JSON.parse(await fs.readFile(path.join(contract,'package-lock.json'),'utf8'));
const versions={};
for(const name of ['near-sdk-js','near-workspaces','near-api-js','@near-js/utils','typescript','@babel/core','@babel/generator']){
 const expected=lock.packages['node_modules/'+name]?.version;
 if(!expected)throw Error('Required package is absent from the reviewed contract lock: '+name);
 const installed=JSON.parse(await fs.readFile(path.join(deps,name,'package.json'),'utf8'));
 if(installed.version!==expected)throw Error('Installed dependency differs from the contract lock: '+name);
 versions[name]=expected;
}
try{
 const s=await fs.lstat(link);
 if(!s.isSymbolicLink()||await fs.realpath(link)!==await fs.realpath(deps))throw Error('Existing local dependency path differs; inspect it manually.');
}catch(e){
 if(e.code!=='ENOENT')throw e;
 await fs.symlink(path.relative(path.dirname(link),deps),link,'dir');
}
console.log(JSON.stringify({dependency_link:'financial-fork/node_modules',lock_versions_verified:versions,installation_performed:false,network_requests:0,local_nodes_started:0}));
