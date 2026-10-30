import { h } from './dom.js';
import { safeError } from './delivery.js';
import { t } from './strings.js';

export function deliveryCard(doc, item, actions) {
  const labels = {
    sending: t('delivery.sending'), unknown: t('delivery.unknown'), not_sent: t('delivery.not_sent'),
    received: t('delivery.received'), accepted: t('delivery.accepted'), agent_error: t('delivery.agent_error'), error: t('delivery.error'),
  };
  const canRetry = item.state === 'not_sent' && !item.images.length && actions.canRetry !== false;
  const reason = item.reason ? safeError(item.reason) : '';
  const explanation = canRetry
    ? t('delivery.retry_action') : t('delivery.no_retry');
  const detail = [labels[item.state] || labels.unknown, reason, explanation,
    t('delivery.state', { state: Object.hasOwn(labels, item.state) ? item.state : 'unknown' }),
    Number.isInteger(item.httpStatus) && item.httpStatus >= 400 && item.httpStatus < 600 ? t('delivery.http', { status: item.httpStatus }) : '',
    t('delivery.hidden')].filter(Boolean).join('\n');
  const retry = h(doc, 'button', { type: 'button', text: t('delivery.retry'), disabled: !canRetry, title: canRetry ? t('delivery.retry_hint') : explanation });
  retry.addEventListener('click', () => { if (!canRetry || retry.disabled) return; retry.disabled = true; actions.retry(item.id); });
  const restore = h(doc, 'button', { type: 'button', text: t('msg.restore') });
  restore.addEventListener('click', () => actions.restore(item.text));
  const copy = h(doc, 'button', { type: 'button', text: t('delivery.copy') });
  copy.addEventListener('click', () => actions.copy(detail));
  const forget = h(doc, 'button', { type: 'button', text: t('delivery.forget'), title: t('delivery.forget_hint') });
  forget.addEventListener('click', () => actions.forget(item.id));
  return h(doc, 'div', { class: 'delivery-error', role: item.state === 'sending' ? 'status' : 'alert' },
    h(doc, 'strong', { text: `⚠ ${labels[item.state] || labels.unknown}` }),
    reason ? h(doc, 'p', { text: reason }) : false,
    h(doc, 'p', { text: explanation }),
    item.images.length ? h(doc, 'p', { text: t('delivery.images') }) : false,
    h(doc, 'div', { class: 'delivery-actions' }, ...(item.state === 'error' ? [] : [retry, restore]), ...(actions.forget ? [forget] : [])),
    h(doc, 'details', {}, h(doc, 'summary', { text: t('delivery.details') }), h(doc, 'pre', { text: detail }), copy));
}
