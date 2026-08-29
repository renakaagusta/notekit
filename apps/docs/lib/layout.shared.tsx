import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandLockup } from '@/components/brand';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLockup />,
    },
    githubUrl: 'https://github.com/renakaagusta/notekit',
  };
}
