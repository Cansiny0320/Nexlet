import { t } from '../shared/i18n';
import { useEffect, useState } from 'react';
import type { CapabilityState, OcrResult, TranslationResult } from '../shared/capability-providers';
import type { CaptureAnnotation } from '../shared/capture-editor';
import { errorText } from './common';

export function ImageRecognition({ annotations = [] }: { annotations?: CaptureAnnotation[] }) {
  const [providers, setProviders] = useState<CapabilityState>({ providers: [], defaults: {} });
  const [ocr, setOcr] = useState(''),
    [translation, setTranslation] = useState(''),
    [target, setTarget] = useState('zh-CN');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  useEffect(() => {
    void window.desktopTools
      .call<CapabilityState>('providers')
      .then(setProviders)
      .catch((e) => setError(errorText(e)));
    return () => {
      void window.desktopTools.call('recognitionCancel').catch(() => {});
    };
  }, []);
  const run = async (action: 'recognize' | 'translate') => {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const value = await window.desktopTools.call<OcrResult | TranslationResult>(action, {
        annotations,
        ocrProviderId: ocr || undefined,
        translationProviderId: translation || undefined,
        targetLanguage: target,
      });
      setResult(value.text);
      if (!value.text) setError(t('没有识别到文字'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="image-recognition" onPointerDown={(e) => e.stopPropagation()}>
      <div className="image-recognition-controls">
        <select
          aria-label={t('OCR 提供商')}
          value={ocr}
          disabled={busy}
          onChange={(e) => setOcr(e.target.value)}
        >
          <option value="">{t('默认 OCR')}</option>
          {providers.providers
            .filter((p) => p.capability === 'ocr')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.locality === 'cloud' ? t('（云端）') : ''}
              </option>
            ))}
        </select>
        <button disabled={busy} onClick={() => void run('recognize')}>
          {t('提取文字')}
        </button>
        <select
          aria-label={t('翻译提供商')}
          value={translation}
          disabled={busy}
          onChange={(e) => setTranslation(e.target.value)}
        >
          <option value="">{t('默认翻译')}</option>
          {providers.providers
            .filter((p) => p.capability === 'translation')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.locality === 'cloud' ? t('（云端）') : ''}
              </option>
            ))}
        </select>
        <select
          aria-label={t('目标语言')}
          value={target}
          disabled={busy}
          onChange={(e) => setTarget(e.target.value)}
        >
          {[
            ['zh-CN', t('简体中文')],
            ['zh-TW', t('繁體中文')],
            ['en', 'English'],
            ['ja', t('日本語')],
            ['ko', '한국어'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button disabled={busy} onClick={() => void run('translate')}>
          {t('翻译')}
        </button>
        {busy && (
          <button onClick={() => void window.desktopTools.call('recognitionCancel')}>
            {t('取消')}
          </button>
        )}
      </div>
      {busy && <p role="status">{t('处理中…')}</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <textarea
            aria-label={t('识别或翻译结果')}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={6}
          />
          <div className="tool-buttons">
            <button
              onClick={() =>
                void window.desktopTools
                  .call('resultCopy', result)
                  .catch((e) => setError(errorText(e)))
              }
            >
              {t('复制文字')}
            </button>
            <button
              onClick={() =>
                void window.desktopTools
                  .call('resultLaunch', result)
                  .catch((e) => setError(errorText(e)))
              }
            >
              {t('继续处理')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
