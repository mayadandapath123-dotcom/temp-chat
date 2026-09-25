/* Clickable HTTP(S) links only. Never uses innerHTML or downloads URL previews. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TempChatLinks = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function parts(input) {
    const source = String(input || ''); const result = []; let last = 0;
    const pattern = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/gi;
    for (const match of source.matchAll(pattern)) {
      const start = match.index; let text = match[0];
      if (start > 0 && /[@\w/:.\-]/.test(source[start - 1])) continue;
      text = text.replace(/[.,!?;:]+$/, '');
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        while (text.endsWith(close) && text.split(close).length > text.split(open).length) text = text.slice(0, -1);
      }
      let url; try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch (_) { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || /[\u0000-\u0020]/.test(url.href)) continue;
      if (start > last) result.push({ text: source.slice(last, start) });
      result.push({ text, href: url.href }); last = start + text.length;
    }
    if (last < source.length) result.push({ text: source.slice(last) });
    return result;
  }
  function fill(container, value) {
    container.replaceChildren();
    for (const item of parts(value)) {
      if (!item.href) { container.append(document.createTextNode(item.text)); continue; }
      const a = document.createElement('a'); a.textContent = item.text; a.href = item.href;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'tc-chat-link';
      a.title = item.href; a.addEventListener('click', e => e.stopPropagation()); container.append(a);
    }
  }
  return { parts, fill };
});
