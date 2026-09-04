"use client";

import { useEffect, useRef, useState } from "react";
import { useAppAuth } from "@/components/auth/AppAuth";
import { Building2, Copy, Mail, ShieldCheck, Trash2, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OrganizationTimezonePanel } from "@/components/settings/OrganizationTimezonePanel";
import {
  approveOrgContentKeyRequest,
  bootstrapCurrentOrgContentKey,
  createOrgInvitation,
  fetchCurrentOrgContentKeyRecovery,
  fetchCurrentOrgContentKeyStatus,
  removeOrgMember,
  requestCurrentOrgContentKeyAccess,
  resendOrgInvitation,
  revokeOrgInvitation,
  updateOrgMember,
} from "@/lib/api";
import { useCurrentOrg, useCurrentUser, useCurrentOrgContentKeyAccessRequest, useOrganizations, useOrgContentKeyRequests, useOrgInvitations, useOrgMembers, useOrgQuotaStatus, useOrgScopeCatalog } from "@/lib/hooks";
import { useOrgContext } from "@/lib/org-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { syncCurrentUserAckToActiveWorkers } from "@/lib/workerAckSync";
import type { CurrentOrgContentKeyStatus, OrgContentKeyAccessRequest, OrgInvitation, OrgMember, OrgScopeCatalog, QuotaStatus } from "@/lib/types";
import { countOpenInvitations, inviteSeatGate, isOpenInvitation } from "@/lib/inviteQuotaPolicy.mjs";
import {
  buildCurrentOrgContentKeyBootstrap,
  ensureDeviceEncryptionIdentity,
  importWrappedOrgContentKeyForDevice,
  importWrappedOrgContentKeyFromRecovery,
  loadStoredOrgContentKey,
  wrapOrgContentKeyForWorker,
} from "@/lib/cryptoContent";

function defaultScopes(catalog: OrgScopeCatalog, role: string): string[] {
  const defaults = catalog.role_defaults.find((entry) => entry.role === role);
  return defaults ? [...defaults.scopes] : [];
}

function assignableRoleDefaults(catalog: OrgScopeCatalog) {
  return catalog.role_defaults.filter((entry) => entry.role !== "owner");
}

function ScopeChecklist({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string[];
  onChange: (scopes: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {options.map((scope) => {
        const checked = value.includes(scope);
        return (
          <label
            key={scope}
            className={cn(
              "theme-border theme-surface flex items-center gap-2 border px-3 py-2 text-sm",
              disabled && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...value, scope].sort());
                  return;
                }
                onChange(value.filter((item) => item !== scope));
              }}
            />
            <span className="font-mono text-[12px]">{scope}</span>
          </label>
        );
      })}
    </div>
  );
}

function ScopeSummary({ scopes }: { scopes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.slice(0, 4).map((scope) => (
        <span
          key={scope}
          className="bg-black/[0.04] px-2 py-1 font-mono text-[11px] text-gray-600 dark:bg-white/[0.08] dark:text-gray-300"
        >
          {scope}
        </span>
      ))}
      {scopes.length > 4 && (
        <span className="bg-black/[0.04] px-2 py-1 text-[11px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
          +{scopes.length - 4} more
        </span>
      )}
    </div>
  );
}

function OrganizationMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="theme-border theme-surface flex min-w-0 items-start gap-3 rounded-2xl border p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="theme-text truncate text-lg font-semibold tracking-[-0.02em]">{value}</p>
        <p className="theme-text mt-0.5 text-xs font-medium">{label}</p>
        <p className="theme-text-muted mt-1 text-[11px] leading-4">{detail}</p>
      </div>
    </div>
  );
}

function MembersPanel({
  orgId,
  members,
  scopeCatalog,
  canEdit,
  canRead,
  onRefresh,
  currentUserId,
  currentUserDisplayName,
  currentUserEmail,
}: {
  orgId: string;
  members: OrgMember[];
  scopeCatalog: OrgScopeCatalog;
  canEdit: boolean;
  canRead: boolean;
  onRefresh: () => Promise<unknown>;
  currentUserId?: string;
  currentUserDisplayName?: string | null;
  currentUserEmail?: string | null;
}) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState("member");
  const [draftScopes, setDraftScopes] = useState<string[]>(() => defaultScopes(scopeCatalog, "member"));
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const startEditing = (member: OrgMember) => {
    if (member.is_owner) {
      return;
    }
    const role = assignableRoleDefaults(scopeCatalog).some((entry) => entry.role === member.role)
      ? member.role
      : "member";
    setEditingUserId(member.user_id);
    setDraftRole(role);
    setDraftScopes(role === member.role ? member.scopes : defaultScopes(scopeCatalog, role));
  };

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
        <p className="theme-text text-sm">You do not have access to view org members.</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
      <div className="border-b border-black/8 px-5 py-4 dark:border-white/8">
        <h2 className="theme-text text-base font-semibold">Members</h2>
      </div>

      <div className="divide-y divide-black/5 dark:divide-white/8">
        {members.map((member) => {
          const editing = editingUserId === member.user_id;
          const isOwner = member.is_owner;
          const isCurrentUser = !!currentUserId && member.user_id === currentUserId;
          const primaryText = isCurrentUser
            ? currentUserDisplayName || currentUserEmail || member.email
            : member.email;
          const secondaryText = isCurrentUser && currentUserEmail
            ? currentUserEmail
            : member.user_id;
          return (
            <div key={member.user_id} className="px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="theme-text truncate font-medium">{primaryText}</p>
                    <span className="bg-deep-space-blue-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-200">
                      {member.role}
                    </span>
                  </div>
                  <p className="theme-text-muted mt-1 text-sm">{secondaryText}</p>
                  {isCurrentUser && currentUserEmail && secondaryText !== member.user_id && (
                    <p className="theme-text-muted mt-1 text-xs">{member.user_id}</p>
                  )}
                  {!editing && (
                    <div className="mt-3">
                      <ScopeSummary scopes={member.scopes} />
                    </div>
                  )}
                </div>

                {!editing && canEdit && !isOwner && (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => startEditing(member)}>
                      Edit access
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={busyUserId === member.user_id}
                      onClick={async () => {
                        if (!window.confirm(`Remove ${member.email} from this organization?`)) {
                          return;
                        }
                        try {
                          setBusyUserId(member.user_id);
                          await removeOrgMember(orgId, member.user_id);
                          await onRefresh();
                          toast.success("Member removed.");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to remove member.");
                        } finally {
                          setBusyUserId(null);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              {editing && (
                <div className="mt-4 space-y-4 border-l border-black/10 pl-4 dark:border-white/10">
                  <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                    <label className="space-y-2">
                      <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                        Role
                      </span>
                      <select
                        value={draftRole}
                        onChange={(event) => {
                          const role = event.target.value;
                          setDraftRole(role);
                          setDraftScopes(defaultScopes(scopeCatalog, role));
                        }}
                        className="theme-border theme-surface w-full border px-3 py-2 text-sm"
                      >
                        {assignableRoleDefaults(scopeCatalog).map((entry) => (
                          <option key={entry.role} value={entry.role}>
                            {entry.role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2">
                      <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                        Explicit scopes
                      </span>
                      <ScopeChecklist options={scopeCatalog.scopes} value={draftScopes} onChange={setDraftScopes} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      isLoading={busyUserId === member.user_id}
                      onClick={async () => {
                        try {
                          setBusyUserId(member.user_id);
                          await updateOrgMember(orgId, member.user_id, {
                            role: draftRole,
                            scopes: draftScopes,
                          });
                          await onRefresh();
                          setEditingUserId(null);
                          toast.success("Member access updated.");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to update member.");
                        } finally {
                          setBusyUserId(null);
                        }
                      }}
                    >
                      Save access
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingUserId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InvitesPanel({
  orgId,
  invitations,
  scopeCatalog,
  quotaStatus,
  quotaLoading,
  canEdit,
  canRead,
  onRefresh,
}: {
  orgId: string;
  invitations: OrgInvitation[];
  scopeCatalog: OrgScopeCatalog;
  quotaStatus?: QuotaStatus;
  quotaLoading: boolean;
  canEdit: boolean;
  canRead: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [scopes, setScopes] = useState<string[]>(() => defaultScopes(scopeCatalog, "member"));
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const openInvitations = invitations.filter((invite) => isOpenInvitation(invite));
  const openInvitationCount = countOpenInvitations(invitations);
  const memberQuota = quotaStatus?.resources.members;
  const quotaGate = memberQuota
    ? inviteSeatGate({
        memberCount: memberQuota.count,
        openInvitationCount,
        memberLimit: memberQuota.limit,
      })
    : null;
  const inviteBlockedByQuota = quotaGate ? !quotaGate.canInvite : true;
  const inviteUnavailable = !quotaGate || inviteBlockedByQuota;
  const inviteButtonDisabled =
    inviteExpanded ||
    quotaLoading ||
    inviteUnavailable;
  const tierLabel = quotaStatus?.tier ? `${quotaStatus.tier} tier` : "current tier";
  const memberLimitText =
    memberQuota && memberQuota.limit >= 0
      ? `${quotaGate?.seatsUsed ?? memberQuota.count}/${memberQuota.limit} seats used`
      : "Unlimited seats";

  const buildInviteLink = (token: string) => {
    if (typeof window === "undefined") return token;
    return `${window.location.origin}/dashboard/invitations?token=${encodeURIComponent(token)}`;
  };

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
        <p className="theme-text text-sm">You do not have access to view org invitations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="theme-text text-base font-semibold">Invite a member</h2>
              <p className="theme-text-muted mt-1 text-sm">
                Create a scoped invite and copy the acceptance link immediately.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Button
                variant="primary"
                disabled={inviteButtonDisabled}
                onClick={() => setInviteExpanded(true)}
              >
                {quotaLoading
                  ? "Loading tier..."
                  : !quotaGate
                    ? "Tier unavailable"
                    : inviteBlockedByQuota
                      ? "Seat limit reached"
                      : "Invite member"}
              </Button>
              <p className="theme-text-muted text-xs">
                {quotaGate
                  ? `${tierLabel}: ${memberLimitText}`
                  : "Checking tier limits"}
              </p>
            </div>
          </div>

          {quotaGate && inviteBlockedByQuota ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              This organization has reached the member limit for the {tierLabel}. Revoke a pending invite, remove a member, or upgrade before inviting another member.
            </div>
          ) : null}

          {inviteExpanded && (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.1fr),220px]">
                <label className="space-y-2">
                  <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                    Email
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="client@example.com"
                    className="theme-border theme-surface w-full border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                    Role
                  </span>
                  <select
                    value={role}
                    onChange={(event) => {
                      const nextRole = event.target.value;
                      setRole(nextRole);
                      setScopes(defaultScopes(scopeCatalog, nextRole));
                    }}
                    className="theme-border theme-surface w-full border px-3 py-2 text-sm"
                  >
                    {assignableRoleDefaults(scopeCatalog).map((entry) => (
                      <option key={entry.role} value={entry.role}>
                        {entry.role}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 space-y-2">
                <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                  Explicit scopes
                </span>
                <ScopeChecklist options={scopeCatalog.scopes} value={scopes} onChange={setScopes} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  isLoading={isSubmitting}
                  disabled={inviteUnavailable}
                  onClick={async () => {
                    if (inviteUnavailable) {
                      toast.error("This organization does not have an available member seat.");
                      return;
                    }
                    try {
                      setIsSubmitting(true);
                      const created = await createOrgInvitation(orgId, {
                        email,
                        role,
                        scopes,
                      });
                      await navigator.clipboard.writeText(buildInviteLink(created.invite_token));
                      setEmail("");
                      setRole("member");
                      setScopes(defaultScopes(scopeCatalog, "member"));
                      setInviteExpanded(false);
                      await onRefresh();
                      toast.success("Invite email sent and link copied.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to create invitation.");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  Send invite
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setInviteExpanded(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
        <div className="border-b border-black/8 px-5 py-4 dark:border-white/8">
          <h2 className="theme-text text-base font-semibold">Invites</h2>
        </div>

        <div className="divide-y divide-black/5 dark:divide-white/8">
          {openInvitations.length === 0 && (
            <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
              No invitations yet.
            </div>
          )}

          {openInvitations.map((invite) => {
            return (
              <div key={invite.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="theme-text truncate font-medium">{invite.email}</p>
                    <span className="bg-black/[0.04] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                      pending
                    </span>
                    <span className="bg-deep-space-blue-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-200">
                      {invite.role}
                    </span>
                  </div>
                  <p className="theme-text-muted mt-1 text-sm">
                    Expires {new Date(invite.expires_at).toLocaleString()}
                  </p>
                  {invite.last_sent_at && (
                    <p className="theme-text-muted mt-1 text-xs">
                      Last sent {new Date(invite.last_sent_at).toLocaleString()}
                    </p>
                  )}
                  <div className="mt-3">
                    <ScopeSummary scopes={invite.scopes} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={busyInviteId === invite.id}
                    onClick={async () => {
                      try {
                        setBusyInviteId(invite.id);
                        const resent = await resendOrgInvitation(orgId, invite.id);
                        await navigator.clipboard.writeText(buildInviteLink(resent.invite_token));
                        await onRefresh();
                        toast.success("Invite email resent and fresh link copied.");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to resend invitation.");
                      } finally {
                        setBusyInviteId(null);
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Resend invite
                  </Button>
                  {canEdit && (
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={busyInviteId === invite.id}
                      onClick={async () => {
                        if (!window.confirm(`Revoke invite for ${invite.email}?`)) {
                          return;
                        }
                        try {
                          setBusyInviteId(invite.id);
                          await revokeOrgInvitation(orgId, invite.id);
                          await onRefresh();
                          toast.success("Invite revoked.");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Failed to revoke invitation.");
                        } finally {
                          setBusyInviteId(null);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MyDeviceAccessPanel({
  orgId,
  currentRole,
}: {
  orgId: string;
  currentRole: string | null;
}) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [orgKeyStatus, setOrgKeyStatus] = useState<CurrentOrgContentKeyStatus | null>(null);
  const [hasLocalAccess, setHasLocalAccess] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const autoRequestedRef = useRef(false);
  const autoUnlockingRef = useRef(false);
  const accessRequestDeviceId = hasLocalAccess === false ? deviceId ?? undefined : undefined;
  const { request, mutate, isLoading: requestLoading } = useCurrentOrgContentKeyAccessRequest(
    accessRequestDeviceId,
  );
  const roleAllowsRecovery = currentRole === "owner" || currentRole === "admin";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = await ensureDeviceEncryptionIdentity();
        if (!cancelled) {
          setDeviceId(identity.deviceId);
        }
      } catch {
        if (!cancelled) {
          setDeviceId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchCurrentOrgContentKeyStatus();
        const local = await loadStoredOrgContentKey(status.org_id, status.key_version);
        if (!cancelled) {
          setOrgKeyStatus(status);
          setHasLocalAccess(Boolean(local));
        }
      } catch {
        if (!cancelled) {
          setOrgKeyStatus(null);
          setHasLocalAccess(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!deviceId || !orgKeyStatus || hasLocalAccess || requestLoading || request || autoRequestedRef.current) {
      return;
    }

    autoRequestedRef.current = true;
    void (async () => {
      try {
        await requestCurrentOrgContentKeyAccess(deviceId);
        await mutate();
      } catch {
        autoRequestedRef.current = false;
      }
    })();
  }, [deviceId, hasLocalAccess, mutate, orgKeyStatus, request, requestLoading]);

  useEffect(() => {
    if (
      !orgKeyStatus ||
      hasLocalAccess ||
      !request ||
      request.state !== "approved" ||
      !request.wrapped_ock ||
      autoUnlockingRef.current
    ) {
      return;
    }

    autoUnlockingRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        await importWrappedOrgContentKeyForDevice({
          orgId: orgKeyStatus.org_id,
          wrappedOck: request.wrapped_ock!,
        });
        if (roleAllowsRecovery) {
          const bootstrap = await buildCurrentOrgContentKeyBootstrap({
            orgId: orgKeyStatus.org_id,
            keyVersion: orgKeyStatus.key_version,
          });
          await bootstrapCurrentOrgContentKey(bootstrap);
        }
        setHasLocalAccess(true);
        await syncCurrentUserAckToActiveWorkers().catch(() => undefined);
        await mutate();
        toast.success("Unlocked shared org content for this device.");
      } catch (error) {
        autoUnlockingRef.current = false;
        toast.error(error instanceof Error ? error.message : "Failed to unlock shared content.");
      } finally {
        setBusy(false);
      }
    })();
  }, [hasLocalAccess, mutate, orgKeyStatus, request, roleAllowsRecovery]);

  if (!deviceId || !orgKeyStatus) {
    return (
      <section className="rounded-2xl border border-black/10 px-5 py-4 dark:border-white/10">
        <p className="theme-text-muted text-sm">Checking shared content access for this device...</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
      <div className="border-b border-black/8 px-5 py-4 dark:border-white/8">
        <h2 className="theme-text text-base font-semibold">Shared Content Access</h2>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {hasLocalAccess ? (
          <p className="theme-text">This device already has access to shared org content.</p>
        ) : request?.state === "approved" && request.wrapped_ock ? (
          <>
            <p className="theme-text">
              An admin approved this device. Nenjo is unlocking shared org content locally now.
            </p>
            <Button isLoading={busy} disabled>
              Unlocking this device
            </Button>
          </>
        ) : request?.state === "pending" ? (
          <p className="theme-text">
            Waiting for approval. An owner or admin still needs to approve this device before shared org content is available here.
          </p>
        ) : (
          <>
            <p className="theme-text">
              This device does not have access to shared org content yet. Nenjo will request approval for it automatically.
            </p>
            <Button
              isLoading={busy}
              disabled={requestLoading}
              onClick={async () => {
                try {
                  setBusy(true);
                  await requestCurrentOrgContentKeyAccess(deviceId);
                  await mutate();
                  toast.success("Requested shared content access for this device.");
                } catch (error) {
                  autoRequestedRef.current = false;
                  toast.error(error instanceof Error ? error.message : "Failed to request shared content access.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {requestLoading ? "Requesting access" : "Request access for this device"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function AccessRequestsPanel({
  orgId,
  requests,
  currentUserId,
  onRefresh,
}: {
  orgId: string;
  requests: OrgContentKeyAccessRequest[];
  currentUserId?: string;
  onRefresh: () => Promise<unknown>;
}) {
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
      <div className="border-b border-black/8 px-5 py-4 dark:border-white/8">
        <h2 className="theme-text text-base font-semibold">Pending Device Access</h2>
      </div>
      <div className="divide-y divide-black/5 dark:divide-white/8">
        {requests.length === 0 ? (
          <div className="px-5 py-4">
            <p className="theme-text-muted text-sm">No pending device access requests.</p>
          </div>
        ) : (
          requests.map((request) => (
            <div key={request.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="theme-text font-medium">{request.requester_email}</p>
                <p className="theme-text-muted text-xs">{request.requester_user_id}</p>
                <p className="theme-text-muted text-xs">
                  Role: {request.requester_role} · Device: {request.device_label || request.device_id}
                </p>
              </div>
              {request.requester_user_id === currentUserId ? (
                <Button
                  disabled
                  className="disabled:opacity-100 motion-safe:animate-pulse shadow-[0_0_0_1px_rgba(217,119,6,0.35)]"
                  style={{ backgroundColor: "#f59e0b", color: "#ffffff" }}
                >
                  Waiting for approval
                </Button>
              ) : (
                <Button
                  isLoading={busyRequestId === request.id}
                  className="motion-safe:animate-pulse shadow-[0_0_0_1px_rgba(22,163,74,0.35)]"
                  style={{ backgroundColor: "#16a34a", color: "#ffffff" }}
                  onClick={async () => {
                    try {
                      setBusyRequestId(request.id);
                      const status = await fetchCurrentOrgContentKeyStatus();
                      let localOck = await loadStoredOrgContentKey(status.org_id, status.key_version);
                      if (!localOck && status.has_user_recovery_access) {
                        const recovery = await fetchCurrentOrgContentKeyRecovery();
                        if (recovery.recovery_wrapped_ock) {
                          localOck = await importWrappedOrgContentKeyFromRecovery({
                            orgId: recovery.org_id,
                            wrappedOck: recovery.recovery_wrapped_ock,
                          });
                        }
                      }
                      if (!localOck) {
                        throw new Error("This device does not currently hold the org content key. Restore org access on this device first.");
                      }
                      const wrappedOck = await wrapOrgContentKeyForWorker({
                        orgId: status.org_id,
                        keyVersion: status.key_version,
                        workerPublicKey: request.enc_public_key,
                      });
                      await approveOrgContentKeyRequest(orgId, request.id, wrappedOck);
                      await onRefresh();
                      toast.success("Approved device access request.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed to approve device access request.");
                    } finally {
                      setBusyRequestId(null);
                    }
                  }}
                >
                  Approve device
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function OrgSettingsSection() {
  const { user } = useAppAuth();
  const { currentUser, mutate: mutateCurrentUser } = useCurrentUser();
  const { currentOrg, mutate: mutateCurrentOrg } = useCurrentOrg();
  const { mutate: mutateOrganizations } = useOrganizations();
  const {
    activeOrgId,
    activeOrganization,
    currentRole,
    currentScopes,
    hasScope,
  } = useOrgContext();
  const { members, isLoading: membersLoading, mutate: mutateMembers } = useOrgMembers(activeOrgId ?? undefined);
  const { invitations, isLoading: invitesLoading, mutate: mutateInvites } = useOrgInvitations(activeOrgId ?? undefined);
  const { quotaStatus, isLoading: quotaLoading, mutate: mutateQuotaStatus } = useOrgQuotaStatus(activeOrgId ?? undefined);
  const { requests, isLoading: requestsLoading, mutate: mutateRequests } = useOrgContentKeyRequests(activeOrgId ?? undefined);
  const { scopeCatalog, isLoading: scopeCatalogLoading, isError: scopeCatalogError } = useOrgScopeCatalog();
  const githubAccount = user?.externalAccounts?.find((account) => account.provider === "github");
  const currentUserDisplayName =
    githubAccount?.username ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    null;
  const currentUserEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const canReadMembers = hasScope("org_members:read");
  const canWriteMembers = hasScope("org_members:write");
  const canReadInvites = hasScope("org_invites:read");
  const canWriteInvites = hasScope("org_invites:write");

  if (!activeOrgId) {
    return (
      <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
        <p className="theme-text text-sm">No active organization is selected.</p>
      </div>
    );
  }

  if (scopeCatalogLoading) {
    return (
      <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
        <p className="theme-text-muted text-sm">Loading organization access catalog...</p>
      </div>
    );
  }

  if (scopeCatalogError || !scopeCatalog) {
    return (
      <div className="rounded-2xl border border-red-200 px-4 py-5 dark:border-red-900/60">
        <p className="text-sm text-red-700 dark:text-red-300">Unable to load organization roles and scopes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-label="Organization summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <OrganizationMetric icon={<Building2 className="h-4 w-4" />} label="Organization" value={activeOrganization?.name ?? "Organization"} detail="Active workspace boundary" />
        <OrganizationMetric icon={<UserRoundCheck className="h-4 w-4" />} label="Your role" value={currentRole ?? "Unknown"} detail="Membership authority" />
        <OrganizationMetric icon={<ShieldCheck className="h-4 w-4" />} label="Effective scopes" value={currentScopes.length} detail="Explicit access grants" />
      </section>

      <OrganizationTimezonePanel
        canEdit={hasScope("org:write")}
        timezone={currentOrg?.timezone ?? activeOrganization?.timezone ?? "UTC"}
        onSaved={async () => {
          await Promise.all([mutateCurrentOrg(), mutateOrganizations()]);
        }}
      />

      <MyDeviceAccessPanel
        orgId={activeOrgId}
        currentRole={currentRole}
      />

      {membersLoading ? (
        <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
          <p className="theme-text-muted text-sm">Loading members...</p>
        </div>
      ) : (
        <MembersPanel
          orgId={activeOrgId}
          members={members ?? []}
          scopeCatalog={scopeCatalog}
          canRead={canReadMembers}
          canEdit={canWriteMembers}
          currentUserId={currentUser?.user_id ?? undefined}
          currentUserDisplayName={currentUserDisplayName}
          currentUserEmail={currentUserEmail}
          onRefresh={async () => {
            await Promise.allSettled([
              mutateMembers(),
              mutateQuotaStatus(),
              mutateCurrentUser(),
              mutateCurrentOrg(),
              mutateOrganizations(),
            ]);
          }}
        />
      )}

      {canWriteMembers && (
        requestsLoading ? (
          <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
            <p className="theme-text-muted text-sm">Loading device access requests...</p>
          </div>
        ) : (
          <AccessRequestsPanel
            orgId={activeOrgId}
            requests={requests ?? []}
            currentUserId={currentUser?.user_id ?? undefined}
            onRefresh={async () => {
              await mutateRequests();
            }}
          />
        )
      )}

      {invitesLoading ? (
        <div className="rounded-2xl border border-black/10 px-4 py-5 dark:border-white/10">
          <p className="theme-text-muted text-sm">Loading invites...</p>
        </div>
      ) : (
        <InvitesPanel
          orgId={activeOrgId}
          invitations={invitations ?? []}
          scopeCatalog={scopeCatalog}
          quotaStatus={quotaStatus}
          quotaLoading={quotaLoading}
          canRead={canReadInvites}
          canEdit={canWriteInvites}
          onRefresh={async () => {
            await Promise.all([mutateInvites(), mutateQuotaStatus()]);
          }}
        />
      )}
    </div>
  );
}
