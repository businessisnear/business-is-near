// Called only after the loopback server's capability, origin and POST checks.
// The caller cannot supply native state, final receipts or a journal override.
export async function companyCommand({pathname,body,company,requireReconciledReviews,readVerifiedState}){
 requireReconciledReviews();
 if(pathname==='/api/company/plan')return company.propose(body);
 if(pathname==='/api/company/approve')return company.approve(body);
 if(pathname==='/api/company/reconcile'){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw Error('Company reconciliation accepts no caller-supplied state');
  return company.reconcileVerifiedState(await readVerifiedState());
 }
 throw Error('Unsupported company route');
}
