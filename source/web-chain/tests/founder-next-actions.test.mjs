import test from 'node:test';
import assert from 'node:assert/strict';
import {FOUNDER_STARTING_POINTS, FOUNDER_REVISION_POINTS, founderNextAction, founderSuggestionFields, founderOnboardingBrief, founderBriefForState} from '../src/founder-next-actions.js';
import {createFounderSuggestionController, createFounderWorkEditHandler, applyFounderSuggestionFields, founderSuggestionNotice} from '../src/founder-next-actions-ui.js';
import {scopeFromForm} from '../src/business-actions.js';
import {createFounderPublicationUI} from '../src/founder-publication-ui.js';
import {FOUNDER_TESTNET_GENESIS} from '../src/founder-rpc.js';
import {t} from '../src/localization.js';
import {readFile} from 'node:fs/promises';

const company = 'harbor.factory.testnet', owner = 'owner.testnet';
const facts = '  Harbor Studio is fictional. A one-hour session includes five edited images.\nNo price is supplied.  ';
const task = (change = {}) => ({id: 'work_original', operation: 'website_build', status: 'archived', scope_hash: 'a'.repeat(64), evidence_hash: 'b'.repeat(64), ...change});
const state = () => ({epoch: 1, founderBinding: {company_id: company, owner}, company: {contract: company, treasury: {owner}, company: {lifetime_tasks: 0}}, account: owner, ready: true, busy: false, prepared: null, pin: 'code-pin', profile: {version: 1}, manifest: {worker_key_id: 'worker-pin'}, founderReadiness: {ready: true}, tasks: []});
const opened = () => ({company, owner, taskId: 'work_original', operation: 'website_build', scopeHash: 'a'.repeat(64), evidenceHash: 'b'.repeat(64), facts, summary: 'A draft excerpt that is not a source of new business facts.'});
function fixture(options = {}) {
  const value = state(), mutations = [];
  let saved = null, result = null, currentFacts = facts;
  const controller = createFounderSuggestionController({getState: () => value, getPending: () => saved, hasPublicationPending: options.hasPublicationPending ?? (async () => false), getOpenedResult: () => result, getFacts: () => currentFacts, invalidateDraft: details => {mutations.push({kind: 'invalidate', details}); value.epoch++;}, applyFields: fields => mutations.push({kind: 'fields', fields}), ...options.controller});
  return {value, controller, mutations, setPending: item => {saved = item;}, setResult: item => {result = item;}, setFacts: item => {currentFacts = item;}};
}

test('starting points fit the existing scope limits and request finished copy without adding facts', () => {
  assert.equal(FOUNDER_STARTING_POINTS.length, 6);
  assert.equal(FOUNDER_REVISION_POINTS.length, 3);
  for (const point of [...FOUNDER_STARTING_POINTS, ...FOUNDER_REVISION_POINTS]) {
    const fields = founderSuggestionFields(point.id, {facts, openedResult: opened()});
    assert.ok(['website_build', 'content_draft'].includes(fields.operation));
    assert.ok(fields.brief.length <= 400 && fields.context.length <= 600);
    assert.equal(fields.facts, facts);
    assert.match(fields.context, /finished visitor copy, not a plan/);
    assert.match(fields.context, /unsupported adjectives/);
  }
  assert.match(founderSuggestionFields('website', {facts}).brief, /actual visitor-facing/);
  assert.match(founderSuggestionFields('shorter', {facts, openedResult: opened()}).brief, /Replace commentary about a draft/);
  assert.throws(() => founderSuggestionFields('engineering_patch', {facts}), /displayed starting points/);
});

test('next move follows lifetime records, real completion and matching recovery rather than a goal or queue length', () => {
  const value = state();
  assert.equal(founderNextAction(value).kind, 'draft');
  value.company.company.lifetime_tasks = 1; value.tasks = [task({status: 'queued', evidence_hash: ''})];
  assert.equal(founderNextAction(value).kind, 'active');
  value.tasks = [task()];
  assert.equal(founderNextAction(value).kind, 'recover');
  assert.equal(founderNextAction(value, {openedResult: {...opened(), evidenceHash: 'wrong'}}).kind, 'recover');
  assert.equal(founderNextAction(value, {openedResult: {...opened(), company: 'other.factory.testnet'}}).kind, 'recover');
  assert.equal(founderNextAction(value, {openedResult: opened()}).kind, 'revision');
  value.company.company.lifetime_tasks = 2;
  assert.equal(founderNextAction(value).kind, 'used');
  assert.equal(founderNextAction(value, {openedResult: opened()}).action, 'publication');
  assert.equal(founderNextAction(value, {openedResult: opened()}).canChoose, false);
  value.company.company.lifetime_tasks = 1; value.tasks = [task({status: 'cancelled', evidence_hash: ''})];
  assert.equal(founderNextAction(value).kind, 'inspect');
  value.company.company.lifetime_tasks = 0;
  assert.equal(founderNextAction(value).canChoose, false, 'Contradictory lifetime count never opens a replacement slot');
  value.company.company.lifetime_tasks = undefined; value.tasks = [];
  assert.equal(founderNextAction(value).canChoose, false);
});

test('busy, prepared, owner, pending, active and exhausted states cause zero field changes at click time', async t => {
  for (const [name, block] of [
    ['busy', f => {f.value.busy = true;}],
    ['prepared request', f => {f.value.prepared = {recovery: {record_key: 'fixture-only'}};}],
    ['prepared publication', f => {f.value.publicationPrepared = true;}],
    ['different owner', f => {f.value.account = 'other.testnet';}],
    ['unknown task outcome', f => f.setPending({tx_hash: null})],
    ['active on-chain task', f => {f.value.company.company.lifetime_tasks = 1; f.value.tasks = [task({status: 'awaiting_evidence', evidence_hash: ''})];}],
    ['used lifetime slots', f => {f.value.company.company.lifetime_tasks = 2; f.value.tasks = [task()];}],
    ['unavailable worker', f => {f.value.founderReadiness.ready = false;}],
    ['wrong binding', f => {f.value.founderBinding.company_id = 'other.factory.testnet';}],
  ]) await t.test(name, async () => {
    const f = fixture(); assert.equal(f.controller.snapshot().canChoose, true);
    block(f); const before = JSON.stringify(f.value);
    await assert.rejects(f.controller.select('website'));
    assert.deepEqual(f.mutations, []); assert.equal(JSON.stringify(f.value), before);
  });
});

test('malformed task checkpoint and failed or pending publication checks fail closed', async () => {
  for (const options of [
    {controller: {getPending: () => {throw Error('Malformed saved action');}}},
    {hasPublicationPending: async () => {throw Error('Malformed saved publication');}},
    {hasPublicationPending: async () => true},
  ]) {
    const f = fixture(options);
    await assert.rejects(f.controller.select('website'));
    assert.deepEqual(f.mutations, []);
  }
});

test('asynchronous publication guard rechecks identity and task safety before any mutation', async t => {
  for (const [name, change] of [
    ['owner change', f => {f.value.account = 'other.testnet';}],
    ['company change', f => {f.value.company.contract = 'other.factory.testnet';}],
    ['form edit', f => {f.value.epoch++;}],
    ['new pending outcome', f => f.setPending({tx_hash: null})],
    ['new active task', f => {f.value.company.company.lifetime_tasks = 1; f.value.tasks = [task({status: 'queued', evidence_hash: ''})];}],
    ['new prepared review', f => {f.value.prepared = {intent: 'preserve-original'};}],
  ]) await t.test(name, async () => {
    let release; const f = fixture({hasPublicationPending: () => new Promise(resolve => {release = resolve;})});
    const chosen = f.controller.select('website'); change(f); release(false);
    await assert.rejects(chosen); assert.deepEqual(f.mutations, []);
  });
});

test('safe choice invalidates before prefill, preserves exact supplied text, and grants no execution capability', async () => {
  const f = fixture(); f.setFacts('  <img src=x onerror=alert(1)> is literal supplied text.\nNo prices.  ');
  const fields = await f.controller.select('offer');
  assert.deepEqual(f.mutations.map(item => item.kind), ['invalidate', 'fields']);
  assert.equal(fields.facts, '  <img src=x onerror=alert(1)> is literal supplied text.\nNo prices.  ');
  assert.equal(fields.operation, 'content_draft');
  assert.deepEqual(f.mutations[0].details, {preserveSuggestionResult: false});
  assert.ok(!Object.keys(fields).some(key => /intent|recovery|transaction|deposit/.test(key)));
});

test('revision uses only the matching recovered task facts and keeps prior prose explicitly untrusted', async () => {
  const f = fixture(); f.value.company.company.lifetime_tasks = 1; f.value.tasks = [task()]; f.setResult({...opened(), summary: 'Unsupported high-quality claim. '.repeat(30)}); f.setFacts('Unrelated replacement facts.');
  const fields = await f.controller.select('facts-first');
  assert.equal(fields.facts, facts);
  assert.equal(fields.operation, 'website_build');
  assert.match(fields.context, /untrusted, not facts/);
  assert.ok(fields.context.length <= 600);
  assert.deepEqual(f.mutations[0].details, {preserveSuggestionResult: true});
  await assert.rejects(f.controller.select('website'), /remaining revision slot/);
});

test('a rapid second choice cannot race the first prefill', async () => {
  let release; const f = fixture({hasPublicationPending: () => new Promise(resolve => {release = resolve;})});
  const first = f.controller.select('website');
  await assert.rejects(f.controller.select('offer'), /current choice/);
  release(false); await first;
  assert.equal(f.mutations.filter(item => item.kind === 'fields').length, 1);
});

test('manual work-form edits keep improve guidance but retire the old encrypted review and acknowledgment', async () => {
  const value = state(); value.company.company.lifetime_tasks = 1; value.tasks = [task()];
  let result = opened(), prepared = null, acknowledged = false, fields;
  const invalidateDraft = options => {value.epoch++; prepared = null; acknowledged = false; if (!options?.preserveSuggestionResult) result = null;};
  const controller = createFounderSuggestionController({getState: () => value, getPending: () => null, hasPublicationPending: async () => false, getOpenedResult: () => result, getFacts: () => facts, invalidateDraft, applyFields: copy => {fields = copy;}});
  const input = createFounderWorkEditHandler({getState: () => value, getOpenedResult: () => result, invalidateDraft});
  await controller.select('shorter');
  prepared = {ciphertext: 'old fixture review'}; acknowledged = true;
  fields.brief = 'My edited, more specific revision request.'; input();
  assert.equal(prepared, null); assert.equal(acknowledged, false);
  assert.equal(fields.brief, 'My edited, more specific revision request.');
  assert.equal(controller.snapshot().kind, 'revision', 'An ordinary edit must not ask for the same result recovery again');
  // Other lifecycle callers use ordinary invalidation, not the work listener.
  invalidateDraft(); assert.equal(result, null); assert.equal(controller.snapshot().kind, 'recover');
});

test('manual edit preservation refuses a changed company, owner, exact result or consumed revision slot', () => {
  for (const change of [
    value => {value.account = 'other.testnet';},
    value => {value.company.contract = 'other.factory.testnet';},
    value => {value.tasks[0].evidence_hash = 'c'.repeat(64);},
    value => {value.tasks[0].scope_hash = 'c'.repeat(64);},
    value => {value.tasks[0].id = 'work_other';},
    value => {value.company.company.lifetime_tasks = 2;},
    value => {value.tasks.push(task({id: 'work_revision', status: 'queued', evidence_hash: ''}));},
  ]) {
    const value = state(); value.company.company.lifetime_tasks = 1; value.tasks = [task()]; let result = opened();
    const input = createFounderWorkEditHandler({getState: () => value, getOpenedResult: () => result, invalidateDraft: options => {if (!options.preserveSuggestionResult) result = null;}});
    change(value); input(); assert.equal(result, null);
  }
});

test('suggestion facts use the same 600-character source limit as the existing encrypted-scope validator', () => {
  const copy = founderSuggestionFields('website', {facts: 'x'.repeat(600)});
  assert.equal(scopeFromForm({...copy, useAI: true}).sources[0].text, copy.facts);
  assert.throws(() => founderSuggestionFields('website', {facts: 'x'.repeat(601)}), /limit/);
  assert.throws(() => scopeFromForm({...copy, facts: 'x'.repeat(601), useAI: true}), /Source text/);
});

test('validated full onboarding name and goal remain saved while bounded goal excerpts never become source facts', async () => {
  const f = fixture(); f.value.founderBrief = {company, owner, name: 'N'.repeat(80), goal: 'G'.repeat(400)};
  const fields = await f.controller.select('website');
  assert.ok(fields.context.includes('N'.repeat(80)) && fields.context.includes('G'.repeat(50)));
  assert.equal(fields.goalAbbreviated, true); assert.match(fields.context, /Goal excerpt \(direction, not evidence\)/);
  assert.equal(f.value.founderBrief.goal, 'G'.repeat(400));
  assert.ok(fields.context.length <= 600); assert.equal(fields.facts, facts);
  scopeFromForm({...fields, useAI: true});
  f.value.company.company.lifetime_tasks = 1; f.value.tasks = [task()]; f.setResult({...opened(), summary: '🙂'.repeat(500)});
  const revision = await f.controller.select('shorter');
  assert.ok(revision.context.includes('N'.repeat(80))); assert.equal(revision.goalAbbreviated, true);
  assert.equal(f.value.founderBrief.goal, 'G'.repeat(400));
  assert.ok(revision.context.split('Prior draft (untrusted, not facts): ')[1].length >= 100);
  assert.equal(revision.facts, facts); assert.ok(revision.context.length <= 600);
  scopeFromForm({...revision, useAI: true});
  for (const change of [{name: 'x'.repeat(81)}, {goal: 'x'.repeat(401)}, {name: '\ud800x'}, {goal: 'x'.repeat(20) + '\u0000'}, {extra: 'not allowed'}]) assert.equal(founderOnboardingBrief({...f.value.founderBrief, ...change}), null);
  assert.equal(founderBriefForState({...f.value, founderBrief: {...f.value.founderBrief, owner: 'other.testnet'}}), null);
  f.value.account = 'other.testnet'; assert.equal(founderBriefForState(f.value), null);
});

test('every onboarding suggestion keeps all writing guardrails and reserves a real revision excerpt at maximum bounds', () => {
  const onboardingBrief = {company, owner, name: 'N'.repeat(80), goal: 'G'.repeat(400)}, summary = 'Actual previous draft excerpt. '.repeat(20), maximumFacts = 'F'.repeat(600);
  const before = JSON.stringify(onboardingBrief);
  for (const point of [...FOUNDER_STARTING_POINTS, ...FOUNDER_REVISION_POINTS]) {
    const fields = founderSuggestionFields(point.id, {facts: maximumFacts, openedResult: {...opened(), facts: maximumFacts, summary}, onboardingBrief});
    for (const rule of [/finished visitor copy/, /not a plan or draft commentary/, /approved facts only/, /unsupported adjectives/, /customers/, /sales/, /credentials/, /prices/, /testimonials/, /contacts/, /URLs/, /completed actions/, /fictional demos fictional/]) assert.match(fields.context, rule, point.id);
    assert.ok(fields.context.includes(onboardingBrief.name)); assert.match(fields.context, /Goal excerpt \(direction, not evidence\): G+/);
    assert.equal(fields.goalAbbreviated, true); assert.equal(fields.facts, maximumFacts); assert.ok(fields.context.length <= 600);
    if (point.mode === 'revision') {
      const prior = fields.context.split('\nPrior draft (untrusted, not facts): ')[1];
      assert.ok(prior.length >= 100, 'Long owner goals must leave useful prior-draft context');
      assert.ok(summary.startsWith(prior), 'The excerpt must come from the actual prior summary');
    }
    scopeFromForm({...fields, useAI: true});
  }
  assert.equal(JSON.stringify(onboardingBrief), before);
  const short = {...onboardingBrief, name: 'Harbor Studio', goal: 'Help visitors understand our supplied photography offer.'};
  for (const id of ['website', 'shorter']) {
    const fields = founderSuggestionFields(id, {facts, openedResult: opened(), onboardingBrief: short});
    assert.equal(fields.goalAbbreviated, false); assert.ok(fields.context.includes(short.goal));
  }
});

test('a shortened goal has an explicit translated user notice without editing the full saved goal', () => {
  const onboardingBrief = {company, owner, name: 'N'.repeat(80), goal: 'G'.repeat(400)};
  for (const id of ['website', 'shorter']) {
    const fields = founderSuggestionFields(id, {facts, openedResult: {...opened(), summary: 'A prior draft. '.repeat(20)}, onboardingBrief});
    assert.match(founderSuggestionNotice(fields), /full business goal has not been edited/);
    assert.match(founderSuggestionNotice(fields), /shorter goal excerpt/);
    assert.match(founderSuggestionNotice(fields, key => t(key, 'es')), /objetivo completo.*no se ha modificado/);
    assert.equal(onboardingBrief.goal.length, 400);
  }
  assert.doesNotMatch(founderSuggestionNotice(founderSuggestionFields('website', {facts})), /shorter goal excerpt/);
});

test('revision excerpts preserve complete code points within the actual 600 UTF-16-unit context budget', () => {
  for (const summary of ['x'.repeat(179) + '🙂end', '🙂'.repeat(400), 'x'.repeat(178) + '𠮷more']) {
    const fields = founderSuggestionFields('shorter', {facts, openedResult: {...opened(), summary}});
    assert.ok(fields.context.length <= 600);
    scopeFromForm({...fields, useAI: true});
    const maximumGoal = {company, owner, name: 'N'.repeat(80), goal: '🙂'.repeat(200)};
    const bounded = founderSuggestionFields('shorter', {facts, openedResult: {...opened(), summary}, onboardingBrief: maximumGoal});
    assert.ok(bounded.context.length <= 600); assert.equal(bounded.goalAbbreviated, true);
    assert.ok(bounded.context.split('Prior draft (untrusted, not facts): ')[1].length >= 100);
    scopeFromForm({...bounded, useAI: true});
  }
});

test('the actual form prefill preserves either explicit AI selection while reducing recurrence authority', () => {
  for (const selection of [false, true]) {
    const elements = new Map(['operation', 'brief', 'context', 'facts'].map(name => ['#work-' + name, {value: ''}]));
    elements.set('#work-repeat', {checked: true});
    const ai = {get checked() {return selection;}, set checked(_value) {assert.fail('Suggestion must not write the AI consent checkbox');}};
    elements.set('#work-ai', ai);
    const root = {querySelector: key => {assert.ok(elements.has(key)); return elements.get(key);}};
    const fields = founderSuggestionFields('website', {facts});
    applyFounderSuggestionFields(root, fields);
    assert.equal(ai.checked, selection); assert.equal(elements.get('#work-repeat').checked, false);
    assert.equal(elements.get('#work-facts').value, facts);
    assert.equal(elements.get('#work-brief').value, fields.brief);
  }
});

test('pending, busy, prepared and active revisions keep the correct journey stage and publication wording', () => {
  const value = state(); value.company.company.lifetime_tasks = 1;
  assert.equal(founderNextAction(value, {pending: true}).stage, 'improve');
  value.busy = true; assert.equal(founderNextAction(value).stage, 'improve'); value.busy = false;
  value.prepared = {}; assert.equal(founderNextAction(value).stage, 'improve'); value.prepared = null;
  value.tasks = [task({status: 'queued', evidence_hash: ''})]; assert.equal(founderNextAction(value).stage, 'improve');
  value.tasks = [task()]; value.publicationPrepared = true;
  const publication = founderNextAction(value); assert.equal(publication.stage, 'publish'); assert.doesNotMatch(publication.description, /recovery file/); assert.match(publication.title, /public website copy/);
  value.publicationPrepared = false;
  assert.equal(founderNextAction(value, {publicationPending: true}).stage, 'publish');
  value.company.company.lifetime_tasks = 2; assert.equal(founderNextAction(value, {pending: true}).stage, 'publish');
});

test('an archived cancelled task without evidence is terminal inspection with its slot still used', () => {
  const value = state(); value.company.company.lifetime_tasks = 1; value.tasks = [task({status: 'archived', evidence_hash: ''})];
  const view = founderNextAction(value); assert.equal(view.kind, 'inspect'); assert.equal(view.canChoose, false); assert.equal(view.stage, 'improve');
  value.company.company.lifetime_tasks = 2; assert.equal(founderNextAction(value).kind, 'used'); assert.equal(founderNextAction(value).canChoose, false);
});

test('new static guidance has Spanish labels while model requests and supplied facts remain literal', () => {
  for (const point of [...FOUNDER_STARTING_POINTS, ...FOUNDER_REVISION_POINTS]) {
    assert.notEqual(t(point.title, 'es'), point.title); assert.notEqual(t(point.description, 'es'), point.description);
  }
  for (const key of ['More ideas', 'Adjust task details', 'What do you offer?', 'Your draft journey', 'Review your public website copy']) assert.notEqual(t(key, 'es'), key);
  const fields = founderSuggestionFields('website', {facts}); assert.equal(fields.brief, FOUNDER_STARTING_POINTS[0].brief); assert.equal(fields.facts, facts);
});

// Inert DOM executes the production publication handlers. It has no real
// browser, network or wallet; the separate browser QA verifies native DOM moves.
class PublicationElement {
  constructor(root, tag = 'div') {this.root = root; this.tagName = tag.toUpperCase(); this.hidden = false; this.disabled = false; this.checked = false; this.value = ''; this.children = []; this.attributes = new Map(); this.handlers = new Map(); this.isConnected = true;}
  set textContent(value) {this.text = String(value); this.children = [];} get textContent() {return (this.text ?? '') + this.children.map(child => child.textContent).join('');}
  setAttribute(name, value) {this.attributes.set(name, String(value));} getAttribute(name) {return this.attributes.get(name) ?? null;} removeAttribute(name) {this.attributes.delete(name);}
  append(...children) {this.children.push(...children);} replaceChildren(...children) {this.children = children;}
  addEventListener(type, handler) {const list = this.handlers.get(type) ?? []; list.push(handler); this.handlers.set(type, list);}
  async emit(type) {for (const handler of this.handlers.get(type) ?? []) await handler({target: this, preventDefault() {}});}
  scrollIntoView() {} focus() {this.root.activeElement = this;}
}
const publicationConfig = JSON.parse(await readFile(new URL('../src/founder-config.json', import.meta.url), 'utf8'));
function publicationFixture(observer = () => {}) {
  const elements = new Map(), root = {createElement: tag => new PublicationElement(root, tag)}, mount = new PublicationElement(root);
  const $ = selector => {assert.ok(elements.has(selector), selector); return elements.get(selector);};
  Object.defineProperty(mount, 'innerHTML', {set(html) {for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {const element = new PublicationElement(root, match[1]); element.hidden = /\shidden(?:\s|>)/.test(match[0]); elements.set('#' + match[2], element);}}});
  const descendants = element => [element, ...element.children.flatMap(descendants)];
  mount.querySelector = $; mount.querySelectorAll = selector => {
    const values = [...new Set([...elements.values(), ...descendants($('#publication-items'))])];
    if (selector === '[data-publication-item]') return values.filter(element => element.attributes.has('data-publication-item'));
    if (selector === 'button,input,textarea') return values.filter(element => ['BUTTON', 'INPUT', 'TEXTAREA'].includes(element.tagName));
    if (selector === 'input,textarea') return values.filter(element => ['INPUT', 'TEXTAREA'].includes(element.tagName));
    throw Error('Unexpected inert DOM selector ' + selector);
  };
  const storage = new Map(), readRequests = [], changes = [], notices = [], child = 'guidance.' + publicationConfig.factory_id, H = '1'.repeat(44);
  let ui, walletCalls = 0;
  const selector = {wallet: async () => {walletCalls++; throw Error('Observer test forbids wallet acquisition');}}, context = {epoch: 1, account: owner, owner, company: child, selector, binding: {record_id: 'company_guidance'}};
  const encoded = value => ({result: [...new TextEncoder().encode(JSON.stringify(value))], block_hash: H, block_height: 10});
  const rpc = {finalBlock: async () => ({hash: H, height: 10}), request: async (method, args) => {
    readRequests.push({method, args});
    if (method === 'status') return {chain_id: 'testnet', genesis_hash: FOUNDER_TESTNET_GENESIS, sync_info: {syncing: false}};
    if (method === 'EXPERIMENTAL_protocol_config') return {runtime_config: {storage_amount_per_byte: '10000000000000000000'}};
    if (method === 'query' && args.request_type === 'view_account') return {code_hash: publicationConfig.factory_code_hash, block_hash: H, block_height: 10};
    if (method === 'query' && args.method_name === 'record') return encoded({id: 'company_guidance', creator: owner, child, phase: 'active', template_sha256: publicationConfig.company_template_sha256});
    if (method === 'query' && args.method_name === 'site') return encoded(null);
    throw Error('Unexpected synthetic read');
  }};
  ui = createFounderPublicationUI({config: publicationConfig, root, mount, rpc, getContext: () => context, storage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}, notice: message => notices.push(message), onChange: () => {changes.push({prepared: !$('#publication-review').hidden, busy: mount.getAttribute('aria-busy') === 'true'}); return observer(ui);}});
  ui.setArtifact({title: 'Harbor Studio', summary: 'A fictional photography service.', items: [{text: 'One-hour session, five edited images.'}]});
  return {ui, $, changes, notices, readRequests, walletCalls: () => walletCalls};
}

test('publication change observer updates review, discard, edit and clear immediately without a notification loop', async () => {
  const previousLocation = globalThis.location; globalThis.location = {href: 'https://example.invalid/app/business.html'};
  try {
    const f = publicationFixture(ui => ui.hasPending());
    await f.$('#publication-form').emit('submit');
    assert.ok(f.changes.some(change => change.prepared)); assert.equal(f.changes.at(-1).busy, false);
    const before = f.changes.length; await Promise.resolve(); await Promise.resolve(); assert.equal(f.changes.length, before, 'Reading pending state must not notify again');
    await f.$('#discard-publication').emit('click'); assert.equal(f.changes.at(-1).prepared, false);
    await f.$('#publication-form').emit('submit'); assert.equal(f.changes.at(-1).prepared, true);
    await f.$('#publication-form').emit('input'); assert.equal(f.changes.at(-1).prepared, false);
    await f.$('#publication-form').emit('submit'); f.ui.clearReview(); assert.equal(f.changes.at(-1).prepared, false);
    f.ui.clear(); assert.equal(f.changes.at(-1).prepared, false);
    assert.equal(f.walletCalls(), 0); assert.deepEqual(f.notices, []);
  } finally {if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;}
});

test('throwing or rejecting publication observers cannot turn a UI review into a failed action', async () => {
  const previousLocation = globalThis.location; globalThis.location = {href: 'https://example.invalid/app/business.html'};
  try {
    for (const observer of [() => {throw Error('Synthetic observer failure');}, async () => {throw Error('Synthetic observer rejection');}]) {
      const f = publicationFixture(observer); await f.$('#publication-form').emit('submit');
      assert.equal(f.$('#publication-review').hidden, false); assert.deepEqual(f.notices, []); assert.equal(f.walletCalls(), 0);
      f.ui.clearReview(); assert.equal(f.$('#publication-review').hidden, true);
    }
  } finally {if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;}
});
