// The pinned NEAR transaction serializer reads the Node-style Buffer global.
// Resolve the npm browser implementation explicitly, rather than a Node builtin.
import {Buffer as BrowserBuffer} from 'buffer/index.js';
if(typeof globalThis.Buffer==='undefined')globalThis.Buffer=BrowserBuffer;
if(typeof globalThis.Buffer?.from!=='function'||typeof globalThis.Buffer?.isBuffer!=='function')throw Error('The wallet binary serializer is unavailable.');
