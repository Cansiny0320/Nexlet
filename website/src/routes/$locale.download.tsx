import { createFileRoute } from '@tanstack/react-router';
import { DownloadPage } from '../pages/download';
import { pageHead } from '../lib/seo';
import type { Locale } from '../lib/i18n';
export const Route = createFileRoute('/$locale/download')({
  head: ({ params }) => pageHead('/download/', params.locale as Locale),
  component: DownloadPage,
});
