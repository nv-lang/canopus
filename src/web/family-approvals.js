// Native modes are opaque ids, not an ordered scale of model permissions.
import { h } from './dom.js';
import { labelOf } from './labels-ru.js';
import { shownOf } from './state.js';

export function approvalView(model, session, agents, source = session.source, offers) {
  const shown = shownOf(model, session);
  const pool = Boolean(source?.pool);
  const families = pool ? agents.map(a => a.id) : [source?.family || shown.agent];
  const groups = [...new Set(families)].map(family => {
    const own = family === shown.agent && session.optionsAgent === family;
    const options = own ? session.options : model.catalog?.[family]?.options;
    const modes = offers?.get(JSON.stringify([session.id, family])) || options?.modes || [];
    const requested = session.approvals?.[family] || '';
    const actual = own ? options?.mode || '' : '';
    const selected = requested || options?.mode || '';
    const mode = modes.find(m => m.id === selected);
    return { family, modes, selected, actual, requested, unset: !requested, name: family === 'qoder' && selected === 'auto' ? 'Авто' : mode?.name || selected,
      pending: !session.draft && Boolean(requested) && requested !== actual,
      unavailable: modes.length === 0 ? 'Адаптер не сообщил поддерживаемые режимы' : selected && !mode ? `Режим ${selected} больше не поддерживается` : '' };
  });
  const direct = groups[0];
  const actualMode = direct?.modes.find(m => m.id === direct.actual);
  const displayedMode = direct?.modes.find(m => m.id === direct.selected);
  const defaultLabel = labelOf('mode', displayedMode).name || 'По умолчанию';
  return { pool, groups, label: pool ? 'По семьям' : direct?.unset ? defaultLabel : (direct?.unavailable ? labelOf('mode', actualMode).name || 'Режим недоступен' : labelOf('mode', displayedMode).name || direct?.name) || 'Нет данных ACP' };
}

export function createFamilyApprovals(doc, onPick) {
  let context = null;
  const button = h(doc, 'button', { type: 'button', class: 'status-btn family-approvals-button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', text: 'Нет данных ACP' });
  const menu = h(doc, 'div', { class: 'menu family-approvals-menu', role: 'menu', 'data-side': 'right', hidden: true });
  const root = h(doc, 'div', { class: 'mic-wrap family-approvals' }, button, menu);
  function close() { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function fill() {
    if (!context) return;
    const rows = [h(doc, 'div', { class: 'menu-head', text: 'Родные подтверждения / режим агента' }),
      h(doc, 'div', { class: 'menu-head', text: 'Не меняет ограничения Подготовки. Build/Plan — режимы агента, не шкала прав модели.' })];
    for (const group of context.view.groups) {
      rows.push(h(doc, 'div', { class: 'menu-head', text: group.family }));
      if (group.unset) rows.push(h(doc, 'div', { class: 'menu-head', text: 'По умолчанию — выбор владельца не задан' }));
      if (group.actual) rows.push(h(doc, 'div', { class: 'menu-head', text: `Подтверждено ACP: ${group.modes.find(m => m.id === group.actual)?.name || group.actual}` }));
      if (group.unavailable) rows.push(h(doc, 'div', { class: 'menu-head', text: group.unavailable }));
      for (const mode of group.modes) {
        const row = h(doc, 'button', { type: 'button', class: 'menu-item', role: 'menuitemradio',
          'aria-checked': String(!group.unset && mode.id === group.selected), disabled: context.busy,
          title: [mode.id, mode.description].filter(Boolean).join(' — '), text: mode.name || mode.id });
        row.addEventListener('click', () => { onPick(context.trace, group.family, mode.id); close(); });
        rows.push(row);
      }
    }
    menu.replaceChildren(...rows);
  }
  button.addEventListener('click', () => { if (menu.hidden) { fill(); menu.hidden = false; button.setAttribute('aria-expanded', 'true'); } else close(); });
  doc.addEventListener('click', e => { if (!e.composedPath().includes(root)) close(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); button.focus(); } });
  return { root, button, render(model, session, agents, busy, source) {
    if (context?.trace !== session.id) close();
    const view = approvalView(model, session, agents, source);
    context = { trace: session.id, view, busy };
    button.textContent = view.label;
    button.title = view.groups.map(g => `${g.family}: ${g.unavailable || (g.unset ? 'По умолчанию (не закреплено)' : g.name) || 'Нет данных ACP'}${g.actual ? ` · ACP: ${g.actual}` : ''}`).join('\n');
    button.setAttribute('aria-label', `Подтверждения: ${view.label}`);
    if (!menu.hidden) fill();
  } };
}
