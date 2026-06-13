# Dashboard Passkey Unlocking Security Review

Date: 2026-06-11

Scope:

- Dashboard working tree on `refactor/manifest-contract`, including the new local passkey/password unlock files.
- Dashboard sensitive-content request paths for agent prompts, ability prompts, domain prompts, context block content, document content, task content, project settings, heartbeat instructions, routine cron tasks, and chat messages.
- Platform passkey metadata endpoints were read only to verify the dashboard contract.

Method:

- WooYun-style trust-boundary and data-flow review: source -> processing -> storage/request sink.
- Focused on plaintext leaving the browser, backend-bound private key material, and unsafe API helpers that can bypass encrypted envelope flows.

## Findings

### 1. Medium: chat messages are encrypted with the wrong envelope object type

Status: Resolved 2026-06-11.

Evidence:

- `dashboard/lib/usePlannerChat.ts:2139` encrypts outbound user chat content, but sets `objectType: "agent_prompt"` at `dashboard/lib/usePlannerChat.ts:2142`.
- The current sensitive-field catalog says user chat messages should use `chat.message` (`platform/docs/db/sensitive-field-encryption-catalog.md:110`).
- The chat stream route persists `encrypted_message` without validating the encrypted payload object type (`platform/crates/api-server/src/routes/chat_streams.rs:186` through `platform/crates/api-server/src/routes/chat_streams.rs:210`).

Impact:

- The user message is still ciphertext, so this is not a direct plaintext leak.
- It weakens envelope policy, auditability, and future backend validation because chat content is labeled like prompt content.

Recommendation:

- Change the dashboard chat encryption object type to `chat.message`.
- Add backend validation for chat encrypted payload scope and object type before persistence or worker dispatch.

Resolution:

- Dashboard chat encryption now uses `chat.message`.
- Platform chat stream creation now requires `encrypted_message` and validates user scope, account ownership, and `chat.message` object type before persistence.

### 2. Medium: exported chat API helpers still allow plaintext chat persistence/streaming

Status: Resolved 2026-06-11.

Evidence:

- `createChatMessage` accepts `content: string` and posts it directly to `/chat-messages` (`dashboard/lib/api.ts:3244` through `dashboard/lib/api.ts:3261`).
- `createChatStream` serializes the caller-provided `message` and `encrypted_message` without enforcing encryption (`dashboard/lib/api.ts:3315` through `dashboard/lib/api.ts:3330`).
- The active `usePlannerChat` send path does encrypt and sends the placeholder `"[Encrypted message]"` plus `encrypted_message` (`dashboard/lib/usePlannerChat.ts:2179` through `dashboard/lib/usePlannerChat.ts:2183`).
- I did not find active dashboard callers of `createChatMessage`, so this is unsafe exported surface rather than confirmed current UI leakage.

Impact:

- A future or missed caller can send plaintext chat messages through the shared dashboard API layer.
- This conflicts with the stated target that chat messages must be encrypted.

Recommendation:

- Make dashboard chat helpers fail closed unless an encrypted payload is supplied.
- Consider removing `createChatMessage` or narrowing it to encrypted-only request shapes.
- Keep plaintext placeholders explicit and centralized.

Resolution:

- Removed the dashboard `createChatMessage` helper.
- Dashboard `createChatStream` now requires an `encrypted_message` in its request type.
- Platform chat stream creation now rejects requests without `encrypted_message`.
- Platform direct chat message creation now rejects requests without a valid `chat.message` encrypted payload and encrypted placeholder content.

### 3. Low: unlock setup helpers can create a replacement vault key if called while an existing vault is locked

Status: Resolved 2026-06-11.

Evidence:

- `getOrCreateVaultRawKey` generates a new vault key whenever `vaultKeyRawSession` is empty (`dashboard/lib/cryptoContent.ts:405` through `dashboard/lib/cryptoContent.ts:409`).
- `setupPasskeyUnlock` and `setupPasswordUnlock` call it before migrating/wrapping records (`dashboard/lib/cryptoContent.ts:506` and `dashboard/lib/cryptoContent.ts:559`).
- Normal dashboard routes are wrapped by `LocalVaultUnlockGate` (`dashboard/app/dashboard/layout.tsx:223`), so settings should not be reachable while locked. The lower-level helper still does not enforce that invariant itself.

Impact:

- Not a plaintext leak.
- If a non-gated flow or future caller invokes setup while the vault is locked, it can wrap a new vault key that cannot decrypt existing vault-wrapped secrets, causing a local lockout/confusing unlock state.

Recommendation:

- In setup helpers, if a vault already exists and no vault key is loaded, throw instead of generating a new vault key.
- Keep onboarding/new-workspace setup as the only path allowed to create the first vault key.

Resolution:

- `getOrCreateVaultRawKey` now throws when an encrypted vault already exists but no vault key is loaded in the session.

### 4. Low: passkey registration metadata is not tied to a server-issued challenge

Evidence:

- The dashboard fetches registration options (`dashboard/lib/localUnlock.ts:91`) but then generates its own WebAuthn challenge (`dashboard/lib/localUnlock.ts:95`) and uses `window.location.hostname` as RP ID (`dashboard/lib/localUnlock.ts:96` through `dashboard/lib/localUnlock.ts:99`).
- The platform registration-options endpoint returns user identity labels and existing credential IDs, but no server-issued challenge or RP ID.
- The platform plan says these passkeys are local unlock factors, not backend auth factors (`platform/docs/dashboard-passkey-unlock-plan.md:83`).

Impact:

- Because the passkey is not an auth factor and PRF output never leaves the browser, this does not grant backend access by itself.
- It does make backend-stored passkey metadata less trustworthy if later reused for authentication, auditing, or policy.

Recommendation:

- Either document the endpoint as metadata-only and intentionally unverified, or issue server challenges/RP IDs and verify attestation fields before storing metadata.

## Positive Checks

- I did not find plaintext passkey PRF output, vault key, password/passphrase, trusted device private key, or account signing private key being posted by the new passkey unlock dashboard code.
- `registerPasskeyUnlock` sends credential metadata/attestation material only; PRF output is passed only into local wrapping (`dashboard/lib/localUnlock.ts:131` through `dashboard/lib/localUnlock.ts:156`).
- Sensitive content write paths for agent prompts, ability prompts, domain prompts, context block content, document bodies, task descriptions/acceptance criteria, project context/metadata settings, heartbeat instructions, and routine cron task payloads use `encrypted_payload` in the reviewed dashboard API paths.
- Account signing private key material is included only inside the recovery bundle ciphertext before backend upload. I did not find raw private key material sent to the backend.

## Notes

- The current recovery flow does send an encrypted recovery bundle to the backend. That bundle plaintext contains the account content key and account signing private key, but the backend receives only the passphrase-encrypted bundle ciphertext.
- Several backend schemas and dashboard DTOs still have plaintext peer fields for compatibility. The dashboard currently tries to populate encrypted envelopes for the reviewed sensitive content kinds, but server-side validation remains important because client-side validation is not a security boundary.
