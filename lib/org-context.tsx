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
  resolveActiveOrgId,
  subscribeStoredActiveOrgId,
  writeStoredActiveOrgId,
} from "@/lib/activeOrg";
import { isOrgScopedPlatformApiUrl } from "@/lib/apiScope";
import { useCurrentOrg, useCurrentUser, useOrganizations } from "@/lib/hooks";
import { firstNonEmptyScopes, hasOrgScope } from "@/lib/orgScopes.mjs";
import type { OrganizationSummary } from "@/lib/types";

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

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const { currentUser, isLoading: userLoading } = useCurrentUser();
  const {
    organizations,
    isLoading: orgsLoading,
    isError: orgsError,
  } = useOrganizations();
  const { currentOrg, isLoading: currentOrgLoading } = useCurrentOrg();
  const activeOrgId = useSyncExternalStore(
    subscribeStoredActiveOrgId,
    readStoredActiveOrgId,
    () => null,
  );
  const orgList = organizations ?? [];
  const reconciledOrgId = resolveActiveOrgId({
    storedOrgId: activeOrgId,
    availableOrgIds: orgList.map((org) => org.id),
    currentUserOrgId: currentUser?.org_id,
    currentOrgId: currentOrg?.org_id,
  });
  const orgSelectionPending =
    !orgsLoading && !orgsError && reconciledOrgId !== activeOrgId;

  useEffect(() => {
    setActiveOrgIdGetter(readStoredActiveOrgId);
    return () => setActiveOrgIdGetter(null);
  }, []);

  const persistActiveOrgId = useCallback((orgId: string | null) => {
    const normalizedOrgId = orgId?.trim() || null;
    writeStoredActiveOrgId(normalizedOrgId);
  }, []);

  const revalidateOrgScopedState = useCallback(() => {
    startTransition(() => {
      void mutate(
        (key) =>
          typeof key === "string" && isOrgScopedPlatformApiUrl(key),
        undefined,
        { revalidate: true },
      );
    });
  }, [mutate]);

  useEffect(() => {
    if (orgsLoading || orgsError) return;

    if (reconciledOrgId === activeOrgId) {
      return;
    }

    persistActiveOrgId(reconciledOrgId);
    revalidateOrgScopedState();
  }, [
    activeOrgId,
    orgsError,
    orgsLoading,
    persistActiveOrgId,
    reconciledOrgId,
    revalidateOrgScopedState,
  ]);

  const setActiveOrgId = useCallback((orgId: string) => {
    if (!orgId || orgId === activeOrgId) {
      return;
    }
    persistActiveOrgId(orgId);
    revalidateOrgScopedState();
  }, [activeOrgId, persistActiveOrgId, revalidateOrgScopedState]);

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
  // Prefer auth-resolved scopes (/auth/me, /orgs/current). Those endpoints
  // expand empty org_members.scopes to role defaults. GET /orgs returns raw DB
  // scopes, so an empty array would otherwise shadow the real owner/admin set
  // via `??` (empty is not nullish).
  const currentScopes = firstNonEmptyScopes(
    currentUserMatchesActiveOrg ? currentUser?.org_scopes : null,
    currentOrgMatchesActiveOrg ? currentOrg?.scopes : null,
    activeOrganization?.scopes,
  );

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
      {userLoading || orgsLoading || currentOrgLoading || orgSelectionPending
        ? null
        : children}
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
