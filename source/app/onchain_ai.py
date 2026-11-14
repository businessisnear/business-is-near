"""Contract-backed authorization for the optional local NEAR AI client.

The contract records authorization and conservative reservations, not actual
provider billing. A chain check cannot revoke an HTTPS request already in flight.
"""
import hashlib
import re

class OnchainAI:
    def __init__(self,gateway):self.gateway=gateway
    @staticmethod
    def translate(policy):
        return {'enabled':policy['enabled'],'scope_consent':policy['scope_consent'],
                'selected_model':policy['model'],'allow_economy':True,'allow_expensive':policy['allow_expensive'],
                'per_call_nanos':str(policy['per_call_nanos']),'daily_nanos':str(policy['daily_nanos']),
                'lifetime_nanos':str(policy['run_nanos']),'max_input_tokens':policy['max_input_tokens'],
                'max_output_tokens':policy['max_output_tokens'],'max_calls_per_job':policy['max_calls_per_job'],
                'max_calls_per_day':policy['max_calls_per_day']}
    def _call(self,command,**kwargs):
        value=self.gateway.call(command,**kwargs)
        if not isinstance(value,dict) or value.get('ok') is not True:raise ValueError('Chain AI authority unavailable')
        return value
    def configure(self,policy):
        expected=self.translate(policy)
        result=self._call('ai_set_policy',**expected)
        state=self._call('ai_policy').get('policy')
        if not isinstance(state,dict) or any(state.get(k)!=v for k,v in expected.items()):raise ValueError('Chain AI policy mismatch')
        return result.get('tx')
    def status(self):
        value=self._call('ai_policy').get('policy')
        if not isinstance(value,dict):raise ValueError('Chain AI policy unavailable')
        return value
    def check(self,policy,expected_version=None):
        expected=self.translate(policy);chain=self._call('ai_policy').get('policy')
        snap=self.gateway.snapshot()
        if not isinstance(chain,dict) or any(chain.get(k)!=v for k,v in expected.items()):raise ValueError('Chain AI policy mismatch')
        if snap.get('company',{}).get('frozen') is not False or snap.get('contract',{}).get('frozen') is not False:raise ValueError('Company frozen')
        version=chain.get('version')
        if type(version) is not int or version<=0 or (expected_version is not None and version!=expected_version):raise ValueError('Chain AI policy version changed')
        if not chain.get('enabled') or not chain.get('scope_consent'):raise ValueError('Chain AI consent disabled')
        return version
    def check_job(self,job_id):
        if not isinstance(job_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',job_id) or job_id in ('__proto__','prototype','constructor'):raise ValueError('A public QA job is required')
        # Scan the bounded public queue first. A private/logical mission label
        # must not be published in a failed signed request (or RPC job lookup).
        cursor=0;matches=[]
        for _ in range(2):
            page=self._call('company_list',from_index=cursor,limit=20).get('tasks')
            if not isinstance(page,dict) or not isinstance(page.get('items'),list) or len(page['items'])>20:raise ValueError('Active QA queue unavailable')
            matches.extend(t for t in page['items'] if isinstance(t,dict) and t.get('kind')=='qa' and t.get('job_id')==job_id)
            next_index=page.get('next_index')
            if next_index is None:break
            if type(next_index) is not int or not cursor<next_index<=32:raise ValueError('Active QA queue unavailable')
            cursor=next_index
        else:raise ValueError('Active QA queue exceeds bound')
        if len(matches)!=1:raise ValueError('A linked active QA job is required')
        task=matches[0];job=self._call('job',id=job_id).get('job')
        if not isinstance(job,dict) or not (job.get('status')=='escrowed' and task.get('status')=='pending_review' or job.get('status')=='accepted' and task.get('status')=='hired'):raise ValueError('QA job is not in an inference stage')
    def reserve(self,**args):
        self.check_job(args.get('job_id'))
        outcome=self._call('ai_reserve_call',**args)
        # A previously reserved call may already have reached the provider.
        # Never interpret a duplicate as permission to issue another request.
        if outcome.get('duplicate'):raise ValueError('Existing chain reservation requires reconciliation')
        call=self._call('ai_call',id=args['id']).get('call')
        if not isinstance(call,dict) or any(call.get(k)!=v for k,v in args.items()) or call.get('status')!='reserved':raise ValueError('Chain reservation not confirmed')
        return outcome.get('tx')
    def complete(self,call_id,cache):
        digest=hashlib.sha256(cache.encode('utf-8')).hexdigest()
        result=self._call('ai_complete_call',id=call_id,output_hash=digest)
        self.check_cache(call_id,cache)
        return result.get('tx')
    def check_cache(self,call_id,cache):
        call=self._call('ai_call',id=call_id).get('call')
        if not isinstance(call,dict) or call.get('status')!='completed' or call.get('output_hash')!=hashlib.sha256(cache.encode('utf-8')).hexdigest():raise ValueError('Chain output commitment unavailable')
