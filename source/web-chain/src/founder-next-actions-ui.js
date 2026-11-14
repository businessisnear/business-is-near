import {founderNextAction, founderSuggestionContext, founderSuggestionFields, founderWorkEditOptions, founderBriefForState} from './founder-next-actions.js';

export function createFounderWorkEditHandler({getState, getOpenedResult, invalidateDraft}) {
  return () => invalidateDraft(founderWorkEditOptions(getState(), getOpenedResult()));
}

export function applyFounderSuggestionFields(root, fields) {
  const $ = selector => root.querySelector(selector);
  $('#work-operation').value = fields.operation;
  $('#work-brief').value = fields.brief;
  $('#work-context').value = fields.context;
  $('#work-facts').value = fields.facts;
  $('#work-repeat').checked = false;
  // The owner's explicit AI choice is preserved, including an unchecked box.
}

export function founderSuggestionNotice(fields, tr = value => value) {
  const message = tr(fields.mode === 'revision' ? 'The revision request is filled in using the original approved facts. Review it and save its new recovery file before approval.' : 'The request is filled in. Add or check your business facts, then review it. Nothing has run yet.');
  return fields.goalAbbreviated ? message + ' ' + tr('Your full business goal has not been edited. This request uses a shorter goal excerpt to leave room for its instructions and any prior draft.') : message;
}

// This controller can only fill fields. It has no prepare, wallet, RPC or model
// capability. All asynchronous guards complete before the first form mutation.
export function createFounderSuggestionController({getState, getPending, hasPublicationPending, getOpenedResult, getFacts, invalidateDraft, applyFields}) {
  let selecting = false;
  function snapshot(options = {}) {
    let pending = false, checkpointUnknown = !!options.checkpointUnknown;
    try { pending = !!getPending(); } catch { checkpointUnknown = true; }
    return founderNextAction(getState(), {...options, pending, checkpointUnknown, openedResult: getOpenedResult()});
  }
  async function select(id) {
    if (selecting) throw Error('Wait for the current choice to finish.');
    let view = snapshot();
    if (!view.canChoose || !view.choices.some(point => point.id === id)) throw Error(view.description);
    const identity = founderSuggestionContext(getState());
    selecting = true;
    try {
      const publicationPending = await hasPublicationPending();
      if (identity !== founderSuggestionContext(getState())) throw Error('Your company or wallet changed. Choose again in the current workspace.');
      view = snapshot({publicationPending: !!publicationPending});
      if (!view.canChoose || !view.choices.some(point => point.id === id)) throw Error(view.description);
      const fields = founderSuggestionFields(id, {facts: getFacts(), openedResult: getOpenedResult(), onboardingBrief: founderBriefForState(getState())});
      invalidateDraft({preserveSuggestionResult: fields.mode === 'revision'});
      applyFields(fields);
      return fields;
    } finally { selecting = false; }
  }
  return {snapshot, select};
}

export function createFounderNextActionsUI({getState, getPending, hasPublicationPending, getOpenedResult, invalidateDraft, onNavigate, notice, tr = value => value, root = document}) {
  const $ = selector => root.querySelector(selector);
  const el = (tag, text, className) => {
    const element = root.createElement(tag);
    if (text !== undefined) {element.textContent = tr(text); element.setAttribute('data-i18n', text);}
    if (className) element.className = className;
    return element;
  };
  const form = $('#work-form'), facts = $('#work-facts'), factsLabel = facts.closest('label');
  const mount = el('article', undefined, 'panel founder-guidance'); mount.id = 'founder-next-actions';
  mount.setAttribute('aria-labelledby', 'founder-next-title');
  $('#simple-work-anchor').after(mount);
  const advanced = el('details', undefined, 'founder-task-details'); advanced.id = 'founder-task-details';
  advanced.append(el('summary', 'Adjust task details'), el('p', 'Optional: change the request or inspect exactly what the worker will receive.', 'hint'));
  advanced.append($('#work-brief').closest('label'), $('#work-operation').closest('label'), $('#work-context').closest('details'), $('#work-ai').closest('label'));
  factsLabel.removeAttribute('data-i18n');
  factsLabel.replaceChildren(el('span', 'What do you offer?'), facts);
  facts.setAttribute('data-i18n-placeholder', 'Describe your service and what is included. Leave unknown details out.');
  facts.placeholder = tr('Describe your service and what is included. Leave unknown details out.');
  const example = el('p', 'For example: a one-hour photography session with five edited images. Use only facts you approve for your own business.', 'hint founder-facts-example');
  form.prepend(factsLabel, example, advanced);
  const formTitle = form.closest('article')?.querySelector('h2');
  if (formTitle) { formTitle.setAttribute('data-i18n', 'Start with what you know'); formTitle.textContent = tr('Start with what you know'); }
  const anchor = $('#simple-work-anchor');
  const anchorLabel = anchor.querySelector('.eyebrow');
  if (anchorLabel) { anchorLabel.setAttribute('data-i18n', 'YOUR NEXT MOVE'); anchorLabel.textContent = tr('YOUR NEXT MOVE'); }
  const intro = anchor.querySelector('p:last-child');
  if (intro) { intro.setAttribute('data-i18n', 'Choose a starting point. We fill in the task; you review it.'); intro.textContent = tr('Choose a starting point. We fill in the task; you review it.'); }
  let generation = 0, rendered = '', choosing = false;
  const controller = createFounderSuggestionController({getState, getPending, hasPublicationPending, getOpenedResult, getFacts: () => facts.value, invalidateDraft, applyFields(fields) {
    applyFounderSuggestionFields(root, fields);
    advanced.open = false;
    form.scrollIntoView({block: 'start', behavior: 'auto'});
    if (facts.value.trim()) form.querySelector('button[type="submit"]').focus({preventScroll: true});
    else facts.focus({preventScroll: true});
    notice(founderSuggestionNotice(fields, tr));
  }});
  async function choose(id) {
    if (choosing) return;
    choosing = true;
    mount.querySelectorAll('button').forEach(button => button.disabled = true);
    try { await controller.select(id); } catch (error) { notice(tr(error.message), true); }
    finally { choosing = false; rendered = ''; await update(); }
  }
  function button(label, callback, primary = false) {
    const value = el('button', label, 'button ' + (primary ? 'primary' : 'secondary'));
    value.type = 'button';
    value.addEventListener('click', callback);
    return value;
  }
  const readLabels = {inspect: 'Inspect original action →', progress: 'View existing work →', 'open-result': 'Open saved result →', 'review-prepared': 'Continue this review →', publication: 'Review public copy →'};
  function navigate(view) {
    const identity = founderSuggestionContext(getState());
    return async () => {
      try {
        if (identity !== founderSuggestionContext(getState())) throw Error('Your company or wallet changed. Open the current workspace first.');
        await onNavigate(view.action, view.task);
      } catch (error) { notice(tr(error.message), true); }
    };
  }
  function render(view) {
    mount.hidden = !getState().founderBinding;
    const signature = JSON.stringify([founderSuggestionContext(getState()), getState().locale, view]);
    if (signature === rendered) return;
    rendered = signature;
    const journey = el('ol', undefined, 'founder-work-journey'); journey.setAttribute('aria-label', tr('Your draft journey')); journey.setAttribute('data-i18n-aria-label', 'Your draft journey');
    for (const [stage, title, description] of [['draft', '1 · Draft', 'Choose a useful starting point.'], ['improve', '2 · Improve', 'Read the result and revise once.'], ['publish', '3 · Publish', 'Review the exact public copy.']]) {
      const step = el('li');
      if (view.stage === stage) step.setAttribute('aria-current', 'step');
      step.append(el('strong', title), el('span', description)); journey.append(step);
    }
    const heading = el('h2', view.title); heading.id = 'founder-next-title';
    const description = el('p', view.description, 'founder-recommendation-description');
    const recommendation = el('div', undefined, 'founder-recommendation');
    recommendation.append(el('p', 'RECOMMENDED NEXT', 'eyebrow'), heading, description);
    if (view.canChoose) {
      recommendation.append(button(view.kind === 'revision' ? 'Use this revision plan →' : 'Use this website plan →', () => choose(view.action), true));
      const more = el('details', undefined, 'founder-more-ideas'); more.append(el('summary', 'More ideas'));
      more.append(el('p', view.kind === 'revision' ? 'Choose one way to use your remaining revision. Each choice keeps the original approved facts.' : 'Choose one useful draft. This pilot allows one first draft and one revision; these are alternatives, not a queue of six tasks.', 'hint'));
      const grid = el('div', undefined, 'founder-idea-grid');
      for (const point of view.choices.filter(point => point.id !== view.action)) {
        const card = el('article', undefined, 'founder-idea');
        card.append(el('h3', point.title), el('p', point.description), button('Use this idea →', () => choose(point.id)));
        grid.append(card);
      }
      more.append(grid); recommendation.append(more);
      if (view.kind === 'revision') recommendation.append(button('Review public copy instead →', navigate({...view, action: 'publication'})));
    } else if (view.action) recommendation.append(button(readLabels[view.action], navigate(view), true));
    mount.replaceChildren(journey, recommendation, el('p', 'These are ready-made starting points, not an AI assessment of your business. Choosing one fills in an editable request. It does not run work, spend tokens or publish anything.', 'hint founder-guidance-scope'));
  }
  async function update() {
    const current = ++generation;
    try {
      const publicationPending = await hasPublicationPending();
      if (current !== generation) return;
      render(controller.snapshot({publicationPending: !!publicationPending}));
    } catch {
      if (current === generation) render(controller.snapshot({checkpointUnknown: true}));
    }
  }
  update();
  return {update};
}
