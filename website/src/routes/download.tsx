import { createFileRoute } from '@tanstack/react-router';
import { DownloadPage } from '../pages/download';
import { pageHead } from '../lib/seo';
export const Route = createFileRoute('/download')({
  head: () => pageHead('/download/'),
  component: DownloadPage,
});
