"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { useSWRConfig } from "swr";
import { setActiveOrgIdGetter } from "@/lib/api";
import {
  readStoredActiveOrgId,
  subscribeStoredActiveOrgId,
  writeStoredActiveOrgId,
} from "@/lib/activeOrg";
import { useCurrentOrg, useCurrentUser, useOrganizations } from "@/lib/hooks";
import type { OrganizationSummary } from "@/lib/types";

const PLATFORM_API_PREFIX = "/api/platform";

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
  const activeOrgId = useSyncExternalStore(
    subscribeStoredActiveOrgId,
    readStoredActiveOrgId,
    () => null,
  );

  useEffect(() => {
    setActiveOrgIdGetter(readStoredActiveOrgId);
    return () => setActiveOrgIdGetter(null);
  }, []);

  const persistActiveOrgId = useCallback((orgId: string) => {
    const normalizedOrgId = orgId.trim() || null;
    writeStoredActiveOrgId(normalizedOrgId);
  }, []);

  const revalidateOrgScopedState = useCallback(() => {
    startTransition(() => {
      void mutate(
        (key) =>
          typeof key === "string" && key.startsWith(PLATFORM_API_PREFIX),
        undefined,
        { revalidate: true },
      );
    });
  }, [mutate]);

  useEffect(() => {
    if (orgsLoading) return;

    const availableOrgs = organizations ?? [];
    const isKnownSelection = !!activeOrgId && availableOrgs.some((org) => org.id === activeOrgId);
    if (isKnownSelection) {
      return;
    }

    if (activeOrgId) {
      revalidateOrgScopedState();
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
    organizations,
    orgsLoading,
    persistActiveOrgId,
    revalidateOrgScopedState,
  ]);

  const setActiveOrgId = useCallback((orgId: string) => {
    if (!orgId || orgId === activeOrgId) {
      return;
    }
    persistActiveOrgId(orgId);
    revalidateOrgScopedState();
  }, [activeOrgId, persistActiveOrgId, revalidateOrgScopedState]);

  const orgList = organizations ?? [];
  const resolvedActiveOrgId = activeOrgId ?? currentUser?.org_id ?? currentOrg?.org_id ?? null;
  const activeOrganization =
    orgList.find((org) => org.id === resolvedActiveOrgId) ?? null;
  const currentUserMatchesActiveOrg = currentUser?.org_id === resolvedActiveOrgId;
  const currentOrgMatchesActiveOrg = currentOrg?.org_id === resolvedActiveOrgId;
  const activeOrgName =
    activeOrganization?.name ??
    (currentOrgMatchesActiveOrg ? currentOrg?.org_name : null) ??
    (currentUserMatchesActiveOrg ? currentUser?.org_name : null) ??
    null;
  const currentRole =
    activeOrganization?.role ??
    (currentUserMatchesActiveOrg ? currentUser?.org_role : null) ??
    (currentOrgMatchesActiveOrg ? currentOrg?.role : null) ??
    null;
  const currentScopes =
    activeOrganization?.scopes ??
    (currentUserMatchesActiveOrg ? currentUser?.org_scopes : null) ??
    (currentOrgMatchesActiveOrg ? currentOrg?.scopes : null) ??
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
        isLoading: userLoading || orgsLoading || currentOrgLoading,
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
