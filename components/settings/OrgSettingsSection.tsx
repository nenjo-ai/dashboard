"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Copy, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
import { useCurrentUser, useCurrentOrgContentKeyAccessRequest, useOrgContentKeyRequests, useOrgInvitations, useOrgMembers } from "@/lib/hooks";
import { useOrgContext } from "@/lib/org-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { syncCurrentUserAckToActiveWorkers } from "@/lib/workerAckSync";
import type { CurrentOrgContentKeyStatus, OrgContentKeyAccessRequest, OrgInvitation, OrgMember } from "@/lib/types";
import {
  buildCurrentOrgContentKeyBootstrap,
  ensureDeviceEncryptionIdentity,
  importWrappedOrgContentKeyForDevice,
  importWrappedOrgContentKeyFromRecovery,
  loadStoredOrgContentKey,
  wrapOrgContentKeyForWorker,
} from "@/lib/cryptoContent";

const ROLE_OPTIONS = ["owner", "admin", "member", "viewer"] as const;
const SCOPE_OPTIONS = [
  "org:read",
  "org:write",
  "org_members:read",
  "org_members:write",
  "org_invites:read",
  "org_invites:write",
  "workers:read",
  "workers:approve",
  "workers:write",
  "api_keys:read",
  "api_keys:write",
  "projects:read",
  "projects:write",
  "library:write",
  "agents:read",
  "agents:write",
  "models:read",
  "models:write",
  "routines:read",
  "routines:write",
  "councils:read",
  "councils:write",
  "domains:read",
  "domains:write",
  "abilities:read",
  "abilities:write",
  "context_blocks:read",
  "context_blocks:write",
  "commands:read",
  "commands:write",
  "mcp_servers:read",
  "mcp_servers:write",
  "notify:read",
  "notify:write",
] as const;

function defaultScopes(role: (typeof ROLE_OPTIONS)[number]) {
  if (role === "owner" || role === "admin") return [...SCOPE_OPTIONS];
  if (role === "member") {
    return [
      "org:read",
      "org_members:read",
      "workers:read",
      "projects:read",
      "projects:write",
      "library:write",
      "agents:read",
      "agents:write",
      "models:read",
      "models:write",
      "routines:read",
      "routines:write",
      "councils:read",
      "councils:write",
      "domains:read",
      "domains:write",
      "abilities:read",
      "abilities:write",
      "context_blocks:read",
      "context_blocks:write",
      "commands:read",
      "commands:write",
      "mcp_servers:read",
      "mcp_servers:write",
      "notify:read",
    ];
  }
  return [
    "org:read",
    "org_members:read",
    "workers:read",
    "projects:read",
    "agents:read",
    "models:read",
    "routines:read",
    "councils:read",
    "domains:read",
    "abilities:read",
    "context_blocks:read",
    "commands:read",
    "mcp_servers:read",
    "notify:read",
  ];
}

function ScopeChecklist({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (scopes: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {SCOPE_OPTIONS.map((scope) => {
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

function MembersPanel({
  orgId,
  members,
  canEdit,
  canRead,
  onRefresh,
  currentUserId,
  currentUserDisplayName,
  currentUserEmail,
}: {
  orgId: string;
  members: OrgMember[];
  canEdit: boolean;
  canRead: boolean;
  onRefresh: () => Promise<unknown>;
  currentUserId?: string;
  currentUserDisplayName?: string | null;
  currentUserEmail?: string | null;
}) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<(typeof ROLE_OPTIONS)[number]>("member");
  const [draftScopes, setDraftScopes] = useState<string[]>(defaultScopes("member"));
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const startEditing = (member: OrgMember) => {
    if (member.role === "owner") {
      return;
    }
    const role = ROLE_OPTIONS.includes(member.role as (typeof ROLE_OPTIONS)[number])
      ? (member.role as (typeof ROLE_OPTIONS)[number])
      : "member";
    setEditingUserId(member.user_id);
    setDraftRole(role);
    setDraftScopes(member.scopes);
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
          const isOwner = member.role === "owner";
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
                          const role = event.target.value as (typeof ROLE_OPTIONS)[number];
                          setDraftRole(role);
                          setDraftScopes(defaultScopes(role));
                        }}
                        className="theme-border theme-surface w-full border px-3 py-2 text-sm"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2">
                      <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                        Explicit scopes
                      </span>
                      <ScopeChecklist value={draftScopes} onChange={setDraftScopes} />
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
  canEdit,
  canRead,
  onRefresh,
}: {
  orgId: string;
  invitations: OrgInvitation[];
  canEdit: boolean;
  canRead: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("member");
  const [scopes, setScopes] = useState<string[]>(defaultScopes("member"));
  const [inviteExpanded, setInviteExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const openInvitations = invitations.filter(
    (invite) =>
      !invite.revoked_at &&
      !invite.accepted_at &&
      new Date(invite.expires_at).getTime() > Date.now(),
  );

  const buildInviteLink = (token: string) => {
    if (typeof window === "undefined") return token;
    return `${window.location.origin}/dashboard/invitations/${token}`;
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
              <Button variant="primary" disabled>
                Invite member
              </Button>
              <p className="theme-text-muted text-xs">Coming soon</p>
            </div>
          </div>

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
                      const nextRole = event.target.value as (typeof ROLE_OPTIONS)[number];
                      setRole(nextRole);
                      setScopes(defaultScopes(nextRole));
                    }}
                    className="theme-border theme-surface w-full border px-3 py-2 text-sm"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 space-y-2">
                <span className="theme-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                  Explicit scopes
                </span>
                <ScopeChecklist value={scopes} onChange={setScopes} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  isLoading={isSubmitting}
                  onClick={async () => {
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
                      setScopes(defaultScopes("member"));
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
                  className="disabled:opacity-100 animate-pulse shadow-[0_0_0_1px_rgba(217,119,6,0.35)]"
                  style={{ backgroundColor: "#f59e0b", color: "#ffffff" }}
                >
                  Waiting for approval
                </Button>
              ) : (
                <Button
                  isLoading={busyRequestId === request.id}
                  className="animate-pulse shadow-[0_0_0_1px_rgba(22,163,74,0.35)]"
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
  const { user } = useUser();
  const { currentUser } = useCurrentUser();
  const {
    activeOrgId,
    activeOrganization,
    currentRole,
    currentScopes,
    hasScope,
  } = useOrgContext();
  const { members, isLoading: membersLoading, mutate: mutateMembers } = useOrgMembers(activeOrgId ?? undefined);
  const { invitations, isLoading: invitesLoading, mutate: mutateInvites } = useOrgInvitations(activeOrgId ?? undefined);
  const { requests, isLoading: requestsLoading, mutate: mutateRequests } = useOrgContentKeyRequests(activeOrgId ?? undefined);
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

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-black/10 p-5 dark:border-white/10 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Organization</p>
          <p className="theme-text mt-2 text-lg font-semibold">{activeOrganization?.name ?? "Organization"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Your role</p>
          <p className="theme-text mt-2 text-sm">{currentRole ?? "Unknown"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Effective scopes</p>
          <p className="theme-text mt-2 text-sm">{currentScopes.length}</p>
        </div>
      </section>

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
          canRead={canReadMembers}
          canEdit={canWriteMembers}
          currentUserId={currentUser?.user_id ?? undefined}
          currentUserDisplayName={currentUserDisplayName}
          currentUserEmail={currentUserEmail}
          onRefresh={async () => {
            await mutateMembers();
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
          canRead={canReadInvites}
          canEdit={canWriteInvites}
          onRefresh={async () => {
            await mutateInvites();
          }}
        />
      )}
    </div>
  );
}
