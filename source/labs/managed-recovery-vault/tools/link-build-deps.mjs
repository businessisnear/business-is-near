// All rights reserved. Optional local build setup; no install/network/process.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const capsule=fileURLToPath(new URL('../',import.meta.url)),web=path.join(capsule,'web'),dependencies=path.resolve(capsule,'../../web-chain/node_modules');
for(const [name,version]of [['vite','7.3.7'],['@near-wallet-selector/core','10.1.4'],['@near-wallet-selector/nightly','10.1.4'],['buffer','6.0.3']]){const pkg=JSON.parse(await fs.readFile(path.join(dependencies,name,'package.json'),'utf8'));if(pkg.version!==version)throw Error('Install the repository-pinned frontend dependencies first; version differs for '+name);}
const link=path.join(web,'node_modules');try{const st=await fs.lstat(link);if(!st.isSymbolicLink()||await fs.realpath(link)!==await fs.realpath(dependencies))throw Error('Existing build dependencies differ; no overwrite.');}catch(error){if(error.code!=='ENOENT')throw error;await fs.symlink(path.relative(web,dependencies),link,'dir');}
console.log('Reviewed repository dependency link ready. No package installed.');
