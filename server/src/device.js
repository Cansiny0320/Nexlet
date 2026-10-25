const base = location.pathname.replace(/\/device$/, '');
const language = /zh/i.test(navigator.language)
  ? /Hant|TW|HK|MO/i.test(navigator.language)
    ? 1
    : 0
  : 2;
const labels = [
  [
    '确认设备登录',
    '设备代码',
    '仅确认你本人发起的登录请求。',
    '使用 GitHub 登录',
    '确认登录',
    '拒绝',
    '请求失败，请重试',
    '已确认，请回到 Nexlet。',
    '已拒绝。',
    '当前 GitHub 账号',
    '核对设备代码，允许此设备登录你的账号。',
    '请与 Nexlet 客户端显示的代码核对。',
  ],
  [
    '確認裝置登入',
    '裝置代碼',
    '僅確認你本人發起的登入請求。',
    '使用 GitHub 登入',
    '確認登入',
    '拒絕',
    '請求失敗，請重試',
    '已確認，請回到 Nexlet。',
    '已拒絕。',
    '目前 GitHub 帳號',
    '核對裝置代碼，允許此裝置登入你的帳號。',
    '請與 Nexlet 用戶端顯示的代碼核對。',
  ],
  [
    'Confirm device sign-in',
    'Device code',
    'Confirm only a sign-in request you started.',
    'Sign in with GitHub',
    'Confirm sign-in',
    'Deny',
    'Request failed. Please retry.',
    'Confirmed. Return to Nexlet.',
    'Denied.',
    'Current GitHub account',
    'Check the device code to allow this device to sign in.',
    'Match this code with the one shown in your Nexlet client.',
  ],
][language];
document.documentElement.lang = ['zh-CN', 'zh-Hant', 'en'][language];
document.title = 'Nexlet · ' + labels[0];
['h1', '#code-label', '#safety-text', '#login', '#approve', '#deny'].forEach((selector, i) => {
  document.querySelector(selector).textContent = labels[i];
});
document.querySelector('#account-label').textContent = labels[9];
document.querySelector('#description').textContent = labels[10];
document.querySelector('#code-hint').textContent = labels[11];
const code = document.querySelector('#code'),
  message = document.querySelector('#message'),
  login = document.querySelector('#login'),
  approve = document.querySelector('#approve'),
  deny = document.querySelector('#deny');
let busy = false,
  completed = false;
code.value = new URLSearchParams(location.search).get('user_code') || '';
function setBusy(value) {
  busy = value;
  document.querySelector('main').setAttribute('aria-busy', String(value));
  for (const control of [code, login, approve, deny]) control.disabled = value || completed;
}
async function call(path, body) {
  const response = await fetch(base + '/auth' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || value.error_description || labels[6]);
  return value;
}
function error(e) {
  message.dataset.state = 'error';
  message.setAttribute('role', 'alert');
  message.textContent = e.message || labels[6];
}
function clearMessage() {
  message.textContent = '';
  message.setAttribute('role', 'status');
  delete message.dataset.state;
}
login.onclick = async () => {
  if (busy || completed) return;
  setBusy(true);
  clearMessage();
  try {
    const result = await call('/sign-in/social', {
      provider: 'github',
      callbackURL: location.origin + base + '/device?user_code=' + encodeURIComponent(code.value),
    });
    if (result.url) location.assign(result.url);
  } catch (e) {
    error(e);
  } finally {
    setBusy(false);
  }
};
async function decide(approved) {
  if (busy || completed) return;
  const userCode = code.value;
  setBusy(true);
  clearMessage();
  try {
    await call('/device?user_code=' + encodeURIComponent(userCode));
    await call(approved ? '/device/approve' : '/device/deny', { userCode });
    completed = true;
    message.dataset.state = 'success';
    message.textContent = approved ? labels[7] : labels[8];
  } catch (e) {
    error(e);
  } finally {
    setBusy(false);
  }
}
approve.onclick = () => decide(true);
deny.onclick = () => decide(false);
setBusy(true);
call('/get-session')
  .then((session) => {
    if (!session?.user) return;
    document.querySelector('#identity').textContent = session.user.name;
    document.querySelector('#account').hidden = false;
    login.hidden = true;
    approve.hidden = false;
    deny.hidden = false;
  })
  .catch(error)
  .finally(() => setBusy(false));
