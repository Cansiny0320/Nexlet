import { createFileRoute } from '@tanstack/react-router';
import { PluginsPage } from '../pages/plugins';
import { pageHead } from '../lib/seo';
import type { Locale } from '../lib/i18n';
export const Route = createFileRoute('/$locale/plugins')({
  head: ({ params }) => pageHead('/plugins/', params.locale as Locale),
  component: PluginsPage,
});
