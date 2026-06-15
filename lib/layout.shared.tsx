import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { DocsThemeToggle } from '@/components/docs/DocsThemeToggle';

export function baseOptions(): BaseLayoutProps {
  return {
    themeSwitch: {
      component: <DocsThemeToggle />,
    },
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <img
              src="/nenjo-logo-dark.png"
              alt="Nenjo"
              className="size-5 object-contain dark:hidden"
            />
            <img
              src="/nenjo-logo-white.png"
              alt="Nenjo"
              className="hidden size-5 object-contain dark:block"
            />
          </span>
          <span>Nenjo Docs</span>
        </span>
      ),
    },
    links: [
      {
        text: 'Dashboard',
        url: '/dashboard/login',
      },
    ],
  };
}
