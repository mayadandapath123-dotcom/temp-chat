/* User manual: groups every manual section (built-in and feature-injected) into
   a few tabs so the guide reads as short pages instead of one long list.
   Loaded last, after every feature script has added its section. */
(function () {
  'use strict';
  const guide = document.querySelector('.guide-sections'); if (!guide) return;
  const items = [...guide.querySelectorAll(':scope > .guide-section-item')]; if (items.length < 4) return;
  const tabs = [
    { id: 'start', label: 'Rooms', match: /invite|room name|links and exit|refresh/i },
    { id: 'messages', label: 'Messages & media', match: /photo|voice note|reply|receipt|theme|quick delete|late joiners|reset/i },
    { id: 'calls', label: 'Calls', match: /call|camera|zoom|mute|mic|listen|talking|maximize|screen shar/i },
    { id: 'safety', label: 'Privacy & safety', match: /remov|privacy|safety|notif|data/i },
  ];
  const buckets = new Map(tabs.map(t => [t.id, []]));
  for (const item of items) {
    const title = item.querySelector('h5')?.textContent || '';
    const tab = tabs.find(t => t.match.test(title)) || tabs[0];
    buckets.get(tab.id).push(item);
  }
  const bar = document.createElement('div'); bar.className = 'tc-manual-tabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Manual sections');
  const panels = [];
  const buttons = [];
  for (const tab of tabs) {
    const list = buckets.get(tab.id); if (!list.length) continue;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'tc-manual-tab'; button.id = `tc-manual-tab-${tab.id}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `tc-manual-panel-${tab.id}`); button.textContent = tab.label;
    const panel = document.createElement('div'); panel.className = 'tc-manual-panel'; panel.id = `tc-manual-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.append(...list);
    button.addEventListener('click', () => select(tab.id));
    bar.append(button); panels.push({ id: tab.id, panel, button }); buttons.push(button);
  }
  function select(id) {
    for (const p of panels) {
      const on = p.id === id;
      p.panel.hidden = !on; p.button.setAttribute('aria-selected', on ? 'true' : 'false'); p.button.tabIndex = on ? 0 : -1;
    }
  }
  bar.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = buttons.indexOf(document.activeElement); if (i < 0) return;
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.focus(); next.click(); e.preventDefault();
  });
  guide.replaceChildren(bar, ...panels.map(p => p.panel));
  select(panels[0].id);
  // Reopening the manual starts on the first tab again.
  for (const id of ['guide-button', 'open-guide-btn-join']) document.getElementById(id)?.addEventListener('click', () => select(panels[0].id));
})();
