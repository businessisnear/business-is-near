// In-process admission for this finite LOCAL server; not durable browser CAS.
// Original inspection remains read-only and may bypass this new-action guard.
const check=(v,m)=>{if(!v)throw Error(m);};
export function createApprovalFlight(){
 let active=null;
 return {
  assertIdle(){check(active===null,'An exact approval is already in flight; inspect it before another action');},
  begin(){this.assertIdle();const token=Object.freeze({});active=token;return token;},
  finish(token){check(active!==null&&active===token,'Only the current exact approval may release its flight');active=null;}
 };
}
