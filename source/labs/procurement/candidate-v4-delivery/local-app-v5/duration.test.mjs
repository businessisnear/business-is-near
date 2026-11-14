import test from 'node:test';
import assert from 'node:assert/strict';
import {localDurationSettings} from './duration.mjs';
test('default duration remains fifteen minutes with one shared millisecond value',()=>{
 assert.deepEqual(localDurationSettings(undefined),{minutes:15,milliseconds:900000});
 assert.ok(Object.isFrozen(localDurationSettings()));
});
test('explicit future local duration accepts each integer from fifteen through thirty',()=>{
 for(let minutes=15;minutes<=30;minutes++)assert.deepEqual(localDurationSettings(String(minutes)),{minutes,milliseconds:minutes*60000});
});
test('out-of-bounds, ambiguous or non-string configuration refuses',()=>{
 for(const value of ['',null,15,30,true,{},'14','31','0','60','015','30.0','15e0',' 30','30 ','+30','-15','NaN','Infinity','15\n'])assert.throws(()=>localDurationSettings(value),/integer from 15 through 30/);
});
