"use client";

import { createContext, useContext } from "react";

const MobileMenuContext = createContext<(() => void) | undefined>(undefined);

export function MobileMenuProvider({
  onMenuClick,
  children,
}: {
  onMenuClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <MobileMenuContext.Provider value={onMenuClick}>
      {children}
    </MobileMenuContext.Provider>
  );
}

export function useMobileMenu() {
  return useContext(MobileMenuContext);
}
