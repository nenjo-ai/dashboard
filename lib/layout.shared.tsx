import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <img
              src="/nenjo-logo-dark.png"
              alt=""
              className="size-5 object-contain dark:hidden"
            />
            <img
              src="/nenjo-logo-white.png"
              alt=""
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
