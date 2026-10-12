import { Download, RefreshCw } from 'lucide-react';
import { api, errorText, useApp } from './common';

export function UpdatePanel() {
  const { state, toast, dialog } = useApp();
  const update = state.update;
  const busy = ['checking', 'downloading', 'installing'].includes(update.phase);
  const action = async (operation: 'updateCheck'|'updateDownload'|'updateInstall'|'updatePortable') => {
    try {
      if (operation === 'updateInstall' && !await dialog({ title: '重启并安装更新？', message: 'Nexlet 将关闭并重新打开，已保存的数据会保留。JSON 等临时输入请先复制保留。', confirm: '重启安装' })) return;
      await api(operation);
    } catch (error) { toast(errorText(error), true); }
  };
  const label = { idle: '检查是否有新的正式版本', checking: '正在检查更新…', latest: '当前已是最新正式版本', available: `发现新版本 ${update.version}`, downloading: `正在下载 ${update.percent ?? 0}%`, downloaded: `版本 ${update.version} 已下载，准备安装`, installing: '正在准备安装并重启…', error: update.error || '更新失败，请重试' }[update.phase];
  return <>
    <div className="setting-row"><div><strong>应用更新</strong><p role="status">{update.mode === 'unsupported' ? '开发模式或当前平台暂不支持更新' : label}</p>
      {update.mode === 'portable' && <p>便携版下载后需手动替换；使用安装版可直接重启更新。</p>}</div>
      <div className="tool-buttons">
        {update.phase === 'available' ? <button className="button primary" onClick={() => void action(update.mode === 'portable' ? 'updatePortable' : 'updateDownload')}><Download size={16}/>{update.mode === 'portable' ? '下载便携版' : '下载更新'}</button> :
          update.phase === 'downloaded' ? <button className="button primary" onClick={() => void action('updateInstall')}>重启安装</button> :
          <button className="button" disabled={busy || update.mode === 'unsupported'} onClick={() => void action('updateCheck')}><RefreshCw size={16}/>{busy ? '更新处理中…' : '检查更新'}</button>}
      </div>
    </div>
    {update.phase === 'downloading' && <progress style={{ width: '100%' }} aria-label="更新下载进度" value={update.percent ?? 0} max={100}/>}
    {update.notes && <details className="setting-description"><summary>版本更新说明</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{update.notes}</p></details>}
  </>;
}
