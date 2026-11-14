import{E as al,t as A,d as il}from"./index-NKs1wSuU.js";import{q as sl}from"./sha256-B7vnFrgq.js";var jt,Zn;function ll(){return Zn||(Zn=1,jt=function(){var e=document.getSelection();if(!e.rangeCount)return function(){};for(var t=document.activeElement,r=[],n=0;n<e.rangeCount;n++)r.push(e.getRangeAt(n));switch(t.tagName.toUpperCase()){case"INPUT":case"TEXTAREA":t.blur();break;default:t=null;break}return e.removeAllRanges(),function(){e.type==="Caret"&&e.removeAllRanges(),e.rangeCount||r.forEach(function(o){e.addRange(o)}),t&&t.focus()}}),jt}var Ft,zn;function cl(){if(zn)return Ft;zn=1;var e=ll(),t={"text/plain":"Text","text/html":"Url",default:"Text"},r="Copy to clipboard: #{key}, Enter";function n(a){var i=(/mac os x/i.test(navigator.userAgent)?"⌘":"Ctrl")+"+C";return a.replace(/#{\s*key\s*}/g,i)}function o(a,i){var s,l,c,u,v,d,h=!1;i||(i={}),s=i.debug||!1;try{c=e(),u=document.createRange(),v=document.getSelection(),d=document.createElement("span"),d.textContent=a,d.ariaHidden="true",d.style.all="unset",d.style.position="fixed",d.style.top=0,d.style.clip="rect(0, 0, 0, 0)",d.style.whiteSpace="pre",d.style.webkitUserSelect="text",d.style.MozUserSelect="text",d.style.msUserSelect="text",d.style.userSelect="text",d.addEventListener("copy",function(g){if(g.stopPropagation(),i.format)if(g.preventDefault(),typeof g.clipboardData>"u"){s&&console.warn("unable to use e.clipboardData"),s&&console.warn("trying IE specific stuff"),window.clipboardData.clearData();var P=t[i.format]||t.default;window.clipboardData.setData(P,a)}else g.clipboardData.clearData(),g.clipboardData.setData(i.format,a);i.onCopy&&(g.preventDefault(),i.onCopy(g.clipboardData))}),document.body.appendChild(d),u.selectNodeContents(d),v.addRange(u);var y=document.execCommand("copy");if(!y)throw new Error("copy command was unsuccessful");h=!0}catch(g){s&&console.error("unable to copy using execCommand: ",g),s&&console.warn("trying IE specific stuff");try{window.clipboardData.setData(i.format||"text",a),i.onCopy&&i.onCopy(window.clipboardData),h=!0}catch(P){s&&console.error("unable to copy using clipboardData: ",P),s&&console.error("falling back to prompt"),l=n("message"in i?i.message:r),window.prompt(l,a)}}finally{v&&(typeof v.removeRange=="function"?v.removeRange(u):v.removeAllRanges()),d&&document.body.removeChild(d),c()}return h}return Ft=o,Ft}var ul=cl();const dl=sl(ul);var ge={},Ut,Yn;function vl(){return Yn||(Yn=1,Ut=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}),Ut}var xt={},re={},Jn;function de(){if(Jn)return re;Jn=1;let e;const t=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];return re.getSymbolSize=function(n){if(!n)throw new Error('"version" cannot be null or undefined');if(n<1||n>40)throw new Error('"version" should be in range from 1 to 40');return n*4+17},re.getSymbolTotalCodewords=function(n){return t[n]},re.getBCHDigit=function(r){let n=0;for(;r!==0;)n++,r>>>=1;return n},re.setToSJISFunction=function(n){if(typeof n!="function")throw new Error('"toSJISFunc" is not a valid function.');e=n},re.isKanjiModeEnabled=function(){return typeof e<"u"},re.toSJIS=function(n){return e(n)},re}var qt={},Qn;function vn(){return Qn||(Qn=1,(function(e){e.L={bit:1},e.M={bit:0},e.Q={bit:3},e.H={bit:2};function t(r){if(typeof r!="string")throw new Error("Param is not a string");switch(r.toLowerCase()){case"l":case"low":return e.L;case"m":case"medium":return e.M;case"q":case"quartile":return e.Q;case"h":case"high":return e.H;default:throw new Error("Unknown EC Level: "+r)}}e.isValid=function(n){return n&&typeof n.bit<"u"&&n.bit>=0&&n.bit<4},e.from=function(n,o){if(e.isValid(n))return n;try{return t(n)}catch{return o}}})(qt)),qt}var Vt,Xn;function fl(){if(Xn)return Vt;Xn=1;function e(){this.buffer=[],this.length=0}return e.prototype={get:function(t){const r=Math.floor(t/8);return(this.buffer[r]>>>7-t%8&1)===1},put:function(t,r){for(let n=0;n<r;n++)this.putBit((t>>>r-n-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(t){const r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}},Vt=e,Vt}var Ht,eo;function hl(){if(eo)return Ht;eo=1;function e(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}return e.prototype.set=function(t,r,n,o){const a=t*this.size+r;this.data[a]=n,o&&(this.reservedBit[a]=!0)},e.prototype.get=function(t,r){return this.data[t*this.size+r]},e.prototype.xor=function(t,r,n){this.data[t*this.size+r]^=n},e.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]},Ht=e,Ht}var Gt={},to;function gl(){return to||(to=1,(function(e){const t=de().getSymbolSize;e.getRowColCoords=function(n){if(n===1)return[];const o=Math.floor(n/7)+2,a=t(n),i=a===145?26:Math.ceil((a-13)/(2*o-2))*2,s=[a-7];for(let l=1;l<o-1;l++)s[l]=s[l-1]-i;return s.push(6),s.reverse()},e.getPositions=function(n){const o=[],a=e.getRowColCoords(n),i=a.length;for(let s=0;s<i;s++)for(let l=0;l<i;l++)s===0&&l===0||s===0&&l===i-1||s===i-1&&l===0||o.push([a[s],a[l]]);return o}})(Gt)),Gt}var Kt={},ro;function pl(){if(ro)return Kt;ro=1;const e=de().getSymbolSize,t=7;return Kt.getPositions=function(n){const o=e(n);return[[0,0],[o-t,0],[0,o-t]]},Kt}var Wt={},no;function yl(){return no||(no=1,(function(e){e.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};const t={N1:3,N2:3,N3:40,N4:10};e.isValid=function(o){return o!=null&&o!==""&&!isNaN(o)&&o>=0&&o<=7},e.from=function(o){return e.isValid(o)?parseInt(o,10):void 0},e.getPenaltyN1=function(o){const a=o.size;let i=0,s=0,l=0,c=null,u=null;for(let v=0;v<a;v++){s=l=0,c=u=null;for(let d=0;d<a;d++){let h=o.get(v,d);h===c?s++:(s>=5&&(i+=t.N1+(s-5)),c=h,s=1),h=o.get(d,v),h===u?l++:(l>=5&&(i+=t.N1+(l-5)),u=h,l=1)}s>=5&&(i+=t.N1+(s-5)),l>=5&&(i+=t.N1+(l-5))}return i},e.getPenaltyN2=function(o){const a=o.size;let i=0;for(let s=0;s<a-1;s++)for(let l=0;l<a-1;l++){const c=o.get(s,l)+o.get(s,l+1)+o.get(s+1,l)+o.get(s+1,l+1);(c===4||c===0)&&i++}return i*t.N2},e.getPenaltyN3=function(o){const a=o.size;let i=0,s=0,l=0;for(let c=0;c<a;c++){s=l=0;for(let u=0;u<a;u++)s=s<<1&2047|o.get(c,u),u>=10&&(s===1488||s===93)&&i++,l=l<<1&2047|o.get(u,c),u>=10&&(l===1488||l===93)&&i++}return i*t.N3},e.getPenaltyN4=function(o){let a=0;const i=o.data.length;for(let l=0;l<i;l++)a+=o.data[l];return Math.abs(Math.ceil(a*100/i/5)-10)*t.N4};function r(n,o,a){switch(n){case e.Patterns.PATTERN000:return(o+a)%2===0;case e.Patterns.PATTERN001:return o%2===0;case e.Patterns.PATTERN010:return a%3===0;case e.Patterns.PATTERN011:return(o+a)%3===0;case e.Patterns.PATTERN100:return(Math.floor(o/2)+Math.floor(a/3))%2===0;case e.Patterns.PATTERN101:return o*a%2+o*a%3===0;case e.Patterns.PATTERN110:return(o*a%2+o*a%3)%2===0;case e.Patterns.PATTERN111:return(o*a%3+(o+a)%2)%2===0;default:throw new Error("bad maskPattern:"+n)}}e.applyMask=function(o,a){const i=a.size;for(let s=0;s<i;s++)for(let l=0;l<i;l++)a.isReserved(l,s)||a.xor(l,s,r(o,l,s))},e.getBestMask=function(o,a){const i=Object.keys(e.Patterns).length;let s=0,l=1/0;for(let c=0;c<i;c++){a(c),e.applyMask(c,o);const u=e.getPenaltyN1(o)+e.getPenaltyN2(o)+e.getPenaltyN3(o)+e.getPenaltyN4(o);e.applyMask(c,o),u<l&&(l=u,s=c)}return s}})(Wt)),Wt}var Je={},oo;function yi(){if(oo)return Je;oo=1;const e=vn(),t=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],r=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];return Je.getBlocksCount=function(o,a){switch(a){case e.L:return t[(o-1)*4+0];case e.M:return t[(o-1)*4+1];case e.Q:return t[(o-1)*4+2];case e.H:return t[(o-1)*4+3];default:return}},Je.getTotalCodewordsCount=function(o,a){switch(a){case e.L:return r[(o-1)*4+0];case e.M:return r[(o-1)*4+1];case e.Q:return r[(o-1)*4+2];case e.H:return r[(o-1)*4+3];default:return}},Je}var Zt={},Le={},ao;function ml(){if(ao)return Le;ao=1;const e=new Uint8Array(512),t=new Uint8Array(256);return(function(){let n=1;for(let o=0;o<255;o++)e[o]=n,t[n]=o,n<<=1,n&256&&(n^=285);for(let o=255;o<512;o++)e[o]=e[o-255]})(),Le.log=function(n){if(n<1)throw new Error("log("+n+")");return t[n]},Le.exp=function(n){return e[n]},Le.mul=function(n,o){return n===0||o===0?0:e[t[n]+t[o]]},Le}var io;function wl(){return io||(io=1,(function(e){const t=ml();e.mul=function(n,o){const a=new Uint8Array(n.length+o.length-1);for(let i=0;i<n.length;i++)for(let s=0;s<o.length;s++)a[i+s]^=t.mul(n[i],o[s]);return a},e.mod=function(n,o){let a=new Uint8Array(n);for(;a.length-o.length>=0;){const i=a[0];for(let l=0;l<o.length;l++)a[l]^=t.mul(o[l],i);let s=0;for(;s<a.length&&a[s]===0;)s++;a=a.slice(s)}return a},e.generateECPolynomial=function(n){let o=new Uint8Array([1]);for(let a=0;a<n;a++)o=e.mul(o,new Uint8Array([1,t.exp(a)]));return o}})(Zt)),Zt}var zt,so;function bl(){if(so)return zt;so=1;const e=wl();function t(r){this.genPoly=void 0,this.degree=r,this.degree&&this.initialize(this.degree)}return t.prototype.initialize=function(n){this.degree=n,this.genPoly=e.generateECPolynomial(this.degree)},t.prototype.encode=function(n){if(!this.genPoly)throw new Error("Encoder not initialized");const o=new Uint8Array(n.length+this.degree);o.set(n);const a=e.mod(o,this.genPoly),i=this.degree-a.length;if(i>0){const s=new Uint8Array(this.degree);return s.set(a,i),s}return a},zt=t,zt}var Yt={},Jt={},Qt={},lo;function mi(){return lo||(lo=1,Qt.isValid=function(t){return!isNaN(t)&&t>=1&&t<=40}),Qt}var Z={},co;function wi(){if(co)return Z;co=1;const e="[0-9]+",t="[A-Z $%*+\\-./:]+";let r="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";r=r.replace(/u/g,"\\u");const n="(?:(?![A-Z0-9 $%*+\\-./:]|"+r+`)(?:.|[\r
]))+`;Z.KANJI=new RegExp(r,"g"),Z.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g"),Z.BYTE=new RegExp(n,"g"),Z.NUMERIC=new RegExp(e,"g"),Z.ALPHANUMERIC=new RegExp(t,"g");const o=new RegExp("^"+r+"$"),a=new RegExp("^"+e+"$"),i=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");return Z.testKanji=function(l){return o.test(l)},Z.testNumeric=function(l){return a.test(l)},Z.testAlphanumeric=function(l){return i.test(l)},Z}var uo;function ve(){return uo||(uo=1,(function(e){const t=mi(),r=wi();e.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},e.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},e.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},e.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},e.MIXED={bit:-1},e.getCharCountIndicator=function(a,i){if(!a.ccBits)throw new Error("Invalid mode: "+a);if(!t.isValid(i))throw new Error("Invalid version: "+i);return i>=1&&i<10?a.ccBits[0]:i<27?a.ccBits[1]:a.ccBits[2]},e.getBestModeForData=function(a){return r.testNumeric(a)?e.NUMERIC:r.testAlphanumeric(a)?e.ALPHANUMERIC:r.testKanji(a)?e.KANJI:e.BYTE},e.toString=function(a){if(a&&a.id)return a.id;throw new Error("Invalid mode")},e.isValid=function(a){return a&&a.bit&&a.ccBits};function n(o){if(typeof o!="string")throw new Error("Param is not a string");switch(o.toLowerCase()){case"numeric":return e.NUMERIC;case"alphanumeric":return e.ALPHANUMERIC;case"kanji":return e.KANJI;case"byte":return e.BYTE;default:throw new Error("Unknown mode: "+o)}}e.from=function(a,i){if(e.isValid(a))return a;try{return n(a)}catch{return i}}})(Jt)),Jt}var vo;function Cl(){return vo||(vo=1,(function(e){const t=de(),r=yi(),n=vn(),o=ve(),a=mi(),i=7973,s=t.getBCHDigit(i);function l(d,h,y){for(let g=1;g<=40;g++)if(h<=e.getCapacity(g,y,d))return g}function c(d,h){return o.getCharCountIndicator(d,h)+4}function u(d,h){let y=0;return d.forEach(function(g){const P=c(g.mode,h);y+=P+g.getBitsLength()}),y}function v(d,h){for(let y=1;y<=40;y++)if(u(d,y)<=e.getCapacity(y,h,o.MIXED))return y}e.from=function(h,y){return a.isValid(h)?parseInt(h,10):y},e.getCapacity=function(h,y,g){if(!a.isValid(h))throw new Error("Invalid QR Code version");typeof g>"u"&&(g=o.BYTE);const P=t.getSymbolTotalCodewords(h),m=r.getTotalCodewordsCount(h,y),b=(P-m)*8;if(g===o.MIXED)return b;const L=b-c(g,h);switch(g){case o.NUMERIC:return Math.floor(L/10*3);case o.ALPHANUMERIC:return Math.floor(L/11*2);case o.KANJI:return Math.floor(L/13);case o.BYTE:default:return Math.floor(L/8)}},e.getBestVersionForData=function(h,y){let g;const P=n.from(y,n.M);if(Array.isArray(h)){if(h.length>1)return v(h,P);if(h.length===0)return 1;g=h[0]}else g=h;return l(g.mode,g.getLength(),P)},e.getEncodedBits=function(h){if(!a.isValid(h)||h<7)throw new Error("Invalid QR Code version");let y=h<<12;for(;t.getBCHDigit(y)-s>=0;)y^=i<<t.getBCHDigit(y)-s;return h<<12|y}})(Yt)),Yt}var Xt={},fo;function $l(){if(fo)return Xt;fo=1;const e=de(),t=1335,r=21522,n=e.getBCHDigit(t);return Xt.getEncodedBits=function(a,i){const s=a.bit<<3|i;let l=s<<10;for(;e.getBCHDigit(l)-n>=0;)l^=t<<e.getBCHDigit(l)-n;return(s<<10|l)^r},Xt}var er={},tr,ho;function El(){if(ho)return tr;ho=1;const e=ve();function t(r){this.mode=e.NUMERIC,this.data=r.toString()}return t.getBitsLength=function(n){return 10*Math.floor(n/3)+(n%3?n%3*3+1:0)},t.prototype.getLength=function(){return this.data.length},t.prototype.getBitsLength=function(){return t.getBitsLength(this.data.length)},t.prototype.write=function(n){let o,a,i;for(o=0;o+3<=this.data.length;o+=3)a=this.data.substr(o,3),i=parseInt(a,10),n.put(i,10);const s=this.data.length-o;s>0&&(a=this.data.substr(o),i=parseInt(a,10),n.put(i,s*3+1))},tr=t,tr}var rr,go;function Tl(){if(go)return rr;go=1;const e=ve(),t=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function r(n){this.mode=e.ALPHANUMERIC,this.data=n}return r.getBitsLength=function(o){return 11*Math.floor(o/2)+6*(o%2)},r.prototype.getLength=function(){return this.data.length},r.prototype.getBitsLength=function(){return r.getBitsLength(this.data.length)},r.prototype.write=function(o){let a;for(a=0;a+2<=this.data.length;a+=2){let i=t.indexOf(this.data[a])*45;i+=t.indexOf(this.data[a+1]),o.put(i,11)}this.data.length%2&&o.put(t.indexOf(this.data[a]),6)},rr=r,rr}var nr,po;function Il(){if(po)return nr;po=1;const e=ve();function t(r){this.mode=e.BYTE,typeof r=="string"?this.data=new TextEncoder().encode(r):this.data=new Uint8Array(r)}return t.getBitsLength=function(n){return n*8},t.prototype.getLength=function(){return this.data.length},t.prototype.getBitsLength=function(){return t.getBitsLength(this.data.length)},t.prototype.write=function(r){for(let n=0,o=this.data.length;n<o;n++)r.put(this.data[n],8)},nr=t,nr}var or,yo;function Sl(){if(yo)return or;yo=1;const e=ve(),t=de();function r(n){this.mode=e.KANJI,this.data=n}return r.getBitsLength=function(o){return o*13},r.prototype.getLength=function(){return this.data.length},r.prototype.getBitsLength=function(){return r.getBitsLength(this.data.length)},r.prototype.write=function(n){let o;for(o=0;o<this.data.length;o++){let a=t.toSJIS(this.data[o]);if(a>=33088&&a<=40956)a-=33088;else if(a>=57408&&a<=60351)a-=49472;else throw new Error("Invalid SJIS character: "+this.data[o]+`
Make sure your charset is UTF-8`);a=(a>>>8&255)*192+(a&255),n.put(a,13)}},or=r,or}var ar={exports:{}},mo;function Rl(){return mo||(mo=1,(function(e){var t={single_source_shortest_paths:function(r,n,o){var a={},i={};i[n]=0;var s=t.PriorityQueue.make();s.push(n,0);for(var l,c,u,v,d,h,y,g,P;!s.empty();){l=s.pop(),c=l.value,v=l.cost,d=r[c]||{};for(u in d)d.hasOwnProperty(u)&&(h=d[u],y=v+h,g=i[u],P=typeof i[u]>"u",(P||g>y)&&(i[u]=y,s.push(u,y),a[u]=c))}if(typeof o<"u"&&typeof i[o]>"u"){var m=["Could not find a path from ",n," to ",o,"."].join("");throw new Error(m)}return a},extract_shortest_path_from_predecessor_list:function(r,n){for(var o=[],a=n;a;)o.push(a),r[a],a=r[a];return o.reverse(),o},find_path:function(r,n,o){var a=t.single_source_shortest_paths(r,n,o);return t.extract_shortest_path_from_predecessor_list(a,o)},PriorityQueue:{make:function(r){var n=t.PriorityQueue,o={},a;r=r||{};for(a in n)n.hasOwnProperty(a)&&(o[a]=n[a]);return o.queue=[],o.sorter=r.sorter||n.default_sorter,o},default_sorter:function(r,n){return r.cost-n.cost},push:function(r,n){var o={value:r,cost:n};this.queue.push(o),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return this.queue.length===0}}};e.exports=t})(ar)),ar.exports}var wo;function Ll(){return wo||(wo=1,(function(e){const t=ve(),r=El(),n=Tl(),o=Il(),a=Sl(),i=wi(),s=de(),l=Rl();function c(m){return unescape(encodeURIComponent(m)).length}function u(m,b,L){const S=[];let N;for(;(N=m.exec(L))!==null;)S.push({data:N[0],index:N.index,mode:b,length:N[0].length});return S}function v(m){const b=u(i.NUMERIC,t.NUMERIC,m),L=u(i.ALPHANUMERIC,t.ALPHANUMERIC,m);let S,N;return s.isKanjiModeEnabled()?(S=u(i.BYTE,t.BYTE,m),N=u(i.KANJI,t.KANJI,m)):(S=u(i.BYTE_KANJI,t.BYTE,m),N=[]),b.concat(L,S,N).sort(function(T,E){return T.index-E.index}).map(function(T){return{data:T.data,mode:T.mode,length:T.length}})}function d(m,b){switch(b){case t.NUMERIC:return r.getBitsLength(m);case t.ALPHANUMERIC:return n.getBitsLength(m);case t.KANJI:return a.getBitsLength(m);case t.BYTE:return o.getBitsLength(m)}}function h(m){return m.reduce(function(b,L){const S=b.length-1>=0?b[b.length-1]:null;return S&&S.mode===L.mode?(b[b.length-1].data+=L.data,b):(b.push(L),b)},[])}function y(m){const b=[];for(let L=0;L<m.length;L++){const S=m[L];switch(S.mode){case t.NUMERIC:b.push([S,{data:S.data,mode:t.ALPHANUMERIC,length:S.length},{data:S.data,mode:t.BYTE,length:S.length}]);break;case t.ALPHANUMERIC:b.push([S,{data:S.data,mode:t.BYTE,length:S.length}]);break;case t.KANJI:b.push([S,{data:S.data,mode:t.BYTE,length:c(S.data)}]);break;case t.BYTE:b.push([{data:S.data,mode:t.BYTE,length:c(S.data)}])}}return b}function g(m,b){const L={},S={start:{}};let N=["start"];for(let w=0;w<m.length;w++){const T=m[w],E=[];for(let p=0;p<T.length;p++){const R=T[p],C=""+w+p;E.push(C),L[C]={node:R,lastCount:0},S[C]={};for(let I=0;I<N.length;I++){const $=N[I];L[$]&&L[$].node.mode===R.mode?(S[$][C]=d(L[$].lastCount+R.length,R.mode)-d(L[$].lastCount,R.mode),L[$].lastCount+=R.length):(L[$]&&(L[$].lastCount=R.length),S[$][C]=d(R.length,R.mode)+4+t.getCharCountIndicator(R.mode,b))}}N=E}for(let w=0;w<N.length;w++)S[N[w]].end=0;return{map:S,table:L}}function P(m,b){let L;const S=t.getBestModeForData(m);if(L=t.from(b,S),L!==t.BYTE&&L.bit<S.bit)throw new Error('"'+m+'" cannot be encoded with mode '+t.toString(L)+`.
 Suggested mode is: `+t.toString(S));switch(L===t.KANJI&&!s.isKanjiModeEnabled()&&(L=t.BYTE),L){case t.NUMERIC:return new r(m);case t.ALPHANUMERIC:return new n(m);case t.KANJI:return new a(m);case t.BYTE:return new o(m)}}e.fromArray=function(b){return b.reduce(function(L,S){return typeof S=="string"?L.push(P(S,null)):S.data&&L.push(P(S.data,S.mode)),L},[])},e.fromString=function(b,L){const S=v(b,s.isKanjiModeEnabled()),N=y(S),w=g(N,L),T=l.find_path(w.map,"start","end"),E=[];for(let p=1;p<T.length-1;p++)E.push(w.table[T[p]].node);return e.fromArray(h(E))},e.rawSplit=function(b){return e.fromArray(v(b,s.isKanjiModeEnabled()))}})(er)),er}var bo;function Ol(){if(bo)return xt;bo=1;const e=de(),t=vn(),r=fl(),n=hl(),o=gl(),a=pl(),i=yl(),s=yi(),l=bl(),c=Cl(),u=$l(),v=ve(),d=Ll();function h(w,T){const E=w.size,p=a.getPositions(T);for(let R=0;R<p.length;R++){const C=p[R][0],I=p[R][1];for(let $=-1;$<=7;$++)if(!(C+$<=-1||E<=C+$))for(let O=-1;O<=7;O++)I+O<=-1||E<=I+O||($>=0&&$<=6&&(O===0||O===6)||O>=0&&O<=6&&($===0||$===6)||$>=2&&$<=4&&O>=2&&O<=4?w.set(C+$,I+O,!0,!0):w.set(C+$,I+O,!1,!0))}}function y(w){const T=w.size;for(let E=8;E<T-8;E++){const p=E%2===0;w.set(E,6,p,!0),w.set(6,E,p,!0)}}function g(w,T){const E=o.getPositions(T);for(let p=0;p<E.length;p++){const R=E[p][0],C=E[p][1];for(let I=-2;I<=2;I++)for(let $=-2;$<=2;$++)I===-2||I===2||$===-2||$===2||I===0&&$===0?w.set(R+I,C+$,!0,!0):w.set(R+I,C+$,!1,!0)}}function P(w,T){const E=w.size,p=c.getEncodedBits(T);let R,C,I;for(let $=0;$<18;$++)R=Math.floor($/3),C=$%3+E-8-3,I=(p>>$&1)===1,w.set(R,C,I,!0),w.set(C,R,I,!0)}function m(w,T,E){const p=w.size,R=u.getEncodedBits(T,E);let C,I;for(C=0;C<15;C++)I=(R>>C&1)===1,C<6?w.set(C,8,I,!0):C<8?w.set(C+1,8,I,!0):w.set(p-15+C,8,I,!0),C<8?w.set(8,p-C-1,I,!0):C<9?w.set(8,15-C-1+1,I,!0):w.set(8,15-C-1,I,!0);w.set(p-8,8,1,!0)}function b(w,T){const E=w.size;let p=-1,R=E-1,C=7,I=0;for(let $=E-1;$>0;$-=2)for($===6&&$--;;){for(let O=0;O<2;O++)if(!w.isReserved(R,$-O)){let te=!1;I<T.length&&(te=(T[I]>>>C&1)===1),w.set(R,$-O,te),C--,C===-1&&(I++,C=7)}if(R+=p,R<0||E<=R){R-=p,p=-p;break}}}function L(w,T,E){const p=new r;E.forEach(function(O){p.put(O.mode.bit,4),p.put(O.getLength(),v.getCharCountIndicator(O.mode,w)),O.write(p)});const R=e.getSymbolTotalCodewords(w),C=s.getTotalCodewordsCount(w,T),I=(R-C)*8;for(p.getLengthInBits()+4<=I&&p.put(0,4);p.getLengthInBits()%8!==0;)p.putBit(0);const $=(I-p.getLengthInBits())/8;for(let O=0;O<$;O++)p.put(O%2?17:236,8);return S(p,w,T)}function S(w,T,E){const p=e.getSymbolTotalCodewords(T),R=s.getTotalCodewordsCount(T,E),C=p-R,I=s.getBlocksCount(T,E),$=p%I,O=I-$,te=Math.floor(p/I),Re=Math.floor(C/I),rl=Re+1,Gn=te-Re,nl=new l(Gn);let Nt=0;const Ye=new Array(I),Kn=new Array(I);let _t=0;const ol=new Uint8Array(w.buffer);for(let he=0;he<I;he++){const Dt=he<O?Re:rl;Ye[he]=ol.slice(Nt,Nt+Dt),Kn[he]=nl.encode(Ye[he]),Nt+=Dt,_t=Math.max(_t,Dt)}const kt=new Uint8Array(p);let Wn=0,Y,J;for(Y=0;Y<_t;Y++)for(J=0;J<I;J++)Y<Ye[J].length&&(kt[Wn++]=Ye[J][Y]);for(Y=0;Y<Gn;Y++)for(J=0;J<I;J++)kt[Wn++]=Kn[J][Y];return kt}function N(w,T,E,p){let R;if(Array.isArray(w))R=d.fromArray(w);else if(typeof w=="string"){let te=T;if(!te){const Re=d.rawSplit(w);te=c.getBestVersionForData(Re,E)}R=d.fromString(w,te||40)}else throw new Error("Invalid data");const C=c.getBestVersionForData(R,E);if(!C)throw new Error("The amount of data is too big to be stored in a QR Code");if(!T)T=C;else if(T<C)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+C+`.
`);const I=L(T,E,R),$=e.getSymbolSize(T),O=new n($);return h(O,T),y(O),g(O,T),m(O,E,0),T>=7&&P(O,T),b(O,I),isNaN(p)&&(p=i.getBestMask(O,m.bind(null,O,E))),i.applyMask(p,O),m(O,E,p),{modules:O,version:T,errorCorrectionLevel:E,maskPattern:p,segments:R}}return xt.create=function(T,E){if(typeof T>"u"||T==="")throw new Error("No input text");let p=t.M,R,C;return typeof E<"u"&&(p=t.from(E.errorCorrectionLevel,t.M),R=c.from(E.version),C=i.from(E.maskPattern),E.toSJISFunc&&e.setToSJISFunction(E.toSJISFunc)),N(T,R,p,C)},xt}var ir={},sr={},Co;function bi(){return Co||(Co=1,(function(e){function t(r){if(typeof r=="number"&&(r=r.toString()),typeof r!="string")throw new Error("Color should be defined as hex string");let n=r.slice().replace("#","").split("");if(n.length<3||n.length===5||n.length>8)throw new Error("Invalid hex color: "+r);(n.length===3||n.length===4)&&(n=Array.prototype.concat.apply([],n.map(function(a){return[a,a]}))),n.length===6&&n.push("F","F");const o=parseInt(n.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+n.slice(0,6).join("")}}e.getOptions=function(n){n||(n={}),n.color||(n.color={});const o=typeof n.margin>"u"||n.margin===null||n.margin<0?4:n.margin,a=n.width&&n.width>=21?n.width:void 0,i=n.scale||4;return{width:a,scale:a?4:i,margin:o,color:{dark:t(n.color.dark||"#000000ff"),light:t(n.color.light||"#ffffffff")},type:n.type,rendererOpts:n.rendererOpts||{}}},e.getScale=function(n,o){return o.width&&o.width>=n+o.margin*2?o.width/(n+o.margin*2):o.scale},e.getImageWidth=function(n,o){const a=e.getScale(n,o);return Math.floor((n+o.margin*2)*a)},e.qrToImageData=function(n,o,a){const i=o.modules.size,s=o.modules.data,l=e.getScale(i,a),c=Math.floor((i+a.margin*2)*l),u=a.margin*l,v=[a.color.light,a.color.dark];for(let d=0;d<c;d++)for(let h=0;h<c;h++){let y=(d*c+h)*4,g=a.color.light;if(d>=u&&h>=u&&d<c-u&&h<c-u){const P=Math.floor((d-u)/l),m=Math.floor((h-u)/l);g=v[s[P*i+m]?1:0]}n[y++]=g.r,n[y++]=g.g,n[y++]=g.b,n[y]=g.a}}})(sr)),sr}var $o;function Pl(){return $o||($o=1,(function(e){const t=bi();function r(o,a,i){o.clearRect(0,0,a.width,a.height),a.style||(a.style={}),a.height=i,a.width=i,a.style.height=i+"px",a.style.width=i+"px"}function n(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}e.render=function(a,i,s){let l=s,c=i;typeof l>"u"&&(!i||!i.getContext)&&(l=i,i=void 0),i||(c=n()),l=t.getOptions(l);const u=t.getImageWidth(a.modules.size,l),v=c.getContext("2d"),d=v.createImageData(u,u);return t.qrToImageData(d.data,a,l),r(v,c,u),v.putImageData(d,0,0),c},e.renderToDataURL=function(a,i,s){let l=s;typeof l>"u"&&(!i||!i.getContext)&&(l=i,i=void 0),l||(l={});const c=e.render(a,i,l),u=l.type||"image/png",v=l.rendererOpts||{};return c.toDataURL(u,v.quality)}})(ir)),ir}var lr={},Eo;function Al(){if(Eo)return lr;Eo=1;const e=bi();function t(o,a){const i=o.a/255,s=a+'="'+o.hex+'"';return i<1?s+" "+a+'-opacity="'+i.toFixed(2).slice(1)+'"':s}function r(o,a,i){let s=o+a;return typeof i<"u"&&(s+=" "+i),s}function n(o,a,i){let s="",l=0,c=!1,u=0;for(let v=0;v<o.length;v++){const d=Math.floor(v%a),h=Math.floor(v/a);!d&&!c&&(c=!0),o[v]?(u++,v>0&&d>0&&o[v-1]||(s+=c?r("M",d+i,.5+h+i):r("m",l,0),l=0,c=!1),d+1<a&&o[v+1]||(s+=r("h",u),u=0)):l++}return s}return lr.render=function(a,i,s){const l=e.getOptions(i),c=a.modules.size,u=a.modules.data,v=c+l.margin*2,d=l.color.light.a?"<path "+t(l.color.light,"fill")+' d="M0 0h'+v+"v"+v+'H0z"/>':"",h="<path "+t(l.color.dark,"stroke")+' d="'+n(u,c,l.margin)+'"/>',y='viewBox="0 0 '+v+" "+v+'"',P='<svg xmlns="http://www.w3.org/2000/svg" '+(l.width?'width="'+l.width+'" height="'+l.width+'" ':"")+y+' shape-rendering="crispEdges">'+d+h+`</svg>
`;return typeof s=="function"&&s(null,P),P},lr}var To;function Ml(){if(To)return ge;To=1;const e=vl(),t=Ol(),r=Pl(),n=Al();function o(a,i,s,l,c){const u=[].slice.call(arguments,1),v=u.length,d=typeof u[v-1]=="function";if(!d&&!e())throw new Error("Callback required as last argument");if(d){if(v<2)throw new Error("Too few arguments provided");v===2?(c=s,s=i,i=l=void 0):v===3&&(i.getContext&&typeof c>"u"?(c=l,l=void 0):(c=l,l=s,s=i,i=void 0))}else{if(v<1)throw new Error("Too few arguments provided");return v===1?(s=i,i=l=void 0):v===2&&!i.getContext&&(l=s,s=i,i=void 0),new Promise(function(h,y){try{const g=t.create(s,l);h(a(g,i,l))}catch(g){y(g)}})}try{const h=t.create(s,l);c(null,a(h,i,l))}catch(h){c(h)}}return ge.create=t.create,ge.toCanvas=o.bind(null,r.render),ge.toDataURL=o.bind(null,r.renderToDataURL),ge.toString=o.bind(null,function(a,i,s){return n.render(a,s)}),ge}var Bl=Ml(),Qe=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{},Oe=function(e){return e&&e.Math===Math&&e},M=Oe(typeof globalThis=="object"&&globalThis)||Oe(typeof window=="object"&&window)||Oe(typeof self=="object"&&self)||Oe(typeof Qe=="object"&&Qe)||Oe(typeof Qe=="object"&&Qe)||(function(){return this})()||Function("return this")(),fn={},k=function(e){try{return!!e()}catch{return!0}},Nl=k,U=!Nl(function(){return Object.defineProperty({},1,{get:function(){return 7}})[1]!==7}),_l=k,St=!_l(function(){var e=(function(){}).bind();return typeof e!="function"||e.hasOwnProperty("prototype")}),kl=St,Xe=Function.prototype.call,G=kl?Xe.bind(Xe):function(){return Xe.apply(Xe,arguments)},Ci={},$i={}.propertyIsEnumerable,Ei=Object.getOwnPropertyDescriptor,Dl=Ei&&!$i.call({1:2},1);Ci.f=Dl?function(t){var r=Ei(this,t);return!!r&&r.enumerable}:$i;var hn=function(e,t){return{enumerable:!(e&1),configurable:!(e&2),writable:!(e&4),value:t}},Ti=St,Ii=Function.prototype,Hr=Ii.call,jl=Ti&&Ii.bind.bind(Hr,Hr),_=Ti?jl:function(e){return function(){return Hr.apply(e,arguments)}},Si=_,Fl=Si({}.toString),Ul=Si("".slice),Ue=function(e){return Ul(Fl(e),8,-1)},xl=_,ql=k,Vl=Ue,cr=Object,Hl=xl("".split),Gl=ql(function(){return!cr("z").propertyIsEnumerable(0)})?function(e){return Vl(e)==="String"?Hl(e,""):cr(e)}:cr,Rt=function(e){return e==null},Kl=Rt,Wl=TypeError,xe=function(e){if(Kl(e))throw new Wl("Can't call method on "+e);return e},Zl=Gl,zl=xe,qe=function(e){return Zl(zl(e))},ur=typeof document=="object"&&document.all,B=typeof ur>"u"&&ur!==void 0?function(e){return typeof e=="function"||e===ur}:function(e){return typeof e=="function"},Yl=B,K=function(e){return typeof e=="object"?e!==null:Yl(e)},dr=M,Jl=B,Ql=function(e){return Jl(e)?e:void 0},fe=function(e,t){return arguments.length<2?Ql(dr[e]):dr[e]&&dr[e][t]},Xl=_,Ve=Xl({}.isPrototypeOf),ec=M,Io=ec.navigator,So=Io&&Io.userAgent,ae=So?String(So):"",Ri=M,vr=ae,Ro=Ri.process,Lo=Ri.Deno,Oo=Ro&&Ro.versions||Lo&&Lo.version,Po=Oo&&Oo.v8,H,bt;Po&&(H=Po.split("."),bt=H[0]>0&&H[0]<4?1:+(H[0]+H[1]));!bt&&vr&&(H=vr.match(/Edge\/(\d+)/),(!H||H[1]>=74)&&(H=vr.match(/Chrome\/(\d+)/),H&&(bt=+H[1])));var gn=bt,Ao=gn,tc=k,rc=M,nc=rc.String,Li=!!Object.getOwnPropertySymbols&&!tc(function(){var e=Symbol("symbol detection");return!nc(e)||!(Object(e)instanceof Symbol)||!Symbol.sham&&Ao&&Ao<41}),oc=Li,Oi=oc&&!Symbol.sham&&typeof Symbol.iterator=="symbol",ac=fe,ic=B,sc=Ve,lc=Oi,cc=Object,Pi=lc?function(e){return typeof e=="symbol"}:function(e){var t=ac("Symbol");return ic(t)&&sc(t.prototype,cc(e))},uc=String,He=function(e){try{return uc(e)}catch{return"Object"}},dc=B,vc=He,fc=TypeError,X=function(e){if(dc(e))return e;throw new fc(vc(e)+" is not a function")},hc=X,gc=Rt,pn=function(e,t){var r=e[t];return gc(r)?void 0:hc(r)},fr=G,hr=B,gr=K,pc=TypeError,yc=function(e,t){var r,n;if(t==="string"&&hr(r=e.toString)&&!gr(n=fr(r,e))||hr(r=e.valueOf)&&!gr(n=fr(r,e))||t!=="string"&&hr(r=e.toString)&&!gr(n=fr(r,e)))return n;throw new pc("Can't convert object to primitive value")},Lt={exports:{}},Mo=M,mc=Object.defineProperty,yn=function(e,t){try{mc(Mo,e,{value:t,configurable:!0,writable:!0})}catch{Mo[e]=t}return t},wc=M,bc=yn,Bo="__core-js_shared__",No=Lt.exports=wc[Bo]||bc(Bo,{});(No.versions||(No.versions=[])).push({version:"3.41.0",mode:"global",copyright:"© 2014-2025 Denis Pushkarev (zloirock.ru)",license:"https://github.com/zloirock/core-js/blob/v3.41.0/LICENSE",source:"https://github.com/zloirock/core-js"});var _o=Lt.exports,Ai=function(e,t){return _o[e]||(_o[e]=t||{})},Cc=xe,$c=Object,mn=function(e){return $c(Cc(e))},Ec=_,Tc=mn,Ic=Ec({}.hasOwnProperty),x=Object.hasOwn||function(t,r){return Ic(Tc(t),r)},Sc=_,Rc=0,Lc=Math.random(),Oc=Sc(1 .toString),Mi=function(e){return"Symbol("+(e===void 0?"":e)+")_"+Oc(++Rc+Lc,36)},Pc=M,Ac=Ai,ko=x,Mc=Mi,Bc=Li,Nc=Oi,we=Pc.Symbol,pr=Ac("wks"),_c=Nc?we.for||we:we&&we.withoutSetter||Mc,j=function(e){return ko(pr,e)||(pr[e]=Bc&&ko(we,e)?we[e]:_c("Symbol."+e)),pr[e]},kc=G,Do=K,jo=Pi,Dc=pn,jc=yc,Fc=j,Uc=TypeError,xc=Fc("toPrimitive"),qc=function(e,t){if(!Do(e)||jo(e))return e;var r=Dc(e,xc),n;if(r){if(t===void 0&&(t="default"),n=kc(r,e,t),!Do(n)||jo(n))return n;throw new Uc("Can't convert object to primitive value")}return t===void 0&&(t="number"),jc(e,t)},Vc=qc,Hc=Pi,Bi=function(e){var t=Vc(e,"string");return Hc(t)?t:t+""},Gc=M,Fo=K,Gr=Gc.document,Kc=Fo(Gr)&&Fo(Gr.createElement),Ot=function(e){return Kc?Gr.createElement(e):{}},Wc=U,Zc=k,zc=Ot,Ni=!Wc&&!Zc(function(){return Object.defineProperty(zc("div"),"a",{get:function(){return 7}}).a!==7}),Yc=U,Jc=G,Qc=Ci,Xc=hn,eu=qe,tu=Bi,ru=x,nu=Ni,Uo=Object.getOwnPropertyDescriptor;fn.f=Yc?Uo:function(t,r){if(t=eu(t),r=tu(r),nu)try{return Uo(t,r)}catch{}if(ru(t,r))return Xc(!Jc(Qc.f,t,r),t[r])};var ee={},ou=U,au=k,_i=ou&&au(function(){return Object.defineProperty(function(){},"prototype",{value:42,writable:!1}).prototype!==42}),iu=K,su=String,lu=TypeError,W=function(e){if(iu(e))return e;throw new lu(su(e)+" is not an object")},cu=U,uu=Ni,du=_i,et=W,xo=Bi,vu=TypeError,yr=Object.defineProperty,fu=Object.getOwnPropertyDescriptor,mr="enumerable",wr="configurable",br="writable";ee.f=cu?du?function(t,r,n){if(et(t),r=xo(r),et(n),typeof t=="function"&&r==="prototype"&&"value"in n&&br in n&&!n[br]){var o=fu(t,r);o&&o[br]&&(t[r]=n.value,n={configurable:wr in n?n[wr]:o[wr],enumerable:mr in n?n[mr]:o[mr],writable:!1})}return yr(t,r,n)}:yr:function(t,r,n){if(et(t),r=xo(r),et(n),uu)try{return yr(t,r,n)}catch{}if("get"in n||"set"in n)throw new vu("Accessors not supported");return"value"in n&&(t[r]=n.value),t};var hu=U,gu=ee,pu=hn,Pt=hu?function(e,t,r){return gu.f(e,t,pu(1,r))}:function(e,t,r){return e[t]=r,e},wn={exports:{}},Kr=U,yu=x,ki=Function.prototype,mu=Kr&&Object.getOwnPropertyDescriptor,Di=yu(ki,"name"),wu=Di&&(function(){}).name==="something",bu=Di&&(!Kr||Kr&&mu(ki,"name").configurable),bn={PROPER:wu,CONFIGURABLE:bu},Cu=_,$u=B,Wr=Lt.exports,Eu=Cu(Function.toString);$u(Wr.inspectSource)||(Wr.inspectSource=function(e){return Eu(e)});var Cn=Wr.inspectSource,Tu=M,Iu=B,qo=Tu.WeakMap,Su=Iu(qo)&&/native code/.test(String(qo)),Ru=Ai,Lu=Mi,Vo=Ru("keys"),$n=function(e){return Vo[e]||(Vo[e]=Lu(e))},En={},Ou=Su,ji=M,Pu=K,Au=Pt,Cr=x,$r=Lt.exports,Mu=$n,Bu=En,Ho="Object already initialized",Zr=ji.TypeError,Nu=ji.WeakMap,Ct,je,$t,_u=function(e){return $t(e)?je(e):Ct(e,{})},ku=function(e){return function(t){var r;if(!Pu(t)||(r=je(t)).type!==e)throw new Zr("Incompatible receiver, "+e+" required");return r}};if(Ou||$r.state){var z=$r.state||($r.state=new Nu);z.get=z.get,z.has=z.has,z.set=z.set,Ct=function(e,t){if(z.has(e))throw new Zr(Ho);return t.facade=e,z.set(e,t),t},je=function(e){return z.get(e)||{}},$t=function(e){return z.has(e)}}else{var pe=Mu("state");Bu[pe]=!0,Ct=function(e,t){if(Cr(e,pe))throw new Zr(Ho);return t.facade=e,Au(e,pe,t),t},je=function(e){return Cr(e,pe)?e[pe]:{}},$t=function(e){return Cr(e,pe)}}var Tn={set:Ct,get:je,has:$t,enforce:_u,getterFor:ku},In=_,Du=k,ju=B,tt=x,zr=U,Fu=bn.CONFIGURABLE,Uu=Cn,Fi=Tn,xu=Fi.enforce,qu=Fi.get,Go=String,gt=Object.defineProperty,Vu=In("".slice),Hu=In("".replace),Gu=In([].join),Ku=zr&&!Du(function(){return gt(function(){},"length",{value:8}).length!==8}),Wu=String(String).split("String"),Zu=wn.exports=function(e,t,r){Vu(Go(t),0,7)==="Symbol("&&(t="["+Hu(Go(t),/^Symbol\(([^)]*)\).*$/,"$1")+"]"),r&&r.getter&&(t="get "+t),r&&r.setter&&(t="set "+t),(!tt(e,"name")||Fu&&e.name!==t)&&(zr?gt(e,"name",{value:t,configurable:!0}):e.name=t),Ku&&r&&tt(r,"arity")&&e.length!==r.arity&&gt(e,"length",{value:r.arity});try{r&&tt(r,"constructor")&&r.constructor?zr&&gt(e,"prototype",{writable:!1}):e.prototype&&(e.prototype=void 0)}catch{}var n=xu(e);return tt(n,"source")||(n.source=Gu(Wu,typeof t=="string"?t:"")),e};Function.prototype.toString=Zu(function(){return ju(this)&&qu(this).source||Uu(this)},"toString");var zu=B,Yu=ee,Ju=wn.exports,Qu=yn,Te=function(e,t,r,n){n||(n={});var o=n.enumerable,a=n.name!==void 0?n.name:t;if(zu(r)&&Ju(r,a,n),n.global)o?e[t]=r:Qu(t,r);else{try{n.unsafe?e[t]&&(o=!0):delete e[t]}catch{}o?e[t]=r:Yu.f(e,t,{value:r,enumerable:!1,configurable:!n.nonConfigurable,writable:!n.nonWritable})}return e},Ui={},Xu=Math.ceil,e1=Math.floor,t1=Math.trunc||function(t){var r=+t;return(r>0?e1:Xu)(r)},r1=t1,xi=function(e){var t=+e;return t!==t||t===0?0:r1(t)},n1=xi,o1=Math.max,a1=Math.min,i1=function(e,t){var r=n1(e);return r<0?o1(r+t,0):a1(r,t)},s1=xi,l1=Math.min,c1=function(e){var t=s1(e);return t>0?l1(t,9007199254740991):0},u1=c1,Sn=function(e){return u1(e.length)},d1=qe,v1=i1,f1=Sn,Ko=function(e){return function(t,r,n){var o=d1(t),a=f1(o);if(a===0)return!e&&-1;var i=v1(n,a),s;if(e&&r!==r){for(;a>i;)if(s=o[i++],s!==s)return!0}else for(;a>i;i++)if((e||i in o)&&o[i]===r)return e||i||0;return!e&&-1}},qi={includes:Ko(!0),indexOf:Ko(!1)},h1=_,Er=x,g1=qe,p1=qi.indexOf,y1=En,Wo=h1([].push),Vi=function(e,t){var r=g1(e),n=0,o=[],a;for(a in r)!Er(y1,a)&&Er(r,a)&&Wo(o,a);for(;t.length>n;)Er(r,a=t[n++])&&(~p1(o,a)||Wo(o,a));return o},Rn=["constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"],m1=Vi,w1=Rn,b1=w1.concat("length","prototype");Ui.f=Object.getOwnPropertyNames||function(t){return m1(t,b1)};var Hi={};Hi.f=Object.getOwnPropertySymbols;var C1=fe,$1=_,E1=Ui,T1=Hi,I1=W,S1=$1([].concat),R1=C1("Reflect","ownKeys")||function(t){var r=E1.f(I1(t)),n=T1.f;return n?S1(r,n(t)):r},Zo=x,L1=R1,O1=fn,P1=ee,Gi=function(e,t,r){for(var n=L1(t),o=P1.f,a=O1.f,i=0;i<n.length;i++){var s=n[i];!Zo(e,s)&&!(r&&Zo(r,s))&&o(e,s,a(t,s))}},A1=k,M1=B,B1=/#|\.prototype\./,Ge=function(e,t){var r=_1[N1(e)];return r===D1?!0:r===k1?!1:M1(t)?A1(t):!!t},N1=Ge.normalize=function(e){return String(e).replace(B1,".").toLowerCase()},_1=Ge.data={},k1=Ge.NATIVE="N",D1=Ge.POLYFILL="P",Ki=Ge,rt=M,j1=fn.f,F1=Pt,U1=Te,x1=yn,q1=Gi,V1=Ki,q=function(e,t){var r=e.target,n=e.global,o=e.stat,a,i,s,l,c,u;if(n?i=rt:o?i=rt[r]||x1(r,{}):i=rt[r]&&rt[r].prototype,i)for(s in t){if(c=t[s],e.dontCallGetSet?(u=j1(i,s),l=u&&u.value):l=i[s],a=V1(n?s:r+(o?".":"#")+s,e.forced),!a&&l!==void 0){if(typeof c==typeof l)continue;q1(c,l)}(e.sham||l&&l.sham)&&F1(c,"sham",!0),U1(i,s,c,e)}},zo=He,H1=TypeError,G1=function(e,t){if(!delete e[t])throw new H1("Cannot delete property "+zo(t)+" of "+zo(e))},K1=j,W1=K1("toStringTag"),Wi={};Wi[W1]="z";var Z1=String(Wi)==="[object z]",z1=Z1,Y1=B,pt=Ue,J1=j,Q1=J1("toStringTag"),X1=Object,ed=pt((function(){return arguments})())==="Arguments",td=function(e,t){try{return e[t]}catch{}},Ln=z1?pt:function(e){var t,r,n;return e===void 0?"Undefined":e===null?"Null":typeof(r=td(t=X1(e),Q1))=="string"?r:ed?pt(t):(n=pt(t))==="Object"&&Y1(t.callee)?"Arguments":n},rd=Ln,nd=String,Ie=function(e){if(rd(e)==="Symbol")throw new TypeError("Cannot convert a Symbol value to a string");return nd(e)},od=_,Zi=od([].slice),Yo=Zi,ad=Math.floor,Yr=function(e,t){var r=e.length;if(r<8)for(var n=1,o,a;n<r;){for(a=n,o=e[n];a&&t(e[a-1],o)>0;)e[a]=e[--a];a!==n++&&(e[a]=o)}else for(var i=ad(r/2),s=Yr(Yo(e,0,i),t),l=Yr(Yo(e,i),t),c=s.length,u=l.length,v=0,d=0;v<c||d<u;)e[v+d]=v<c&&d<u?t(s[v],l[d])<=0?s[v++]:l[d++]:v<c?s[v++]:l[d++];return e},id=Yr,sd=k,ld=function(e,t){var r=[][e];return!!r&&sd(function(){r.call(null,t||function(){return 1},1)})},cd=ae,Jo=cd.match(/firefox\/(\d+)/i),ud=!!Jo&&+Jo[1],dd=ae,vd=/MSIE|Trident/.test(dd),fd=ae,Qo=fd.match(/AppleWebKit\/(\d+)\./),hd=!!Qo&&+Qo[1],gd=q,zi=_,pd=X,yd=mn,Xo=Sn,md=G1,ea=Ie,On=k,wd=id,bd=ld,ta=ud,Cd=vd,ra=gn,na=hd,ne=[],oa=zi(ne.sort),$d=zi(ne.push),Ed=On(function(){ne.sort(void 0)}),Td=On(function(){ne.sort(null)}),Id=bd("sort"),Yi=!On(function(){if(ra)return ra<70;if(!(ta&&ta>3)){if(Cd)return!0;if(na)return na<603;var e="",t,r,n,o;for(t=65;t<76;t++){switch(r=String.fromCharCode(t),t){case 66:case 69:case 70:case 72:n=3;break;case 68:case 71:n=4;break;default:n=2}for(o=0;o<47;o++)ne.push({k:r+o,v:n})}for(ne.sort(function(a,i){return i.v-a.v}),o=0;o<ne.length;o++)r=ne[o].k.charAt(0),e.charAt(e.length-1)!==r&&(e+=r);return e!=="DGBEFHACIJK"}}),Sd=Ed||!Td||!Id||!Yi,Rd=function(e){return function(t,r){return r===void 0?-1:t===void 0?1:e!==void 0?+e(t,r)||0:ea(t)>ea(r)?1:-1}};gd({target:"Array",proto:!0,forced:Sd},{sort:function(t){t!==void 0&&pd(t);var r=yd(this);if(Yi)return t===void 0?oa(r):oa(r,t);var n=[],o=Xo(r),a,i;for(i=0;i<o;i++)i in r&&$d(n,r[i]);for(wd(n,Rd(t)),a=Xo(n),i=0;i<a;)r[i]=n[i++];for(;i<o;)md(r,i++);return r}});function D(e,t,r,n){function o(a){return a instanceof r?a:new r(function(i){i(a)})}return new(r||(r=Promise))(function(a,i){function s(u){try{c(n.next(u))}catch(v){i(v)}}function l(u){try{c(n.throw(u))}catch(v){i(v)}}function c(u){u.done?a(u.value):o(u.value).then(s,l)}c((n=n.apply(e,[])).next())})}var aa=wn.exports,Ld=ee,Ji=function(e,t,r){return r.get&&aa(r.get,t,{getter:!0}),r.set&&aa(r.set,t,{setter:!0}),Ld.f(e,t,r)},Od=q,Pd=U,Ad=M,nt=_,Md=x,Bd=B,Nd=Ve,_d=Ie,kd=Ji,Dd=Gi,Q=Ad.Symbol,ie=Q&&Q.prototype;if(Pd&&Bd(Q)&&(!("description"in ie)||Q().description!==void 0)){var ia={},ot=function(){var t=arguments.length<1||arguments[0]===void 0?void 0:_d(arguments[0]),r=Nd(ie,this)?new Q(t):t===void 0?Q():Q(t);return t===""&&(ia[r]=!0),r};Dd(ot,Q),ot.prototype=ie,ie.constructor=ot;var jd=String(Q("description detection"))==="Symbol(description detection)",Fd=nt(ie.valueOf),Ud=nt(ie.toString),xd=/^Symbol\((.*)\)[^)]+$/,qd=nt("".replace),Vd=nt("".slice);kd(ie,"description",{configurable:!0,get:function(){var t=Fd(this);if(Md(ia,t))return"";var r=Ud(t),n=jd?Vd(r,7,-1):qd(r,xd,"$1");return n===""?void 0:n}}),Od({global:!0,constructor:!0,forced:!0},{Symbol:ot})}var Qi={},Hd=Vi,Gd=Rn,Kd=Object.keys||function(t){return Hd(t,Gd)},Wd=U,Zd=_i,zd=ee,Yd=W,Jd=qe,Qd=Kd;Qi.f=Wd&&!Zd?Object.defineProperties:function(t,r){Yd(t);for(var n=Jd(r),o=Qd(r),a=o.length,i=0,s;a>i;)zd.f(t,s=o[i++],n[s]);return t};var Xd=fe,Xi=Xd("document","documentElement"),ev=W,tv=Qi,sa=Rn,rv=En,nv=Xi,ov=Ot,av=$n,la=">",ca="<",Jr="prototype",Qr="script",es=av("IE_PROTO"),Tr=function(){},ts=function(e){return ca+Qr+la+e+ca+"/"+Qr+la},ua=function(e){e.write(ts("")),e.close();var t=e.parentWindow.Object;return e=null,t},iv=function(){var e=ov("iframe"),t="java"+Qr+":",r;return e.style.display="none",nv.appendChild(e),e.src=String(t),r=e.contentWindow.document,r.open(),r.write(ts("document.F=Object")),r.close(),r.F},at,yt=function(){try{at=new ActiveXObject("htmlfile")}catch{}yt=typeof document<"u"?document.domain&&at?ua(at):iv():ua(at);for(var e=sa.length;e--;)delete yt[Jr][sa[e]];return yt()};rv[es]=!0;var rs=Object.create||function(t,r){var n;return t!==null?(Tr[Jr]=ev(t),n=new Tr,Tr[Jr]=null,n[es]=t):n=yt(),r===void 0?n:tv.f(n,r)},sv=j,lv=rs,cv=ee.f,Xr=sv("unscopables"),en=Array.prototype;en[Xr]===void 0&&cv(en,Xr,{configurable:!0,value:lv(null)});var ns=function(e){en[Xr][e]=!0},uv=q,dv=qi.includes,vv=k,fv=ns,hv=vv(function(){return!Array(1).includes()});uv({target:"Array",proto:!0,forced:hv},{includes:function(t){return dv(this,t,arguments.length>1?arguments[1]:void 0)}});fv("includes");var Ke={},gv=k,pv=!gv(function(){function e(){}return e.prototype.constructor=null,Object.getPrototypeOf(new e)!==e.prototype}),yv=x,mv=B,wv=mn,bv=$n,Cv=pv,da=bv("IE_PROTO"),tn=Object,$v=tn.prototype,os=Cv?tn.getPrototypeOf:function(e){var t=wv(e);if(yv(t,da))return t[da];var r=t.constructor;return mv(r)&&t instanceof r?r.prototype:t instanceof tn?$v:null},Ev=k,Tv=B,Iv=K,va=os,Sv=Te,Rv=j,rn=Rv("iterator"),as=!1,ue,Ir,Sr;[].keys&&(Sr=[].keys(),"next"in Sr?(Ir=va(va(Sr)),Ir!==Object.prototype&&(ue=Ir)):as=!0);var Lv=!Iv(ue)||Ev(function(){var e={};return ue[rn].call(e)!==e});Lv&&(ue={});Tv(ue[rn])||Sv(ue,rn,function(){return this});var is={IteratorPrototype:ue,BUGGY_SAFARI_ITERATORS:as},Ov=ee.f,Pv=x,Av=j,fa=Av("toStringTag"),At=function(e,t,r){e&&!r&&(e=e.prototype),e&&!Pv(e,fa)&&Ov(e,fa,{configurable:!0,value:t})},Mv=is.IteratorPrototype,Bv=rs,Nv=hn,_v=At,kv=Ke,Dv=function(){return this},jv=function(e,t,r,n){var o=t+" Iterator";return e.prototype=Bv(Mv,{next:Nv(+!n,r)}),_v(e,o,!1),kv[o]=Dv,e},Fv=_,Uv=X,xv=function(e,t,r){try{return Fv(Uv(Object.getOwnPropertyDescriptor(e,t)[r]))}catch{}},qv=K,Vv=function(e){return qv(e)||e===null},Hv=Vv,Gv=String,Kv=TypeError,Wv=function(e){if(Hv(e))return e;throw new Kv("Can't set "+Gv(e)+" as a prototype")},Zv=xv,zv=K,Yv=xe,Jv=Wv,ss=Object.setPrototypeOf||("__proto__"in{}?(function(){var e=!1,t={},r;try{r=Zv(Object.prototype,"__proto__","set"),r(t,[]),e=t instanceof Array}catch{}return function(o,a){return Yv(o),Jv(a),zv(o)&&(e?r(o,a):o.__proto__=a),o}})():void 0),Qv=q,Xv=G,ls=bn,ef=B,tf=jv,ha=os,ga=ss,rf=At,nf=Pt,Rr=Te,of=j,af=Ke,cs=is,sf=ls.PROPER,lf=ls.CONFIGURABLE,pa=cs.IteratorPrototype,it=cs.BUGGY_SAFARI_ITERATORS,Pe=of("iterator"),ya="keys",Ae="values",ma="entries",cf=function(){return this},uf=function(e,t,r,n,o,a,i){tf(r,t,n);var s=function(m){if(m===o&&d)return d;if(!it&&m&&m in u)return u[m];switch(m){case ya:return function(){return new r(this,m)};case Ae:return function(){return new r(this,m)};case ma:return function(){return new r(this,m)}}return function(){return new r(this)}},l=t+" Iterator",c=!1,u=e.prototype,v=u[Pe]||u["@@iterator"]||o&&u[o],d=!it&&v||s(o),h=t==="Array"&&u.entries||v,y,g,P;if(h&&(y=ha(h.call(new e)),y!==Object.prototype&&y.next&&(ha(y)!==pa&&(ga?ga(y,pa):ef(y[Pe])||Rr(y,Pe,cf)),rf(y,l,!0))),sf&&o===Ae&&v&&v.name!==Ae&&(lf?nf(u,"name",Ae):(c=!0,d=function(){return Xv(v,this)})),o)if(g={values:s(Ae),keys:a?d:s(ya),entries:s(ma)},i)for(P in g)(it||c||!(P in u))&&Rr(u,P,g[P]);else Qv({target:t,proto:!0,forced:it||c},g);return u[Pe]!==d&&Rr(u,Pe,d,{name:o}),af[t]=d,g},df=function(e,t){return{value:e,done:t}},vf=qe,Pn=ns,wa=Ke,us=Tn,ff=ee.f,hf=uf,st=df,gf=U,ds="Array Iterator",pf=us.set,yf=us.getterFor(ds),mf=hf(Array,"Array",function(e,t){pf(this,{type:ds,target:vf(e),index:0,kind:t})},function(){var e=yf(this),t=e.target,r=e.index++;if(!t||r>=t.length)return e.target=null,st(void 0,!0);switch(e.kind){case"keys":return st(r,!1);case"values":return st(t[r],!1)}return st([r,t[r]],!1)},"values"),ba=wa.Arguments=wa.Array;Pn("keys");Pn("values");Pn("entries");if(gf&&ba.name!=="values")try{ff(ba,"name",{value:"values"})}catch{}var Me=M,wf=ae,bf=Ue,lt=function(e){return wf.slice(0,e.length)===e},vs=(function(){return lt("Bun/")?"BUN":lt("Cloudflare-Workers")?"CLOUDFLARE":lt("Deno/")?"DENO":lt("Node.js/")?"NODE":Me.Bun&&typeof Bun.version=="string"?"BUN":Me.Deno&&typeof Deno.version=="object"?"DENO":bf(Me.process)==="process"?"NODE":Me.window&&Me.document?"BROWSER":"REST"})(),Cf=vs,An=Cf==="NODE",$f=fe,Ef=Ji,Tf=j,If=U,Ca=Tf("species"),Sf=function(e){var t=$f(e);If&&t&&!t[Ca]&&Ef(t,Ca,{configurable:!0,get:function(){return this}})},Rf=Ve,Lf=TypeError,Of=function(e,t){if(Rf(t,e))return e;throw new Lf("Incorrect invocation")},Pf=_,Af=k,fs=B,Mf=Ln,Bf=fe,Nf=Cn,hs=function(){},gs=Bf("Reflect","construct"),Mn=/^\s*(?:class|function)\b/,_f=Pf(Mn.exec),kf=!Mn.test(hs),Be=function(t){if(!fs(t))return!1;try{return gs(hs,[],t),!0}catch{return!1}},ps=function(t){if(!fs(t))return!1;switch(Mf(t)){case"AsyncFunction":case"GeneratorFunction":case"AsyncGeneratorFunction":return!1}try{return kf||!!_f(Mn,Nf(t))}catch{return!0}};ps.sham=!0;var Df=!gs||Af(function(){var e;return Be(Be.call)||!Be(Object)||!Be(function(){e=!0})||e})?ps:Be,jf=Df,Ff=He,Uf=TypeError,xf=function(e){if(jf(e))return e;throw new Uf(Ff(e)+" is not a constructor")},$a=W,qf=xf,Vf=Rt,Hf=j,Gf=Hf("species"),Kf=function(e,t){var r=$a(e).constructor,n;return r===void 0||Vf(n=$a(r)[Gf])?t:qf(n)},Wf=St,ys=Function.prototype,Ea=ys.apply,Ta=ys.call,Zf=typeof Reflect=="object"&&Reflect.apply||(Wf?Ta.bind(Ea):function(){return Ta.apply(Ea,arguments)}),zf=Ue,Yf=_,Jf=function(e){if(zf(e)==="Function")return Yf(e)},Ia=Jf,Qf=X,Xf=St,e0=Ia(Ia.bind),Bn=function(e,t){return Qf(e),t===void 0?e:Xf?e0(e,t):function(){return e.apply(t,arguments)}},t0=TypeError,r0=function(e,t){if(e<t)throw new t0("Not enough arguments");return e},n0=ae,ms=/(?:ipad|iphone|ipod).*applewebkit/i.test(n0),F=M,o0=Zf,a0=Bn,Sa=B,i0=x,ws=k,Ra=Xi,s0=Zi,La=Ot,l0=r0,c0=ms,u0=An,nn=F.setImmediate,Oa=F.clearImmediate,d0=F.process,Lr=F.Dispatch,v0=F.Function,Pa=F.MessageChannel,f0=F.String,Or=0,_e={},Aa="onreadystatechange",Fe,se,Pr,Ar;ws(function(){Fe=F.location});var Nn=function(e){if(i0(_e,e)){var t=_e[e];delete _e[e],t()}},Mr=function(e){return function(){Nn(e)}},Ma=function(e){Nn(e.data)},Ba=function(e){F.postMessage(f0(e),Fe.protocol+"//"+Fe.host)};(!nn||!Oa)&&(nn=function(t){l0(arguments.length,1);var r=Sa(t)?t:v0(t),n=s0(arguments,1);return _e[++Or]=function(){o0(r,void 0,n)},se(Or),Or},Oa=function(t){delete _e[t]},u0?se=function(e){d0.nextTick(Mr(e))}:Lr&&Lr.now?se=function(e){Lr.now(Mr(e))}:Pa&&!c0?(Pr=new Pa,Ar=Pr.port2,Pr.port1.onmessage=Ma,se=a0(Ar.postMessage,Ar)):F.addEventListener&&Sa(F.postMessage)&&!F.importScripts&&Fe&&Fe.protocol!=="file:"&&!ws(Ba)?(se=Ba,F.addEventListener("message",Ma,!1)):Aa in La("script")?se=function(e){Ra.appendChild(La("script"))[Aa]=function(){Ra.removeChild(this),Nn(e)}}:se=function(e){setTimeout(Mr(e),0)});var bs={set:nn},Na=M,h0=U,g0=Object.getOwnPropertyDescriptor,p0=function(e){if(!h0)return Na[e];var t=g0(Na,e);return t&&t.value},Cs=function(){this.head=null,this.tail=null};Cs.prototype={add:function(e){var t={item:e,next:null},r=this.tail;r?r.next=t:this.head=t,this.tail=t},get:function(){var e=this.head;if(e){var t=this.head=e.next;return t===null&&(this.tail=null),e.item}}};var $s=Cs,y0=ae,m0=/ipad|iphone|ipod/i.test(y0)&&typeof Pebble<"u",w0=ae,b0=/web0s(?!.*chrome)/i.test(w0),$e=M,C0=p0,_a=Bn,Br=bs.set,$0=$s,E0=ms,T0=m0,I0=b0,Nr=An,ka=$e.MutationObserver||$e.WebKitMutationObserver,Da=$e.document,ja=$e.process,ct=$e.Promise,on=C0("queueMicrotask"),ye,_r,kr,ut,Fa;if(!on){var dt=new $0,vt=function(){var e,t;for(Nr&&(e=ja.domain)&&e.exit();t=dt.get();)try{t()}catch(r){throw dt.head&&ye(),r}e&&e.enter()};!E0&&!Nr&&!I0&&ka&&Da?(_r=!0,kr=Da.createTextNode(""),new ka(vt).observe(kr,{characterData:!0}),ye=function(){kr.data=_r=!_r}):!T0&&ct&&ct.resolve?(ut=ct.resolve(void 0),ut.constructor=ct,Fa=_a(ut.then,ut),ye=function(){Fa(vt)}):Nr?ye=function(){ja.nextTick(vt)}:(Br=_a(Br,$e),ye=function(){Br(vt)}),on=function(e){dt.head||ye(),dt.add(e)}}var S0=on,R0=function(e,t){try{arguments.length===1?console.error(e):console.error(e,t)}catch{}},_n=function(e){try{return{error:!1,value:e()}}catch(t){return{error:!0,value:t}}},L0=M,Mt=L0.Promise,O0=M,ke=Mt,P0=B,A0=Ki,M0=Cn,B0=j,Ua=vs,Dr=gn;ke&&ke.prototype;var N0=B0("species"),an=!1,Es=P0(O0.PromiseRejectionEvent),_0=A0("Promise",function(){var e=M0(ke),t=e!==String(ke);if(!t&&Dr===66)return!0;if(!Dr||Dr<51||!/native code/.test(e)){var r=new ke(function(a){a(1)}),n=function(a){a(function(){},function(){})},o=r.constructor={};if(o[N0]=n,an=r.then(function(){})instanceof n,!an)return!0}return!t&&(Ua==="BROWSER"||Ua==="DENO")&&!Es}),We={CONSTRUCTOR:_0,REJECTION_EVENT:Es,SUBCLASSING:an},Se={},xa=X,k0=TypeError,D0=function(e){var t,r;this.promise=new e(function(n,o){if(t!==void 0||r!==void 0)throw new k0("Bad Promise constructor");t=n,r=o}),this.resolve=xa(t),this.reject=xa(r)};Se.f=function(e){return new D0(e)};var j0=q,Et=An,oe=M,Ee=G,qa=Te,Va=ss,F0=At,U0=Sf,x0=X,mt=B,q0=K,V0=Of,H0=Kf,Ts=bs.set,kn=S0,G0=R0,K0=_n,W0=$s,Is=Tn,Tt=Mt,Dn=We,Ss=Se,Bt="Promise",Rs=Dn.CONSTRUCTOR,Z0=Dn.REJECTION_EVENT,z0=Dn.SUBCLASSING,jr=Is.getterFor(Bt),Y0=Is.set,me=Tt&&Tt.prototype,le=Tt,ft=me,Ls=oe.TypeError,sn=oe.document,jn=oe.process,ln=Ss.f,J0=ln,Q0=!!(sn&&sn.createEvent&&oe.dispatchEvent),Os="unhandledrejection",X0="rejectionhandled",Ha=0,Ps=1,e2=2,Fn=1,As=2,ht,Ga,t2,Ka,Ms=function(e){var t;return q0(e)&&mt(t=e.then)?t:!1},Bs=function(e,t){var r=t.value,n=t.state===Ps,o=n?e.ok:e.fail,a=e.resolve,i=e.reject,s=e.domain,l,c,u;try{o?(n||(t.rejection===As&&n2(t),t.rejection=Fn),o===!0?l=r:(s&&s.enter(),l=o(r),s&&(s.exit(),u=!0)),l===e.promise?i(new Ls("Promise-chain cycle")):(c=Ms(l))?Ee(c,l,a,i):a(l)):i(r)}catch(v){s&&!u&&s.exit(),i(v)}},Ns=function(e,t){e.notified||(e.notified=!0,kn(function(){for(var r=e.reactions,n;n=r.get();)Bs(n,e);e.notified=!1,t&&!e.rejection&&r2(e)}))},_s=function(e,t,r){var n,o;Q0?(n=sn.createEvent("Event"),n.promise=t,n.reason=r,n.initEvent(e,!1,!0),oe.dispatchEvent(n)):n={promise:t,reason:r},!Z0&&(o=oe["on"+e])?o(n):e===Os&&G0("Unhandled promise rejection",r)},r2=function(e){Ee(Ts,oe,function(){var t=e.facade,r=e.value,n=Wa(e),o;if(n&&(o=K0(function(){Et?jn.emit("unhandledRejection",r,t):_s(Os,t,r)}),e.rejection=Et||Wa(e)?As:Fn,o.error))throw o.value})},Wa=function(e){return e.rejection!==Fn&&!e.parent},n2=function(e){Ee(Ts,oe,function(){var t=e.facade;Et?jn.emit("rejectionHandled",t):_s(X0,t,e.value)})},be=function(e,t,r){return function(n){e(t,n,r)}},Ce=function(e,t,r){e.done||(e.done=!0,r&&(e=r),e.value=t,e.state=e2,Ns(e,!0))},cn=function(e,t,r){if(!e.done){e.done=!0,r&&(e=r);try{if(e.facade===t)throw new Ls("Promise can't be resolved itself");var n=Ms(t);n?kn(function(){var o={done:!1};try{Ee(n,t,be(cn,o,e),be(Ce,o,e))}catch(a){Ce(o,a,e)}}):(e.value=t,e.state=Ps,Ns(e,!1))}catch(o){Ce({done:!1},o,e)}}};if(Rs&&(le=function(t){V0(this,ft),x0(t),Ee(ht,this);var r=jr(this);try{t(be(cn,r),be(Ce,r))}catch(n){Ce(r,n)}},ft=le.prototype,ht=function(t){Y0(this,{type:Bt,done:!1,notified:!1,parent:!1,reactions:new W0,rejection:!1,state:Ha,value:null})},ht.prototype=qa(ft,"then",function(t,r){var n=jr(this),o=ln(H0(this,le));return n.parent=!0,o.ok=mt(t)?t:!0,o.fail=mt(r)&&r,o.domain=Et?jn.domain:void 0,n.state===Ha?n.reactions.add(o):kn(function(){Bs(o,n)}),o.promise}),Ga=function(){var e=new ht,t=jr(e);this.promise=e,this.resolve=be(cn,t),this.reject=be(Ce,t)},Ss.f=ln=function(e){return e===le||e===t2?new Ga(e):J0(e)},mt(Tt)&&me!==Object.prototype)){Ka=me.then,z0||qa(me,"then",function(t,r){var n=this;return new le(function(o,a){Ee(Ka,n,o,a)}).then(t,r)},{unsafe:!0});try{delete me.constructor}catch{}Va&&Va(me,ft)}j0({global:!0,constructor:!0,wrap:!0,forced:Rs},{Promise:le});F0(le,Bt,!1);U0(Bt);var o2=j,a2=Ke,i2=o2("iterator"),s2=Array.prototype,l2=function(e){return e!==void 0&&(a2.Array===e||s2[i2]===e)},c2=Ln,Za=pn,u2=Rt,d2=Ke,v2=j,f2=v2("iterator"),ks=function(e){if(!u2(e))return Za(e,f2)||Za(e,"@@iterator")||d2[c2(e)]},h2=G,g2=X,p2=W,y2=He,m2=ks,w2=TypeError,b2=function(e,t){var r=arguments.length<2?m2(e):t;if(g2(r))return p2(h2(r,e));throw new w2(y2(e)+" is not iterable")},C2=G,za=W,$2=pn,E2=function(e,t,r){var n,o;za(e);try{if(n=$2(e,"return"),!n){if(t==="throw")throw r;return r}n=C2(n,e)}catch(a){o=!0,n=a}if(t==="throw")throw r;if(o)throw n;return za(n),r},T2=Bn,I2=G,S2=W,R2=He,L2=l2,O2=Sn,Ya=Ve,P2=b2,A2=ks,Ja=E2,M2=TypeError,wt=function(e,t){this.stopped=e,this.result=t},Qa=wt.prototype,Ds=function(e,t,r){var n=r&&r.that,o=!!(r&&r.AS_ENTRIES),a=!!(r&&r.IS_RECORD),i=!!(r&&r.IS_ITERATOR),s=!!(r&&r.INTERRUPTED),l=T2(t,n),c,u,v,d,h,y,g,P=function(b){return c&&Ja(c,"normal",b),new wt(!0,b)},m=function(b){return o?(S2(b),s?l(b[0],b[1],P):l(b[0],b[1])):s?l(b,P):l(b)};if(a)c=e.iterator;else if(i)c=e;else{if(u=A2(e),!u)throw new M2(R2(e)+" is not iterable");if(L2(u)){for(v=0,d=O2(e);d>v;v++)if(h=m(e[v]),h&&Ya(Qa,h))return h;return new wt(!1)}c=P2(e,u)}for(y=a?e.next:c.next;!(g=I2(y,c)).done;){try{h=m(g.value)}catch(b){Ja(c,"throw",b)}if(typeof h=="object"&&h&&Ya(Qa,h))return h}return new wt(!1)},B2=j,js=B2("iterator"),Fs=!1;try{var N2=0,Xa={next:function(){return{done:!!N2++}},return:function(){Fs=!0}};Xa[js]=function(){return this},Array.from(Xa,function(){throw 2})}catch{}var _2=function(e,t){try{if(!t&&!Fs)return!1}catch{return!1}var r=!1;try{var n={};n[js]=function(){return{next:function(){return{done:r=!0}}}},e(n)}catch{}return r},k2=Mt,D2=_2,j2=We.CONSTRUCTOR,Us=j2||!D2(function(e){k2.all(e).then(void 0,function(){})}),F2=q,U2=G,x2=X,q2=Se,V2=_n,H2=Ds,G2=Us;F2({target:"Promise",stat:!0,forced:G2},{all:function(t){var r=this,n=q2.f(r),o=n.resolve,a=n.reject,i=V2(function(){var s=x2(r.resolve),l=[],c=0,u=1;H2(t,function(v){var d=c++,h=!1;u++,U2(s,r,v).then(function(y){h||(h=!0,l[d]=y,--u||o(l))},a)}),--u||o(l)});return i.error&&a(i.value),n.promise}});var K2=q,W2=We.CONSTRUCTOR,un=Mt,Z2=fe,z2=B,Y2=Te,ei=un&&un.prototype;K2({target:"Promise",proto:!0,forced:W2,real:!0},{catch:function(e){return this.then(void 0,e)}});if(z2(un)){var ti=Z2("Promise").prototype.catch;ei.catch!==ti&&Y2(ei,"catch",ti,{unsafe:!0})}var J2=q,Q2=G,X2=X,e3=Se,t3=_n,r3=Ds,n3=Us;J2({target:"Promise",stat:!0,forced:n3},{race:function(t){var r=this,n=e3.f(r),o=n.reject,a=t3(function(){var i=X2(r.resolve);r3(t,function(s){Q2(i,r,s).then(n.resolve,o)})});return a.error&&o(a.value),n.promise}});var o3=q,a3=Se,i3=We.CONSTRUCTOR;o3({target:"Promise",stat:!0,forced:i3},{reject:function(t){var r=a3.f(this),n=r.reject;return n(t),r.promise}});var s3=W,l3=K,c3=Se,u3=function(e,t){if(s3(e),l3(t)&&t.constructor===e)return t;var r=c3.f(e),n=r.resolve;return n(t),r.promise},d3=q,v3=fe,f3=We.CONSTRUCTOR,h3=u3;v3("Promise");d3({target:"Promise",stat:!0,forced:f3},{resolve:function(t){return h3(this,t)}});var g3=K,p3=Ue,y3=j,m3=y3("match"),w3=function(e){var t;return g3(e)&&((t=e[m3])!==void 0?!!t:p3(e)==="RegExp")},b3=w3,C3=TypeError,$3=function(e){if(b3(e))throw new C3("The method doesn't accept regular expressions");return e},E3=j,T3=E3("match"),I3=function(e){var t=/./;try{"/./"[e](t)}catch{try{return t[T3]=!1,"/./"[e](t)}catch{}}return!1},S3=q,R3=_,L3=$3,O3=xe,ri=Ie,P3=I3,A3=R3("".indexOf);S3({target:"String",proto:!0,forced:!P3("includes")},{includes:function(t){return!!~A3(ri(O3(this)),ri(L3(t)),arguments.length>1?arguments[1]:void 0)}});var M3={CSSRuleList:0,CSSStyleDeclaration:0,CSSValueList:0,ClientRectList:0,DOMRectList:0,DOMStringList:0,DOMTokenList:1,DataTransferItemList:0,FileList:0,HTMLAllCollection:0,HTMLCollection:0,HTMLFormElement:0,HTMLSelectElement:0,MediaList:0,MimeTypeArray:0,NamedNodeMap:0,NodeList:1,PaintRequestList:0,Plugin:0,PluginArray:0,SVGLengthList:0,SVGNumberList:0,SVGPathSegList:0,SVGPointList:0,SVGStringList:0,SVGTransformList:0,SourceBufferList:0,StyleSheetList:0,TextTrackCueList:0,TextTrackList:0,TouchList:0},B3=Ot,Fr=B3("span").classList,ni=Fr&&Fr.constructor&&Fr.constructor.prototype,N3=ni===Object.prototype?void 0:ni,oi=M,xs=M3,_3=N3,Ne=mf,ai=Pt,k3=At,D3=j,Ur=D3("iterator"),xr=Ne.values,qs=function(e,t){if(e){if(e[Ur]!==xr)try{ai(e,Ur,xr)}catch{e[Ur]=xr}if(k3(e,t,!0),xs[t]){for(var r in Ne)if(e[r]!==Ne[r])try{ai(e,r,Ne[r])}catch{e[r]=Ne[r]}}}};for(var qr in xs)qs(oi[qr]&&oi[qr].prototype,qr);qs(_3,"DOMTokenList");var Vs=`	
\v\f\r                　\u2028\u2029\uFEFF`,j3=_,F3=xe,U3=Ie,dn=Vs,ii=j3("".replace),x3=RegExp("^["+dn+"]+"),q3=RegExp("(^|[^"+dn+"])["+dn+"]+$"),V3=function(e){return function(t){var r=U3(F3(t));return e&1&&(r=ii(r,x3,"")),e&2&&(r=ii(r,q3,"$1")),r}},H3={trim:V3(3)},Hs=M,G3=k,K3=_,W3=Ie,Z3=H3.trim,si=Vs,De=Hs.parseInt,li=Hs.Symbol,ci=li&&li.iterator,Gs=/^[+-]?0x/i,z3=K3(Gs.exec),Y3=De(si+"08")!==8||De(si+"0x16")!==22||ci&&!G3(function(){De(Object(ci))}),J3=Y3?function(t,r){var n=Z3(W3(t));return De(n,r>>>0||(z3(Gs,n)?16:10))}:De,Q3=q,ui=J3;Q3({global:!0,forced:parseInt!==ui},{parseInt:ui});var X3=W,eh=function(){var e=X3(this),t="";return e.hasIndices&&(t+="d"),e.global&&(t+="g"),e.ignoreCase&&(t+="i"),e.multiline&&(t+="m"),e.dotAll&&(t+="s"),e.unicode&&(t+="u"),e.unicodeSets&&(t+="v"),e.sticky&&(t+="y"),t},th=G,rh=x,nh=Ve,oh=eh,di=RegExp.prototype,ah=function(e){var t=e.flags;return t===void 0&&!("flags"in di)&&!rh(e,"flags")&&nh(di,e)?th(oh,e):t},ih=bn.PROPER,sh=Te,lh=W,vi=Ie,ch=k,uh=ah,Un="toString",Ks=RegExp.prototype,Ws=Ks[Un],dh=ch(function(){return Ws.call({source:"a",flags:"b"})!=="/a/b"}),vh=ih&&Ws.name!==Un;(dh||vh)&&sh(Ks,Un,function(){var t=lh(this),r=vi(t.source),n=vi(uh(t));return"/"+r+"/"+n},{unsafe:!0});const Ze=`
<svg width="8" height="14" viewBox="0 0 8 14"
  fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 13L1 7L7 1" stroke="#6494EE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  </path>
</svg>`,V=`
<svg
  xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="#C1C1C1">
  <path d="M0 0h24v24H0z" fill="none"></path>
  <path
    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z">
  </path>
</svg>`;function xn(e,t){var r,n,o;return D(this,void 0,void 0,function*(){if(f){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header-wrapper"><button class="back-button" id="back-button">${Ze}</button>
        <div class="nws-modal-header">
          <h3 class="middleTitle">${A("modal.ledger.selectYourAccounts")}</h3>
            <button class="close-button">${V}</button>
        </div>
      </div>
      <div class="derivation-path-wrapper">
        <div class="choose-ledger-account-form-wrapper">
          <p>We found ${t.length} accounts on your device. Select the account(s) you wish to connect.</p>
          <div class="button-wrapper"><button id="change-derivation-path-button">HD.../${f.derivationPath.slice(-2,-1)}</button></div>
          <form class="form">
            <div>
              <div class="nws-form-control">
                <div id="accounts"></div>
              <div class="action-buttons"><button class="middleButton" id="connect-button">Connect</button></div>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;for(let a=0;a<t.length;a++)(r=document.getElementById("accounts"))===null||r===void 0||r.insertAdjacentHTML("beforeend",`
      <div class="account">
        <input type="checkbox" id="${t[a].accountId}" name="account" value="${t[a].accountId}" ${a===0?"checked":""}>
        <label for="${t[a].accountId}"> ${t[a].accountId}</label>
        <br>
      </div>
      `);(n=document.getElementById("change-derivation-path-button"))===null||n===void 0||n.addEventListener("click",()=>{Ys(e)}),(o=document.getElementById("connect-button"))===null||o===void 0||o.addEventListener("click",a=>{a.preventDefault();const i=Array.from(document.querySelectorAll("input[name='account']")).map(l=>l.checked),s=t.filter((l,c)=>i[c]);s.length<1||qn(e,t,s)})}})}const fh=`
<svg
  width="21"
  height="20"
  viewBox="0 0 21 20"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M10.5001 18.3333C15.1025 18.3333 18.8334 14.6023 18.8334 9.99996C18.8334 5.39759 15.1025 1.66663 10.5001 1.66663C5.89771 1.66663 2.16675 5.39759 2.16675 9.99996C2.16675 14.6023 5.89771 18.3333 10.5001 18.3333Z"
    stroke="#CE5A6F"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M13 7.5L8 12.5"
    stroke="#CE5A6F"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M8 7.5L13 12.5"
    stroke="#CE5A6F"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`,hh=`
  <svg
    width="14"
    height="12"
    viewBox="0 0 14 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6.91301 11.0202C6.91301 11.1866 6.8469 11.3462 6.72921 11.4639C6.61153 11.5816 6.45192 11.6477 6.28549 11.6477C3.11273 11.6477 0.515625 9.13343 0.515625 6C0.515625 2.86657 3.11273 0.352295 6.28549 0.352295C8.88343 0.352295 11.0957 2.03824 11.8119 4.36928L12.3164 3.51585C12.4011 3.3725 12.5392 3.26864 12.7004 3.22714C12.8616 3.18564 13.0328 3.20988 13.1761 3.29454C13.3195 3.3792 13.4233 3.51733 13.4648 3.67856C13.5063 3.83979 13.4821 4.0109 13.3974 4.15425L12.0336 6.45935C11.9501 6.60075 11.8145 6.70379 11.6559 6.74633C11.4972 6.78888 11.3283 6.76755 11.1852 6.68693L8.82403 5.35574C8.75222 5.31525 8.6891 5.26102 8.63825 5.19613C8.58741 5.13125 8.54984 5.05698 8.5277 4.97758C8.50556 4.89817 8.49927 4.81519 8.5092 4.73335C8.51913 4.65152 8.54508 4.57244 8.58557 4.50064C8.62606 4.42883 8.68029 4.36571 8.74518 4.31486C8.81007 4.26402 8.88433 4.22645 8.96373 4.20431C9.04314 4.18217 9.12613 4.17588 9.20796 4.18581C9.28979 4.19574 9.36887 4.22169 9.44067 4.26218L10.6723 4.95664C10.192 3.04228 8.42074 1.60734 6.28632 1.60734C3.77791 1.60734 1.77067 3.5878 1.77067 6C1.77067 8.4122 3.77791 10.3927 6.28549 10.3927C6.45192 10.3927 6.61153 10.4588 6.72921 10.5765C6.8469 10.6941 6.91301 10.8538 6.91301 11.0202Z"
      fill="white"
    />
  </svg>
`;function It(e,t){var r;return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header">
        <h3 class="middleTitle"></h3>
        <button class="close-button">
          ${V}
        </button>
      </div>
      <div class="alert-message connecting-wrapper connecting-wrapper-err">
        <div class="content">
          <div class="icon"><img src="${e.metadata.iconUrl}" alt="${e.metadata.name}"></div>
          <h3 class="connecting-name">${e.metadata.name}</h3>
          <div class="connecting-message">
            <span>The connection was not successful, please try again.</span>
          </div>
          <div class="connecting-details">
            <div class="connection">
              <div class="error-wrapper">
                  ${!e?.metadata.deprecated&&e?.metadata.available?`<button class="loading-dots" id='retry-button'>
                          ${hh}
                          ${A("modal.ledger.retry")}
                        </button>`:""}
                <div class="error-floating">
                  <div class="error">
                    ${fh}
                    ${A("modal.wallet.connectionFailed")}
                  </div>
                  <p>${t&&t.message?t.message:""}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,(r=document.getElementById("retry-button"))===null||r===void 0||r.addEventListener("click",()=>{ze(e,!1)})})}function qn(e,t,r){var n,o,a;return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
    <div class="nws-modal-header-wrapper">
      <button class="back-button" id="back-button">
        ${Ze}
      </button>
        <div class="nws-modal-header">
          <h3 class="middleTitle">
          ${A("modal.ledger.connecting")} ${r.length} ${A("modal.ledger.ofAccounts")}
          </h3>
    <button class="close-button">${V}</button>
        </div>
      </div>
      <div class="derivation-path-wrapper">
        <div class="overview-wrapper">
          <p>
            ${A("modal.ledger.overviewTheListOfAuthorized")}
          </p>
          <div class="accounts" id="accounts"></div>
          <div class="action-buttons">
            <button class="middleButton" id="finish-button">
              ${A("modal.ledger.finish")}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;for(let i=0;i<r.length;i++)(n=document.getElementById("accounts"))===null||n===void 0||n.insertAdjacentHTML("beforeend",`
        <div>
          <div class="account">
            <span>${r[i].accountId}</span>
          </div>
        </div>
      `);(o=document.getElementById("back-button"))===null||o===void 0||o.addEventListener("click",()=>{xn(e,t)}),(a=document.getElementById("finish-button"))===null||a===void 0||a.addEventListener("click",()=>D(this,void 0,void 0,function*(){try{if(!f)return;(yield e.wallet()).signIn({contractId:f.options.contractId,methodNames:f.options.methodNames,accounts:r}),f.container.children[0].classList.remove("open"),f.emitter.emit("onHide",{hideReason:"wallet-navigation"})}catch(i){yield It(e,i)}}))})}function Zs(e){var t;return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header-wrapper"><button class="back-button" id="back-button">${Ze}</button>
        <div class="nws-modal-header">
          <h3 class="middleTitle">
            ${A("modal.ledger.noAccountsFound")}
          </h3>
          <button class="close-button">${V}</button>
        </div>
      </div>
      <div class="derivation-path-wrapper">
        <div class="no-accounts-found-wrapper">
          <p>
            ${A("modal.ledger.cantFindAnyAccount")}
            <a href="https://testnet.mynearwallet.com/create" target="_blank">MyNearWallet</a>
            ${A("modal.ledger.orConnectAnAnotherLedger")}
          </p>
        </div>
      </div>
    </div>
  `,(t=document.getElementById("back-button"))===null||t===void 0||t.addEventListener("click",()=>{Vn(e)})})}function zs(e=null){return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header">
        <h3 class="middleTitle"></h3>
        <button class="close-button">
          ${V}
        </button>
      </div>
      <div class="connecting-wrapper">
        <div class="content">
          <div class="icon">
            <img src="${e?.metadata.iconUrl}" alt="${e?.metadata.name}">
          </div>
          <h3 class="connecting-name">${e?.metadata.name}</h3>
          <div class="connecting-message">
          <span>
          ${A("modal.wallet.connectingMessage."+e?.type)}
          </span>
          </div>
          <div class="connecting-details">
            <div class="loading-dots">
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `})}const gh=`
<svg width="10" height="7" viewBox="0 0 10 7" fill="none"
  xmlns="http://www.w3.org/2000/svg">
  <path d="M9 5.4762L5 1.4762L1 5.4762" stroke="#4F7CD1" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round"></path>
</svg>`,ph=`
<svg width="10" height="7" viewBox="0 0 10 7" fill="none"
  xmlns="http://www.w3.org/2000/svg">
  <path d="M1 1.52382L5 5.52382L9 1.52382" stroke="#4F7CD1" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round"></path>
</svg>`;function Ys(e){var t,r,n,o;if(!f)return;document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header-wrapper"><button class="back-button" id="back-button">${Ze}</button>
        <div class="nws-modal-header">
          <h3 class="middleTitle">
            ${A("modal.ledger.specifyHDPath")}
          </h3>
          <button class="close-button">
            ${V}
          </button>
        </div>
      </div>
      <div class="derivation-path-wrapper">
        <div class="specify-path-wrapper">
          <div class="change-path-wrapper">
            <div class="display-path"><span>44'/397'/0'/0'/</span></div>
            <div class="change-path">
              <div class="path-value"><span id="derivation-path-index"></span></div>
              <div class="buttons-wrapper">
                <button id="increase-index-button">
                  ${gh}
                </button>
                <button id="decrease-index-button">
                  ${ph}
                </button>
              </div>
            </div>
          </div>
          <p class="path-description">
            ${A("modal.ledger.enterYourPreferredHDPath")}
          </p>
          <p class="what-link">
            <a
              href="https://www.ledger.com/academy/crypto/what-are-hierarchical-deterministic-hd-wallets"
              target="_blank"
            >
              What's this?
            </a>
          </p>
          <div class="action-buttons">
            <button class="middleButton" id="scan-button">
            ${A("modal.ledger.scan")}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;const a=document.getElementById("derivation-path-index");a.innerText=f.derivationPath.slice(-2,-1),(t=document.getElementById("increase-index-button"))===null||t===void 0||t.addEventListener("click",()=>{if(!f)return;const i=parseInt(a.innerText)+1;f.derivationPath=f.derivationPath.slice(0,-2)+i.toString()+"'",a.innerText=i.toString()}),(r=document.getElementById("decrease-index-button"))===null||r===void 0||r.addEventListener("click",()=>{if(!f)return;const i=parseInt(a.innerText)-1;f.derivationPath=f.derivationPath.slice(0,-2)+i.toString()+"'",i>=0&&(a.innerText=i.toString())}),(n=document.getElementById("back-button"))===null||n===void 0||n.addEventListener("click",()=>{Vn(e)}),(o=document.getElementById("scan-button"))===null||o===void 0||o.addEventListener("click",()=>D(this,void 0,void 0,function*(){try{const i=yield e.wallet();zs(e);const s=yield Qs(i);if(!s||s.length<1)return Zs(e);s.length===1&&qn(e,s,s),xn(e,s)}catch(i){yield It(e,i)}}))}const yh=`
<svg width="317" height="157" viewBox="0 0 317 157" fill="none"
  xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M249.99 16.0994C270.063 -0.864155 289.788 1.58873 301.497 10.7365C307.402 15.3499 311.278 21.6575 312.267 28.1258C313.247 34.5412 311.413 41.2233 305.692 46.8044C297.366 54.9273 286.343 55.3362 273.015 51.5109C261.654 48.25 249.058 42.0377 235.726 35.4627L235.726 35.4626L235.717 35.458C233.367 34.2992 230.995 33.129 228.602 31.9618C212.742 24.2253 196.067 16.6575 179.842 13.8595C163.538 11.0479 147.552 13.0313 133.266 24.522C128.032 28.732 123.478 35.2086 121.716 44.8205C119.961 54.3947 120.992 66.9771 126.703 83.4311C135.432 108.583 132.899 126.677 123.575 138.063C114.217 149.491 97.5614 154.733 76.7887 153.121C55.0043 151.43 29.0621 142.206 3.29867 125.227L0.887817 127.942C27.2472 145.405 53.9251 154.952 76.5105 156.705C97.9028 158.365 115.96 153.035 126.356 140.341C136.785 127.606 139.045 108.029 130.099 82.2524C124.521 66.1801 123.642 54.2493 125.252 45.4687C126.854 36.7258 130.94 31.006 135.519 27.3232C148.794 16.6458 163.649 14.715 179.231 17.4021C194.891 20.1027 211.146 27.4463 227.026 35.1928C229.381 36.3415 231.729 37.5001 234.066 38.6531L234.073 38.6568C247.382 45.223 260.324 51.608 272.024 54.9662C285.819 58.9258 298.493 58.8501 308.202 49.3776C314.764 42.9759 316.974 35.1288 315.82 27.5826C314.675 20.0893 310.237 13.0029 303.71 7.90363C290.555 -2.37382 268.938 -4.62038 247.67 13.3537L249.99 16.0994Z"
    fill="url(#paint0_linear_3_672)"></path>
  <path d="M260.264 17.8767L177.605 89.4649L157.679 73.9664L239.23 3.85423L260.264 17.8767Z" fill="#6A7075">
  </path>
  <path d="M205.939 54.4577L199.764 50.2636L233.316 20.9053L239.907 25.8395L205.939 54.4577Z" fill="#494E52">
  </path>
  <path d="M260.264 17.8757L177.605 89.4639L182.033 98.3202L264.323 26.363L260.264 17.8757Z" fill="#494E52">
  </path>
  <path d="M177.236 89.4646L181.295 98.3209L165.059 85.7745L170.963 85.0365L177.236 89.4646Z" fill="black">
  </path>
  <path d="M93.4708 99.6384L91.9948 110.13L174.653 92.894L164.69 85.7749L93.4708 99.6384Z" fill="#DCDADA">
  </path>
  <path d="M93.1157 104.323L94.314 100.129L165.613 86.3483L169.208 89.344L93.1157 104.323Z" fill="#C1C1C1">
  </path>
  <path d="M94.2086 99.7963L86.0903 101.272L92.3635 110.129L94.2086 99.7963Z" fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M86.0903 100.907L89.0027 74.1304L178.455 55.2416C184.695 53.9962 195.766 54.7675 197.177 63.7058C198.284 70.717 195.506 73.9943 191.628 77.3592C188.495 80.0671 180.152 82.4646 178.343 82.8944C178.293 82.9064 178.241 82.9188 178.186 82.9319C177.38 83.1245 176.007 83.4525 170.644 84.5088C169.085 84.8158 167.382 85.1501 165.557 85.5078L164.933 85.63C146.312 89.2764 115.528 95.2297 93.9844 99.3849C91.1808 99.9257 88.5337 100.436 86.0903 100.907ZM185.076 75.554C190.748 73.3535 193.99 68.0745 192.318 63.7631C190.645 59.4517 184.691 57.7405 179.019 59.941C173.347 62.1416 170.105 67.4206 171.778 71.732C173.45 76.0434 179.404 77.7546 185.076 75.554Z"
    fill="#F4F1E8"></path>
  <path d="M199.764 50.3994L196.768 48.3043L232.194 18.0454L233.316 21.6403L199.764 50.3994Z" fill="black">
  </path>
  <path d="M239.968 25.9943L232.588 20.4592V17.5071L241.813 24.5183L239.968 25.9943Z" fill="black"></path>
  <ellipse cx="182.084" cy="68.0811" rx="10.242" ry="7.46772" transform="rotate(-23.7949 182.084 68.0811)"
    fill="#494E52"></ellipse>
  <ellipse cx="182.084" cy="68.0816" rx="6.68462" ry="4.87394" transform="rotate(-23.7949 182.084 68.0816)"
    fill="#494E52"></ellipse>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M238.725 2.93094L260.368 17.2564L264.865 26.4556L181.615 99.0341L175.16 94.311L92.0028 110.947L85.3267 101.399L88.3269 73.8157L178.118 54.8553L238.725 2.93094ZM178.599 56.2622L89.6786 75.0388L86.9321 100.29C89.0979 99.8725 91.4124 99.4263 93.8446 98.9572C115.388 94.8019 146.171 88.8488 164.791 85.2026L165.415 85.0804C167.24 84.7228 168.943 84.3885 170.501 84.0816C175.853 83.0275 177.219 82.701 178.015 82.5107C178.07 82.4976 178.122 82.4852 178.173 82.4732C179.048 82.2652 181.558 81.5669 184.235 80.5851C186.742 79.6655 189.286 78.5354 190.802 77.3758L191.151 77.0922L191.644 76.6595C193.341 75.147 194.723 73.6739 195.61 71.871C196.571 69.916 196.982 67.5029 196.448 64.1178C195.8 60.0131 192.959 57.7574 189.408 56.6566C185.833 55.5483 181.637 55.6566 178.603 56.2615C178.601 56.2617 178.6 56.262 178.599 56.2622ZM192.631 77.7565L259.555 18.9531L263.042 26.0869L181.808 96.9078L178.132 89.5713L191.724 78.529C191.859 78.4249 191.988 78.32 192.11 78.2144L192.111 78.2136C192.286 78.0617 192.46 77.9094 192.631 77.7565ZM185.491 81.6908C185.24 81.7868 184.99 81.8802 184.743 81.9709C182.013 82.9723 179.447 83.6875 178.514 83.9093C178.463 83.9213 178.411 83.9338 178.356 83.9468C177.635 84.1192 176.472 84.3971 172.491 85.1919L177.172 88.4492L185.491 81.6908ZM176.631 89.8707L170.479 85.5903C169.306 85.8213 168.054 86.0673 166.731 86.3265L175.769 92.9276L179.548 95.6924L176.631 89.8707ZM164.758 86.7132C146.252 90.3362 116.027 96.1817 94.6324 100.308L93.2258 109.197L173.543 93.1293L164.758 86.7132ZM91.888 108.207L93.0909 100.606C91.0848 100.993 89.1642 101.363 87.3471 101.713L91.888 108.207ZM258.581 17.8436L197.306 71.6841C198.142 69.5779 198.41 67.0795 197.906 63.8876C197.143 59.0539 193.743 56.4549 189.845 55.2467C186.921 54.3402 183.662 54.1916 180.861 54.449L238.84 4.77668L258.581 17.8436ZM232.505 16.82L243.089 24.5643L205.915 56.5106L196.042 48.0665L232.505 16.82ZM232.118 19.096L198.312 48.0654L199.744 49.29L232.584 20.9424L232.118 19.096ZM233.456 22.1396L200.878 50.2604L205.913 54.5664L239.041 26.0969L233.456 22.1396ZM240.195 25.1054L240.717 24.6571L233.759 19.5663L234.06 20.7586L240.195 25.1054Z"
    fill="black"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M190.194 69.9744C191.32 68.1409 191.576 66.2271 190.942 64.5937C190.308 62.9603 188.829 61.7198 186.761 61.1254C184.691 60.5307 182.116 60.6196 179.553 61.6139C176.991 62.6081 175.029 64.2794 173.902 66.1141C172.776 67.9477 172.52 69.8614 173.154 71.4948C173.788 73.1282 175.267 74.3687 177.335 74.9631C179.405 75.5578 181.98 75.4689 184.543 74.4746C187.105 73.4804 189.067 71.8091 190.194 69.9744ZM185.077 75.8508C190.749 73.6502 193.991 68.3712 192.318 64.0598C190.645 59.7484 184.691 58.0372 179.019 60.2378C173.347 62.4383 170.105 67.7173 171.778 72.0287C173.451 76.3401 179.405 78.0513 185.077 75.8508Z"
    fill="black"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M187.391 69.169C188.127 67.9713 188.266 66.7721 187.881 65.7812C187.497 64.7903 186.586 63.9984 185.235 63.6102C183.883 63.2216 182.173 63.2741 180.456 63.9404C178.738 64.6068 177.441 65.7208 176.705 66.9196C175.969 68.1172 175.83 69.3165 176.215 70.3074C176.599 71.2983 177.511 72.0901 178.861 72.4783C180.214 72.8669 181.923 72.8144 183.64 72.1481C185.358 71.4818 186.655 70.3678 187.391 69.169ZM184.174 73.5242C188.156 71.9795 190.432 68.2738 189.257 65.2473C188.083 62.2208 183.904 61.0196 179.922 62.5643C175.94 64.1091 173.665 67.8148 174.839 70.8412C176.013 73.8677 180.193 75.0689 184.174 73.5242Z"
    fill="black"></path>
  <path
    d="M240.499 41.2441C239.744 40.3649 239.844 39.04 240.724 38.285L249.781 30.5067C250.66 29.7516 251.985 29.8523 252.74 30.7315V30.7315C253.495 31.6108 253.395 32.9356 252.516 33.6907L243.458 41.469C242.579 42.224 241.254 42.1234 240.499 41.2441V41.2441Z"
    fill="black"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M250.743 31.6265L241.685 39.4048C241.424 39.6287 241.395 40.0217 241.619 40.2825C241.842 40.5433 242.235 40.5731 242.496 40.3492L251.554 32.5709C251.815 32.3469 251.845 31.954 251.621 31.6932C251.397 31.4324 251.004 31.4025 250.743 31.6265ZM240.724 38.285C239.844 39.04 239.744 40.3649 240.499 41.2441C241.254 42.1234 242.579 42.224 243.458 41.469L252.516 33.6907C253.395 32.9356 253.495 31.6108 252.74 30.7315C251.985 29.8523 250.66 29.7516 249.781 30.5067L240.724 38.285Z"
    fill="black"></path>
  <path
    d="M205.779 71.4647C205.005 70.5642 205.108 69.2073 206.009 68.4339L214.989 60.7218C215.89 59.9485 217.247 60.0516 218.02 60.9521V60.9521C218.793 61.8526 218.69 63.2095 217.79 63.9829L208.809 71.695C207.909 72.4683 206.552 72.3652 205.779 71.4647V71.4647Z"
    fill="black"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M215.951 61.8416L206.97 69.5537C206.688 69.796 206.656 70.221 206.898 70.5031C207.141 70.7851 207.566 70.8174 207.848 70.5752L216.828 62.863C217.11 62.6208 217.143 62.1958 216.9 61.9137C216.658 61.6317 216.233 61.5994 215.951 61.8416ZM206.009 68.4339C205.108 69.2073 205.005 70.5642 205.779 71.4647C206.552 72.3652 207.909 72.4683 208.809 71.695L217.79 63.9829C218.69 63.2095 218.793 61.8526 218.02 60.9521C217.247 60.0516 215.89 59.9485 214.989 60.7218L206.009 68.4339Z"
    fill="black"></path>
  <circle cx="141.356" cy="19.525" r="10.1855" fill="#FE89B4"></circle>
  <ellipse cx="139.062" cy="14.7094" rx="2.42519" ry="1.94015" transform="rotate(-34.544 139.062 14.7094)"
    fill="#FDF7FF"></ellipse>
  <circle cx="252.489" cy="79.7577" r="7.78893" fill="#EC5236"></circle>
  <ellipse cx="250.434" cy="76.3701" rx="2.61272" ry="2.09018" transform="rotate(-34.544 250.434 76.3701)"
    fill="#EDB69D"></ellipse>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M100.436 79.9254C100.461 79.6567 100.732 79.3897 101.042 79.329L106.657 78.2299C107.587 78.0478 108.281 78.5536 108.207 79.3596L107.759 84.2243C107.734 84.493 107.463 84.76 107.153 84.8207L100.416 86.1396C100.106 86.2003 99.8742 86.0317 99.899 85.7631L100.436 79.9254Z"
    fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M95.8553 81.7775C95.9294 80.9715 96.7437 80.1704 97.6739 79.9883L98.7968 79.7685C99.1069 79.7078 99.3382 79.8764 99.3135 80.1451L99.1344 82.091C99.1096 82.3597 98.8382 82.6267 98.5282 82.6874L96.2824 83.127C95.9723 83.1877 95.741 83.0191 95.7657 82.7505L95.8553 81.7775Z"
    fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M95.5865 84.6965C95.6112 84.4278 95.8826 84.1608 96.1927 84.1001L98.4385 83.6605C98.7486 83.5998 98.9799 83.7684 98.9552 84.037L98.7761 85.9829C98.7513 86.2516 98.4799 86.5186 98.1699 86.5793L95.9241 87.019C95.614 87.0797 95.3827 86.9111 95.4074 86.6424L95.5865 84.6965Z"
    fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M95.2282 88.5884C95.2529 88.3197 95.5244 88.0527 95.8344 87.992L98.0802 87.5524C98.3903 87.4917 98.6216 87.6603 98.5969 87.929L98.4178 89.8749C98.3931 90.1435 98.1216 90.4105 97.8116 90.4712L96.6887 90.6911C95.7584 90.8732 95.0645 90.3674 95.1387 89.5614L95.2282 88.5884Z"
    fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M99.7197 87.709C99.7444 87.4403 100.016 87.1733 100.326 87.1126L102.572 86.673C102.882 86.6123 103.113 86.7809 103.088 87.0496L102.909 88.9955C102.885 89.2641 102.613 89.5312 102.303 89.5919L100.057 90.0315C99.7472 90.0922 99.5159 89.9236 99.5406 89.6549L99.7197 87.709Z"
    fill="#B3AAAA"></path>
  <path fill-rule="evenodd" clip-rule="evenodd"
    d="M104.211 86.8298C104.236 86.5611 104.507 86.2941 104.817 86.2334L107.063 85.7938C107.373 85.7331 107.605 85.9017 107.58 86.1704L107.49 87.1433C107.416 87.9493 106.602 88.7504 105.672 88.9325L104.549 89.1523C104.239 89.213 104.007 89.0444 104.032 88.7757L104.211 86.8298Z"
    fill="#B3AAAA"></path>
  <defs>
    <linearGradient id="paint0_linear_3_672" x1="-44.5195" y1="122.42" x2="263.357" y2="-8.65023"
      gradientUnits="userSpaceOnUse">
      <stop offset="0.110697" stop-color="#232323"></stop>
      <stop offset="1" stop-color="#3D3D3D"></stop>
    </linearGradient>
  </defs>
 </svg>`;function Vn(e){var t,r;f&&(f.derivationPath=tl,document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header-wrapper">
        <div class="nws-modal-header">
          <h3 class="middleTitle">
            ${A("modal.ledger.connectWithLedger")}
          </h3>
          <button class="close-button">
          ${V}
          </button>
        </div>
      </div>
      <div class="derivation-path-wrapper">
        <div class="enter-derivation-path">
          <div class="ledger-image">
            ${yh}
          </div>
          <div class="ledger-description">
            <p> ${A("modal.ledger.makeSureYourLedger")} </p>
            <p class="specify-path" id="specify-derivation-path-button">${A("modal.ledger.specifyHDPath")}</p>
          </div>
          <div class="action-buttons"><button class="middleButton" id="continue-button">${A("modal.ledger.continue")}</button></div>
        </div>
      </div>
    </div>
  `,(t=document.getElementById("continue-button"))===null||t===void 0||t.addEventListener("click",()=>{ze(e,!1)}),(r=document.getElementById("specify-derivation-path-button"))===null||r===void 0||r.addEventListener("click",()=>{Ys(e)}))}const mh=`
<svg
  width="18"
  height="16"
  viewBox="0 0 18 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M7.22224 1.33334H1.44446V6.66668H7.22224V1.33334Z"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M15.8889 1.33334H10.1111V6.66668H15.8889V1.33334Z"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M7.22224 9.33334H1.44446V14.6667H7.22224V9.33334Z"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M10.1111 13.1429V14.6667H15.8889M10.1111 9.33334V10.8572H12.5873V9.33334H15.8889V12.381"
    stroke="#4C5155"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <rect
    x="3.61108"
    y="3.33334"
    width="1.44444"
    height="1.33333"
    fill="#4C5155"
  />
  <rect
    x="3.61108"
    y="11.3333"
    width="1.44444"
    height="1.33333"
    fill="#4C5155"
  />
  <rect
    x="12.2778"
    y="3.33334"
    width="1.44445"
    height="1.33333"
    fill="#4C5155"
  />
</svg>`,wh=`
<svg
  width="18"
  height="16"
  viewBox="0 0 18 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M13 8.66667V12.6667C13 13.0203 12.8478 13.3594 12.577 13.6095C12.3061 13.8595 11.9387 14 11.5556 14H3.61113C3.22804 14 2.86064 13.8595 2.58975 13.6095C2.31887 13.3594 2.16669 13.0203 2.16669 12.6667V5.33333C2.16669 4.97971 2.31887 4.64057 2.58975 4.39052C2.86064 4.14048 3.22804 4 3.61113 4H7.94447"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M10.8333 2H15.1666V6"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M7.22223 9.33333L15.1667 2"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;function fi(e){if(!f)return;let t="";return e.type==="injected"&&(t=e.metadata.downloadUrl),e.type==="browser"&&(t=e.metadata.walletUrl),t}function hi(){var e,t;return D(this,void 0,void 0,function*(){if(!f)return;document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="wallet-home-wrapper">
        <div class="nws-modal-header-wrapper">
        <button class="back-button" id="back-button">
          ${Ze}
        </button>
          <div class="nws-modal-header">
            <h3 class="middleTitle -open">${A("modal.wallet.getAWallet")}</h3>
            <button class="close-button">
              ${V}
            </button>
          </div>
        </div>
        <div class="get-wallet-wrapper" id="wallets">

        </div>
      </div>
    </div>
  `;const r=o=>o.type!=="bridge"&&o.type!=="hardware"&&o.type!=="instant-link",n=f.modules.filter(r);for(let o=0;o<n.length;o++){const a=["nearfi","here-wallet"].includes(n[o].id),i=n[o].id==="here-wallet"?"mobile":"",s=fi(n[o]);(e=document.getElementById("wallets"))===null||e===void 0||e.insertAdjacentHTML("beforeend",`
    <div tabindex="0" class="single-wallet-get ${n[o].id}" id="${n[o].id}">
      <div class="small-icon">
      ${a&&s?`${mh}`:!a&&s?`${wh}`:""}

      </div>
      <div class="icon">
      <img
          src="${n[o].metadata.iconUrl}"
          alt="${n[o].metadata.name}"></div>
      <div class="content">
        <div class="title">${n[o].metadata.name}</div>
        <div class="type">${A(`modal.walletTypes.${i||n[o].type}`)}</div>
      </div>
    </div>
`)}Array.from(document.querySelectorAll(".single-wallet-get")).forEach(o=>{o.addEventListener("click",()=>{if(!f)return;const a=f.modules.find(s=>s.id===o.id);if(!a)return;const i=fi(a);i&&window.open(i,"_blank")})}),(t=document.getElementById("back-button"))===null||t===void 0||t.addEventListener("click",()=>{Hn()})})}const bh=`
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M5 6.5C5 6.36739 5.05268 6.24021 5.14645 6.14645C5.24021 6.05268 5.36739 6 5.5 6H16C16.2652 6 16.5196 5.89464 16.7071 5.70711C16.8946 5.51957 17 5.26522 17 5C17 4.73478 16.8946 4.48043 16.7071 4.29289C16.5196 4.10536 16.2652 4 16 4H5.5C4.83696 4 4.20107 4.26339 3.73223 4.73223C3.26339 5.20107 3 5.83696 3 6.5V18C3 18.5304 3.21071 19.0391 3.58579 19.4142C3.96086 19.7893 4.46957 20 5 20H19C19.5304 20 20.0391 19.7893 20.4142 19.4142C20.7893 19.0391 21 18.5304 21 18V9C21 8.46957 20.7893 7.96086 20.4142 7.58579C20.0391 7.21071 19.5304 7 19 7H5.5C5.36739 7 5.24021 6.94732 5.14645 6.85355C5.05268 6.75979 5 6.63261 5 6.5ZM15.5 15C15.8978 15 16.2794 14.842 16.5607 14.5607C16.842 14.2794 17 13.8978 17 13.5C17 13.1022 16.842 12.7206 16.5607 12.4393C16.2794 12.158 15.8978 12 15.5 12C15.1022 12 14.7206 12.158 14.4393 12.4393C14.158 12.7206 14 13.1022 14 13.5C14 13.8978 14.158 14.2794 14.4393 14.5607C14.7206 14.842 15.1022 15 15.5 15Z"
      fill="#888888"
    />
  </svg>
`;function Hn(){var e,t;return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="wallet-home-wrapper">
        <div class="wallet-info-wrapper">
          <div class="wallet-info-wrapper">
            <div class="info">
              ${bh}
              <p>
                Wallets let you store digital assets like crypto, and log into
                apps on NEAR.
              </p>
              <p>Please select a wallet on the left, or</p>
              <p class="button" id="get-a-wallet-button">
                Create a new wallet
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  `,(e=document.getElementById("get-a-wallet-button"))===null||e===void 0||e.addEventListener("click",()=>{hi()}),(t=document.getElementById("get-a-wallet-button-mobile"))===null||t===void 0||t.addEventListener("click",()=>{hi()})})}function Ch(e){var t,r,n;f&&(document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
      <div class="nws-modal-header-wrapper">
        <div class="nws-modal-header">
          <h3 class="middleTitle"></h3><button id="back-button" class="close-button">${V}</button>
        </div>
      </div>
      <div class="wallet-not-installed-wrapper">
        <div class="wallet-data">
          <div class="wallet-icon-box"><img
              src="${e.metadata.iconUrl}" alt="${e.metadata.name}">
          </div>
          <p>
            ${e.metadata.name}
          </p>
        </div>
        <p>
          ${A("modal.install.youllNeedToInstall")} ${e.metadata.name}
          ${A("modal.install.toContinueAfterInstalling")}
          <span class="refresh-link" id="refresh-page-lint">&nbsp;
            ${A("modal.install.refreshThePage")}
          </span>
        </p>
        <div class="action-buttons">
          <button class="middleButton" id="download-button">
            ${A("modal.install.open")} ${e.metadata.name}
          </button>
        </div>
      </div>
    </div>
  `,(t=document.getElementById("back-button"))===null||t===void 0||t.addEventListener("click",()=>{Hn()}),(r=document.getElementById("refresh-page-lint"))===null||r===void 0||r.addEventListener("click",()=>{window.location.reload()}),(n=document.getElementById("download-button"))===null||n===void 0||n.addEventListener("click",()=>{e.type==="injected"&&window.open(e.metadata.downloadUrl,"_blank")}))}const $h=`
<svg
  width="21"
  height="20"
  viewBox="0 0 21 20"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M18.8333 9.2333V9.99997C18.8323 11.797 18.2504 13.5455 17.1744 14.9848C16.0984 16.4241 14.586 17.477 12.8628 17.9866C11.1395 18.4961 9.29768 18.4349 7.61202 17.8121C5.92636 17.1894 4.48717 16.0384 3.50909 14.5309C2.53101 13.0233 2.06645 11.24 2.18469 9.4469C2.30293 7.65377 2.99763 5.94691 4.16519 4.58086C5.33275 3.21482 6.91061 2.26279 8.66345 1.86676C10.4163 1.47073 12.2502 1.65192 13.8916 2.3833"
    stroke="#4FD98F"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M18.8333 3.33337L10.5 11.675L8 9.17504"
    stroke="#4FD98F"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;function Js(e=null){return D(this,void 0,void 0,function*(){document.querySelector(".modal-right").innerHTML=`
    <div class="nws-modal-body">
    <div class="nws-modal-header">
        <h3 class="middleTitle"></h3>
        <button class="close-button">
          ${V}
        </button>
      </div>
      <div class="connecting-wrapper">
        <div class="content">
          <div class="icon">
            <div class="green-dot"></div>
            <img src="${e?.metadata.iconUrl}" alt="${e?.metadata.name}">
          </div>
          <h3 class="connecting-name">${e?.metadata.name}</h3>
          <div class="wallet-connected-success">
             ${$h}
            <span>
              ${A("modal.wallet.connectionSuccessful")}
            </span>
          </div>
        </div>
      </div>
    </div>
  `})}function Eh(e,t){var r,n,o;return D(this,void 0,void 0,function*(){function a(v){return D(this,void 0,void 0,function*(){return yield Bl.toString(v,{margin:0,type:"svg"})})}const i=yield a(t.uri);document.querySelector(".modal-right").innerHTML=`
      <div class="nws-modal-body">
        <section class="scan-qr-code">
          <div class="nws-modal-header">
            <button class="close-button">
                ${V}
            </button>
          </div>
          <section class="qr-code">
            <img src="${e?.metadata.iconUrl}" alt="${e?.metadata.name}" />
            <div>
                ${i}
            </div>
            <p>Please scan this QR code
 to connect your wallet.</p>
            <p>
              <span class="copy-to-clipboard" id="copy-uri-to-clipboard">
                ${A("modal.qr.copyToClipboard")}
              </span>
              or
              <span class="open-in-official-dialogue" id="default-modal-trigger">
                open in official dialogue
              </span>
            </p>
        </section>
      </section>
    </div>
`,(r=document.getElementById("continue-button"))===null||r===void 0||r.addEventListener("click",()=>{ze(e,!1)});const s=document.getElementById("copy-uri-to-clipboard"),l=document.getElementById("uri-copy-notification"),c=v=>{l&&s&&(l.innerHTML=v,l.style.display="block",s.style.display="none")},u=()=>{l&&s&&(s.style.display="flex",l.style.display="none")};(n=document.getElementById("copy-uri-to-clipboard"))===null||n===void 0||n.addEventListener("click",()=>{if(!t.uri)return;dl(t.uri)?(c(A("modal.qr.copiedToClipboard")),setTimeout(()=>u(),1200)):(c(A("modal.qr.failedToCopy")),setTimeout(()=>u(),1200))}),(o=document.getElementById("default-modal-trigger"))===null||o===void 0||o.addEventListener("click",()=>{t.handleOpenDefaultModal()})})}const Th=`
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4.95215 16.3536L10.2152 5.85657C10.9531 4.38481 13.0538 4.38519 13.7912 5.85723L19.0494 16.3543C19.7156 17.6841 18.7486 19.25 17.2612 19.25H6.74001C5.25228 19.25 4.28535 17.6835 4.95215 16.3536Z" stroke="#E6B73E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
  <path d="M12 10V12" stroke="#E6B73E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  <path d="M12.5 16C12.5 16.2761 12.2761 16.5 12 16.5C11.7239 16.5 11.5 16.2761 11.5 16C11.5 15.7239 11.7239 15.5 12 15.5C12.2761 15.5 12.5 15.7239 12.5 16Z" stroke="#E6B73E"></path>
 </svg>`;let gi=!0;const Ih=e=>D(void 0,void 0,void 0,function*(){if(!f)return[];const t=`${f.selector.options.network.indexerUrl}/public_key/ed25519:${e}`,r=yield fetch(t);if(!r.ok)throw new Error("Failed to get account ID from public key");const n=yield r.json(),{account_ids:o}=n;return Array.isArray(o)?o:[]}),Qs=e=>D(void 0,void 0,void 0,function*(){if(!f)return[];const t=yield e.getPublicKey(f.derivationPath);try{return(yield Ih(t)).map((n,o)=>({derivationPath:f.derivationPath,publicKey:t,accountId:n,selected:o===0}))}catch{return null}});function ze(e,t=!1){return D(this,void 0,void 0,function*(){if(!f)return;const{selectedWalletId:r}=f.selector.store.getState();if(r===e.id){Js(e);return}try{if(e.type==="injected"&&!e.metadata.available)return Ch(e);if(e.metadata.deprecated)return It(e,new Error("Wallet is deprecated"));const n=yield e.wallet();if(yield zs(e),n.type==="hardware"){const o=yield Qs(n);return!o||o.length<1?Zs(e):o.length===1?qn(e,o,o):xn(e,o)}if(n.type==="bridge"){const o=f.selector.on("uriChanged",({uri:a})=>{Eh(e,{uri:a,handleOpenDefaultModal:()=>{ze(e,!0)}})});yield n.signIn({contractId:f.options.contractId,methodNames:f.options.methodNames,qrCodeModal:t}),o.remove(),ce(),f.emitter.emit("onHide",{hideReason:"wallet-navigation"});return}if(n.type==="browser"){yield n.signIn({contractId:f.options.contractId,methodNames:f.options.methodNames,successUrl:n.metadata.successUrl,failureUrl:n.metadata.failureUrl}),ce(),f.emitter.emit("onHide",{hideReason:"wallet-navigation"});return}yield n.signIn({contractId:f.options.contractId,methodNames:f.options.methodNames}),ce(),f.emitter.emit("onHide",{hideReason:"wallet-navigation"})}catch(n){const{name:o}=e.metadata,a=n&&typeof n=="object"&&"message"in n?n.message:"Something went wrong";yield It(e,new Error(`Failed to sign in with ${o}: ${a}`))}})}function Xs(e,t){var r,n;if(f)for(let o=0;o<t.length;o++){const a=t[o];if(t[o].type==="instant-link"&&f.selector.store.getState().selectedWalletId!==a.id)continue;const{name:i,description:s,iconUrl:l}=a.metadata;(r=document.querySelector(e))===null||r===void 0||r.insertAdjacentHTML("beforeend",`
        <div tabindex="0" class="single-wallet ${a.id===f.selector.store.getState().selectedWalletId?"selected-wallet connected-wallet":""} sidebar ${a.metadata.deprecated?"deprecated-wallet":""} ${a.id}" id="module-${a.id}">
          <div class="icon"><img src="${l}" alt="${i}"></div>
          <div class="content">
            <div class="title">${i}</div>
            <div class="description">${s}</div>
          </div>
          ${a.metadata.deprecated?`
              <div class="warning-triangle">
                ${Th}
              </div>
                `:""}
        </div>
      `),(n=document.getElementById("module-"+a.id))===null||n===void 0||n.addEventListener("click",()=>{var c;if(document.querySelectorAll(".selected-wallet").forEach(u=>{u.classList.remove("selected-wallet")}),(c=document.getElementById("module-"+a.id))===null||c===void 0||c.classList.add("selected-wallet"),a.type==="hardware")return Vn(a);ze(a,!1)})}}const Sh=()=>{if(!f)return;const e=[],t=[];f.modules.forEach(o=>{f?.selector.store.getState().recentlySignedInWallets.includes(o.id)?t.push(o):e.push(o)});const r=document.querySelector(".wallet-options-wrapper");r&&(r.innerHTML="");let n=[];f.selector.options.optimizeWalletOrder&&t.length>0?(n=[...t],f.selector.options.randomizeWalletOrder?n=[...n,...e.sort(()=>Math.random()-.5)]:n=[...n,...e]):n=[...f.modules],r?.insertAdjacentHTML("beforeend",'<div class="options-list"></div>'),Xs(".options-list",n)},Rh=()=>{f&&(f.selector.setRememberRecentWallets(),Sh())};function pi(){var e,t,r,n;if(!f)return;const{rememberRecentWallets:o,selectedWalletId:a}=f.selector.store.getState();f.container.innerHTML=`
    <div class="nws-modal-wrapper ${f.options.theme==="dark"?"dark-theme":""}">
      <div class="nws-modal-overlay"></div>
      <div class="nws-modal-background">
        <div class="nws-modal-title-wrapper">
          <h2 class="nws-modal-title">
          ${A("modal.wallet.connectYourWallet")}
          </h2>
          <button class="close-button">
            ${V}
          </button>
        </div>
        <div class="nws-modal">
          <div class="modal-left">
            <div class="nws-modal-body">
              <div class="wallet-options-wrapper"></div>
            </div>
          </div>
          <div class="modal-right"></div>
        </div>
      </div>
    </div>
  `,(e=document.getElementById("rememberWalletSwitch"))===null||e===void 0||e.addEventListener("change",Rh);const i=[],s=[];f.modules.forEach(c=>{f?.selector.store.getState().recentlySignedInWallets.includes(c.id)?s.push(c):i.push(c)});let l=[];if(f.selector.options.optimizeWalletOrder&&s.length>0){if(l=[...s],f.selector.options.randomizeWalletOrder?l=[...l,...i.sort(()=>Math.random()-.5)]:l=[...l,...i],!a&&s.length>0){const c=s[0];(t=document.querySelector(`#module-${c.id}`))===null||t===void 0||t.classList.add("selected-wallet")}}else l=[...f.modules];(r=document.querySelector(".wallet-options-wrapper"))===null||r===void 0||r.insertAdjacentHTML("beforeend",'<div class="options-list"></div>'),Xs(".options-list",l),(n=document.querySelector(".nws-modal-overlay"))===null||n===void 0||n.addEventListener("click",()=>{f&&(ce(),f.emitter.emit("onHide",{hideReason:"user-triggered"}))}),gi&&(document.addEventListener("click",c=>{if(!f)return;const u=c.target;u&&u.className==="close-button"&&(ce(),f.emitter.emit("onHide",{hideReason:"user-triggered"}))}),gi=!1)}const el="near-wallet-selector-modal",tl="44'/397'/0'/0'/1'";let Vr=null,f=null;function ce(){if(!f)return;const e=f.container.children[0];e&&(e.classList.remove("open"),e.classList.add("closing"),setTimeout(()=>{f&&e&&e.classList.remove("closing")},200))}if(typeof window<"u"){const e=document.createElement("div");e.id=el,document.body.appendChild(e)}const Ph=(e,t)=>{const r=new al;e.store.getState().modules.forEach(o=>D(void 0,void 0,void 0,function*(){if("topLevelInjected"in o.metadata){if(!o.metadata.topLevelInjected)return;const a=yield o.wallet();if(a.type!=="injected")return;yield a.signIn({contractId:t.contractId,methodNames:t.methodNames})}})),f={container:document.getElementById(el),selector:e,options:t,route:{name:"WalletOptions"},modules:[],derivationPath:tl,emitter:r},f.selector.store.observable.subscribe(o=>{f&&(e.options.optimizeWalletOrder&&(o.modules.sort((a,i)=>a.metadata.deprecated===i.metadata.deprecated?0:a.metadata.deprecated?1:-1),o.modules.sort((a,i)=>i.metadata.available===a.metadata.available?0:i.metadata.available?1:-1)),f.modules=o.modules)});const n=o=>{if(o.key==="Escape"){if(!f)return;ce(),f.emitter.emit("onHide",{hideReason:"user-triggered"})}};return window.addEventListener("keydown",n),pi(),Vr||(Vr={show:()=>{if(!f)return;il(f.selector.options.languageCode),pi();const o=f.selector.store.getState().selectedWalletId;if(o){const a=f.modules.find(i=>i.id===o);Js(a)}else Hn();f.container.children[0].classList.add("open")},hide:()=>{ce()},on:(o,a)=>f.emitter.on(o,a),off:(o,a)=>{f.emitter.off(o,a)}}),Vr};export{Ph as setupModal};
