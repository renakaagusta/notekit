import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandLockup } from '@/components/brand';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLockup />,
    },
    githubUrl: 'https://github.com/renakaagusta/notekit',
    links: [
      { text: 'App', url: 'https://app.notekit.online' },
      { text: 'Design', url: 'https://design.notekit.online' },
    ],
  };
}
