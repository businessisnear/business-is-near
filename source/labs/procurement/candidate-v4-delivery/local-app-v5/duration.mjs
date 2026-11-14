// Future-run configuration only. Invalid input refuses before sandbox creation.
export function localDurationSettings(raw){
 if(raw!==undefined&&(typeof raw!=='string'||!/^(?:1[5-9]|2[0-9]|30)$/.test(raw)))throw Error('V5_LOCAL_DURATION_MINUTES must be an integer from 15 through 30');
 const minutes=raw===undefined?15:Number(raw);
 return Object.freeze({minutes,milliseconds:minutes*60*1000});
}
