'use client';

import { useEffect, useState } from 'react';
import { Airplay, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

const options = [
  ['light', Sun],
  ['dark', Moon],
  ['system', Airplay],
] as const;

type ThemeChoice = (typeof options)[number][0];

function itemClass(active: boolean) {
  return cn(
    'size-6.5 p-1.5',
    active
      ? 'bg-fd-accent text-fd-accent-foreground'
      : 'text-fd-muted-foreground',
  );
}

export function DocsThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const value = mounted ? theme : null;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border p-1 *:rounded-full',
        className,
      )}
      data-theme-toggle=""
    >
      {options.map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          aria-label={key}
          className={itemClass(value === key)}
          onClick={() => setTheme(key as ThemeChoice)}
        >
          <Icon className="size-full" fill="currentColor" />
        </button>
      ))}
    </div>
  );
}
