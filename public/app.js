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
