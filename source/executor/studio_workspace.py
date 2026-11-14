"""Bounded private media/export adapter for the seeded local workspace only.

The controller checks the local session/demo actor and captures chain records.
This module accepts no requester-supplied filesystem paths or credentials.
"""
import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import tempfile
import uuid
import zlib

from executor.media import MediaLibrary
from executor.portability import (canonical, digest, directory, export_company, read_regular,
                                  reject_private_material, strict_json, write_private)

MAX_IMAGE_BYTES = 1024 * 1024
MAX_PIXELS = 4_000_000
SOURCE_FILES = (
    'web-chain/business.html', 'web-chain/index.html', 'web-chain/package.json', 'web-chain/package-lock.json',
    'web-chain/factory.html', 'web-chain/outbox.html', 'web-chain/public-page.html',
    'web-chain/src/company-factory.js', 'web-chain/src/company-factory-ui.js', 'web-chain/src/company-factory-client.js',
    'web-chain/src/company-factory-actions.js', 'web-chain/src/company-factory.css',
    'web-chain/src/outbox-console.js', 'web-chain/src/outbox-actions.js', 'web-chain/src/outbox-session.js',
    'web-chain/src/public-page-console.js', 'web-chain/src/public-page-actions.js', 'web-chain/src/public-page.css',
    'web-chain/vite.config.js', 'web-chain/src/business.js', 'web-chain/src/business.css',
    'web-chain/src/business-presentation.js', 'web-chain/src/workspace-theme.css',
    'web-chain/src/business-actions.js', 'web-chain/src/static-web-repair-results.js', 'web-chain/src/appointment-actions.js',
    'web-chain/src/action-review.js', 'web-chain/src/library-ui.js', 'web-chain/src/image-results.js', 'web-chain/src/audio-results.js', 'web-chain/src/cloud-media-results.js', 'web-chain/src/cloud-media-transfer.js', 'web-chain/src/media-presentation.js', 'web-chain/src/claim-review.js', 'web-chain/src/chain.js', 'web-chain/src/crypto.js',
    'web-chain/src/conversation-actions.js', 'web-chain/src/conversation-ui.js',
    'web-chain/src/knowledge-input.js',
    'web-chain/src/localization.js', 'web-chain/src/localization-dom.js', 'web-chain/src/workspace-messages.js',
    'web-chain/src/business-analytics.js', 'web-chain/src/business-analytics-ui.js',
    'web-chain/src/goal-plan-actions.js', 'web-chain/src/goal-plan-ui.js', 'web-chain/src/goal-plan-messages.js',
    'web-chain/src/leads-actions.js', 'web-chain/src/leads-ui.js', 'web-chain/src/leads-messages.js',
    'web-chain/src/document-input.js', 'web-chain/src/document-ui.js', 'web-chain/src/document-messages.js',
    'web-chain/wallet-auth-callback.html', 'web-chain/src/wallet-auth-callback.js', 'web-chain/src/private-owner-client.js',
    'web-chain/src/wallet-sdk.js', 'web-chain/src/browser-buffer.js',
    'web-chain/src/main.js', 'web-chain/src/style.css', 'web-chain/src/staking.js', 'web-chain/src/wallet.js',
    'web-chain/public/offline-tool.html', 'web-chain/public/fixture/index.html',
    'web-chain/public/fixture/collections.html', 'web-chain/public/fixture/hero.svg',
    'contract/onchain/company.ts', 'contract/onchain/appointments.ts',
    'contract/build/company.wasm', 'contract/build/appointments.wasm',
    'executor/operations.py', 'executor/inbox.py', 'executor/local_model.py', 'executor/main.py',
    'executor/media.py', 'executor/portability.py', 'executor/studio_workspace.py',
    'executor/engineering_router.py', 'executor/engineering.py', 'executor/web_engineering.py',
    'executor/outcome.mjs', 'app/near_ai_client.py',
    'scripts/studio.mjs', 'scripts/studio-local-workspace.mjs', 'scripts/studio-documents.mjs', 'scripts/private-rehearsal-path.mjs',
    'app/worker_crypto.py', 'app/company_intelligence.py', 'app/model_schema.py', 'app/onchain_ai.py', 'app/cloud_media_client.py',
    'executor/__init__.py', 'executor/crypto.py', 'executor/engine.py', 'executor/fetch.py',
    'executor/inference.py', 'executor/operations_cli.py', 'executor/planner.py', 'executor/research.py',
    'executor/web_browser_runner.mjs', 'executor/web_receipts.py', 'executor/media_analysis.py', 'executor/audio_analysis.py',
    'executor/image_operations.py', 'executor/cloud_media_transport.py', 'executor/media_transfer.py', 'executor/claims.py', 'executor/knowledge.py', 'executor/qa.py', 'executor/rpc_bridge.mjs',
    'executor/conversation.py',
    'executor/knowledge_input.py', 'executor/localization.py', 'executor/goal_plan.py', 'executor/leads.py',
    'executor/document_input.py', 'executor/document_store.py', 'executor/document_native.py', 'executor/document_transfer.py', 'executor/public_page.py',
    'executor/wallet_auth.py', 'executor/private_workspace_server.py',
    'executor/rpc_gateway.py', 'executor/journal.mjs', 'executor/archive.py', 'executor/package.json',
    'executor/package-lock.json', 'executor/config.example.json', 'executor/Dockerfile',
    'qa/runner.py', 'requirements.txt', 'public/encryption-tool.html',
    'contract/package.json', 'contract/package-lock.json', 'contract/persistent/sandbox.mjs',
    'docs/OPERATIONS.md', 'docs/AUTONOMOUS_OPERATIONS.md', 'docs/NEAR_INBOX.md',
    'docs/PORTABILITY.md', 'docs/WEB_ENGINEERING.md', 'docs/SHARED_KNOWLEDGE.md', 'docs/MULTIMODAL.md',
)
OPTIONAL_SOURCE_FILES = (
    'executor/native_source_watch.py','executor/editorial_queue.py','executor/native_watch_api.py','scripts/native-source-watch.mjs',
    'web-chain/native-watch.html','web-chain/src/native-watch-editorial.js','web-chain/src/native-watch-console.js','web-chain/src/native-watch.css','docs/NATIVE_SOURCE_WATCH.md','integration/native_watch_browser.mjs',
    'web-chain/native-retirement.html','web-chain/src/native-retirement-console.js','web-chain/src/native-retirement-actions.js','web-chain/src/native-retirement.css',
    'executor/retirement_model.mjs','executor/native_portfolio_retirement.mjs','executor/retirement_server.mjs','scripts/native-retirement.mjs','docs/NATIVE_RETIREMENT.md',
    'docs/NATIVE_SERVICE.md','docs/CHAT_APP_PROVISIONING.md',
    'contract/onchain/native_service.ts','contract/build/native_service.wasm','scripts/build_native_service.mjs',
    'web-chain/native-service.html','web-chain/vite.service.config.js','web-chain/src/native-service-console.js',
    'web-chain/src/native-service-actions.js','web-chain/src/native-service.css',
    'docs/CLOUD_MEDIA.md','docs/CLOUD_MEDIA_TRANSFER.md','docs/COMPANY_EXIT.md','docs/NATIVE_SUBSCRIPTIONS.md','docs/GENERAL_APPS.md','docs/BRAND_REFERENCE.md',
    'executor/company_exit.py','scripts/company-exit.mjs','executor/native_subscriptions_client.mjs',
    'contract/onchain/native_subscriptions.ts','contract/build/native_subscriptions.wasm','scripts/build_native_subscriptions.mjs',
    'web-chain/native-subscriptions.html','web-chain/src/native-subscriptions-console.js',
    'web-chain/src/native-subscriptions-actions.js','web-chain/src/native-subscriptions.css',
    'web-chain/general-app.html','web-chain/src/general-app-console.js','web-chain/vite.general.config.js',
    'scripts/general_app_source.mjs','scripts/general_app_studio.mjs',
    'docs/LOCAL_MODEL.md',
    'web-chain/native-community.html', 'web-chain/src/native-community-console.js',
    'web-chain/src/native-community-actions.js', 'web-chain/src/native-community.css',
    'executor/native_feed_scheduler.mjs', 'docs/NATIVE_COMMUNITY.md',
    'contract/onchain/native_mail_directory.ts', 'web-chain/src/native-mail-directory.js', 'docs/NATIVE_MAIL_DIRECTORY.md',
    'docs/GENERATED_APP.md', 'docs/NATIVE_MONITORING.md', 'docs/NATIVE_EXPERIMENTS.md',
    'scripts/generated_app_service.mjs', 'scripts/generated_app_studio.mjs',
    'web-chain/generated-app.html', 'web-chain/src/generated-app-console.js',
    'executor/native_monitor.py', 'web-chain/native-monitor.html', 'web-chain/native-experiments.html',
    'web-chain/src/native-growth.css', 'web-chain/src/native-growth-wallet.js',
    'web-chain/src/native-monitor-actions.js', 'web-chain/src/native-monitor-console.js',
    'web-chain/src/native-experiment-actions.js', 'web-chain/src/native-experiment-console.js',
    'executor/app_generation.py', 'web-chain/src/app-generation-actions.js', 'web-chain/src/native-app-sealed.js',
    'web-chain/native-feed.html', 'web-chain/src/native-feed-console.js',
    'web-chain/src/native-feed-actions.js', 'web-chain/src/native-feed-media.js', 'web-chain/src/native-feed.css',
    'contract/onchain/native_feed.ts', 'contract/onchain/native_feed_media.ts', 'contract/onchain/native_feed_codec.ts',
    'contract/build/native_feed.wasm', 'scripts/build_native_feed.mjs', 'scripts/build_native_feed_media.mjs', 'docs/NATIVE_FEED.md',
    'web-chain/native-promotion.html', 'web-chain/src/native-promotion-console.js',
    'web-chain/src/native-promotion-actions.js', 'web-chain/src/native-promotion.css',
    'contract/onchain/native_promotion.ts', 'contract/build/native_promotion.wasm',
    'scripts/build_native_promotion.mjs', 'executor/native_promotion_client.mjs', 'docs/NATIVE_PROMOTIONS.md',
    'executor/account_handoff.mjs', 'executor/account_handoff_client.mjs', 'executor/native_media_render.mjs', 'executor/video_frames.mjs',
    'docs/NATIVE_CUSTODY.md', 'docs/NATIVE_MEDIA.md',
    'web-chain/native-mail.html', 'web-chain/src/native-mail-console.js',
    'web-chain/src/native-mail-actions.js', 'web-chain/src/native-mail.css',
    'contract/onchain/native_mail.ts', 'contract/build/native_mail.wasm',
    'scripts/build_native_mail.mjs', 'docs/NATIVE_MAIL.md',
    'docs/near-native-capabilities.json', 'docs/acceptance-target.json',
    'scripts/acceptance_scope.py', 'scripts/test_acceptance_scope.py',
    'web-chain/knowledge.html', 'web-chain/src/knowledge.js', 'web-chain/src/knowledge.css',
    'web-chain/src/knowledge-actions.js', 'scripts/knowledge_studio.mjs',
    'contract/onchain/knowledge.ts', 'contract/build/knowledge.wasm', 'scripts/build_knowledge.mjs',
    'scripts/build_appointments.mjs', 'scripts/setup_near_sdk_arm.py',
    'web-chain/dist/offline-tool.html', 'web-chain/dist/fixture/index.html',
    'web-chain/dist/fixture/collections.html', 'web-chain/dist/fixture/hero.svg',
    'web-chain/native-app.html', 'web-chain/src/native-app.js', 'web-chain/src/native-app.css',
    'web-chain/src/native-app-actions.js',
    'contract/onchain/app.ts', 'contract/build/app.wasm', 'executor/app_schema.py',
    'scripts/native_app_studio.mjs', 'scripts/build_native_app.mjs', 'docs/NATIVE_APP.md',
    'docs/KNOWLEDGE_CONSUMPTION.md', 'docs/LOCALIZATION.md',
    'docs/BUSINESS_ANALYTICS.md', 'docs/OWNER_AUTHENTICATION.md', 'docs/GOAL_PLANNING.md',
    'executor/delivery.py', 'executor/gmail_delivery.py', 'executor/delivery_rpc.mjs', 'docs/DELIVERY.md',
    'contract/onchain/outbox.ts', 'contract/build/outbox.wasm', 'scripts/build_outbox.mjs',
    'contract/onchain/social_outbox.ts', 'contract/build/social_outbox.wasm', 'scripts/build_social_outbox.mjs',
    'executor/social_worker.py', 'executor/social_protocol.py', 'executor/social_providers.py',
    'executor/social_x.py', 'executor/social_meta.py', 'executor/social_pinterest.py',
    'executor/social_video.py', 'executor/social_media.py',
    'contract/onchain/company_factory.ts', 'contract/build/company_factory.wasm',
    'contract/build/company_factory.metadata.json', 'scripts/build_company_factory.mjs',
    'contract/onchain/public_page.ts', 'contract/build/public_page.wasm', 'scripts/build_public_page.mjs',
    'docs/COMPANY_ONBOARDING.md', 'docs/SOCIAL_DELIVERY.md', 'docs/OUTBOX_UI.md',
    'docs/PUBLIC_PAGES.md', 'docs/LEAD_DISCOVERY.md', 'docs/DOCUMENT_INGESTION.md',
    'docs/BUSINESS_REQUIREMENTS.md', 'docs/native-business-requirements.json',
    'scripts/verify_native_requirements.py',
)
HASH = re.compile(r'^[0-9a-f]{64}$')
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')


def wasm_code_hash(raw):
    """NEAR's public code identity is base58 of the exact WASM SHA-256."""
    value = bytes.fromhex(digest(raw)); number = int.from_bytes(value, 'big'); encoded = ''
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    while number:
        number, remainder = divmod(number, 58); encoded = alphabet[remainder] + encoded
    return '1' * (len(value) - len(value.lstrip(b'\0'))) + encoded


def png_info(raw):
    """Accept only bounded, CRC-valid 8-bit RGB/RGBA noninterlaced PNG pixels.

    Ancillary chunks are refused rather than retaining metadata, profiles,
    comments or embedded text. The original accepted bytes remain unchanged.
    """
    if not isinstance(raw, bytes) or not 45 <= len(raw) <= MAX_IMAGE_BYTES or raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Choose a PNG of at most 1 MiB')
    offset, header, ended, chunks, compressed = 8, None, False, 0, bytearray()
    idat_finished = False
    while offset < len(raw):
        if offset + 12 > len(raw): raise ValueError('Truncated PNG chunk')
        size = struct.unpack('>I', raw[offset:offset + 4])[0]
        kind = raw[offset + 4:offset + 8]
        end = offset + 12 + size
        if end > len(raw) or size > MAX_IMAGE_BYTES: raise ValueError('PNG chunk exceeds bounds')
        body = raw[offset + 8:offset + 8 + size]
        crc = struct.unpack('>I', raw[end - 4:end])[0]
        if binascii.crc32(kind + body) & 0xffffffff != crc: raise ValueError('PNG checksum mismatch')
        chunks += 1
        if chunks > 1024 or ended: raise ValueError('Unexpected PNG data')
        if kind == b'IHDR':
            if chunks != 1 or size != 13: raise ValueError('PNG header must be first and unique')
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', body)
            if not 1 <= width <= 4096 or not 1 <= height <= 4096 or width * height > MAX_PIXELS:
                raise ValueError('PNG dimensions exceed 4096 per edge or four million pixels')
            if depth != 8 or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0):
                raise ValueError('Only 8-bit RGB/RGBA noninterlaced PNG is supported')
            header = (width, height, 3 if color == 2 else 4)
        elif kind == b'IDAT':
            if header is None or idat_finished: raise ValueError('Invalid PNG image-data order')
            compressed.extend(body)
        elif kind == b'IEND':
            if size != 0 or header is None or not compressed or end != len(raw): raise ValueError('Invalid PNG end')
            ended = True; idat_finished = True
        else:
            raise ValueError('PNG metadata/unsupported chunks are refused; export plain RGB/RGBA pixels first')
        offset = end
    if not ended: raise ValueError('Missing PNG end')
    width, height, channels = header
    expected = height * (1 + width * channels)
    inflater = zlib.decompressobj()
    try: pixels = inflater.decompress(bytes(compressed), expected + 1)
    except zlib.error as exc: raise ValueError('Invalid PNG compressed pixels') from exc
    if len(pixels) != expected or not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise ValueError('PNG expanded pixels do not match its bounded dimensions')
    stride = 1 + width * channels
    if any(pixels[row * stride] > 4 for row in range(height)): raise ValueError('Invalid PNG scanline filter')
    reject_private_material(raw)
    return {'mime_type': 'image/png', 'width': width, 'height': height, 'bytes': len(raw), 'asset_id': digest(raw)}


def image_bytes(value):
    if not isinstance(value, str) or len(value) > (MAX_IMAGE_BYTES + 2) // 3 * 4: raise ValueError('PNG upload exceeds bound')
    try: raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc: raise ValueError('Canonical PNG base64 required') from exc
    if base64.b64encode(raw).decode() != value: raise ValueError('Canonical PNG base64 required')
    return raw


class Workspace:
    def __init__(self, root, repository):
        self.root = directory(root, private=True, create=True)
        worker = directory(self.root.parent / 'worker', private=True, create=True)
        self.library = MediaLibrary(worker / 'media')
        self.exports = directory(self.root / 'exports', private=True, create=True)
        self.repository = directory(repository)

    def inventory(self):
        data = self.library.inventory()
        for asset, entry in data['assets'].items():
            if entry['mime_type']=='audio/wav':
                from executor.audio_analysis import validate_audio
                entry.update(validate_audio(self.library.read_asset(asset)[0]))
            else:entry.update(png_info(self.library.read_asset(asset)[0]))
        return data

    def add(self, request):
        if set(request) != {'image_base64', 'source', 'cost'}: raise ValueError('Exact media import fields required')
        raw = image_bytes(request['image_base64']); info = png_info(raw)
        source = request['source']
        if not isinstance(source, str) or not 1 <= len(source.strip()) <= 120 or any(ord(c) < 32 for c in source):
            raise ValueError('A short owner provenance label is required')
        reject_private_material(source.encode())
        import_id = 'upload_' + uuid.uuid4().hex
        source_file = self.root / (import_id + '.png')
        write_private(source_file, raw)
        try:
            receipt = self.library.import_file(source_file, import_id=import_id, mime_type='image/png',
                provenance={'origin': 'owner_upload', 'source': source.strip()}, cost=request['cost'])
        finally: source_file.unlink(missing_ok=True)
        return {**receipt, **info, 'notice': 'Private local asset; provenance and costs are owner-reported'}

    def add_audio(self, request):
        if set(request) != {'audio_base64','source','cost'}: raise ValueError('Exact audio import fields required')
        from executor.audio_analysis import validate_audio
        if not isinstance(request['audio_base64'],str) or len(request['audio_base64'])>256064: raise ValueError('Short PCM WAV byte cap exceeded')
        raw=base64.b64decode(request['audio_base64'],validate=True); info=validate_audio(raw)
        source=request['source']
        if not isinstance(source,str) or not 1<=len(source.strip())<=120 or any(ord(c)<32 for c in source):raise ValueError('Short owner audio provenance label required')
        reject_private_material(source.encode());import_id='audio_'+uuid.uuid4().hex;temporary=self.root/(import_id+'.wav');write_private(temporary,raw)
        try:receipt=self.library.import_file(temporary,import_id=import_id,mime_type='audio/wav',provenance={'origin':'owner_upload','source':source.strip()},cost=request['cost'])
        finally:temporary.unlink(missing_ok=True)
        return {**receipt,**info,'notice':'Private local audio; provenance and costs are owner-reported'}

    def asset(self, asset_id):
        raw, record = self.library.read_asset(asset_id)
        if record['mime_type']=='audio/wav':
            from executor.audio_analysis import validate_audio
            return {**record,**validate_audio(raw),'audio_base64':base64.b64encode(raw).decode()}
        return {**record, **png_info(raw), 'image_base64': base64.b64encode(raw).decode()}

    def reuse(self, request):
        if set(request) != {'asset_id', 'import_id', 'operation_id', 'scope_hash', 'role', 'chain_reference'}:
            raise ValueError('Exact local media association required')
        reference = request['chain_reference']
        if not isinstance(reference, dict) or set(reference) != {'hash', 'height', 'code_hash', 'contract'}:
            raise ValueError('Pinned FINAL chain reference required')
        if type(reference['height']) is not int or reference['height'] < 0: raise ValueError('Invalid FINAL height')
        record = self.library.reuse(request['asset_id'], request['operation_id'], scope_hash=request['scope_hash'],
            role=request['role'], import_id=request['import_id'])
        return {**record, 'verified_at': reference, 'notice': 'Local association only; no new NEAR execution authority'}

    def export(self, snapshot, selected_assets, selected_documents=None):
        """Export only controller-captured records and named local assets.

        The controller is responsible for FINAL block/code/task verification;
        this adapter cannot query or sign on NEAR and never reads runtime keys.
        """
        if len(list(self.exports.iterdir())) >= 32:
            raise ValueError('Private archive capacity reached; manage the existing private downloads before another export')
        required = {'schema', 'network', 'contract', 'code_hash', 'block', 'data', 'history', 'conversations', 'tasks', 'evidence', 'coverage'}
        if not isinstance(snapshot, dict) or set(snapshot) != required or snapshot['schema'] != 1 or snapshot['network'] != 'local-near-sandbox':
            raise ValueError('Exact controller-captured local FINAL snapshot required')
        if not isinstance(selected_assets, list) or len(selected_assets) > 32 or len(set(selected_assets)) != len(selected_assets):
            raise ValueError('Select at most 32 distinct assets')
        if any(not isinstance(asset, str) or not HASH.fullmatch(asset) for asset in selected_assets): raise ValueError('Invalid selected asset hash')
        selected_documents = [] if selected_documents is None else selected_documents
        if not isinstance(selected_documents, list) or len(selected_documents) > 8: raise ValueError('Select at most eight exact documents')
        reject_private_material(canonical(snapshot))
        if len(canonical(snapshot)) > 2 * 1024 * 1024: raise ValueError('Selected chain snapshot exceeds bound')
        if wasm_code_hash(read_regular(self.repository, 'contract/build/company.wasm')[0]) != snapshot['code_hash']:
            raise ValueError('Selected company WASM differs from the pinned FINAL deployment')
        app = snapshot['data'].get('appointments') if isinstance(snapshot['data'], dict) else None
        if app and wasm_code_hash(read_regular(self.repository, 'contract/build/appointments.wasm')[0]) != app['code_hash']:
            raise ValueError('Selected appointments WASM differs from the pinned FINAL deployment')
        staging = Path(tempfile.mkdtemp(prefix='snapshot-', dir=self.root))
        selections = []
        def stage(name, raw, kind):
            target = staging / name; target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            write_private(target, raw); selections.append({'path': name, 'kind': kind})
        try:
            source_files = list(dict.fromkeys(SOURCE_FILES)) + [name for name in OPTIONAL_SOURCE_FILES if os.path.lexists(self.repository / name)]
            # Build output is an explicitly bounded public artifact directory,
            # never the repository/runtime tree. Include actual files and hashes.
            for name in ('business.html', 'index.html', 'knowledge.html', 'native-app.html',
                         'wallet-auth-callback.html', 'factory.html', 'outbox.html', 'public-page.html', 'native-mail.html', 'native-feed.html', 'native-promotion.html', 'native-monitor.html', 'native-experiments.html', 'generated-app.html', 'native-community.html'):
                source_files.append('web-chain/dist/' + name)
            asset_dir = directory(self.repository / 'web-chain/dist/assets')
            build_names = sorted(path.name for path in asset_dir.iterdir())
            if not 1 <= len(build_names) <= 64 or any(not re.fullmatch(r'[A-Za-z0-9_.-]+\.(?:js|css)', name) for name in build_names):
                raise ValueError('Unexpected public build artifacts; rebuild and review the explicit selection')
            source_files += ['web-chain/dist/assets/' + name for name in build_names]
            source_hashes = {}
            for name in source_files:
                raw, _ = read_regular(self.repository, name)
                stage('source/' + name, raw, 'code'); source_hashes[name] = digest(raw)
            if any(digest(read_regular(self.repository, name)[0]) != expected for name, expected in source_hashes.items()):
                raise ValueError('Actual workspace source/build changed during export; review and retry')
            build_identities = {'company_source_sha256': source_hashes['contract/onchain/company.ts'],
                'company_wasm_sha256': source_hashes['contract/build/company.wasm'],
                'company_deployed_code_hash': snapshot['code_hash'], 'company_wasm_matches_pinned_deployment': True,
                'frontend_input_sha256': source_hashes['web-chain/src/business.js'],
                'frontend_served_build_sha256': source_hashes['web-chain/dist/business.html'],
                'source_compilation_reproduced_during_export': False,
                'note': 'Actual inputs/outputs are identified; independent source rebuild is a separate acceptance check'}
            stage('source/BUILD-IDENTITIES.json', canonical(build_identities), 'code')
            source_manifest = canonical(source_hashes)
            stage('source/SELECTED-SOURCE-HASHES.json', source_manifest, 'code')
            stage('chain/data.json', canonical({key: snapshot[key] for key in ('network', 'contract', 'code_hash', 'block', 'data', 'coverage')}), 'data')
            stage('chain/history.json', canonical(snapshot['history']), 'history')
            stage('chain/conversations.json', canonical(snapshot['conversations']), 'conversation')
            stage('chain/tasks.json', canonical(snapshot['tasks']), 'data')
            stage('chain/evidence.json', canonical(snapshot['evidence']), 'evidence')
            if selected_documents:
                from executor.document_transfer import export_documents, inspect_documents_archive
                document_bundle = export_documents(self.root.parent / 'worker', snapshot['contract'], selected_documents)
                document_receipt = inspect_documents_archive(document_bundle, snapshot['contract'])
                stage('documents/selected-private-documents.zip', document_bundle, 'data')
                stage('documents/transfer-receipt.json', canonical(document_receipt), 'data')
            with self.library.export_snapshot():
                catalog = strict_json(read_regular(self.library.root, 'catalog.json')[0])
                if any(asset not in catalog['assets'] for asset in selected_assets): raise ValueError('Selected asset is absent')
                imports = {key: value for key, value in catalog['imports'].items() if value['asset_id'] in selected_assets}
                uses = {key: value for key, value in catalog['uses'].items() if value['asset_id'] in selected_assets}
                filtered = {**catalog, 'assets': {key: catalog['assets'][key] for key in selected_assets}, 'imports': imports, 'uses': uses}
                stage('media/catalog.json', canonical(filtered), 'media')
                for asset in selected_assets:
                    raw, _ = read_regular(self.library.assets, asset + '.blob')
                    if catalog['assets'][asset]['mime_type']=='audio/wav':
                        from executor.audio_analysis import validate_audio
                        validate_audio(raw)
                    else:png_info(raw)
                    stage('media/assets/' + asset + '.blob', raw, 'media')
                notes = ('Actual selected workspace source and compiled frontend are under source/.\n'
                    'Serve source/web-chain/dist on loopback to inspect/edit the restored built HTML/CSS independently.\n'
                    'The source is editable; rebuilding requires its pinned development dependencies, supplied separately.\n'
                    'chain/ records are one pinned FINAL local sandbox snapshot, with exact coverage in data.json.\n'
                    'Encrypted task/policy/evidence records are included without recovery keys and remain encrypted.\n'
                    'No wallet, worker, provider, vault, runtime config or recovery authority is exported.\n'
                    'Restored chain bindings grant no account authority. No services are automatically restored.\n'
                    'Fixture actor selection is local operator demo authority, not real-user authentication or tenant isolation.\n'
                    'Knowledge/native-app/factory/outbox/public-page source/build is included when present; their separate contract state is not selected here.\n'
                    'Only explicitly selected document originals/extractions/metadata enter a nested documents/ transfer; restore it separately into a fresh same-company worker. No parser runs during generic restore.\n'
                    'media/ associations are local records, not new NEAR permissions. Costs are owner-reported.\n')
                stage('READ-ME.txt', notes.encode(), 'data')
                output = self.exports / ('company-' + uuid.uuid4().hex + '.zip')
                result = export_company(staging, output, snapshot['contract'], selections, metadata={
                    'mode': 'local-rehearsal-only', 'final_block': snapshot['block'], 'contract': snapshot['contract'],
                    'code_hash': snapshot['code_hash'], 'coverage': snapshot['coverage'],
                    'source_manifest': {'path': 'source/SELECTED-SOURCE-HASHES.json', 'sha256': digest(source_manifest), 'files': len(source_hashes)}, 'selected_media': selected_assets,
                    'encrypted_records_without_keys': True,
                }, required_services=['An independently owned NEAR account and reviewed deployment for chain execution',
                    'Separately configured model/provider account or local model', 'Pinned build dependencies to rebuild source'] +
                    (['Matching document parser runtime; selected native PDFs also require the recorded Poppler toolchain'] if selected_documents else []))
            return {'archive_id': output.name, 'sha256': result['sha256'], 'bytes': output.stat().st_size,
                    'files': result['files'], 'snapshot_block': snapshot['block'], 'credentials_included': False,
                    'coverage': snapshot['coverage'], 'source_files': source_hashes}
        finally: shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True); parser.add_argument('--repository', required=True)
    parser.add_argument('action', choices=('inventory', 'import', 'import_audio', 'asset', 'reuse', 'export'))
    args = parser.parse_args(); raw = sys.stdin.buffer.read(3 * 1024 * 1024 + 1)
    if len(raw) > 3 * 1024 * 1024: raise ValueError('Workspace request exceeds bound')
    request = strict_json(raw); workspace = Workspace(args.root, args.repository)
    if args.action == 'inventory':
        if request != {}: raise ValueError('Inventory takes no fields')
        result = workspace.inventory()
    elif args.action == 'import': result = workspace.add(request)
    elif args.action == 'import_audio': result = workspace.add_audio(request)
    elif args.action == 'asset':
        if set(request) != {'asset_id'}: raise ValueError('Exact asset hash required')
        result = workspace.asset(request['asset_id'])
    elif args.action == 'reuse': result = workspace.reuse(request)
    else:
        if set(request) not in ({'snapshot', 'selected_assets'}, {'snapshot', 'selected_assets', 'selected_documents'}): raise ValueError('Exact export request required')
        result = workspace.export(request['snapshot'], request['selected_assets'], request.get('selected_documents'))
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else 'Local media/export validation or storage operation failed'
        print(json.dumps({'error': message}, separators=(',', ':')))
        raise SystemExit(1)
