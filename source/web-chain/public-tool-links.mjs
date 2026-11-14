// The static public build contains only five pages. Broader owner tools remain
// available as source and local setup, not as nonexistent public wallet pages.
export const OWNER_TOOLS_GUIDE = 'https://github.com/businessisnear/business-is-near/blob/main/source/OWNER-TOOLS.md';
export const LOCAL_OWNER_TOOL_PAGES = Object.freeze([
  'native-app.html', 'knowledge.html', 'factory.html', 'outbox.html',
  'public-page.html', 'native-mail.html', 'native-feed.html',
  'native-community.html', 'generated-app.html', 'general-app.html',
  'native-subscriptions.html', 'native-service.html', 'native-promotion.html',
  'native-monitor.html', 'native-experiments.html', 'native-watch.html',
  'native-retirement.html',
]);
export function publicOwnerToolLinks(html) {
  const expected = new Set(LOCAL_OWNER_TOOL_PAGES), seen = new Set();
  const output = html.replace(/<a\b([^>]*\bhref="\.\/([^"?#]+)"[^>]*)>([\s\S]*?)<\/a>/g,
    (anchor, attributes, page, body) => {
      if (!expected.has(page)) return anchor;
      if (seen.has(page)) throw Error('Duplicate local owner-tool link: ' + page);
      seen.add(page);
      const label = body.includes('<h3>')
        ? body.replace(/<h3>([\s\S]*?)<\/h3>/, (_, title) => '<h3>' + title.replace(/\s*↗\s*$/, '') + ' · code &amp; local setup</h3>')
        : 'View source &amp; setup';
      return '<a' + attributes.replace('href="./' + page + '"', 'href="' + OWNER_TOOLS_GUIDE + '"') + '>' + label + '</a>';
    });
  if (seen.size !== expected.size) throw Error('Review the public owner-tool link inventory.');
  return output;
}
