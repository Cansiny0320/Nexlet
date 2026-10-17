import type { ComponentProps } from 'react';
import { Button } from './ui/button';

export function SettingsIconButton({
  title,
  ...props
}: ComponentProps<typeof Button> & { title: string }) {
  return <Button variant="ghost" size="icon-sm" title={title} aria-label={title} {...props} />;
}
