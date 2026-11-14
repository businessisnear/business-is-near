import {PUBLIC_OPERATIONS, verifiedDemo} from './public-testnet.js';

// Present only workflows actually connected by the public build. Event handlers
// also enforce these boundaries; hiding a panel is not an authorization gate.
export function configurePublicWorkspace({config, notice, root = document}) {
  const $ = selector => root.querySelector(selector);
  root.body.dataset.publicTestnet = 'true';
  const hide = element => { if (element) element.dataset.publicUnavailable = 'true'; };
  const write = (element, value) => {
    if (!element) return;
    element.removeAttribute('data-i18n');
    element.textContent = value;
  };
  for (const name of ['inbox', 'apps', 'library']) {
    hide($('[data-tab="' + name + '"]'));
    hide($('[data-panel="' + name + '"]'));
    root.querySelectorAll('[data-go="' + name + '"]').forEach(button => hide(button.closest('.action-row') || button));
  }
  root.querySelectorAll('[data-work-mode]').forEach(button => {
    if (button.dataset.workMode !== 'simple') hide(button);
  });
  for (const id of ['advanced-work-tools', 'company-locale-panel', 'company-operator-panel', 'cloud-media-policy-panel']) hide($('#' + id));
  hide($('#company-operator-panel')?.closest('details'));
  hide($('#mandate-list')?.closest('article'));
  hide($('#appointments-contract')?.closest('details'));
  hide($('#work-repeat')?.closest('label'));
  $('#work-repeat').checked = false;
  $('#work-repeat').disabled = true;
  for (const option of [...$('#work-operation').options]) {
    if (!PUBLIC_OPERATIONS.includes(option.value)) option.remove();
  }
  $('#work-operation').value = 'content_draft';
  const aiInput = $('#work-ai'), aiLabel = aiInput.closest('label');
  for (const child of [...aiLabel.childNodes]) if (child !== aiInput) child.remove();
  aiLabel.append(root.createTextNode(' Use the owner-approved AI policy · local Gemma mock in the demonstration'));
  write($('#mode-badge'), 'PUBLIC NEAR TESTNET');
  write($('#sidebar-network'), 'NEAR testnet · test tokens');
  write($('.overview-heading .lede'), 'Give your AI worker a clear task. Review its draft and decide what happens next.');
  write($('#workspace-start h2'), 'Explore first. Connect when you are ready.');
  write($('#workspace-start p'), 'Read the demonstration company, or connect your own compatible company with its reviewed code hash. Only its actual owner can approve work.');
  const startAction = $('#workspace-start [data-go]');
  write(startAction, 'Connect a company →');
  const banner = root.createElement('p'); banner.className = 'notice public-testnet-boundary';
  banner.textContent = 'NEAR testnet demo · local Gemma AI. Inspecting is free; drafts need the company owner’s approval.';
  $('#workspace-main').prepend(banner);
  write($('.next-steps .action-row p'), 'Prepare a content or website draft from the facts you approve.');
  write($('.metrics article:nth-child(3) small'), 'Public company ledger; test tokens only');
  write($('#work-form .hint'), 'Drafts stay encrypted until you recover them. A separate delivery action is needed to publish a site or send a message.');
  const home = $('.sidebar-foot a'); home.href = './'; write(home, 'About this testnet demo ↗');
  const wordmark = $('.wordmark'); wordmark.href = './';
  const environment = $('#environment-detail').closest('article');
  const detail = $('#environment-detail');
  detail.textContent = 'The browser reads public NEAR testnet directly and asks the actual company owner to approve each encrypted task. A separate operator worker executes approved work. The demonstration uses a pinned local Gemma 4 mock, not NEAR AI Cloud; Cloud billing and TEE execution remain unverified.';
  for (const child of [...environment.children]) if (child !== detail && child.tagName !== 'H2') child.remove();
  const extra = root.createElement('p');
  extra.textContent = 'Private media and documents, inbox, bookings and other operator workflows are not connected in this public build. Company provisioning and continuous worker hosting are separate setup steps. The demonstration company is read-only for visitors because its testnet owner keys stay with the operator.';
  environment.append(extra);
  const source = root.createElement('a'); source.href = 'https://github.com/businessisnear/business-is-near'; source.rel = 'noreferrer'; source.textContent = 'Inspect source and operator setup ↗'; environment.append(source);
  const tools = $('[data-panel="tools"]');
  tools.replaceChildren();
  const heading = root.createElement('div'); heading.className = 'page-heading';
  const headingBody = root.createElement('div');
  const eyebrow = root.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'UNDERSTAND THE WORK';
  const title = root.createElement('h1'); title.textContent = 'Look beneath the status.';
  const intro = root.createElement('p'); intro.className = 'lede'; intro.textContent = 'Read company records directly from NEAR testnet. A finalized task record is evidence of its lifecycle, not a promise about business results or worker uptime.';
  headingBody.append(eyebrow, title, intro); heading.append(headingBody); tools.append(heading);
  const panel = root.createElement('article'); panel.className = 'panel';
  const h2 = root.createElement('h2'); h2.textContent = 'Published demonstration identity';
  const description = root.createElement('p'); description.className = 'hint'; description.textContent = verifiedDemo(config) ? 'Published pins were checked during deployment. The workspace checks the actual current code and worker again when opening the example.' : 'Deployment and worker checks are still pending. These prepared identifiers are not a claim that a company is running.';
  const identity = root.createElement('dl'); identity.className = 'public-demo-identity';
  for (const [name, value] of [['Network', 'NEAR testnet'], ['Company', config.company_id], ['Code hash', config.code_hash], ['Worker identity', config.worker_key_id || 'Not finalized'], ['Execution', 'Pinned local Gemma 4 mock'], ['Cloud / TEE', 'Unverified']]) {
    const dt = root.createElement('dt'); dt.textContent = name;
    const dd = root.createElement('dd'); dd.textContent = value; identity.append(dt, dd);
  }
  panel.append(h2, description, identity); tools.append(panel);
  const link = root.createElement('a'); link.className = 'button secondary'; link.href = './'; link.textContent = 'Return to the demo guide ↗'; tools.append(link);
}
