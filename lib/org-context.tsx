"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSWRConfig } from "swr";
import { authMeUrl, setActiveOrgIdGetter } from "@/lib/api";
import { useCurrentOrg, useCurrentUser, useOrganizations } from "@/lib/hooks";
import type { OrganizationSummary } from "@/lib/types";

const ORG_STORAGE_KEY = "nenjo.active-org-id";

interface OrgContextValue {
  activeOrgId: string | null;
  activeOrgName: string | null;
  activeOrganization: OrganizationSummary | null;
  organizations: OrganizationSummary[];
  currentRole: string | null;
  currentScopes: string[];
  isLoading: boolean;
  setActiveOrgId: (orgId: string) => void;
  hasScope: (scope: string) => boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

function hasOrgScope(scopes: string[], required: string) {
  if (scopes.includes(required)) return true;
  if (!required.endsWith(":read")) return false;
  return scopes.includes(required.replace(":read", ":write"));
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const { currentUser, isLoading: userLoading } = useCurrentUser();
  const { organizations, isLoading: orgsLoading } = useOrganizations();
  const { currentOrg, isLoading: currentOrgLoading } = useCurrentOrg();
  const [hydrated, setHydrated] = useState(false);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActiveOrgIdState(localStorage.getItem(ORG_STORAGE_KEY));
    } catch {
      setActiveOrgIdState(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    setActiveOrgIdGetter(() => activeOrgId);
    return () => setActiveOrgIdGetter(null);
  }, [activeOrgId]);

  const persistActiveOrgId = (orgId: string) => {
    setActiveOrgIdState(orgId);
    try {
      localStorage.setItem(ORG_STORAGE_KEY, orgId);
    } catch {
      // Ignore storage failures.
    }
  };

  const revalidateOrgScopedState = () => {
    startTransition(() => {
      void mutate(
        (key) =>
          typeof key === "string" &&
          (key.includes("/api/v1/") || key === authMeUrl()),
        undefined,
        { revalidate: true },
      );
    });
  };

  useEffect(() => {
    if (!hydrated) return;
    if (orgsLoading) return;

    const availableOrgs = organizations ?? [];
    const isKnownSelection = !!activeOrgId && availableOrgs.some((org) => org.id === activeOrgId);
    if (isKnownSelection) {
      return;
    }

    const fallbackOrgId =
      currentUser?.org_id ??
      currentOrg?.org_id ??
      availableOrgs[0]?.id ??
      null;

    if (!fallbackOrgId) {
      return;
    }

    persistActiveOrgId(fallbackOrgId);
    revalidateOrgScopedState();
  }, [
    activeOrgId,
    currentOrg?.org_id,
    currentUser?.org_id,
    hydrated,
    mutate,
    organizations,
    orgsLoading,
  ]);

  const setActiveOrgId = (orgId: string) => {
    if (!orgId || orgId === activeOrgId) {
      return;
    }
    persistActiveOrgId(orgId);
    revalidateOrgScopedState();
  };

  const orgList = organizations ?? [];
  const resolvedActiveOrgId = activeOrgId ?? currentUser?.org_id ?? currentOrg?.org_id ?? null;
  const activeOrganization =
    orgList.find((org) => org.id === resolvedActiveOrgId) ?? null;
  const activeOrgName =
    activeOrganization?.name ??
    currentOrg?.org_name ??
    currentUser?.org_name ??
    null;
  const currentRole =
    currentUser?.org_role ??
    currentOrg?.role ??
    activeOrganization?.role ??
    null;
  const currentScopes =
    currentUser?.org_scopes ??
    currentOrg?.scopes ??
    activeOrganization?.scopes ??
    [];

  return (
    <OrgContext.Provider
      value={{
        activeOrgId: resolvedActiveOrgId,
        activeOrgName,
        activeOrganization,
        organizations: orgList,
        currentRole,
        currentScopes,
        isLoading: !hydrated || userLoading || orgsLoading || currentOrgLoading,
        setActiveOrgId,
        hasScope: (scope) => hasOrgScope(currentScopes, scope),
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrgContext() {
  const value = useContext(OrgContext);
  if (!value) {
    throw new Error("useOrgContext must be used within an OrgProvider");
  }
  return value;
}
