// Bounded inert PNG and silent self-contained AVC MP4 container validation.
import {assert,encode} from 'near-sdk-js';
export function decode64(value:string):Uint8Array {
 assert(typeof value==='string'&&value.length<=21848&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'canonical bounded asset base64 required');
 const data=encode(value),alphabet=encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),lut=new Int16Array(128);lut.fill(-1);for(let i=0;i<64;i++)lut[alphabet[i]]=i;
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,raw=new Uint8Array(value.length/4*3-padding);let at=0;
 for(let i=0;i<data.length;i+=4){const a=lut[data[i]],b=lut[data[i+1]],c=data[i+2]===61?0:lut[data[i+2]],d=data[i+3]===61?0:lut[data[i+3]];assert(a>=0&&b>=0&&c>=0&&d>=0,'asset base64 alphabet');raw[at++]=(a<<2)|(b>>>4);if(at<raw.length)raw[at++]=(b<<4)|(c>>>2);if(at<raw.length)raw[at++]=(c<<6)|d;}
 if(padding===2)assert((lut[data[data.length-3]]&15)===0,'noncanonical asset padding');if(padding===1)assert((lut[data[data.length-2]]&3)===0,'noncanonical asset padding');assert(raw.length>0&&raw.length<=16384,'asset must fit16KiB');return raw;
}
const u32=(b:Uint8Array,p:number)=>((b[p]*16777216)+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3]);
const u16=(b:Uint8Array,p:number)=>(b[p]<<8)|b[p+1];
const word=(b:Uint8Array,p:number)=>String.fromCharCode(b[p],b[p+1],b[p+2],b[p+3]);
export function pngInfo(raw:Uint8Array){
 assert(raw.length>=57&&raw[0]===137&&word(raw,1)==='PNG\r'&&raw[5]===10&&raw[6]===26&&raw[7]===10,'plain PNG signature required');
 const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
 let at=8,chunks=0,width=0,height=0,data=false,end=false;
 while(at<raw.length){assert(++chunks<=32&&at+12<=raw.length,'bounded PNG chunks');const n=u32(raw,at),type=word(raw,at+4);assert(n<=16384&&at+12+n<=raw.length,'PNG chunk bounds');let crc=0xffffffff;for(let i=at+4;i<at+8+n;i++)crc=table[(crc^raw[i])&255]^(crc>>>8);assert(((crc^0xffffffff)>>>0)===u32(raw,at+8+n),'PNG chunk CRC');
  if(chunks===1){assert(type==='IHDR'&&n===13,'PNG IHDR first');width=u32(raw,at+8);height=u32(raw,at+12);assert(width>=1&&height>=1&&width<=512&&height<=512&&raw[at+16]===8&&(raw[at+17]===2||raw[at+17]===6)&&raw[at+18]===0&&raw[at+19]===0&&raw[at+20]===0,'RGB/RGBA8 noninterlaced PNG<=512px');}
  else if(type==='IDAT'){assert(!end&&n>0,'PNG data required');data=true;}
  else {assert(type==='IEND'&&n===0&&data&&at+12===raw.length,'PNG metadata/extra data refused');end=true;}
  at+=n+12;
 }
 assert(end&&at===raw.length,'complete PNG required');return {width,height,duration_ms:0};
}
export function mp4Info(raw:Uint8Array){
 assert(raw.length>=64&&word(raw,4)==='ftyp','MP4 ftyp signature required');let boxes=0,ftyp=0,mdat=0,moov=0,tracks=0,timescale=0,duration=0,width=0,height=0,dref=0,avc=0,handler=0;
 function walk(start:number,end:number,parent:string){let at=start;while(at<end){assert(++boxes<=128&&at+8<=end,'bounded MP4 boxes');const n=u32(raw,at),type=word(raw,at+4);assert(n>=8&&at+n<=end,'MP4 box extent');const p=at+8;
  if(parent==='root'){assert(['ftyp','free','mdat','moov'].includes(type),'MP4 top-level box refused');if(type==='ftyp'){assert(++ftyp===1&&at===0&&n>=16&&n<=64&&['isom','iso2','mp41','mp42','avc1'].includes(word(raw,p)),'MP4 brand');}if(type==='mdat'){assert(++mdat===1&&n>8,'MP4 media payload');}if(type==='moov'){assert(++moov===1,'single movie');walk(p,at+n,type);}}
  else if(['moov','trak','mdia','minf','stbl','dinf','edts'].includes(parent)){
   const allowed:{[key:string]:string[]}={moov:['mvhd','trak'],trak:['tkhd','mdia','edts'],mdia:['mdhd','hdlr','minf'],minf:['vmhd','dinf','stbl'],stbl:['stsd','stts','stss','ctts','stsc','stsz','stco','co64'],dinf:['dref'],edts:['elst']};assert(allowed[parent].includes(type),'MP4 metadata/track box refused');
   if(type==='trak'){assert(++tracks===1,'one silent video track');walk(p,at+n,type);}else if(['mdia','minf','stbl','dinf','edts'].includes(type))walk(p,at+n,type);
   else if(type==='mdhd'){assert(n>=32&&raw[p]===0,'MP4 v0 media header');timescale=u32(raw,p+12);duration=u32(raw,p+16);assert(timescale>0&&duration>0&&duration<=timescale*10,'MP4 duration<=10s');}
   else if(type==='hdlr'){assert(n>=32&&word(raw,p+8)==='vide','silent video handler');handler++;}
   else if(type==='dref'){assert(n===28&&u32(raw,p)===0&&u32(raw,p+4)===1&&u32(raw,p+8)===12&&word(raw,p+12)==='url '&&u32(raw,p+16)===1,'self-contained MP4 data only');dref++;}
   else if(type==='stsd'){assert(n>=102&&u32(raw,p)===0&&u32(raw,p+4)===1,'one video description');const q=p+8,size=u32(raw,q);assert(size>=86&&q+size===at+n&&word(raw,q+4)==='avc1'&&u16(raw,q+14)===1,'AVC1 self-contained sample');width=u16(raw,q+32);height=u16(raw,q+34);assert(width>=1&&height>=1&&width<=512&&height<=512,'video<=512px');let c=q+86;while(c<q+size){assert(c+8<=q+size&&++boxes<=128,'AVC box bounds');const len=u32(raw,c),name=word(raw,c+4);assert(len>=8&&c+len<=q+size&&['avcC','pasp','btrt'].includes(name),'AVC configuration only');if(name==='avcC'){assert(len>=15&&raw[c+8]===1,'AVC configuration');avc++;}c+=len;}assert(c===q+size,'AVC complete');}
   else if(type==='stsz'){assert(n>=20,'sample sizes');const count=u32(raw,p+8);assert(count>=1&&count<=600,'video sample count');}
  }else assert(false,'MP4 container refused');at+=n;
 }assert(at===end,'complete MP4 boxes');}
 walk(0,raw.length,'root');assert(ftyp===1&&mdat===1&&moov===1&&tracks===1&&handler===1&&dref===1&&avc===1&&timescale>0&&width>0,'complete silent AVC movie');return {width,height,duration_ms:Math.floor(duration*1000/timescale)};
}
