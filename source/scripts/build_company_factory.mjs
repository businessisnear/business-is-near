// Hold the shared near-sdk-js compiler slot before invoking. Never deploys.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../contract/package.json',import.meta.url));
const {utils}=require('near-api-js');
const sha=x=>crypto.createHash('sha256').update(x).digest();
function build(source,target){const result=spawnSync(path.join(root,'contract/node_modules/.bin/near-sdk-js'),['build',source,target],{cwd:path.join(root,'contract'),stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error('SDK build failed: '+source);}
if(!process.argv.includes('--company-already-built'))build('onchain/company.ts','build/company.wasm');
build('onchain/company_factory.ts','build/company_factory.wasm');
if(process.argv.includes('--test-fixture')){build('../integration/company_factory_refund_wallet.ts','build/company_factory_refund_wallet.wasm');await fs.copyFile(path.join(root,'contract/build/company_factory_refund_wallet.wasm'),path.join(root,'integration/company_factory_refund_wallet.wasm'));}
const child=await fs.readFile(path.join(root,'contract/build/company.wasm')),factory=await fs.readFile(path.join(root,'contract/build/company_factory.wasm'));
const files=['contract/onchain/company.ts','contract/build/company.wasm','contract/onchain/company_factory.ts','contract/build/company_factory.wasm','scripts/build_company_factory.mjs'];
const metadata={schema:1,experimental:true,public_deployment:false,company:{bytes:child.length,sha256:sha(child).toString('hex'),code_hash:utils.serialize.base_encode(sha(child))},factory:{bytes:factory.length,sha256:sha(factory).toString('hex'),code_hash:utils.serialize.base_encode(sha(factory))},source_sha256:Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await fs.readFile(path.join(root,p))).toString('hex')]))) };
await fs.writeFile(path.join(root,'contract/build/company_factory.metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log('Built isolated factory with exact embedded company bytes:',JSON.stringify(metadata.company));
