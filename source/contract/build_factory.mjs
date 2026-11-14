// Builds the current derivative factory around the unchanged company template.
// No account, network, model or deployment operation is performed.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root=fileURLToPath(new URL('./',import.meta.url)),source=path.dirname(root);
const digest=x=>crypto.createHash('sha256').update(x).digest();
function base58(b){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let zeros=0,n=0n,out='';while(zeros<b.length&&b[zeros]===0)zeros++;for(const v of b)n=n*256n+BigInt(v);while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}return '1'.repeat(zeros)+out;}
const company=await fs.readFile(path.join(root,'build/company.wasm'));
if(digest(company).toString('hex')!=='470f7674ad709b295459c031f9d6b4f8b929d45b7edafbf13289c22fc0510a80')throw Error('Unchanged reviewed company template required');
const result=spawnSync(path.join(root,'node_modules/.bin/near-sdk-js'),['build','onchain/company_factory.ts','build/company_factory.wasm'],{cwd:root,stdio:'inherit',timeout:240000});
if(result.error)throw result.error;if(result.status!==0)throw Error('Factory SDK build failed');
const factory=await fs.readFile(path.join(root,'build/company_factory.wasm'));
const paths=['contract/onchain/company.ts','contract/build/company.wasm','contract/onchain/company_factory.ts','contract/build/company_factory.wasm','contract/build_factory.mjs'];
const metadata={schema:1,experimental:true,public_deployment:false,service_profile:'near-founder-worker-service-v1',company:{bytes:company.length,sha256:digest(company).toString('hex'),code_hash:base58(digest(company))},factory:{bytes:factory.length,sha256:digest(factory).toString('hex'),code_hash:base58(digest(factory))},source_sha256:Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest(await fs.readFile(path.join(source,p))).toString('hex')]))) };
await fs.writeFile(path.join(root,'build/company_factory.metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));
