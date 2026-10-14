import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '../pages/home';
import { pageHead } from '../lib/seo';
export const Route = createFileRoute('/')({ head: () => pageHead('/'), component: HomePage });
