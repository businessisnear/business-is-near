// Build this isolated experimental authority only; never deploy or modify company.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(path.join(root,'contract/node_modules/.bin/near-sdk-js'),['build','onchain/outbox.ts','build/outbox.wasm'],{cwd:path.join(root,'contract'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
