// Local-only durable NEAR sandbox lifecycle. Never deletes or reinitializes a home.
// This is not a public-chain node or a production key manager.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {Worker} from 'near-workspaces';
import {KeyPair, keyStores} from 'near-api-js';

const require=createRequire(import.meta.url);
const {getBinary}=require('near-sandbox/dist/getBinary');
const MARKER='proofwork-sandbox.json';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function availablePort() {
  return await new Promise((resolve,reject)=>{
    const s=net.createServer(); s.once('error',reject); s.listen(0,'127.0.0.1',()=>{
      const port=s.address().port; s.close(err=>err ? reject(err) : resolve(port));
    });
  });
}
async function alive(child, rpc, chainId) {
  for(let i=0;i<180;i++) {
    if(child.startFailure) throw new Error('Sandbox process could not start');
    if(child.exitCode!==null || child.signalCode!==null) throw new Error('Sandbox process exited before becoming ready');
    try {
      const response=await fetch(rpc+'/status',{signal:AbortSignal.timeout(1000)});
      if(response.ok) {
        const state=await response.json();
        if(state.chain_id!==chainId) throw new Error('Unexpected sandbox chain identity');
        return;
      }
    } catch(e) { if(e.message==='Unexpected sandbox chain identity') throw e; }
    await sleep(250);
  }
  throw new Error('Sandbox node did not become ready');
}
async function stopChild(child) {
  if(!child || child.startFailure || child.exitCode!==null || child.signalCode!==null) return;
  const startedWall=Date.now(),startedMonotonic=performance.now();let timer,onExit;
  const diagnostic=phase=>({version:1,phase,pid:child.pid??null,signal:'SIGINT',timeout_ms:30000,wall_elapsed_ms:Date.now()-startedWall,monotonic_elapsed_ms:Math.round(performance.now()-startedMonotonic),clock_gap_ms:Math.round((Date.now()-startedWall)-(performance.now()-startedMonotonic)),exit_code:child.exitCode,signal_code:child.signalCode,observed_at:new Date().toISOString()});
  const exited=new Promise(resolve=>{
    timer=setTimeout(()=>resolve(false),30000);
    onExit=()=>{clearTimeout(timer);resolve(true);};child.once('exit',onExit);
  });
  try {
    const accepted=child.kill('SIGINT');
    if(!accepted){const error=Error('Sandbox signal not accepted; lock retained for safety');error.code='SANDBOX_SIGNAL_NOT_ACCEPTED';error.diagnostic=diagnostic('sandbox_signal');throw error;}
    if(!await exited){const error=Error('Sandbox did not stop; lock retained for safety');error.code='SANDBOX_STOP_UNKNOWN';error.diagnostic=diagnostic('sandbox_stop');throw error;}
  } catch(error) {
    // A signal failure must not leave a timer/listener running for another30s.
    if(!error.diagnostic)error.diagnostic={...diagnostic('sandbox_signal'),error_type:error.name,signal_error_code:['EPERM','ESRCH','EINVAL'].includes(error.code)?error.code:'OTHER'};
    throw error;
  } finally {clearTimeout(timer);child.removeListener('exit',onExit);}
}
export async function openPersistentSandbox({homeDir}) {
  if(typeof homeDir!=='string' || !path.isAbsolute(homeDir)) throw new Error('An absolute sandbox home path is required');
  const home=path.resolve(homeDir), lock=home+'.lock';
  // No stale-lock takeover: a prior crash requires explicit human recovery.
  try { await fsp.mkdir(lock,{mode:0o700}); }
  catch(e) { if(e.code==='EEXIST') throw new Error('Sandbox is locked; verify the previous process stopped before recovering'); throw e; }
  let child=null, worker=null, release=true;
  try {
    const bin=await getBinary();
    if(!await bin.exists()) throw new Error('NEAR sandbox binary is not installed; install dependencies before starting');
    let created=false;
    try { await fsp.mkdir(home,{mode:0o700}); created=true; }
    catch(e) { if(e.code!=='EEXIST') throw e; }
    const stat=await fsp.lstat(home);
    if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0 || (typeof process.getuid==='function' && stat.uid!==process.getuid()))
      throw new Error('Sandbox home must be a private owner-controlled directory');
    const markerPath=path.join(home,MARKER);
    if(created) {
      const result=spawnSync(bin.binPath,['--home',home,'init'],{stdio:'ignore',timeout:60000,env:{...process.env}});
      if(result.error || result.status!==0) throw new Error('Sandbox initialization failed; the partial home was preserved for review');
      await fsp.chmod(path.join(home,'validator_key.json'),0o600);
      await fsp.chmod(path.join(home,'node_key.json'),0o600);
      const genesis=await fsp.readFile(path.join(home,'genesis.json'));
      const parsed=JSON.parse(genesis); const validator=JSON.parse(await fsp.readFile(path.join(home,'validator_key.json'),'utf8'));
      if(typeof parsed.chain_id!=='string' || validator.account_id!=='test.near') throw new Error('Unexpected sandbox genesis');
      await fsp.writeFile(markerPath,JSON.stringify({version:1,chain_id:parsed.chain_id,genesis_sha256:hash(genesis),root_account:'test.near'}),{mode:0o600,flag:'wx'});
    }
    // Existing directories are never initialized, repaired, overwritten or removed.
    const marker=JSON.parse(await fsp.readFile(markerPath,'utf8'));
    const genesis=await fsp.readFile(path.join(home,'genesis.json'));
    const parsed=JSON.parse(genesis);
    const validatorPath=path.join(home,'validator_key.json');
    const keyStat=await fsp.lstat(validatorPath);
    if(!keyStat.isFile() || keyStat.isSymbolicLink() || (keyStat.mode & 0o077)!==0) throw new Error('Sandbox validator key is not private');
    const validator=JSON.parse(await fsp.readFile(validatorPath,'utf8'));
    if(marker.version!==1 || marker.genesis_sha256!==hash(genesis) || marker.chain_id!==parsed.chain_id || marker.root_account!=='test.near' || validator.account_id!=='test.near')
      throw new Error('Sandbox identity does not match its saved manifest');
    const rpcPort=await availablePort(); let networkPort=await availablePort();
    while(networkPort===rpcPort) networkPort=await availablePort();
    const rpc=`http://127.0.0.1:${rpcPort}`;
    child=spawn(bin.binPath,['--home',home,'run','--rpc-addr',`127.0.0.1:${rpcPort}`,'--network-addr',`127.0.0.1:${networkPort}`],{stdio:'ignore'});
    child.once('error',e=>{child.startFailure=e;});
    await alive(child,rpc,marker.chain_id);
    const credentials=path.join(home,'proofwork-credentials');
    try { await fsp.mkdir(credentials,{mode:0o700}); } catch(e) { if(e.code!=='EEXIST') throw e; }
    const cstat=await fsp.lstat(credentials);
    if(!cstat.isDirectory() || cstat.isSymbolicLink() || (cstat.mode & 0o077)!==0) throw new Error('Sandbox credential directory is not private');
    const keyStore=new keyStores.UnencryptedFileSystemKeyStore(credentials);
    const originalUmask=process.umask(0o077);
    try {
      worker=await Worker.init({network:'custom',rpcAddr:rpc,rootAccountId:'test.near',keyStore});
      const rootKey=KeyPair.fromString(validator.secret_key ?? validator.private_key);
      const existing=await keyStore.getKey('custom','test.near');
      if(existing && existing.getPublicKey().toString()!==rootKey.getPublicKey().toString()) throw new Error('Stored sandbox key does not match genesis');
      if(!existing) await worker.manager.setKey('test.near',rootKey);
    } finally { process.umask(originalUmask); }
    let closed=false;
    return {worker,root:worker.rootAccount,rpcAddr:rpc,chainId:marker.chain_id,created,
      async close() { if(closed)return; try {await stopChild(child);} catch(e){release=false; throw e;} finally {if(release) {await fsp.rmdir(lock); closed=true;}} }};
  } catch(e) {
    try {await stopChild(child);} catch(_){release=false;}
    if(release) await fsp.rmdir(lock).catch(()=>{});
    throw e;
  }
}
