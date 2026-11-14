// Uses installed pinned tools only; writes exclusively to this private generation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('./',import.meta.url)),target=path.join(here,'build');
if(fs.existsSync(target))fs.renameSync(target,path.join(here,'build-preserved-'+new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(path.join(target,'tmp'),{recursive:true,mode:0o700});const command=[path.join(here,'node_modules/.bin/near-sdk-js'),'build','shared_procurement_v4.ts','build/shared_procurement_v4.wasm','--verbose'];
const r=spawnSync(command[0],command.slice(1),{cwd:here,env:{...process.env,TMPDIR:path.join(target,'tmp')},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(target,'BUILD.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),receipt={at_utc:new Date().toISOString(),argv:command,exit_code:r.status,error:r.error?{name:r.error.name,message:r.error.message}:null,source_sha256:sha(fs.readFileSync(path.join(here,'shared_procurement_v4.ts'))),outputs:fs.readdirSync(target).filter(n=>fs.statSync(path.join(target,n)).isFile()).map(n=>({name:n,bytes:fs.statSync(path.join(target,n)).size,sha256:sha(fs.readFileSync(path.join(target,n)))}))};fs.writeFileSync(path.join(target,'BUILD-RESULT.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));process.exitCode=r.status??1;
