# Org Simplification Frontend Plan

Status: Proposed
Last updated: 2026-04-26
Repo: `dashboard`
Parent spec: `../platform/docs/org-simplification-implementation-spec.md`

## Goal

Update the dashboard so users can:

- operate inside a selected organization
- invite members into that organization
- manage member roles and scopes
- approve org workers
- work on org-shared resources
- keep chat private to the signed-in user

## Current State

The frontend has almost no real org UX today:

- `useCurrentUser()` exposes `org_id` and `org_role`, but these are only surfaced from auth state
- shared resources are fetched through stable user-scoped APIs
- worker approval UI exists, but it is user-private and lives in content-encryption settings
- there is no org members page, invite flow, or scope editor

## UX Principles

1. Shared resources should clearly belong to the current org.
2. Private chat should remain clearly personal.
3. Organization admin tools should be concentrated, not scattered.
4. Role editing should be simple by default, with advanced scope editing available explicitly.
5. Worker approval should feel like an org security workflow, not a hidden personal setting.

## Information Architecture

## New top-level concepts

- current organization
- personal/private workspace areas
- org admin

## Suggested navigation changes

### Shared navigation

- current org switcher in the top bar or sidebar
- org-aware labels for shared resources

### Org admin section

- `Members`
- `Invites`
- `Workers`
- `Organization`

### Personal/private section

- `Chat`
- private encryption / trusted device settings if retained separately

## Screens to Add

## 1. Invite Acceptance Screen

Route:

- `/invite/[token]`

States:

- loading
- invalid invite
- expired invite
- revoked invite
- sign-in required
- sign-up required
- accept confirmation
- acceptance success with org switch

### Required behavior

- fetch invite metadata before acceptance
- show org name, inviter, role, and a simplified permissions summary
- after accept, switch current org and route into the dashboard

## 2. Org Members Screen

Route:

- `/dashboard/settings/members` or equivalent org admin route

Content:

- member list
- role badge
- scope summary
- inviter/joined metadata
- actions: edit role/scopes, remove member

### Required controls

- owner/admin-only edit affordances
- role dropdown
- advanced scope editor modal or drawer

## 3. Org Invites Screen

Route:

- same section as members or a dedicated `Invites` tab

Content:

- active invites
- pending invite status
- expiry timestamps
- revoke action
- create invite action

### Invite creation form

Fields:

- email
- role
- optional advanced scope overrides

## 4. Org Workers Screen

Route:

- `/dashboard/settings/workers`

Content:

- connected worker list
- pending worker approval requests
- approval authority status
- approve / revoke / remove request actions

### Important UX change

Current worker approval is buried inside `ContentEncryptionSection`. It should move to a first-class org admin area.

## 5. Org Settings Screen

Route:

- `/dashboard/settings/organization`

Content:

- org name
- slug if editable
- avatar
- org plan / quota summary

## Shared Resource UX Changes

The following pages become current-org aware:

- projects
- agents
- models
- routines
- councils
- domains
- abilities
- context blocks
- MCP servers

### Required behavior

- resource lists refresh when current org changes
- create/edit/delete operations apply to the selected org
- empty states should reference the org, not the individual user

## Private Chat UX Rules

Chat remains personal.

### UI requirements

- chat should not appear in org admin areas
- chat lists should not imply shared visibility
- when a user chats with an org-owned agent, the transcript still belongs to the user

### Suggested copy

Use labels like:

- `Private chats`
- `Only visible to you`

Avoid labels that imply org-sharing.

## State Management Changes

## New client state

Add current-org state with:

- selected org id
- selected org metadata
- effective user scopes for that org

### Likely implementation

- current-org provider at dashboard layout level
- persisted selected org in local storage or server preference
- SWR keys include current-org invalidation behavior

## API Client Changes

`lib/api.ts` needs new helpers for:

- fetching orgs
- fetching current org
- switching current org
- listing members
- updating members
- listing invites
- creating invites
- revoking invites
- org worker status
- org worker enrollment approvals

### Important rule

Do not infer org authority from Clerk values in the frontend.

The frontend should display org context returned by backend APIs, not guess it locally.

## Hooks to Add

Suggested new hooks:

- `useOrganizations()`
- `useCurrentOrganization()`
- `useOrganizationMembers(orgId)`
- `useOrganizationInvites(orgId)`
- `useOrganizationWorkers(orgId)`
- `useOrganizationQuotas(orgId)`

## Components to Add

Suggested components:

- `OrgSwitcher`
- `MemberList`
- `MemberEditDialog`
- `InviteDialog`
- `InviteList`
- `WorkerApprovalPanel`
- `ScopeSummaryChips`
- `AdvancedScopeEditor`

## Existing Areas to Refactor

## `useCurrentUser`

Keep it for identity, but stop treating its `org_id` / `org_role` as enough context for real org UX.

## `ContentEncryptionSection`

Split into:

- personal device/recovery settings
- org worker approval panel

The org worker approval portion should move out.

## Shared resource pages

Update data fetch and cache keys so they revalidate on org changes.

## Suggested Rollout Order

## Phase 1

- add internal dashboard docs and component skeletons
- add current-org provider and org switcher

## Phase 2

- add invite acceptance route
- add org members and invites pages

## Phase 3

- add org workers page and move approval UI out of personal settings

## Phase 4

- convert shared resource pages to current-org aware messaging and state

## Phase 5

- polish permission states, empty states, and private chat labeling

## UX Edge Cases

The frontend should handle:

- user belongs to one org only
- user belongs to multiple orgs
- user opens invite for an org they already belong to
- user lacks permission to manage members
- user lacks permission to approve workers
- user changes org while resource detail page is open
- invite token expired after page load

## Permission UX Rules

1. Hide destructive org admin actions from unauthorized users.
2. Prefer disabled-with-explanation only when it helps discoverability.
3. Do not expose scope editor to viewers or plain members.
4. Show a human-readable summary of scope grants rather than raw scope strings by default.
5. Keep an advanced raw-scope view for debugging/admin use.

## Testing Plan

## Component tests

- org switcher
- invite dialog validation
- member edit dialog
- worker approval panel states

## Integration tests

- accept invite flow
- switch org and see resource list change
- approve pending worker
- non-admin cannot access members page actions
- chat remains visible only in personal context

## Manual verification checklist

1. client creates account
2. client invites operator
3. operator accepts invite
4. operator can open projects, agents, models, routines
5. operator can approve pending worker
6. operator cannot see client's private chat sessions
7. switching org updates shared resources without corrupting personal chat state

## Exit Criteria

The frontend plan is complete when:

1. org membership and invite flows are fully usable
2. worker approval is an org admin workflow
3. shared resources are clearly org-scoped
4. chat remains clearly private
5. permission-driven UI is consistent across dashboard surfaces

