"""Verify only the explicitly published capsule files; no runtime/key access."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'CAPSULE-MANIFEST.json').read_text())
for row in manifest['files']:
    rel=Path(row['path'])
    if rel.is_absolute() or '..' in rel.parts:raise SystemExit('Unsafe manifest path')
    p=root/rel
    if p.is_symlink() or not p.is_file():raise SystemExit('Missing/linked capsule source: '+row['path'])
    b=p.read_bytes()
    if len(b)!=row['bytes'] or hashlib.sha256(b).hexdigest()!=row['sha256']:raise SystemExit('Capsule source changed: '+row['path'])
print('PASS: '+str(len(manifest['files']))+' explicit source/fixture/static files. No wallet/runtime inspected.')
