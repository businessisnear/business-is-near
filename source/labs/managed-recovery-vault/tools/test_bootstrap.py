"""New synthetic temp config only; no server, wallet, key, RPC or user state."""
import json,tempfile,unittest
from pathlib import Path
from bootstrap import prepare,AuthenticationError
class BootstrapTests(unittest.TestCase):
    def test_protected_create_and_exact_reuse_without_key_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();pins=root/'pins.json';pins.write_text(json.dumps({'network':'testnet','chain_id':'testnet','rpc_url':'https://rpc.testnet.near.org','genesis_height':0,'genesis_hash':'1'*32,'companies':{'company.testnet':'1'*31+'2'},'sandbox':False}));state=root/'state';path,new=prepare(pins,state,18902);self.assertTrue(new);self.assertEqual(path.stat().st_mode&0o777,0o600);self.assertFalse((state/'vault-data').exists());self.assertEqual(prepare(pins,state,18902),(path,False))
            with self.assertRaises(AuthenticationError):prepare(pins,state,18903)
            self.assertEqual(json.loads(path.read_text())['port'],18902)
if __name__=='__main__':unittest.main()
