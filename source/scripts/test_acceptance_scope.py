"""Actual filesystem/selection regressions using synthetic policy receipts only."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from scripts.acceptance_scope import selection, native_audit, native_structure, sha

ROOT=Path(__file__).resolve().parents[1]
IDS=[x['id'] for x in json.loads((ROOT/'docs/native-business-requirements.json').read_text())['capabilities']]

class AcceptanceScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        for name in ('docs','executor','.artifacts/accepted-components'):(self.root/name).mkdir(parents=True,exist_ok=True)
        self.source=self.root/'executor/source.py';self.source.write_text('# synthetic unit source\n')
        self.base={'capabilities':[{'id':x,'status':'blocked','missing':'Optional external account is absent.'} for x in IDS]}
        base=self.write('docs/native-business-requirements.json',self.base)
        self.report={'network':'local NEAR sandbox','public_deployment':False,'passed':True,'checks':{'actual_case':True,'teardown':True},'source_sha256':{'executor/source.py':sha(self.source.read_bytes())}}
        raw=(json.dumps(self.report)+'\n').encode();digest=sha(raw)
        path=f'.artifacts/accepted-components/{digest}.json';(self.root/path).write_bytes(raw)
        receipt={'artifact':path,'sha256':digest,'environment':{'path':'network','equals':'local NEAR sandbox'},'stage':'local_authorized','domain':'native','inference':'actual_local_gemma','required_checks':['actual_case','teardown'],'minimum_source_files':['executor/source.py'],'refresh_from':{'file':'.artifacts/unit-e2e.json'},'completion_assertions':{'passed':True}}
        self.catalog={'schema':1,'target_scope':'near_native_equivalents_v1','baseline':{'path':'docs/native-business-requirements.json','sha256':sha(base),'ids':IDS},'receipts':{'unit':receipt},'capabilities':[{'id':x,'criterion':'Synthetic scope-policy unit case, not feature proof.','implementation_status':'partial','local_cases':[{'id':x+'.case','description':'Synthetic unit policy fixture','receipts':['unit']}],'open_native_gaps':[],'declared_bounds':['unit fixture only'],'related_receipts':[],'optional_external_extensions':['Unused named provider'],'public_receipts':[]} for x in IDS]}
        self.save_catalog()
    def tearDown(self):self.tmp.cleanup()
    def write(self,path,value):
        raw=(json.dumps(value)+'\n').encode();(self.root/path).write_bytes(raw);return raw
    def save_catalog(self):
        raw=self.write('docs/near-native-capabilities.json',self.catalog)
        self.config={'schema':1,'target_scope':'near_native_equivalents_v1','required_stage':'local_authorized','inference_mode':'local_gemma_authorized','catalog_sha256':sha(raw)}
        self.write('docs/acceptance-target.json',self.config)
    def audit(self):return native_audit(self.root,selection(self.root))
    def test_scope_exact_unknown_stage_hidden_fields_and_bool_schema(self):
        for change in ({'target_scope':'native'},{'schema':True},{'required_stage':'production'},{'hidden':True}):
            c={**self.config,**change};self.write('docs/acceptance-target.json',c)
            with self.assertRaises(ValueError):selection(self.root)
    def test_explicit_baseline_selection_and_native_default(self):
        self.assertEqual(selection(self.root)['target_scope'],'near_native_equivalents_v1')
        self.assertEqual(selection(self.root,'business_requirements_baseline')['required_stage'],'live_baseline')
    def test_native_local_mock_requires_no_cloud_enrollment(self):
        r=self.audit();self.assertFalse(r['cloud_enrollment_required']);self.assertTrue(r['selected_target_complete']);self.assertFalse(r['public_observation_from_local'])
    def test_exact44_ids_and_baseline_bytes_cannot_drift(self):
        for key in ('duplicate','missing','baseline'):
            old=copy.deepcopy(self.catalog)
            if key=='duplicate':self.catalog['capabilities'][-1]['id']=IDS[0]
            elif key=='missing':self.catalog['capabilities'].pop()
            else:self.catalog['baseline']['sha256']='a'*64
            self.save_catalog()
            with self.assertRaises(ValueError):self.audit()
            self.catalog=old
    def test_implementation_label_does_not_accept_missing_native_case(self):
        self.catalog['capabilities'][0]['implementation_status']='implemented_bounded';self.catalog['capabilities'][0]['local_cases']=[];self.save_catalog()
        self.assertFalse(self.audit()['selected_target_complete'])
    def test_open_native_gap_stays_blocking_even_with_accepted_components(self):
        self.catalog['capabilities'][0]['open_native_gaps']=['Native publication is missing.'];self.save_catalog();r=self.audit()
        self.assertEqual(r['bounded_components_reused'],1);self.assertFalse(r['selected_target_complete']);self.assertTrue(r['capabilities'][0]['local_component_coverage']=='accepted_bounded')
    def test_tampered_receipt_symlink_and_private_key_path_refused(self):
        p=self.root/self.catalog['receipts']['unit']['artifact'];raw=p.read_bytes();p.write_bytes(raw+b' ')
        with self.assertRaises(ValueError):self.audit()
        p.write_bytes(raw);p.unlink();p.symlink_to(self.source)
        with self.assertRaises(ValueError):self.audit()
        self.catalog['receipts']['unit']['artifact']='.artifacts/operator.json';self.save_catalog()
        with self.assertRaises(ValueError):self.audit()
    def test_source_drift_retains_historical_coverage_without_current_promotion(self):
        self.source.write_text('# changed current source\n');r=self.audit()
        self.assertTrue(r['capabilities'][0]['local_workflow_accepted_bounded']);self.assertFalse(r['selected_target_complete']);self.assertEqual(r['receipt_evidence']['unit']['receipt_basis'],'reviewed_immutable_component')
    def test_owned_refresh_requires_all_named_checks_and_current_source_coverage(self):
        self.source.write_text('# changed current source\n');fresh=copy.deepcopy(self.report);fresh['source_sha256']['executor/source.py']=sha(self.source.read_bytes());fresh['checks']={'teardown':True};self.write('.artifacts/unit-e2e.json',fresh)
        self.assertFalse(self.audit()['selected_target_complete'])
        fresh['checks']['actual_case']=True;self.write('.artifacts/unit-e2e.json',fresh);r=self.audit()
        self.assertTrue(r['selected_target_complete']);self.assertEqual(r['receipt_evidence']['unit']['receipt_basis'],'current_owned_harness_report')
    def test_owned_teardown_must_be_proven_before_acceptance(self):
        self.catalog['receipts']['unit']['completion_assertions']={'passed':True,'lifecycle.owned_processes_stopped':True,'lifecycle.fixture_removed':True}
        report=copy.deepcopy(self.report);report['lifecycle']={'owned_processes_stopped':True,'fixture_removed':False}
        raw=(json.dumps(report)+'\n').encode();digest=sha(raw);path=f'.artifacts/accepted-components/{digest}.json';(self.root/path).write_bytes(raw)
        self.catalog['receipts']['unit'].update(artifact=path,sha256=digest);self.save_catalog()
        with self.assertRaisesRegex(ValueError,'completion/teardown'):self.audit()
        report['lifecycle']['fixture_removed']=True
        raw=(json.dumps(report)+'\n').encode();digest=sha(raw);path=f'.artifacts/accepted-components/{digest}.json';(self.root/path).write_bytes(raw)
        self.catalog['receipts']['unit'].update(artifact=path,sha256=digest);self.save_catalog()
        self.assertTrue(self.audit()['selected_target_complete'])
    def test_local_and_synthetic_external_cannot_promote_native_public_formats(self):
        self.catalog['capabilities'][0]['public_receipts']=['unit'];self.save_catalog()
        with self.assertRaises(ValueError):self.audit()
        self.catalog['capabilities'][0]['public_receipts']=[];self.catalog['receipts']['unit']['domain']='external_synthetic';self.save_catalog()
        with self.assertRaises(ValueError):self.audit()
    def test_synthetic_or_none_inference_cannot_complete_real_mock_criterion(self):
        self.catalog['receipts']['unit']['inference']='synthetic';self.save_catalog()
        self.assertFalse(self.audit()['selected_target_complete'])
    def test_wrong_catalogue_or_public_stage_does_not_fall_back_to_easy_local(self):
        self.config['catalog_sha256']='f'*64;self.write('docs/acceptance-target.json',self.config)
        with self.assertRaises(ValueError):self.audit()
        self.save_catalog();s=selection(self.root,required_stage='public_testnet')
        self.assertFalse(native_audit(self.root,s)['selected_target_complete'])
    def inventory_fixture(self):
        other=self.root/'executor/other.py';other.write_text('# second reviewed source\n')
        self.report['source_sha256']['executor/other.py']=sha(other.read_bytes())
        raw=(json.dumps(self.report)+'\n').encode();digest=sha(raw)
        path=f'.artifacts/accepted-components/{digest}.json';(self.root/path).write_bytes(raw)
        receipt=self.catalog['receipts']['unit']
        receipt.update(artifact=path,sha256=digest)
        receipt.pop('minimum_source_files')
        receipt['source_inventory']={'sha256':sha(json.dumps(sorted(self.report['source_sha256']),separators=(',',':')).encode()),'count':2}
        self.save_catalog()
        return other
    def test_full_inventory_commitment_preserves_only_historical_bounded_coverage(self):
        self.inventory_fixture();r=self.audit();e=r['receipt_evidence']['unit']
        self.assertTrue(e['current_sources_match'])
        self.assertFalse(e['current_acceptance_eligible'])
        self.assertTrue(e['refresh_requires_new_reviewed_component'])
        self.assertTrue(r['capabilities'][0]['local_workflow_accepted_bounded'])
        self.assertFalse(r['selected_target_complete'])
    def test_full_inventory_missing_extra_or_renamed_keys_are_refused(self):
        self.inventory_fixture()
        for mutation in ('missing','extra','renamed'):
            report=copy.deepcopy(self.report)
            if mutation=='missing':report['source_sha256'].pop('executor/other.py')
            elif mutation=='extra':report['source_sha256']['executor/extra.py']='a'*64
            else:report['source_sha256']['executor/renamed.py']=report['source_sha256'].pop('executor/other.py')
            raw=(json.dumps(report)+'\n').encode();digest=sha(raw)
            path=f'.artifacts/accepted-components/{digest}.json';(self.root/path).write_bytes(raw)
            self.catalog['receipts']['unit'].update(artifact=path,sha256=digest);self.save_catalog()
            with self.assertRaisesRegex(ValueError,'full source inventory'):self.audit()
    def test_full_inventory_shape_hash_count_and_dual_definition_are_refused(self):
        self.inventory_fixture();original=copy.deepcopy(self.catalog['receipts']['unit'])
        for change in ({'count':True},{'count':0},{'count':1},{'sha256':'b'*64},{'sha256':'invalid'},{'hidden':True}):
            self.catalog['receipts']['unit']=copy.deepcopy(original)
            self.catalog['receipts']['unit']['source_inventory'].update(change);self.save_catalog()
            with self.assertRaises(ValueError):self.audit()
        self.catalog['receipts']['unit']=copy.deepcopy(original)
        self.catalog['receipts']['unit']['minimum_source_files']=['executor/source.py'];self.save_catalog()
        with self.assertRaises(ValueError):self.audit()
    def test_inventory_refresh_cannot_promote_new_source_without_new_component_review(self):
        other=self.inventory_fixture();self.source.write_text('# changed current source\n');other.write_text('# changed second source\n')
        fresh=copy.deepcopy(self.report)
        fresh['source_sha256']={name:sha((self.root/name).read_bytes())for name in fresh['source_sha256']}
        self.write('.artifacts/unit-e2e.json',fresh);r=self.audit();e=r['receipt_evidence']['unit']
        self.assertFalse(e['current_sources_match']);self.assertFalse(e['current_acceptance_eligible'])
        self.assertEqual(e['receipt_basis'],'reviewed_immutable_component')
        self.assertTrue(e['refresh_requires_new_reviewed_component']);self.assertFalse(r['selected_target_complete'])
    def test_structure_only_does_not_load_missing_component_or_claim_feature_acceptance(self):
        (self.root/self.catalog['receipts']['unit']['artifact']).unlink()
        r=native_structure(self.root,selection(self.root))
        self.assertEqual(r['capability_count'],44);self.assertTrue(r['baseline_link_valid'])
        self.assertFalse(r['workflow_acceptance_executed']);self.assertFalse(r['feature_completion_claimed'])
        with self.assertRaises(ValueError):self.audit()
    def test_repository_selection_reuses_exact_reports_without_cloud_or_public_promotion(self):
        s=selection(ROOT);r=native_audit(ROOT,s)
        self.assertEqual(r['capability_count'],44);self.assertGreaterEqual(r['bounded_components_reused'],20)
        self.assertGreaterEqual(r['locally_accepted_bounded_count'],28)
        self.assertFalse(r['cloud_enrollment_required']);self.assertFalse(r['public_observation_from_local'])
    def test_repository_native_directory_requires_full_mail_security_and_source_closure(self):
        catalogue=json.loads((ROOT/'docs/near-native-capabilities.json').read_text())
        receipt=catalogue['receipts']['native_mail']
        self.assertEqual(receipt['sha256'],'6ebb048a5271378f9801eb81bbfd1a14c7303029788d77d3afc575420bd18429')
        # Explicit immutable LOCAL proof sample; no catalogue-wide lookup fallback.
        fixture=ROOT/'fixtures/historical-components/6ebb048a5271378f9801eb81bbfd1a14c7303029788d77d3afc575420bd18429.json'
        raw=fixture.read_bytes();self.assertEqual(sha(raw),receipt['sha256']);report=json.loads(raw)
        self.assertEqual(set(receipt['required_checks']),set(report['checks']));self.assertEqual(len(receipt['required_checks']),17)
        self.assertEqual(set(receipt['minimum_source_files']),set(report['source_sha256']));self.assertEqual(len(receipt['minimum_source_files']),23)
        for name in ('contract/onchain/native_mail_directory.ts','web-chain/src/native-mail-directory.js','web-chain/vite.config.js'):
            self.assertIn(name,receipt['minimum_source_files'])
        self.assertEqual(receipt['completion_assertions'],{'passed':True,'lifecycle.owned_processes_stopped':True,'lifecycle.fixture_removed':True})
        row=next(x for x in catalogue['capabilities'] if x['id']=='lead_discovery')
        native=next(x for x in row['local_cases'] if x['id']=='lead_discovery.native_opt_in_directory')
        self.assertEqual(native['receipts'],['native_mail']);self.assertEqual(row['open_native_gaps'],[])
        self.assertEqual(row['public_receipts'],[])
        self.assertIn('does not revoke message acceptance',' '.join(row['declared_bounds']))

if __name__=='__main__':unittest.main()
