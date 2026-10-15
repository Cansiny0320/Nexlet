import { useSiteTranslation } from '../components/site-language';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from './ui/button';
export function CopyButton({ text, ...props }: ComponentProps<typeof Button> & { text: string }) {
  const { t } = useSiteTranslation();

  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t('已复制到剪贴板'));
    } catch {
      setMessage(t('复制未成功，请选中文字后手动复制'));
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }
  return (
    <>
      <Button {...props} data-copy={text} onClick={copy} />
      <output className="toast" hidden={!message}>
        {message}
      </output>
    </>
  );
}
