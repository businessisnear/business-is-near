"""Explicit local-development substitute for inference; never NEAR AI evidence.

Only numeric loopback, one installed model, no remote fallback or tool calls.
NEAR's existing reservation policy remains an authorization/count ceiling; its
rate estimate is not a bill for local compute.
"""
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
from app.model_schema import output_schema, response_format

MODEL = 'gemma4:e2b-it-q4_K_M'
EXPECTED_DIGEST = 'b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2'




def _request(payload):
    fields={'model', 'messages', 'max_tokens', 'temperature'}
    if (not isinstance(payload, dict) or set(payload) not in (fields,fields|{'response_format'}) or
            ('response_format' in payload and payload['response_format']!=response_format(payload.get('messages'))) or
            type(payload['max_tokens']) is not int or not 1 <= payload['max_tokens'] <= 512):
        raise ValueError('Invalid local inference request')
    request = {'model': MODEL, 'messages': payload['messages'], 'stream': False, 'think': False,
               'format': output_schema(payload['messages']), 'keep_alive': '2m',
               'options': {'temperature': 0, 'num_ctx': 4096, 'num_predict': payload['max_tokens']}}
    connection = http.client.HTTPConnection('127.0.0.1', 11434, timeout=60)
    try:
        connection.request('GET', '/api/tags')
        tags_response = connection.getresponse()
        tags_raw = tags_response.read(1048577)
        if tags_response.status != 200 or len(tags_raw) > 1048576:
            raise ValueError('Local model identity unavailable')
        matches = [m for m in json.loads(tags_raw).get('models', []) if m.get('name') == MODEL]
        if len(matches) != 1 or matches[0].get('digest') != EXPECTED_DIGEST:
            raise ValueError('Installed local model does not match the pinned digest')
        connection.request('POST', '/api/chat', json.dumps(request).encode(), {'Content-Type': 'application/json'})
        response = connection.getresponse()
        raw = response.read(131073)
        if response.status != 200 or len(raw) > 131072:
            raise ValueError('Local model response unavailable')
        result = json.loads(raw)
        if result.get('done') is not True or result.get('model') != MODEL or result.get('done_reason') != 'stop':
            raise ValueError('Incomplete or unexpected local model result')
        if result.get('message', {}).get('tool_calls'):
            raise ValueError('Local tool calls are not authorized')
        content = result['message']['content']
        i, o = result['prompt_eval_count'], result['eval_count']
        if not isinstance(content, str) or any(type(n) is not int or n < 0 for n in (i, o)):
            raise ValueError('Local model content or usage unavailable')
        return {'choices': [{'message': {'content': content}}],
                'usage': {'prompt_tokens': i, 'completion_tokens': o, 'total_tokens': i + o}}
    finally:
        connection.close()


def transport(payload, unused_key):
    root = Path(__file__).resolve().parents[1]
    raw = json.dumps(payload, separators=(',', ':')).encode()
    if len(raw) > 16384:
        raise ValueError('Local request exceeds bound')
    result = subprocess.run([sys.executable, '-m', 'executor.local_model'], input=raw,
                            cwd=root, env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'PYTHONPATH': str(root)},
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=65, check=True)
    if len(result.stdout) > 131072:
        raise ValueError('Local response exceeds bound')
    return json.loads(result.stdout)


class LocalModelClient:
    def __init__(self, bounded_client):
        self.inner = bounded_client

    def configure(self, policy):
        return self.inner.configure(policy)

    def status(self):
        return {**self.inner.status(), 'execution_backend': 'local_ollama', 'execution_model': MODEL,
                'execution_model_digest': EXPECTED_DIGEST,
                'billing_estimate': False, 'provider_rate_snapshot': 'NEAR policy reservation estimates only; no cloud invoice'}

    def reconcile_staged(self, call_id):
        return self.inner.reconcile_staged(call_id)

    def complete(self, *args, **kwargs):
        result = self.inner.complete(*args, **kwargs)
        if result.get('ok') is not True:
            return result
        return {**result, 'authorization_model': result['model'], 'model': MODEL,
                'model_digest': EXPECTED_DIGEST,
                'execution_backend': 'local_ollama', 'cloud_provider_charge_nanos': 0,
                'local_compute_cost_unknown': True}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError('Request too large')
        print(json.dumps(_request(json.loads(raw))))
    except Exception:
        raise SystemExit(1)
