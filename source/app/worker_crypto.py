"""Local worker delegation encryption. Not a hardware security boundary."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

_B64 = re.compile(r'^[A-Za-z0-9+/]*={0,2}$')
_ID = re.compile(r'^[A-Za-z0-9_-]{1,64}$')

def _enc(data): return base64.b64encode(data).decode('ascii')
def _dec(data):
    if not isinstance(data, str) or len(data) % 4 or not _B64.fullmatch(data): raise ValueError('Invalid encoding')
    try: return base64.b64decode(data, validate=True)
    except Exception as exc: raise ValueError('Invalid encoding') from exc

def _password(key):
    if not isinstance(key,str) or not 12 <= len(key) <= 256: raise ValueError('Invalid record key')
    return key.encode('utf-8')

def _derive(key,salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=600000).derive(_password(key))

def encrypt(text,key):
    if not isinstance(text,str) or not text or len(text.encode('utf-8')) > 6000: raise ValueError('Invalid plaintext size')
    salt,iv=os.urandom(16),os.urandom(12)
    cipher=AESGCM(_derive(key,salt)).encrypt(iv,text.encode('utf-8'),None)
    envelope=json.dumps({'v':1,'alg':'AES-256-GCM','kdf':'PBKDF2-SHA256','iterations':600000,'salt':_enc(salt),'iv':_enc(iv),'ciphertext':_enc(cipher)},separators=(',',':'),ensure_ascii=True)
    if len(envelope)>8192: raise ValueError('Envelope too large')
    return {'envelope':envelope,'hash':hashlib.sha256(envelope.encode('utf-8')).hexdigest()}

def decrypt(envelope,key):
    if not isinstance(envelope,str) or not 100<=len(envelope)<=8192 or not re.fullmatch(r'[\x20-\x7e]+',envelope): raise ValueError('Invalid envelope')
    try:
        obj=json.loads(envelope)
        if not isinstance(obj,dict) or set(obj)!={'v','alg','kdf','iterations','salt','iv','ciphertext'} or type(obj['v']) is not int or obj['v']!=1 or obj['alg']!='AES-256-GCM' or obj['kdf']!='PBKDF2-SHA256' or type(obj['iterations']) is not int or obj['iterations']!=600000: raise ValueError()
        salt,iv,cipher=(_dec(obj[name]) for name in ('salt','iv','ciphertext'))
        if len(salt)!=16 or len(iv)!=12 or len(cipher)<16: raise ValueError()
        return AESGCM(_derive(key,salt)).decrypt(iv,cipher,None).decode('utf-8')
    except Exception as exc: raise ValueError('Unable to decrypt envelope') from exc

class WorkerVault:
    def __init__(self, private_dir):
        self.path=Path(private_dir)
        self.path.mkdir(mode=0o700,parents=True,exist_ok=True)
        st=self.path.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_mode & 0o077 or st.st_uid != os.getuid(): raise ValueError('Vault directory must be private and owned by current user')
        self.master=self._load_or_create('master.key',lambda:os.urandom(32))
        raw=self._load_or_create('launch.pem',lambda:rsa.generate_private_key(public_exponent=65537,key_size=4096).private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        self.private=serialization.load_pem_private_key(raw,password=None)
        if len(self.master)!=32 or not isinstance(self.private,rsa.RSAPrivateKey) or self.private.key_size!=4096: raise ValueError('Invalid vault keys')

    def _read(self,name):
        fd=os.open(self.path/name,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077 or st.st_uid != os.getuid() or st.st_size>16384: raise ValueError('Unsafe vault file')
            with os.fdopen(fd,'rb',closefd=False) as f: return f.read()
        finally: os.close(fd)

    def _load_or_create(self,name,factory):
        try: return self._read(name)
        except FileNotFoundError: pass
        data=factory()
        try: fd=os.open(self.path/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
        except FileExistsError: return self._read(name)
        with os.fdopen(fd,'wb') as f: f.write(data);f.flush();os.fsync(f.fileno())
        return data

    def public_info(self):
        nums=self.private.public_key().public_numbers()
        def u(n): return base64.urlsafe_b64encode(n.to_bytes((n.bit_length()+7)//8,'big')).rstrip(b'=').decode('ascii')
        jwk={'kty':'RSA','n':u(nums.n),'e':u(nums.e),'alg':'RSA-OAEP-256','ext':True,'key_ops':['encrypt']}
        der=self.private.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
        return {'public_jwk':jwk,'key_id':hashlib.sha256(der).hexdigest()}

    def open_launch(self,sealed,key_id):
        if key_id!=self.public_info()['key_id']: raise ValueError('Unknown worker key')
        try:
            raw=_dec(sealed)
            if len(raw)!=512: raise ValueError()
            plain=self.private.decrypt(raw,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
            obj=json.loads(plain.decode('utf-8'))
            if not isinstance(obj,dict) or not set(obj)<= {'record_key','idea','goal'} or 'record_key' not in obj: raise ValueError()
            _password(obj['record_key'])
            for name in ('idea','goal'):
                if name in obj and (not isinstance(obj[name],str) or len(obj[name].encode('utf-8'))>256): raise ValueError()
            return obj
        except Exception as exc: raise ValueError('Invalid sealed launch') from exc

    def store(self,run_id,record_key):
        if not isinstance(run_id,str) or not _ID.fullmatch(run_id): raise ValueError('Invalid run ID')
        data=_password(record_key);iv=os.urandom(12)
        content=iv+AESGCM(self.master).encrypt(iv,data,run_id.encode())
        target=self.path/('run-'+run_id+'.vault')
        if target.is_symlink(): raise ValueError('Unsafe vault file')
        fd,tmp=tempfile.mkstemp(dir=self.path,prefix='.vault-')
        try:
            with os.fdopen(fd,'wb') as f: f.write(content);f.flush();os.fsync(f.fileno())
            os.replace(tmp,target)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)

    def load(self,run_id):
        if not isinstance(run_id,str) or not _ID.fullmatch(run_id): raise ValueError('Invalid run ID')
        try:
            raw=self._read('run-'+run_id+'.vault')
            value=AESGCM(self.master).decrypt(raw[:12],raw[12:],run_id.encode()).decode('utf-8');_password(value);return value
        except FileNotFoundError: raise
        except Exception as exc: raise ValueError('Unable to open vault record') from exc

    encrypt=staticmethod(encrypt)
    decrypt=staticmethod(decrypt)
