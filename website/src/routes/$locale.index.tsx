import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '../pages/home';
import { pageHead } from '../lib/seo';
import type { Locale } from '../lib/i18n';
export const Route = createFileRoute('/$locale/')({
  head: ({ params }) => pageHead('/', params.locale as Locale),
  component: HomePage,
});
