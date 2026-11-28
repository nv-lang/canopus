import { h } from './dom.js';
import { t } from './strings.js';

const STATUS_LABEL = {
  online: 'daemon.status_online',
  offline: 'daemon.status_offline',
  checking: 'daemon.status_checking',
  pending: 'daemon.status_pending',
  expired: 'daemon.status_expired',
  revoked: 'daemon.status_revoked',
};

export async function daemonRequest(fetcher, action = '', input) {
  const options = input === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  };
  const response = await fetcher('/api/daemons' + (action ? '/' + action : ''), options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || t('daemon.failed'));
  return result;
}

export function createDaemonSettings(doc, { refresh, mutate }) {
  const win = doc.defaultView;
  const dialog = h(doc, 'dialog', { class: 'dialog modal daemon-settings', 'aria-labelledby': 'daemon-settings-title' });
  const list = h(doc, 'ul', { class: 'daemon-list' });
  const notice = h(doc, 'p', { role: 'status' });
  const issue = h(doc, 'button', { type: 'submit', class: 'primary', text: t('daemon.issue') });
  const idInput = h(doc, 'input', { required: true, pattern: '[a-z0-9_\\-]{1,64}', autocomplete: 'off' });
  const address = h(doc, 'input', { required: true, placeholder: '10.77.0.1:39329', autocomplete: 'off' });
  const cwdInput = h(doc, 'input', { placeholder: '/srv/canopus/work', autocomplete: 'off' });
  const key = h(doc, 'input', { readonly: true, autocomplete: 'off', spellcheck: 'false' });
  const expiry = h(doc, 'p', { class: 'muted' });
  const credential = h(doc, 'div', { hidden: true, class: 'daemon-credential' },
    h(doc, 'label', { class: 'field' }, t('daemon.key'), key), expiry,
  );
  const form = h(doc, 'form', { class: 'proj-form' },
    h(doc, 'h4', { text: t('daemon.add') }),
    h(doc, 'label', { class: 'field' }, t('daemon.id'), idInput),
    h(doc, 'label', { class: 'field' }, t('daemon.address'), address),
    h(doc, 'label', { class: 'field' }, t('daemon.cwd'), cwdInput),
    h(doc, 'div', { class: 'actions' }, issue),
  );
  const close = h(doc, 'button', { type: 'button', text: t('daemon.close') });
  close.addEventListener('click', () => dialog.close());
  dialog.append(h(doc, 'h3', { id: 'daemon-settings-title', text: t('daemon.title') }),
    list, form, credential, notice, h(doc, 'div', { class: 'actions' }, close));
  doc.body.append(dialog);

  let timer;
  let expiresAt = 0;
  let issuedId = '';
  let generation = 0;
  let signature = '';
  let pending = false;
  const clearCredential = () => {
    key.value = '';
    credential.hidden = true;
    issuedId = '';
    expiresAt = 0;
  };

  async function run(action, input) {
    pending = true;
    issue.disabled = true;
    notice.textContent = '';
    try {
      return await mutate(action, input);
    } catch (error) {
      notice.textContent = error.message || t('daemon.failed');
      return null;
    } finally {
      pending = false;
      issue.disabled = false;
    }
  }

  function render(machines) {
    if (issuedId && (expiresAt <= Date.now() || machines.some(machine => machine.id === issuedId && machine.status !== 'pending'))) {
      clearCredential();
    }
    const next = JSON.stringify(machines);
    if (next === signature) return;
    signature = next;
    list.replaceChildren(...machines.map((machine) => {
      const { id, host, port, cwd, status, last_contact: lastContact } = machine;
      const statusText = t(STATUS_LABEL[status] || STATUS_LABEL.checking);
      const last = lastContact ? new Date(lastContact).toLocaleString('ru-RU') : '—';
      const row = h(doc, 'li', { class: 'daemon-machine' },
        h(doc, 'div', {},
          h(doc, 'strong', { text: id }),
          h(doc, 'span', { class: 'muted', text: ` · ${host}:${port}` }),
          h(doc, 'div', { text: statusText }),
          h(doc, 'div', { class: 'muted', text: t('daemon.last_contact', { last }) }),
          machine.revocation === 'pending' ? h(doc, 'div', { class: 'muted', text: t('daemon.revoke_pending') })
            : machine.revocation === 'unconfirmed' ? h(doc, 'div', { class: 'muted', text: t('daemon.revoke_unconfirmed') }) : null,
        ),
      );
      if (status === 'pending' || status === 'expired') {
        const reissue = h(doc, 'button', { type: 'button', text: t('daemon.reissue') });
        reissue.addEventListener('click', () => {
          idInput.value = id;
          address.value = `${host}:${port}`;
          cwdInput.value = cwd || '';
          form.requestSubmit();
        });
        row.append(reissue);
      }
      if (status !== 'revoked') {
        const revoke = h(doc, 'button', { type: 'button', text: t('daemon.revoke') });
        revoke.addEventListener('click', async () => {
          if (pending || !win.confirm(t('daemon.confirm', { id }))) return;
          const result = await run('revoke', { id });
          if (result && issuedId === id) clearCredential();
        });
        row.append(revoke);
      }
      return row;
    }));
    if (!machines.length) list.append(h(doc, 'li', { class: 'muted', text: t('daemon.empty') }));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const match = /^([0-9.]+):(\d+)$/.exec(address.value.trim());
    const port = Number(match?.[2]);
    if (!match || port < 1 || port > 65535) {
      notice.textContent = t('daemon.bad_address');
      return;
    }
    const current = generation;
    const result = await run('issue', { id: idInput.value, host: match[1], port, cwd: cwdInput.value.trim() });
    if (!result || current !== generation || !dialog.open) return;
    issuedId = result.id;
    expiresAt = result.expires_at;
    key.value = result.enroll_key;
    expiry.textContent = t('daemon.expires', { port: result.enroll_port, time: new Date(expiresAt).toLocaleTimeString('ru-RU') });
    credential.hidden = false;
    key.select();
    form.reset();
  });

  async function update() {
    const current = generation;
    try {
      const data = await refresh();
      if (current === generation && dialog.open) render(data.machines || []);
    } catch {
      if (current === generation && dialog.open) notice.textContent = t('daemon.failed');
    }
  }

  dialog.addEventListener('close', () => {
    win.clearInterval(timer);
    generation += 1;
    clearCredential();
  });
  return {
    open() {
      if (dialog.open) return;
      notice.textContent = '';
      dialog.showModal();
      update();
      timer = win.setInterval(update, 3000);
    },
    render,
  };
}
