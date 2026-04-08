import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Nenjo Docs',
    },
    links: [
      {
        text: 'Dashboard',
        url: '/dashboard',
      },
    ],
  };
}
