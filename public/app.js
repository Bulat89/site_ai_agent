// Copy buttons and device-token issuing on the account page. No framework, no dependencies.
'use strict';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a temporary selection.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function flashCopied(button) {
  button.setAttribute('data-copied', '');
  setTimeout(() => button.removeAttribute('data-copied'), 1500);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy], [data-copy-from]');
  if (!button) return;
  const from = button.getAttribute('data-copy-from');
  const text = from ? document.getElementById(from)?.value : button.getAttribute('data-copy');
  if (text && (await copyText(text))) flashCopied(button);
});

const issueButton = document.getElementById('issue-token');
if (issueButton) {
  const row = document.getElementById('token-row');
  const input = document.getElementById('token');
  const error = document.getElementById('token-error');
  const hint = document.getElementById('token-hint');

  issueButton.addEventListener('click', async () => {
    const hasToken = issueButton.getAttribute('data-has-token') === '1';
    if (
      hasToken &&
      !confirm(
        'Выпустить новый токен? Старый перестанет работать во всех браузерах, где он вставлен.',
      )
    )
      return;
    issueButton.disabled = true;
    error.hidden = true;
    try {
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        location.href = '/auth/yandex';
        return;
      }
      if (!res.ok || !body.token) throw new Error(body.message || 'Не удалось получить токен');
      input.value = body.token;
      row.hidden = false;
      input.focus();
      input.select();
      issueButton.textContent = 'Выпустить новый токен';
      issueButton.classList.replace('btn--accent', 'btn--ghost');
      issueButton.setAttribute('data-has-token', '1');
      hint.textContent = 'Скопируйте токен сейчас — после обновления страницы он не будет показан.';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      issueButton.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- agents page
// Every change goes to the site's /api/agents/* (same origin, session cookie), which forwards it
// to the Goldfish server on the owner's behalf. After a change the page is reloaded from the server.

const pageError = document.querySelector('[data-page-error]');

function showError(message) {
  if (!pageError) return alert(message);
  pageError.textContent = message;
  pageError.hidden = false;
  pageError.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function agentsCall(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.href = '/auth/yandex';
    throw new Error('Войдите заново');
  }
  if (!res.ok) throw new Error(data.message || `Ошибка ${res.status}`);
  return data;
}

async function changeSettings(changes) {
  const data = await agentsCall('POST', '/api/agents/settings', { changes });
  if (data.warnings && data.warnings.length)
    alert(`Управляющий предупреждает:\n${data.warnings.join('\n')}`);
  location.reload();
}

const pageStatus = document.querySelector('[data-page-status]');
const FLASH_KEY = 'agents:flash';

function showStatus(message) {
  if (!pageStatus) return alert(message);
  pageStatus.textContent = message;
  pageStatus.hidden = false;
  pageStatus.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// A message that survives the reload after a change (the page is re-rendered by the server).
try {
  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash) {
    sessionStorage.removeItem(FLASH_KEY);
    showStatus(flash);
  }
} catch {
  // Storage blocked: the message is just not shown after the reload.
}

function reloadWith(message) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    alert(message);
  }
  location.reload();
}

function guarded(fn) {
  return (event) => {
    const el = event.currentTarget || event.target;
    Promise.resolve()
      .then(() => fn(event))
      .catch((err) => {
        showError(err.message);
        if (el && 'disabled' in el) el.disabled = false;
      });
  };
}

document.querySelectorAll('[data-act="settings"]').forEach((button) =>
  button.addEventListener(
    'click',
    guarded(async () => {
      button.disabled = true;
      await changeSettings(JSON.parse(button.getAttribute('data-changes')));
    }),
  ),
);

document.querySelectorAll('select[data-act="level"]').forEach((select) =>
  select.addEventListener(
    'change',
    guarded(async () => {
      const duty = select.getAttribute('data-duty');
      const level = select.value;
      // «Выкл» switches the duty off; any other level switches it on with these rights.
      const changes =
        level === 'off'
          ? [{ op: 'duty', duty, enabled: false }]
          : [
              { op: 'duty', duty, enabled: true },
              { op: 'level', duty, level },
            ];
      await changeSettings(changes);
    }),
  ),
);

// «Выполнить»: a duty that is off is not run — the agent asks for permission first, and nothing
// happens until the owner answers: once (the switches stay), always (switch on and run) or no.
const permission = document.querySelector('[data-permission]');

function askPermission(text) {
  if (!permission || typeof permission.showModal !== 'function')
    return Promise.resolve(confirm(`${text}\n\nРазрешить один раз?`) ? 'once' : 'no');
  permission.querySelector('[data-permission-text]').textContent = text;
  return new Promise((resolve) => {
    const buttons = permission.querySelectorAll('[data-grant]');
    const done = (answer) => {
      buttons.forEach((b) => b.removeEventListener('click', onClick));
      permission.removeEventListener('cancel', onCancel);
      if (permission.open) permission.close();
      resolve(answer);
    };
    const onClick = (event) => done(event.currentTarget.getAttribute('data-grant'));
    const onCancel = () => done('no');
    buttons.forEach((b) => b.addEventListener('click', onClick));
    permission.addEventListener('cancel', onCancel);
    permission.showModal();
  });
}

document.querySelectorAll('[data-act="run"]').forEach((button) =>
  button.addEventListener(
    'click',
    guarded(async () => {
      const duty = button.getAttribute('data-duty');
      const title = button.getAttribute('data-title');
      const path = `/api/agents/duties/${encodeURIComponent(duty)}/run`;
      button.disabled = true;
      let data = await agentsCall('POST', path);
      if (data.permission) {
        const grant = await askPermission(data.permission.text);
        if (grant === 'no') {
          showStatus(`«${title}» не выполнена: нет разрешения.`);
          button.disabled = false;
          return;
        }
        data = await agentsCall('POST', path, { grant });
        const warnings =
          data.warnings && data.warnings.length
            ? `\nУправляющий предупреждает: ${data.warnings.join(' ')}`
            : '';
        if (grant === 'always') return reloadWith(`«${title}»: ${data.status}.${warnings}`);
      }
      showStatus(`«${title}»: ${data.status}.`);
      button.disabled = false;
    }),
  ),
);

document.querySelectorAll('select[data-act="platform"]').forEach((select) =>
  select.addEventListener(
    'change',
    guarded(() =>
      changeSettings([
        { op: 'platform', platform: select.getAttribute('data-platform'), mode: select.value },
      ]),
    ),
  ),
);

document.querySelectorAll('select[data-act="wave"]').forEach((select) =>
  select.addEventListener(
    'change',
    guarded(() => changeSettings([{ op: 'wave', wave: Number(select.value) }])),
  ),
);

const pauseForm = document.querySelector('form[data-form="pause"]');
if (pauseForm) {
  pauseForm.addEventListener(
    'submit',
    guarded(async (event) => {
      event.preventDefault();
      const until = pauseForm.elements.until.value;
      if (!until) throw new Error('Укажите дату, до которой пауза');
      await changeSettings([{ op: 'pause', until, reason: pauseForm.elements.reason.value }]);
    }),
  );
}

const ownerForm = document.querySelector('form[data-form="owner"]');
if (ownerForm) {
  ownerForm.addEventListener(
    'submit',
    guarded(async (event) => {
      event.preventDefault();
      const f = ownerForm.elements;
      await changeSettings([
        {
          op: 'owner',
          summaryTime: f.summaryTime.value,
          quietFrom: f.quietFrom.value,
          quietTo: f.quietTo.value,
          urgentPerDay: Number(f.urgentPerDay.value),
        },
        { op: 'limits', reviewAutoMinStars: Number(f.reviewAutoMinStars.value) },
      ]);
    }),
  );
}

document.querySelectorAll('[data-act="approve"], [data-act="reject"]').forEach((button) =>
  button.addEventListener(
    'click',
    guarded(async () => {
      button.disabled = true;
      const decision = button.getAttribute('data-act');
      await agentsCall('POST', `/api/agents/approvals/${button.getAttribute('data-id')}`, {
        decision,
      });
      location.reload();
    }),
  ),
);

document.querySelectorAll('[data-act="edit-open"]').forEach((button) =>
  button.addEventListener('click', () => {
    const form = document.querySelector(
      `form[data-form="edit"][data-id="${button.getAttribute('data-id')}"]`,
    );
    if (form) {
      form.hidden = !form.hidden;
      if (!form.hidden) form.elements.text.focus();
    }
  }),
);

document.querySelectorAll('form[data-form="edit"]').forEach((form) =>
  form.addEventListener(
    'submit',
    guarded(async (event) => {
      event.preventDefault();
      await agentsCall('POST', `/api/agents/approvals/${form.getAttribute('data-id')}`, {
        decision: 'edit',
        text: form.elements.text.value,
      });
      location.reload();
    }),
  ),
);

const telegramButton = document.querySelector('[data-act="telegram"]');
if (telegramButton) {
  telegramButton.addEventListener(
    'click',
    guarded(async () => {
      telegramButton.disabled = true;
      const data = await agentsCall('POST', '/api/agents/telegram');
      const hint = document.querySelector('[data-telegram]');
      hint.textContent = '';
      if (data.link) {
        const a = document.createElement('a');
        a.href = data.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Открыть бота в Telegram';
        hint.append(a, ` — или отправьте боту: /start ${data.code}. Код действует 30 минут.`);
      } else hint.textContent = `Отправьте боту: /start ${data.code}. Код действует 30 минут.`;
      hint.hidden = false;
      telegramButton.disabled = false;
    }),
  );
}

const hookButton = document.querySelector('[data-act="hook-token"]');
if (hookButton) {
  hookButton.addEventListener(
    'click',
    guarded(async () => {
      if (!confirm('Выпустить новый токен вебхуков? Старые адреса перестанут работать.')) return;
      hookButton.disabled = true;
      const data = await agentsCall('POST', '/api/agents/hook-token');
      const base = hookButton.getAttribute('data-base');
      document.querySelector('[data-hook-events]').value = base + data.events;
      document.querySelector('[data-hook-email]').value = base + data.email;
      document.querySelector('[data-hook]').hidden = false;
      hookButton.disabled = false;
    }),
  );
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-from-attr]');
  if (!button) return;
  const input = document.querySelector(`[${button.getAttribute('data-copy-from-attr')}]`);
  if (input && input.value && (await copyText(input.value))) flashCopied(button);
});

const profileForm = document.querySelector('form[data-form="profile"]');
if (profileForm) {
  const error = profileForm.querySelector('[data-error]');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const f = profileForm.elements;
    try {
      const profile = JSON.parse(f.base.value);
      for (const key of ['name', 'address', 'phone', 'checkIn', 'checkOut', 'directions'])
        profile[key] = f[key].value.trim();
      if (f.website.value.trim()) profile.website = f.website.value.trim();
      else delete profile.website;
      profile.amenities = f.amenities.value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      profile.policies = { ...(profile.policies || {}) };
      for (const key of ['children', 'pets', 'prepayment', 'cancellation'])
        profile.policies[key] = f[`policies.${key}`].value.trim();
      profile.priceCorridor = {
        ...(profile.priceCorridor || {}),
        percent: Number(f.corridor.value || 10),
      };
      if (f.adsMonthlyBudget.value) profile.adsMonthlyBudget = Number(f.adsMonthlyBudget.value);
      else delete profile.adsMonthlyBudget;
      for (const key of ['rooms', 'faq', 'systems', 'competitors', 'upsells']) {
        const raw = f[key].value.trim();
        try {
          profile[key] = raw ? JSON.parse(raw) : [];
        } catch {
          throw new Error(
            `Раздел «${f[key].closest('label').querySelector('.field__label').textContent}»: неверный JSON`,
          );
        }
      }
      await agentsCall('PUT', '/api/agents/profile', profile);
      location.reload();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}
