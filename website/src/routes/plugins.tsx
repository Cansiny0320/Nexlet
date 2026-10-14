import { createFileRoute } from '@tanstack/react-router';
import { PluginsPage } from '../pages/plugins';
import { pageHead } from '../lib/seo';
export const Route = createFileRoute('/plugins')({
  head: () => pageHead('/plugins/'),
  component: PluginsPage,
});
