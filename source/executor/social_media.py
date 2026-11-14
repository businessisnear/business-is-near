"""Owner-supplied content-addressed bytes; fixed local decoders, no upload code."""
from pathlib import Path
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from executor.delivery import private_directory,private_read
from executor.gmail_delivery import sha
from executor.social_protocol import SocialError,exact

MAX_MEDIA=8*1024*1024
class SocialMedia:
    def __init__(self,root):self.root=private_directory(root)
    def read(self,descriptor,provider):
        exact(descriptor,('sha256','mime_type','bytes'))
        digest=descriptor['sha256']
        if not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest):raise SocialError('Exact approved media hash required')
        if type(descriptor['bytes']) is not int or not 1<=descriptor['bytes']<=MAX_MEDIA:raise SocialError('Bounded approved media size required')
        raw=private_read(self.root/digest,MAX_MEDIA)
        if sha(raw)!=digest or len(raw)!=descriptor['bytes']:raise SocialError('Actual media bytes differ from owner approval')
        mime=descriptor['mime_type']
        if provider in ('instagram','pinterest'):
            if mime not in (('image/jpeg',) if provider=='instagram' else ('image/jpeg','image/png')):raise SocialError('Unsupported social image MIME')
            self._image(raw,mime)
        elif provider in ('tiktok','youtube'):
            if mime!='video/mp4':raise SocialError('Only bounded H.264 MP4 is implemented')
            self._video(raw)
        else:raise SocialError('Text-only provider does not accept media')
        return raw
    def _image(self,raw,mime):
        if len(raw)>256*1024:raise SocialError('Image limit is 256 KiB')
        # Reuse the already bounded, independent container + installed ImageIO
        # decoder. It exposes no command, executable, path, or flags to an intent.
        from executor.media_analysis import validate_image
        try:info=validate_image(raw,mime)
        except Exception as e:raise SocialError('Installed bounded image validation failed') from e
        if not 320<=info['width']<=512 or not 320<=info['height']<=512:raise SocialError('Implemented social image dimensions are 320..512 pixels')
    def _video(self,raw):
        # Reject truncated/overlapping ISO-BMFF containers before native decode.
        offset=0;types=[]
        while offset<len(raw):
            if offset+8>len(raw):raise SocialError('Truncated MP4 box')
            size,kind=struct.unpack('>I4s',raw[offset:offset+8]);header=8
            if size==1:
                if offset+16>len(raw):raise SocialError('Truncated MP4 extended box')
                size=struct.unpack('>Q',raw[offset+8:offset+16])[0];header=16
            if size<header or offset+size>len(raw) or len(types)>64:raise SocialError('Invalid bounded MP4 container')
            types.append(kind);offset+=size
        if offset!=len(raw) or not all(x in types for x in (b'ftyp',b'moov',b'mdat')):raise SocialError('Complete MP4 movie required')
        executable=next((p for p in ('/opt/homebrew/bin/ffprobe','/usr/bin/ffprobe') if Path(p).is_file()),None)
        if executable is None:raise SocialError('Installed fixed ffprobe validator required; no dependency installation')
        with tempfile.TemporaryDirectory(prefix='social-video-validate-') as temp:
            root=Path(temp);root.chmod(0o700);source=root/'approved.mp4';source.write_bytes(raw);source.chmod(0o600)
            try:r=subprocess.run([executable,'-v','error','-show_entries','stream=codec_name,codec_type,r_frame_rate,width,height:format=duration','-of','json',str(source)],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin'},timeout=10,check=True)
            except (OSError,subprocess.SubprocessError) as e:raise SocialError('MP4 validation failed') from e
            if r.stderr or len(r.stdout)>8192:raise SocialError('Invalid bounded MP4 probe')
            try:
                data=json.loads(r.stdout);streams=data['streams'];videos=[s for s in streams if s.get('codec_type')=='video'];duration=float(data['format']['duration'])
                if len(videos)!=1 or len(streams)>2 or not 0<duration<=60:raise ValueError()
                video=videos[0];num,den=map(int,video['r_frame_rate'].split('/'));fps=num/den
                if video['codec_name']!='h264' or not 23<=fps<=60 or not 360<=video['width']<=4096 or not 360<=video['height']<=4096 or any(s.get('codec_type') not in ('audio','video') or s.get('codec_type')=='audio' and s.get('codec_name')!='aac' for s in streams):raise ValueError()
            except Exception as e:raise SocialError('Only H.264 MP4, optional AAC, 23..60 FPS, 360..4096 pixels and <=60 seconds are implemented') from e
