// Build the isolated native company-feed publisher; never deploy it.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(path.join(root,'contract/node_modules/.bin/near-sdk-js'),['build','onchain/native_feed.ts','build/native_feed.wasm'],{cwd:path.join(root,'contract'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
