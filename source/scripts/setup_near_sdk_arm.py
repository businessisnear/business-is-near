"""Use a native compiler with near-sdk-js 2.0.0's original WASI sysroot.

The npm installer bundles an Intel-only wasi-sdk 11 compiler on Apple Silicon.
This changes ignored dependency tools only. No tracked SDK or lockfile changes.
"""
import hashlib
import json
import platform
from pathlib import Path
import shlex
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
NAME = 'wasi-sdk-24.0-arm64-macos'
SHA256 = 'aeae999396d5f5caa5ce419f52e83c35869d5fd21d40af80acba2c80f51b0b3a'
URL = 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-24/' + NAME + '.tar.gz'


def main():
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('This workaround is only for Apple Silicon')
    package = ROOT / 'contract/node_modules/near-sdk-js'
    if json.loads((package / 'package.json').read_text())['version'] != '2.0.0':
        raise ValueError('Re-evaluate this workaround for a different SDK version')
    artifacts = ROOT / '.artifacts'
    artifacts.mkdir(exist_ok=True)
    archive = artifacts / (NAME + '.tar.gz')
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=120) as source, archive.open('xb') as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
    if archive.is_symlink() or hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Native compiler archive identity mismatch')
    native = artifacts / NAME / 'bin/clang'
    if not native.exists():
        with tarfile.open(archive) as source:
            source.extractall(artifacts, filter='data')
    compiler = package / 'lib/cli/deps/wasi-sdk/bin/clang'
    if compiler.is_symlink():
        raise ValueError('Expected the original SDK dependency directory, not a symlink')
    original = compiler.with_name('clang.x86_64')
    if not original.exists():
        compiler.rename(original)
    # Old libc avoids new reference-type instructions. Explicitly keep the
    # compiler's generated instructions within the chain's supported features.
    compiler.write_text('#!/bin/sh\nexec ' + shlex.quote(str(native)) +
                        ' -mno-sign-ext -mno-bulk-memory -mno-reference-types -mno-multivalue -mno-nontrapping-fptoint "$@"\n')
    compiler.chmod(0o755)
    print('Configured native ARM compiler with original SDK sysroot; run npm run build:onchain --prefix contract.')


if __name__ == '__main__':
    main()
