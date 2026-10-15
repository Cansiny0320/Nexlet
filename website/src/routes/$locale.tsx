import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
export const Route = createFileRoute('/$locale')({
  beforeLoad: ({ params }) => {
    if (params.locale !== 'en' && params.locale !== 'zh-Hant') throw notFound();
  },
  component: Outlet,
});
