import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
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
            <Image
              src="/nenjo-logo-dark.png"
              alt="Nenjo"
              width={20}
              height={20}
              className="size-5 object-contain dark:hidden"
            />
            <Image
              src="/nenjo-logo-white.png"
              alt="Nenjo"
              width={20}
              height={20}
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
