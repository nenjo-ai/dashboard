"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

type NavigateOptions = {
  scroll?: boolean;
};

export function useSafeRouter() {
  const router = useRouter();
  const mountedRef = useRef(false);
  const readyRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        readyRef.current = true;
      }
    }, 0);
    timersRef.current.push(timer);

    return () => {
      mountedRef.current = false;
      readyRef.current = false;
      for (const pendingTimer of timersRef.current) {
        clearTimeout(pendingTimer);
      }
      timersRef.current = [];
    };
  }, []);

  const runWhenReady = useCallback((action: () => void) => {
    if (readyRef.current) {
      action();
      return;
    }

    const timer = setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }
      readyRef.current = true;
      action();
    }, 0);
    timersRef.current.push(timer);
  }, []);

  return useMemo(
    () => ({
      push: (href: string, options?: NavigateOptions) => {
        runWhenReady(() => router.push(href, options));
      },
      replace: (href: string, options?: NavigateOptions) => {
        runWhenReady(() => router.replace(href, options));
      },
      refresh: () => {
        runWhenReady(() => router.refresh());
      },
      prefetch: (href: string) => {
        runWhenReady(() => router.prefetch(href));
      },
      back: () => {
        runWhenReady(() => router.back());
      },
    }),
    [router, runWhenReady],
  );
}
