# Agent Run Tool Envelope IndexedDB Plan

## Context

The live agent-run trace currently tries to attach a reduced `RunTrace` object to
the final assistant message at stream completion time. That is fragile because
correctness depends on stream event ordering, React state timing, duplicate final
message handling, and cleanup timing.

The more stable model is to treat the final assistant message and the run
activity trace as separate records:

- The assistant message is persisted chat history.
- The tool envelope is an append-only local activity log for one run.
- The final message stores or resolves a stable reference to the envelope.

The envelope should live in browser IndexedDB, not the backend.

## Existing Chat APIs

`chat_streams` is the live turn transport. It accepts a user message, starts the
agent run, streams lifecycle/tool/model events to the browser, and persists the
final assistant response.

`chat_messages` is persisted chat history CRUD. It lists paged message history,
creates stored messages, and deletes stored messages. Initial history fetch
loads the newest page for a session. Older messages are loaded with a `before`
timestamp cursor.

Because chat history is paged, local cleanup must not delete an envelope just
because its message is absent from the currently loaded page.

## Backend Quota Contract

The backend already has tier retention limit keys:

- `retention.chat_messages`
- `retention.notifications`
- `retention.activity_rows`
- `retention.execution_runs`

Extend quota status with retention limits:

```ts
type QuotaStatus = {
  tier: string;
  storage: {
    s3: { used_bytes: number; limit_bytes: number };
    db: { used_bytes: number; limit_bytes: number };
  };
  resources: Record<string, { count: number; limit: number }>;
  retention: {
    chat_messages: number;
    notifications: number;
    activity_rows: number;
    execution_runs: number;
  };
};
```

`-1` means unlimited.

Also replace the hardcoded chat session message cap with the effective
`retention.chat_messages` value so backend retention and frontend IndexedDB GC
share the same canonical count.

## Message Attachment Contract

Add a client-side attachment field:

```ts
type ChatMessage = {
  runEnvelopeId?: string;
};
```

For live turns, `runEnvelopeId` should be the canonical `run_id`.

The final card should not store a full `RunTrace` as the canonical attachment.
It should reference the local envelope, then load/decrypt/reduce the envelope
when Activity is expanded.

## IndexedDB Store

Create a dashboard IndexedDB module, likely:

```txt
lib/agentRunTrace/envelopeStore.ts
```

Store clear index metadata separately from encrypted event bodies:

```ts
type ToolEnvelopeIndex = {
  envelopeId: string;
  runId: string;
  sessionId: string;
  assistantMessageId?: string;
  finalContentHash?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  attachState: "running" | "awaiting_message" | "attached" | "orphaned";
  createdAt: string;
  updatedAt: string;
};

type StoredToolEnvelope = {
  envelopeId: string;
  encryptedEvents: EncryptedLocalPayload;
};

type MessageEnvelopeLink = {
  sessionId: string;
  messageId: string;
  messageCreatedAt: string;
  envelopeId: string;
};
```

## Encryption Model

Envelope contents remain encrypted at rest in IndexedDB.

Keep clear:

- envelope id
- run id
- session id
- assistant message id
- final content hash
- status
- attach state
- timestamps

Encrypt:

- lifecycle event payloads
- tool arguments
- stdout/stderr
- output/error previews
- assistant deltas
- ability task/result previews
- failure messages

During a live run, render from memory. Persist encrypted events as they arrive.
On refresh, do not decrypt all envelopes. Decrypt only when a user expands the
Activity disclosure.

## Live Stream Flow

1. `RunStarted` opens an envelope keyed by `run_id`.
2. Every canonical lifecycle event appends to that envelope.
3. The existing reducer maintains active in-memory `RunTrace` for the live UI.
4. `Done` creates or updates the final assistant message.
5. The final assistant message gets `runEnvelopeId = run_id`.
6. A local `MessageEnvelopeLink` records `messageId -> envelopeId`.
7. The final card Activity disclosure renders from `runEnvelopeId`.

## Final Card Activity

If `message.runEnvelopeId` exists:

1. Show an Activity disclosure with a chevron.
2. On expand, load the encrypted envelope from IndexedDB.
3. Decrypt events with the local content key.
4. Reduce events to `RunTrace`.
5. Render the full chronological run history.

If the envelope is missing, hide Activity or show a small unavailable state.

## Refresh Behavior

When chat history loads from `chat_messages`:

1. Fetch paged messages normally.
2. Resolve local `MessageEnvelopeLink` rows for loaded message ids.
3. Set `message.runEnvelopeId` for matching messages.
4. Do not load or decrypt envelope bodies during normal history fetch.
5. Decrypt only on Activity expansion.

Older paged messages can resolve their links when they are loaded later.

## Count-Based IndexedDB GC

Use backend retention count, not a time TTL.

Fetch/cache quota status from `/orgs/:org_id/quotas` and use:

```ts
const keepRecent = quota.retention.chat_messages;
```

Per session:

1. Load local `MessageEnvelopeLink` rows.
2. Sort by `messageCreatedAt DESC`.
3. If `keepRecent === -1`, keep all attached envelopes.
4. Otherwise keep links/envelopes for the newest `keepRecent` messages.
5. Delete links beyond that retained set.
6. Delete envelopes with no remaining links.

Do not delete envelopes merely because their message is absent from the current
paged chat result.

## Explicit Cleanup

On message delete:

1. Delete that message's envelope link.
2. Delete the envelope if no other link references it.

On session archive/delete:

1. Delete all links for `sessionId`.
2. Delete all envelopes referenced only by that session.

On cancelled run with no final message:

1. Mark the envelope `orphaned` once the stream is conclusively closed.
2. Delete the orphaned envelope as part of state-based cleanup.

## Implementation Order

1. Extend backend quota status to expose retention limits.
2. Replace hardcoded chat session cap with `retention.chat_messages`.
3. Add dashboard quota client/types.
4. Add IndexedDB envelope store.
5. Stream lifecycle events into encrypted envelopes.
6. Attach final assistant cards via `runEnvelopeId` and local link table.
7. Render Activity by lazy-loading/decrypting envelope events.
8. Implement count-based local GC from quota retention.
9. Remove the fragile final-message `runTrace` attachment path once the
   envelope path is verified.
