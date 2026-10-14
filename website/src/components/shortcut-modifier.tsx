import { useSite } from './site-provider';
export function ShortcutModifier({ as: Tag = 'span' }: { as?: 'span' | 'kbd' }) {
  return <Tag data-shortcut-modifier>{useSite().modifier}</Tag>;
}
