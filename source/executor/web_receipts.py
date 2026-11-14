"""Compact encrypted receipts bound to immutable full local browser evidence."""
from executor.engineering import canonical
from executor.operations import digest


def compact_browser_result(result,phase):
    if phase not in ('before','after'):raise ValueError('Fixed browser evidence phase required')
    fields=('passed','tests','browser_version','screenshots','isolation','acceptance_sha256','runner_sha256')
    summary={name:result[name] for name in fields}
    failures=[check for check in result['checks'] if not check['passed']]
    numeric_metrics={'document','viewport','count','x','y','width','height','blocked_request_count','page_errors','dialogs','downloads','changed_pixels','max_channel_delta','total_channel_delta'}
    summary.update(detail_file=phase+'-browser.json',detail_manifest_sha256=digest(canonical(result)),
                   source_manifest_sha256=digest(canonical(result['source_sha256'])),source_file_count=len(result['source_sha256']),
                   failed_checks_count=len(failures),failed_checks=[{'viewport':check['viewport'],'kind':check['kind'],
                       'observed':{key:value for key,value in check['observed'].items() if key in numeric_metrics and type(value) in (int,float)}} for check in failures[:4]])
    return summary
