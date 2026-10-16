import { useState, type ComponentProps } from 'react';
import { formatShortcut, parseShortcutInput } from '../../shared/shortcut-display';
import { Input } from './ui/input';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  platform: string;
  onValueChange: (value: string) => void;
};

export function ShortcutInput({ value, platform, onValueChange, onBlur, readOnly, ...props }: Props) {
  const [draft, setDraft] = useState<{ raw: string; display: string } | null>(null);
  return <Input {...props} readOnly={readOnly}
    value={!readOnly && draft?.raw === value ? draft.display : formatShortcut(value, platform)}
    onChange={event => {
      const display = event.target.value, raw = parseShortcutInput(display);
      setDraft({ raw, display });
      onValueChange(raw);
    }}
    onBlur={event => { setDraft(null); onBlur?.(event); }}
  />;
}
