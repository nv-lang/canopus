import { h, icon } from './dom.js';
import { safeError } from './delivery.js';
import { t } from './strings.js';

const loadingWords = {
  ru: 'Проверяем|Уточняем|Обновляем|Синхронизируем|Сопоставляем|Загружаем|Готовим|Собираем|Настраиваем|Подключаемся|Восстанавливаем|Читаем|Вычисляем|Обрабатываем|Упорядочиваем|Согласуем|Разбираем|Сверяем|Подготавливаем|Приводим в порядок'.split('|'),
  en: 'Checking|Verifying|Updating|Syncing|Matching|Loading|Preparing|Gathering|Configuring|Connecting|Restoring|Reading|Calculating|Processing|Organizing|Coordinating|Parsing|Comparing|Arranging|Putting things in order'.split('|'),
};
export function deliveryLoadingWord(language, previous = '') {
  const words = loadingWords[/^en(?:-|$)/i.test(language || '') ? 'en' : 'ru'];
  const choices = words.filter(word => word + '…' !== previous);
  return choices[Math.floor(Math.random() * choices.length)] + '…';
}

// Карточка сбоя доставки: сворачивается в компактную строку (иконка, краткая причина, кнопка раскрытия).
// Сообщение и ошибка не скрываются из модели и не удаляются: свёрнутость — только вид тела карточки.
export function deliveryCard(doc, item, actions) {
  if (item.checking) return h(doc, 'div', { class: 'delivery-pending', role: 'status', 'aria-label': t('delivery.checking'), 'data-delivery-loading': '', text: deliveryLoadingWord(doc.defaultView?.navigator?.language) });
  const archived = item.restored === true && item.state === 'error';
  const timestamp = Number.isFinite(item.at) && item.at > 0 ? new Date(item.at).toLocaleString('ru-RU') : '';
  const labels = {
    sending: t('delivery.sending'), unknown: t('delivery.unknown'), not_sent: t('delivery.not_sent'),
    received: t('delivery.received'), accepted: t('delivery.accepted'), agent_error: t('delivery.agent_error'),
    agent_refused: t('delivery.agent_refused'), error: t('delivery.error'),
  };
  if (item.state === 'waiting_restore') {
    const cancel = h(doc, 'button', { class: 'link-btn', type: 'button', text: t('delivery.restore_cancel') });
    cancel.addEventListener('click', () => actions.forget(item.id));
    return h(doc, 'div', { class: 'delivery-pending', role: 'status' }, t('delivery.waiting_restore'), ' ', cancel);
  }
  const pending = !item.reason && ['sending', 'received', 'accepted'].includes(item.state);
  if (pending) return h(doc, 'div', { class: 'delivery-pending', role: 'status', text: labels[item.state] });
  const uncertain = item.state === 'unknown' && !item.reason;
  const canRetry = item.state === 'not_sent' && !item.images.length && actions.canRetry !== false;
  const reason = item.reason ? safeError(item.reason) : '';
  const partial = item.partialAnswer && ['agent_error', 'agent_refused'].includes(item.state);
  const outgoing = typeof item.text === 'string' && item.text.trim();
  const explanation = partial ? t('delivery.partial_guidance') : canRetry
    ? t('delivery.retry_action') : t('delivery.no_retry');
  const detail = [labels[item.state] || labels.unknown, reason, explanation,
    t('delivery.state', { state: Object.hasOwn(labels, item.state) ? item.state : 'unknown' }),
    Number.isInteger(item.httpStatus) && item.httpStatus >= 400 && item.httpStatus < 600 ? t('delivery.http', { status: item.httpStatus }) : '',
    t('delivery.hidden')].filter(Boolean).join('\n');
  const retry = h(doc, 'button', { type: 'button', text: t('delivery.retry'), disabled: !canRetry, title: canRetry ? t('delivery.retry_hint') : explanation });
  retry.addEventListener('click', () => { if (!canRetry || retry.disabled) return; retry.disabled = true; actions.retry(item.id); });
  const restore = h(doc, 'button', { type: 'button', text: t('delivery.restore_request') });
  restore.addEventListener('click', () => actions.restore(item.text));
  const resume = h(doc, 'button', { type: 'button', text: t('delivery.resume') });
  resume.addEventListener('click', () => actions.restore(t('delivery.resume_draft')));
  const copy = h(doc, 'button', { type: 'button', text: t('delivery.copy') });
  copy.addEventListener('click', () => actions.copy(detail));
  const forget = h(doc, 'button', { type: 'button', text: t('delivery.forget'), title: t('delivery.forget_hint') });
  forget.addEventListener('click', () => actions.forget(item.id));
  const collapsed = item.collapsed !== false;
  const shortLabels = {
    sending: t('delivery.short_sending'), unknown: t('delivery.short_unknown'), not_sent: t('delivery.short_not_sent'),
    received: t('delivery.short_received'), accepted: t('delivery.short_accepted'), agent_error: t('delivery.short_agent_error'),
    agent_refused: t('delivery.short_agent_refused'), error: t('delivery.short_error'),
  };
  const status = partial ? t('delivery.short_partial') : archived ? t('delivery.saved_error') : Object.hasOwn(shortLabels, item.state) ? shortLabels[item.state] : shortLabels.unknown;
  const head = h(doc, 'button', {
    type: 'button', class: 'delivery-head', 'aria-expanded': String(!collapsed),
    title: collapsed ? t('delivery.expand') : t('delivery.collapse'),
  },
    h(doc, 'span', { class: 'delivery-label', 'data-state': item.state, 'data-warning': String(!archived && ['not_sent', 'agent_error', 'agent_refused', 'error'].includes(item.state)), text: status }),
    h(doc, 'span', { class: 'delivery-more', text: t('delivery.more') }),
    icon(doc, 'i-chevron-right', 'chev'));
  const body = h(doc, 'div', { class: 'delivery-body', hidden: collapsed },
    timestamp ? h(doc, 'time', { datetime: new Date(item.at).toISOString(), text: timestamp }) : null,
    !partial || reason ? h(doc, 'p', { class: 'delivery-reason', text: reason || labels[item.state] || labels.unknown }) : false,
    h(doc, 'p', { class: 'delivery-guidance', text: explanation }),
    item.images.length ? h(doc, 'p', { text: t('delivery.images') }) : false,
    outgoing ? h(doc, 'p', { class: 'delivery-request', text: t('delivery.request_preview', { text: outgoing.length > 160 ? outgoing.slice(0, 160) + '…' : outgoing }) }) : null,
    h(doc, 'div', { class: 'delivery-actions' }, ...(item.state === 'error' ? [] : [...(canRetry ? [retry] : []), ...(partial ? [resume] : []), ...(outgoing ? [restore] : [])]), ...(actions.forget ? [forget] : [])),
    h(doc, 'details', {}, h(doc, 'summary', { text: t('delivery.details') }), h(doc, 'pre', { text: detail }), copy));
  if (actions.toggle) head.addEventListener('click', () => actions.toggle(head, body));
  return h(doc, 'div', { class: archived ? 'delivery-error delivery-history' : uncertain ? 'delivery-error delivery-uncertain' : 'delivery-error', role: archived ? 'note' : 'status' }, head, body);
}
