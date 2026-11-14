// Build the isolated native-NEAR appointments contract, never deploy it.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const executable=path.join(root,'contract/node_modules/.bin/near-sdk-js');
const result=spawnSync(executable,['build','onchain/appointments.ts','build/appointments.wasm'],{cwd:path.join(root,'contract'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
