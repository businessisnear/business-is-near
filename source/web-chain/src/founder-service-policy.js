// This reviewed frontend policy grants no on-chain or worker authority.
// Older cached clients and direct contract callers are outside this UI gate.
export const FOUNDER_RECOVERY = Object.freeze({
  mode: 'original-company-revision-only',
  factory: 'bin-factory-986bd42f.testnet',
  operator: 'bin-operator-fe94da82.testnet',
  company: 'harbor-studio-a94eef.bin-factory-986bd42f.testnet',
  owner: '1422b54bb75bfd7ba64df3f6fb9ec53c078ec1b407b37120347910acc8d36e3d',
  originalTask: 'work_027bf76cedf54883',
  workerKey: '89aafd290406ac5ede95014e9735dcdb2f3743974175ea8873e2abdc02b97997',
  leaseEnd: 1794754924,
});
export const FOUNDER_CREATION_PAUSED = 'New company creation and setup are paused. This finite recovery service supports only the original company’s one remaining website revision. Existing records, recovery and publication remain available.';
export const FOUNDER_RECOVERY_ONLY = 'This finite recovery service supports only the original company’s remaining AI website revision. Other companies can read their existing records, recover results and review publication.';
const fail = message => { throw Error(message); };
export const recoveryFactory = config => config?.factory_id === FOUNDER_RECOVERY.factory;
export function assertFounderCreationAllowed(config) {
  if (recoveryFactory(config)) fail(FOUNDER_CREATION_PAUSED);
}
export function founderCreationAvailability(config) {
  return recoveryFactory(config) ? {ready:false, reason:FOUNDER_CREATION_PAUSED, service_mode:FOUNDER_RECOVERY.mode} : null;
}
const time = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,10})$/.test(value) ? Number(value) : NaN;
export function recoveryAdmission({companyId, company, policy, originalTask, service, now = Math.floor(Date.now()/1000)}) {
  const denied = reason => ({ready:false, reason, service_mode:FOUNDER_RECOVERY.mode});
  if (companyId !== FOUNDER_RECOVERY.company) return denied(FOUNDER_RECOVERY_ONLY);
  if (company?.lifetime_tasks === 2) return denied('No further work is admitted after the remaining revision is submitted. Follow its original task progress or recover the result; do not create a replacement.');
  if (!company || company.owner !== FOUNDER_RECOVERY.owner || company.operator !== FOUNDER_RECOVERY.operator || company.frozen !== false || company.lifetime_tasks !== 1 || company.task_count !== 0 || company.storage_blocks !== 2) return denied('The original company must have exactly one used task slot and no active task before its remaining revision. Read the current records.');
  const expected = {version:1, count:1, enabled:true, scope_consent:true, selected_model:'economy', allow_economy:true, allow_expensive:false,
    per_call_nanos:'1000000', daily_nanos:'2000000', lifetime_nanos:'2000000', max_input_tokens:4608, max_output_tokens:512, max_calls_per_job:1, max_calls_per_day:2};
  if (!policy || Object.entries(expected).some(([key,value]) => policy[key] !== value)) return denied('The original owner-approved revision policy or its single-call count changed. Inspect it before preparing work.');
  if (!originalTask || originalTask.id !== FOUNDER_RECOVERY.originalTask || originalTask.status !== 'archived' || originalTask.kind !== 'general' || originalTask.operation !== 'website_build' || originalTask.approved_by !== FOUNDER_RECOVERY.owner || originalTask.worker_key_id !== FOUNDER_RECOVERY.workerKey || originalTask.execution_profile_version !== 1 || !/^[a-f0-9]{64}$/.test(originalTask.evidence_hash ?? '')) return denied('The original completed website task must be verified before preparing its revision.');
  const observed = time(service?.observed_at), end = Math.min(FOUNDER_RECOVERY.leaseEnd, time(service?.heartbeat_expires_at), time(service?.service_expires_at));
  if (!Number.isSafeInteger(now) || !Number.isFinite(end) || !Number.isFinite(observed) || Math.abs(now-observed)>60 || service?.online !== true || now >= end || observed >= end) return denied('The finite recovery heartbeat is unavailable or expired. Existing work remains readable.');
  return {ready:true, service_mode:FOUNDER_RECOVERY.mode, company_id:companyId, owner:company.owner,
    lifetime_tasks:1, policy_count:1, policy_version:1, admission_expires_at:String(end),
    reason:'Finite recovery: only this company’s one remaining AI website revision is eligible. The operator must arm its exact request before wallet approval.'};
}
function admitted(context) {
  const {companyId, account, readiness, now = Math.floor(Date.now()/1000)} = context;
  const end = time(readiness?.admission_expires_at);
  if (companyId !== FOUNDER_RECOVERY.company || account !== FOUNDER_RECOVERY.owner || readiness?.ready !== true || readiness.service_mode !== FOUNDER_RECOVERY.mode || readiness.company_id !== companyId || readiness.owner !== account || readiness.lifetime_tasks !== 1 || readiness.policy_count !== 1 || readiness.policy_version !== 1 || !Number.isSafeInteger(now) || !Number.isFinite(end) || end > FOUNDER_RECOVERY.leaseEnd || now >= end) fail(readiness?.ready ? FOUNDER_RECOVERY_ONLY : readiness?.reason || FOUNDER_RECOVERY_ONLY);
}
export function assertFounderRecoveryPreparation(context, scope, repeating = false) {
  admitted(context);
  const fields = ['profile','operation','brief','context','sources','use_ai'];
  if (scope?.locale !== undefined) fields.push('locale');
  if (!scope || Object.keys(scope).sort().join(',') !== fields.sort().join(',') || scope.profile !== 'business-operations-v1' || scope.operation !== 'website_build' || scope.use_ai !== true || repeating) fail('Only one ordinary AI website revision is serviced during recovery. Keep other work private; no recurring or additional workflow is admitted.');
}
export function assertFounderRecoveryDispatch(context, intent) {
  admitted(context);
  const a = intent?.args;
  if (intent?.method !== 'company_submit_operation' || intent.deposit !== '0' || a?.operation !== 'website_build' || a.worker_key_id !== FOUNDER_RECOVERY.workerKey || a.execution_profile_version !== 1 || !Array.isArray(a.dependencies) || a.dependencies.length || a.not_before !== '0') fail('Only the original company’s separately approved ordinary website revision can be submitted during recovery.');
}
// Recheck the caller's identity after every asynchronous FINAL read and before
// either encryption/preparation or a wallet dispatch can proceed.
export async function checkFounderRecoveryWork({getContext, readReadiness, scope, intent, repeating = false}) {
  const before = {...getContext()}, readiness = await readReadiness(before), after = getContext();
  if (before.epoch !== after.epoch || before.companyId !== after.companyId || before.account !== after.account) fail('Your company or wallet changed during the recovery check. Read the current workspace again.');
  const context = {...before, readiness};
  if (scope) assertFounderRecoveryPreparation(context, scope, repeating);
  else assertFounderRecoveryDispatch(context, intent);
  return readiness;
}
