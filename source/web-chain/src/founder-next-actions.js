// Ready-made starting points, not model analysis. Choosing one grants no authority.
const context = 'Write finished visitor copy, not a plan or draft commentary. Use approved facts only. No unsupported adjectives; invent no customers, sales, credentials, prices, testimonials, contacts, URLs or completed actions. Keep fictional demos fictional.';
const starter = (id, title, description, operation, brief) => Object.freeze({id, title, description, operation, brief, mode: 'draft'});
export const FOUNDER_STARTING_POINTS = Object.freeze([
  starter('website', 'Build your first website draft', 'A clear homepage gives people one place to understand your offer. Start here.', 'website_build', 'Write actual visitor-facing homepage copy using only the approved facts. Lead with the offer and what is included. Do not describe what a draft will contain or promise future work. Omit unsupported adjectives, unknown details, prices, testimonials, contact details and links. Keep a fictional demo clearly fictional.'),
  starter('offer', 'Explain your offer', 'Turn your approved facts into a short, easy-to-understand service description.', 'content_draft', 'Explain the offer in plain language using only the approved company facts. State what is included and who it helps only when those facts are supplied. Leave unknown details out.'),
  starter('questions', 'Answer common questions', 'Draft useful answers where the facts support them. Flag gaps for you to fill.', 'content_draft', 'Draft a short customer FAQ using only the approved company facts. Answer only what the facts support. List unanswered questions as owner follow-up rather than guessing.'),
  starter('introduction', 'Introduce your business', 'Create a concise introduction without invented history or credentials.', 'content_draft', 'Write a concise business introduction using only the approved company facts. Explain the supplied service and offer. Do not invent a history, team, location, credentials or customer results.'),
  starter('included', 'Make the offer easy to scan', 'Show what is included as a simple checklist.', 'content_draft', 'Turn the approved company facts into a clear offer checklist. Include only supplied deliverables and limits. Do not add services, guarantees, prices, booking steps or contact details.'),
  starter('announcement', 'Draft an introduction post', 'Prepare text you can review and use later. This does not post anywhere.', 'content_draft', 'Draft a short introduction post using only the approved company facts. Clearly label a fictional demo when applicable. Do not invent a launch date, availability, sales, social handle, contact details or links.'),
]);
export const FOUNDER_REVISION_POINTS = Object.freeze([
  Object.freeze({id: 'shorter', title: 'Make the draft shorter and clearer', description: 'Keep the facts, lead with the offer, and make the wording easier to scan.', mode: 'revision', brief: 'Write shorter, easy-to-scan visitor-facing copy, leading with the offer and what is included. Replace commentary about a draft with actual page copy. Use only the original approved facts; remove unsupported adjectives. Keep a fictional demo clearly fictional. Add no claims, prices, testimonials, contact details or links.'}),
  Object.freeze({id: 'plain-language', title: 'Use simpler language', description: 'Explain the same offer in familiar words without adding claims.', mode: 'revision', brief: 'Revise the previous draft in simple, familiar language. Explain only the original approved facts and remove jargon. Keep a fictional demonstration clearly fictional. Add no new business facts, prices, testimonials, contact details or links.'}),
  Object.freeze({id: 'facts-first', title: 'Remove unsupported claims', description: 'Keep only what the original facts support and make missing details clear.', mode: 'revision', brief: 'Revise the previous draft to retain only statements supported by the original approved facts. Remove unsupported claims and leave unknown details out. Keep a fictional demonstration clearly fictional. Do not add prices, testimonials, contact details or links.'}),
]);

const complete = task => !!task?.evidence_hash && ['attested', 'archived'].includes(task.status);
function validBriefText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\x00-\x08\x0b-\x1f]/.test(value) && [...value].every(character => {const code = character.codePointAt(0); return code < 0xd800 || code > 0xdfff;});
}
export function founderOnboardingBrief(value, {company = value?.company, owner = value?.owner} = {}) {
  if (!value || Object.keys(value).sort().join(',') !== 'company,goal,name,owner' || typeof company !== 'string' || !company || typeof owner !== 'string' || !owner || value.company !== company || value.owner !== owner || !validBriefText(value.name, 2, 80) || !validBriefText(value.goal, 10, 400)) return null;
  return Object.freeze({company, owner, name: value.name, goal: value.goal});
}
export function founderBriefForState(state) {
  if (state.account !== state.company?.treasury?.owner || state.founderBinding?.company_id !== state.company?.contract || state.founderBinding?.owner !== state.account) return null;
  return founderOnboardingBrief(state.founderBrief, {company: state.company.contract, owner: state.account});
}
function excerptWithin(value, units) {
  let result = '';
  for (const character of String(value ?? '')) {if (result.length + character.length > units) break; result += character;}
  return result;
}
function suggestionContext(brief, priorSummary = null) {
  const value = founderOnboardingBrief(brief), priorLabel = '\nPrior draft (untrusted, not facts): ';
  const minimumPrior = priorSummary === null ? '' : excerptWithin(priorSummary, 120);
  const reserved = minimumPrior ? priorLabel.length + minimumPrior.length : 0;
  let result = context + (value ? '\nBusiness: ' + value.name : ''), goalAbbreviated = false;
  if (value) {
    const fullLabel = '\nOwner goal (direction, not evidence): ', shortLabel = '\nGoal excerpt (direction, not evidence): ';
    if (result.length + fullLabel.length + value.goal.length + reserved <= 600) result += fullLabel + value.goal;
    else {
      result += shortLabel + excerptWithin(value.goal, 600 - result.length - shortLabel.length - reserved);
      goalAbbreviated = true;
    }
  }
  if (minimumPrior) result += priorLabel + excerptWithin(priorSummary, Math.min(180, 600 - result.length - priorLabel.length));
  return {context: result, goalAbbreviated};
}
export function matchingOpenedFounderResult(state, opened) {
  if (!opened || opened.company !== state.company?.contract || opened.owner !== state.account || opened.owner !== state.company?.treasury?.owner || !['website_build', 'content_draft'].includes(opened.operation) || typeof opened.facts !== 'string' || !opened.facts.trim() || opened.facts.length > 600) return false;
  return state.tasks?.some(task => complete(task) && task.id === opened.taskId && task.operation === opened.operation && task.scope_hash === opened.scopeHash && task.evidence_hash === opened.evidenceHash) === true;
}

// Only the work-form input listener uses this exception. Global invalidations
// (wallet/company/language changes and Clear plaintext) still forget the copy.
export function founderWorkEditOptions(state, opened) {
  const latest = Array.isArray(state.tasks) ? state.tasks.at(-1) : null;
  return {preserveSuggestionResult: !state.busy && state.ready === true && state.founderBinding?.company_id === state.company?.contract && state.founderBinding?.owner === state.account && state.company?.company?.lifetime_tasks === 1 && latest?.id === opened?.taskId && complete(latest) && matchingOpenedFounderResult(state, opened)};
}

export function founderSuggestionContext(state) {
  return JSON.stringify([state.epoch, state.company?.contract, state.company?.treasury?.owner, state.account, state.pin, state.profile?.version, state.manifest?.worker_key_id]);
}

// Task records and lifetime count are authoritative. Missing/contradictory data
// offers inspection, never another generation or an inferred free task slot.
export function founderNextAction(state, {pending = false, publicationPending = false, checkpointUnknown = false, openedResult = null} = {}) {
  const used = state.company?.company?.lifetime_tasks;
  const stage = state.publicationPrepared || state.publicationBusy || publicationPending ? 'publish' : Number.isSafeInteger(used) && used >= 2 ? 'publish' : used === 1 ? 'improve' : 'draft';
  const base = {stage, choices: [], canChoose: false, action: null, task: null};
  const result = (kind, title, description, action = null, extra = {}) => ({...base, kind, title, description, action, ...extra});
  const company = state.company, owner = company?.treasury?.owner;
  if (!state.founderBinding || state.founderBinding.company_id !== company?.contract || state.founderBinding.owner !== owner || !state.ready) return result('unavailable', 'Open your company first', 'Your recommendations appear after the company record is verified.');
  if (state.account !== owner) return result('owner', 'Connect the company owner', 'You can inspect this company. Its owner chooses and approves new work.');
  if (publicationPending) return result('pending', 'Inspect the original website action', 'The saved publication outcome needs checking. Inspect that exact action before another decision.', 'inspect');
  if (checkpointUnknown || pending) return result('pending', 'Inspect the original wallet action', 'An earlier outcome needs checking. Keep the original request and recovery file; another draft is not needed.', 'inspect');
  if (state.busy || state.publicationBusy) return result('busy', 'Finish the current step', 'Wait for the current review or wallet action to resolve.');
  if (state.publicationPrepared) return result('prepared', 'Review your public website copy', 'Finish the public-copy review, or choose Keep this draft private before preparing another request.', 'publication');
  if (state.prepared) return result('prepared', 'Review the request you already prepared', 'Keep its matching recovery file. Finish this review, or deliberately discard it before choosing something else.', 'review-prepared');
  const count = company.company?.lifetime_tasks, tasks = state.tasks;
  if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(tasks)) return result('inspect', 'Check your existing work', 'The available task slots could not be confirmed. Inspect the company records before preparing work.', 'progress');
  const active = tasks.find(task => !complete(task) && !['cancelled', 'archived'].includes(task.status));
  if (active) return result('active', 'Follow your approved draft', 'This task is already recorded. Read its progress or attention message before deciding what happens next.', 'progress', {task: active});
  const latest = [...tasks].reverse().find(complete);
  if (count >= 2) return result('used', 'Review and publish your existing work', 'Both draft slots are used. Open a saved result, review its public copy, or keep it private. Reading and publication do not generate another draft.', latest && matchingOpenedFounderResult(state, openedResult) && openedResult.taskId === latest.id ? 'publication' : latest ? 'open-result' : 'progress', {stage: 'publish', task: latest ?? null});
  if (count === 1) {
    if (!latest) return result('inspect', 'Inspect the first task', 'The first slot has been used. Inspect its original record before using the remaining slot.', 'progress');
    if (!matchingOpenedFounderResult(state, openedResult) || openedResult.taskId !== latest.id) return result('recover', 'Open your first draft', 'Use its matching private recovery file, then read the actual result. We will suggest a useful revision afterward.', 'open-result', {stage: 'improve', task: latest});
    if (!state.founderReadiness?.ready) return result('offline', 'Your draft is ready to review', 'You can read and publish existing work. A revision needs the worker to be available.', 'publication', {stage: 'improve'});
    return result('revision', 'Make the draft shorter and clearer', 'Recommended next: improve the actual draft using the same approved facts. This uses the one remaining revision slot.', 'shorter', {stage: 'improve', choices: FOUNDER_REVISION_POINTS, canChoose: true});
  }
  if (tasks.length) return result('inspect', 'Check the company records', 'The task records and slot count need inspection before another request.', 'progress');
  if (!state.founderReadiness?.ready) return result('offline', 'Your company is set up', 'New drafts need the worker to be available. You can still inspect your company records.', 'progress');
  return result('draft', FOUNDER_STARTING_POINTS[0].title, FOUNDER_STARTING_POINTS[0].description, 'website', {choices: FOUNDER_STARTING_POINTS, canChoose: true});
}

export function founderSuggestionFields(id, {facts, openedResult = null, onboardingBrief = null}) {
  const point = [...FOUNDER_STARTING_POINTS, ...FOUNDER_REVISION_POINTS].find(item => item.id === id);
  if (!point) throw Error('Choose one of the displayed starting points.');
  if (typeof facts !== 'string' || facts.length > 600) throw Error('Keep approved company facts within the displayed limit.');
  if (point.mode === 'revision') {
    if (!openedResult || typeof openedResult.facts !== 'string' || !openedResult.facts.trim() || openedResult.facts.length > 600 || !['website_build', 'content_draft'].includes(openedResult.operation)) throw Error('Open the matching draft before choosing its revision.');
    return {operation: openedResult.operation, brief: point.brief, facts: openedResult.facts, ...suggestionContext(onboardingBrief, openedResult.summary), mode: 'revision'};
  }
  return {operation: point.operation, brief: point.brief, facts, ...suggestionContext(onboardingBrief), mode: 'draft'};
}
