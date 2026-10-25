// This bootstrap is used only by synthetic integration tests. It cannot show/focus windows.
const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');
if (process.env.NEXLET_TEST_MODE !== '1' || !process.env.NEXLET_USER_DATA)
  throw new Error('Hidden integration tests require isolated userData');
for (const method of ['show', 'showInactive', 'focus', 'moveTop', 'restore'])
  BrowserWindow.prototype[method] = function () {};
dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
dialog.showErrorBox = (title, content) => {
  throw new Error(title + ': ' + content);
};
app.setAppPath(process.cwd());
require(path.join(process.cwd(), 'dist/main/index.cjs'));
