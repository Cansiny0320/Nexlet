const base = location.pathname.replace(/\/device$/, '');
const language = /zh/i.test(navigator.language)
  ? /Hant|TW|HK|MO/i.test(navigator.language)
    ? 1
    : 0
  : 2;
const labels = [
  [
    'Nexlet 设备登录',
    '输入 Nexlet 显示的设备代码',
    '只有在你自己的 Nexlet 客户端发起登录时才确认。',
    '使用 GitHub 登录',
    '确认登录这台设备',
    '拒绝',
    '请求失败，请重试',
    '已确认，请回到 Nexlet。',
    '已拒绝。',
    '当前账号：',
  ],
  [
    'Nexlet 裝置登入',
    '輸入 Nexlet 顯示的裝置代碼',
    '只有在你自己的 Nexlet 用戶端發起登入時才確認。',
    '使用 GitHub 登入',
    '確認登入這台裝置',
    '拒絕',
    '請求失敗，請重試',
    '已確認，請回到 Nexlet。',
    '已拒絕。',
    '目前帳號：',
  ],
  [
    'Nexlet device sign-in',
    'Enter the device code shown in Nexlet',
    'Confirm only if you started sign-in in your own Nexlet client.',
    'Sign in with GitHub',
    'Confirm this device',
    'Deny',
    'Request failed. Please retry.',
    'Confirmed. Return to Nexlet.',
    'Denied.',
    'Account: ',
  ],
][language];
document.documentElement.lang = ['zh-CN', 'zh-Hant', 'en'][language];
document.title = labels[0];
['h1', '#code-label', 'small', '#login', '#approve', '#deny'].forEach((selector, i) => {
  document.querySelector(selector).textContent = labels[i];
});
const code = document.querySelector('#code'),
  message = document.querySelector('#message');
code.value = new URLSearchParams(location.search).get('user_code') || '';
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
  message.textContent = e.message;
}
document.querySelector('#login').onclick = async () => {
  try {
    const result = await call('/sign-in/social', {
      provider: 'github',
      callbackURL: location.origin + base + '/device?user_code=' + encodeURIComponent(code.value),
    });
    if (result.url) location.assign(result.url);
  } catch (e) {
    error(e);
  }
};
async function decide(approved) {
  try {
    await call('/device?user_code=' + encodeURIComponent(code.value));
    await call(approved ? '/device/approve' : '/device/deny', { userCode: code.value });
    message.textContent = approved ? labels[7] : labels[8];
    document.querySelector('#approve').disabled = true;
    document.querySelector('#deny').disabled = true;
  } catch (e) {
    error(e);
  }
}
document.querySelector('#approve').onclick = () => decide(true);
document.querySelector('#deny').onclick = () => decide(false);
call('/get-session')
  .then((session) => {
    if (!session?.user) return;
    document.querySelector('#identity').textContent = labels[9] + session.user.name;
    document.querySelector('#login').hidden = true;
    document.querySelector('#approve').hidden = false;
    document.querySelector('#deny').hidden = false;
  })
  .catch(error);
