import { t } from '../shared/i18n';
import { useRef } from 'react';
import { X } from 'lucide-react';
import type { LaunchInput } from '../shared/launch';
import { IconButton } from './common';

export function LaunchInputChip({
  input,
  preview,
  onClear,
}: {
  input: LaunchInput;
  preview?: string;
  onClear: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div
        className="launch-input-chip"
        aria-label={t('待处理输入')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
      >
        {input.type === 'image' && preview ? (
          <button
            ref={trigger}
            className="launch-image-trigger"
            aria-label={t('预览图片')}
            title={t('点击预览图片')}
            onClick={() => dialog.current?.showModal()}
          >
            <img src={preview} alt={t('待处理图片')} draggable={false} />
            <span>{t('图片')}</span>
          </button>
        ) : (
          <span>
            {input.type === 'files'
              ? t('{{v0}} 个文件{{v1}}', {
                  v0: input.files.length,
                  v1: input.files.length === 1 ? ' · ' + input.files[0].name : '',
                  count: input.files.length,
                })
              : input.type === 'text'
                ? (input.from === 'selection' ? t('选区 · ') : t('文字 · ')) +
                  input.text.slice(0, 28)
                : t('图片')}
          </span>
        )}
        <IconButton title={t('取消内容输入')} onClick={onClear}>
          <X size={14} />
        </IconButton>
      </div>
      {input.type === 'image' && preview && (
        <dialog
          ref={dialog}
          className="launch-image-preview"
          aria-label={t('图片预览')}
          onClose={() => trigger.current?.focus()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
        >
          <div className="launch-image-preview-content">
            <div className="launch-image-preview-header">
              <span>{t('图片预览')}</span>
              <IconButton title={t('关闭预览')} onClick={() => dialog.current?.close()}>
                <X size={18} />
              </IconButton>
            </div>
            <img src={preview} alt={t('图片预览')} draggable={false} />
          </div>
        </dialog>
      )}
    </>
  );
}
