"""Select a bounded adapter from an exact owner-pinned local policy only.

The encrypted task carries a repository ID/hash, never a filesystem path,
execution command, backend selector or additional authority.
"""
import os
from pathlib import Path
import re
import stat

from executor.engineering import canonical, read_private_json
from executor.operations import digest, validate_scope

NUMERIC_KEYS=frozenset({'id','root','base_revision','editable','read_only'})
STATIC_WEB_KEYS=NUMERIC_KEYS|{'entrypoint','acceptance','acceptance_sha256','public_files'}


def repair(scope,client,task_id,registry):
    validate_scope(scope,'engineering_patch')
    path=Path(registry)
    if not path.is_absolute() or path.resolve()!=path:raise ValueError('Canonical owner registry path required')
    parent=path.parent.stat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.getuid() or parent.st_mode&0o077:
        raise ValueError('Private owner registry directory required')
    # O_NOFOLLOW, regular-file, owner and mode checks live in this reader and
    # are repeated by the selected adapter before it executes any repository.
    data=read_private_json(path)
    if not isinstance(data,dict) or set(data)!={'repositories'} or not isinstance(data['repositories'],list) or not 1<=len(data['repositories'])<=8:
        raise ValueError('Exact bounded owner repository registry required')
    ids=set();selected=None
    for policy in data['repositories']:
        if (not isinstance(policy,dict) or frozenset(policy) not in (NUMERIC_KEYS,STATIC_WEB_KEYS) or
                not isinstance(policy.get('id'),str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}',policy['id'])):
            raise ValueError('Mixed, extra or unsupported owner repository policy keys')
        if policy['id'] in ids:raise ValueError('Duplicate owner repository IDs refused')
        ids.add(policy['id'])
        if policy['id']==scope['engineering']['repository_id']:selected=policy
    if selected is None:raise ValueError('Owner repository not configured')
    if digest(canonical(selected))!=scope['engineering']['policy_hash']:raise ValueError('Owner repository policy hash changed')
    if frozenset(selected)==STATIC_WEB_KEYS:
        from executor.web_engineering import repair as execute
    else:
        from executor.engineering import repair as execute
    return execute(scope,client,task_id,path)
