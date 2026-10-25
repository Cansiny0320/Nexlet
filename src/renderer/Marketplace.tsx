import { t } from '../shared/i18n';
import { localizedLabels } from '../shared/plugin-locales';
import { useEffect, useState } from 'react';
import { LayoutGrid, List, Puzzle, RefreshCw, Search } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { SettingsSelect } from './components/settings-select';
import {
  marketAvailability,
  type MarketEntry,
  type MarketState,
  type MarketTask,
} from '../shared/marketplace';
import { api, useApp, errorText, IconButton, Empty } from './common';
import './plugins.css';
import type { HostInputs } from '../shared/host-rpc';

const taskNames: Record<MarketTask['state'], string> = {
  queued: '等待下载',
  downloading: '下载中',
  ready: '等待安装确认',
  installing: '安装中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
export function MarketPanel() {
  const { state, toast } = useApp();
  const [market, setMarket] = useState<MarketState | null>(null),
    [loading, setLoading] = useState(false),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('name'),
    [layout, setLayout] = useState<'grid' | 'list'>('grid'),
    [detail, setDetail] = useState<string | null>(null),
    [tasks, setTasks] = useState<MarketTask[]>([]);
  const refresh = async (force = false) => {
    setLoading(true);
    try {
      setMarket(await api('marketplace', force));
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setLoading(false);
    }
  };
  const task = async (payload: HostInputs['marketTasks']) => {
    try {
      setTasks(await api('marketTasks', payload));
    } catch (e) {
      toast(errorText(e), true);
      void api('marketTasks', { action: 'list' })
        .then(setTasks)
        .catch(() => {});
    }
  };
  useEffect(() => {
    void refresh();
    void task({ action: 'list' });
  }, []);
  useEffect(() => {
    if (!tasks.some((t) => ['queued', 'downloading', 'installing'].includes(t.state))) return;
    const timer = setTimeout(() => {
      void task({ action: 'list' });
    }, 750);
    return () => clearTimeout(timer);
  }, [tasks]);
  const entries = (market?.entries ?? [])
    .filter(
      (p) =>
        (!category || p.category === category) &&
        [
          p.name,
          p.description,
          p.author,
          p.category,
          ...Object.values(p.locales ?? {}).flatMap(Object.values),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'updated'
        ? (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0)
        : localizedLabels(a).name.localeCompare(localizedLabels(b).name),
    );
  const categories = [...new Set(market?.entries.map((p) => p.category) ?? [])];
  const openLink = (url: string) =>
    void api('marketLink', url).catch((e) => toast(errorText(e), true));
  return (
    <div className="plugins-content">
      <div className="market-intro">
        <div className="market-search">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label={t('搜索插件')}
            placeholder={t('搜索插件')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SettingsSelect
          label={t('插件分类')}
          value={category}
          onValueChange={setCategory}
          items={[
            { value: '', label: t('全部分类') },
            ...categories.map((value) => ({ value, label: value })),
          ]}
        />
        <SettingsSelect
          label={t('插件排序')}
          value={sort}
          onValueChange={setSort}
          items={[
            { value: 'name', label: t('名称') },
            { value: 'updated', label: t('最近更新') },
          ]}
        />
        <Button
          variant="outline"
          aria-pressed={layout === 'list'}
          onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
        >
          {layout === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />}
          {layout === 'grid' ? t('列表') : t('卡片')}
        </Button>
        <IconButton title={t('刷新插件市场')} disabled={loading} onClick={() => void refresh(true)}>
          <RefreshCw size={15} />
        </IconButton>
      </div>
      {market?.error && (
        <div role="alert" className="market-message">
          {market.cached ? t('当前无法联网，显示缓存列表。') : t('无法加载插件市场。')}{' '}
          {market.error}
          <button onClick={() => void refresh(true)}>{t('重试')}</button>
        </div>
      )}
      {!!tasks.length && (
        <details
          className="market-tasks"
          open={tasks.some((t) => !['done', 'cancelled'].includes(t.state))}
        >
          <summary>
            {t('安装任务 (')}
            {tasks.length})
          </summary>
          {tasks.map((job) => (
            <div className="market-task" key={job.id}>
              <div>
                <strong>{job.name}</strong>
                <span>
                  {t(taskNames[job.state])}
                  {job.version ? ' · ' + job.version : ''}
                </span>
                {job.state === 'downloading' && (
                  <>
                    <progress value={job.total ? job.received : undefined} max={job.total ?? 1} />
                    <small>
                      {(job.received / 1048576).toFixed(1)} MiB
                      {job.total ? ' / ' + (job.total / 1048576).toFixed(1) + ' MiB' : ''}
                    </small>
                  </>
                )}
                {job.error && <p role="alert">{job.error}</p>}
                {job.state === 'ready' && (
                  <p>
                    {job.permissions?.length
                      ? t('申请权限：') + job.permissions.join('、')
                      : t('未申请额外权限')}
                    {job.addedPermissions?.length
                      ? t('。新增：') + job.addedPermissions.join('、')
                      : ''}
                  </p>
                )}
              </div>
              {job.state === 'ready' && (
                <button
                  className="button primary small"
                  onClick={() => void task({ action: 'install', id: job.id })}
                >
                  {t('查看权限并安装')}
                </button>
              )}
              {['queued', 'downloading', 'ready'].includes(job.state) && (
                <button onClick={() => void task({ action: 'cancel', id: job.id })}>
                  {t('取消')}
                </button>
              )}
              {['failed', 'cancelled'].includes(job.state) && (
                <button onClick={() => void task({ action: 'retry', id: job.id })}>
                  {t('重试')}
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {loading && !market ? (
        <Empty>{t('正在加载插件市场…')}</Empty>
      ) : !entries.length ? (
        <Empty icon={<Puzzle size={28} />}>
          {query ? t('没有找到相关插件') : t('暂无可用插件')}
        </Empty>
      ) : (
        <div className={layout === 'grid' ? 'market-grid' : 'market-list'}>
          {entries.map((original) => {
            const entry = localizedLabels(original),
              installed = state.plugins.find((p) => p.manifest.id === entry.id),
              reason = marketAvailability(
                entry,
                state.platform,
                state.version,
                installed
                  ? { development: installed.development, version: installed.manifest.version }
                  : undefined,
              ),
              current = installed && installed.manifest.version === entry.version;
            const pending = tasks.some(
              (t) => t.pluginId === entry.id && !['done', 'cancelled', 'failed'].includes(t.state),
            );
            return (
              <article className="market-card" key={entry.id}>
                <div className="market-card-top">
                  {entry.icon ? (
                    <img src={entry.icon} width={42} height={42} alt="" />
                  ) : (
                    <span className="plugin-badge">
                      <Puzzle size={24} />
                    </span>
                  )}
                  <div>
                    <h3>
                      <button
                        className="market-detail-link"
                        onClick={() => setDetail(detail === entry.id ? null : entry.id)}
                        aria-expanded={detail === entry.id}
                      >
                        {entry.name}
                      </button>
                    </h3>
                    <small>
                      {entry.author} · {entry.category}
                    </small>
                  </div>
                </div>
                <p>{entry.description}</p>
                <div className="market-card-bottom">
                  <span>v{entry.version}</span>
                  <div className="market-card-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-expanded={detail === entry.id}
                      onClick={() => setDetail(detail === entry.id ? null : entry.id)}
                    >
                      {detail === entry.id ? t('收起') : t('详情')}
                    </Button>
                    {current ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!installed.enabled}
                        onClick={() =>
                          void api('launch', {
                            id: `plugin:${entry.id}:${installed.manifest.features[0].code}`,
                          }).catch((e) => toast(errorText(e), true))
                        }
                      >
                        {installed.enabled ? t('打开') : t('已停用')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        title={reason ?? ''}
                        disabled={pending || !!reason}
                        onClick={() => void task({ action: 'enqueue', pluginId: entry.id })}
                      >
                        {pending ? t('任务进行中') : installed ? t('更新') : t('安装')}
                      </Button>
                    )}
                  </div>
                </div>
                {reason && !current && <div className="market-unavailable">{reason}</div>}
                {detail === entry.id && (
                  <>
                    <div className="market-platforms">
                      {entry.platforms
                        .map((p) => ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' })[p])
                        .join(' · ')}
                      {entry.minHostVersion && ` · Nexlet ≥ ${entry.minHostVersion}`}
                      {entry.updatedAt && ' · ' + new Date(entry.updatedAt).toLocaleDateString()}
                    </div>
                    <MarketDetails entry={entry} openLink={openLink} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {market?.cached && market.fetchedAt && (
        <div className="market-source">
          {t('缓存于')}
          {new Date(market.fetchedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
function MarketDetails({
  entry,
  openLink,
}: {
  entry: MarketEntry;
  openLink: (url: string) => void;
}) {
  const [images, setImages] = useState<Record<number, string>>({}),
    [error, setError] = useState('');
  return (
    <div className="market-details">
      {entry.readme && (
        <details open>
          <summary>{t('说明')}</summary>
          <p className="market-readme">{entry.readme}</p>
        </details>
      )}
      {!!entry.screenshots?.length && (
        <details>
          <summary>{t('预览')}</summary>
          <div className="market-previews">
            {entry.screenshots.map((url, index) =>
              images[index] ? (
                <img key={url} src={images[index]} alt={`${entry.name} 预览 ${index + 1}`} />
              ) : (
                <button
                  key={url}
                  onClick={() => {
                    setError('');
                    void api('marketPreview', { id: entry.id, index })
                      .then((data) => setImages((old) => ({ ...old, [index]: data })))
                      .catch((e) => setError(errorText(e)));
                  }}
                >
                  {t('加载预览')}
                  {index + 1}
                </button>
              ),
            )}
          </div>
          {error && <p role="alert">{error}</p>}
        </details>
      )}
      {entry.source && <button onClick={() => openLink(entry.source!)}>{t('查看源码')}</button>}
      {!!entry.permissions?.length && (
        <details>
          <summary>{t('申请权限')}</summary>
          <p>{entry.permissions.join('、')}</p>
        </details>
      )}
      {!!entry.changelog?.length && (
        <details>
          <summary>{t('版本日志')}</summary>
          {entry.changelog.map((item, index) => (
            <div key={index}>
              <strong>
                {item.version}
                {item.date ? ' · ' + new Date(item.date).toLocaleDateString() : ''}
              </strong>
              <p className="market-readme">{item.notes}</p>
            </div>
          ))}
        </details>
      )}
      {!entry.readme && !entry.changelog?.length && !entry.source && !entry.screenshots?.length && (
        <p>{t('作者暂未提供更多详情。')}</p>
      )}
    </div>
  );
}
