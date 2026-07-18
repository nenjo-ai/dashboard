"use client";

import {
  decryptLocalJsonFromStorage,
  encryptLocalJsonForStorage,
  type LocalEncryptedStoragePayload,
} from "@/lib/cryptoContent";
import type { AgentLifecycleEvent } from "./types";

const DB_NAME = "nenjo-agent-run-envelopes";
const DB_VERSION = 1;
const ENVELOPES_STORE = "envelopes";
const LINKS_STORE = "message_links";

export type EnvelopeStatus = "running" | "completed" | "failed" | "cancelled";
export type EnvelopeAttachState = "running" | "awaiting_message" | "attached" | "orphaned";

export type ToolEnvelopeIndex = {
  envelopeId: string;
  runId: string;
  sessionId: string;
  inputMessageId?: string;
  status: EnvelopeStatus;
  attachState: EnvelopeAttachState;
  createdAt: string;
  updatedAt: string;
};

export type StoredToolEnvelope = ToolEnvelopeIndex & {
  encryptedEvents: LocalEncryptedStoragePayload;
};

export type InputMessageEnvelopeLink = {
  sessionId: string;
  messageId: string;
  messageCreatedAt: string;
  envelopeId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENVELOPES_STORE)) {
        const envelopes = db.createObjectStore(ENVELOPES_STORE, { keyPath: "envelopeId" });
        envelopes.createIndex("sessionId", "sessionId", { unique: false });
        envelopes.createIndex("status", "status", { unique: false });
        envelopes.createIndex("attachState", "attachState", { unique: false });
      }
      if (!db.objectStoreNames.contains(LINKS_STORE)) {
        const links = db.createObjectStore(LINKS_STORE, { keyPath: "messageId" });
        links.createIndex("sessionId", "sessionId", { unique: false });
        links.createIndex("envelopeId", "envelopeId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open agent run envelope store."));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function getAllFromIndex<T>(
  store: IDBObjectStore,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return requestResult(store.index(indexName).getAll(key) as IDBRequest<T[]>);
}

async function decryptEvents(envelope: StoredToolEnvelope | undefined): Promise<AgentLifecycleEvent[]> {
  if (!envelope) return [];
  try {
    return await decryptLocalJsonFromStorage<AgentLifecycleEvent[]>(envelope.encryptedEvents);
  } catch {
    return [];
  }
}

function statusForEvent(event: AgentLifecycleEvent): EnvelopeStatus | undefined {
  switch (event.event_type) {
    case "RunCompleted":
      return "completed";
    case "RunFailed":
      return "failed";
    case "RunCancelled":
      return "cancelled";
    case "AssistantResponse":
      return event.data.status && event.data.status !== "in_progress"
        ? "completed"
        : undefined;
    default:
      return undefined;
  }
}

export async function appendEnvelopeEvent(params: {
  envelopeId: string;
  runId: string;
  sessionId: string;
  event: AgentLifecycleEvent;
}): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const readTx = db.transaction(ENVELOPES_STORE, "readonly");
  const existing = await requestResult(
    readTx.objectStore(ENVELOPES_STORE).get(params.envelopeId) as IDBRequest<StoredToolEnvelope | undefined>,
  );
  const events = await decryptEvents(existing);
  events.push(params.event);

  const timestamp = nowIso();
  const nextStatus = statusForEvent(params.event) ?? existing?.status ?? "running";
  const completed = nextStatus === "completed" || nextStatus === "failed" || nextStatus === "cancelled";
  const next: StoredToolEnvelope = {
    envelopeId: params.envelopeId,
    runId: existing?.runId ?? params.runId,
    sessionId: existing?.sessionId ?? params.sessionId,
    inputMessageId: existing?.inputMessageId,
    status: nextStatus,
    attachState: existing?.attachState ?? (completed ? "awaiting_message" : "running"),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    encryptedEvents: await encryptLocalJsonForStorage(events),
  };
  const writeTx = db.transaction(ENVELOPES_STORE, "readwrite");
  writeTx.objectStore(ENVELOPES_STORE).put(next);
  await txDone(writeTx);
}

export async function loadEnvelopeEvents(envelopeId: string): Promise<AgentLifecycleEvent[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const tx = db.transaction(ENVELOPES_STORE, "readonly");
  const envelope = await requestResult(
    tx.objectStore(ENVELOPES_STORE).get(envelopeId) as IDBRequest<StoredToolEnvelope | undefined>,
  );
  return decryptEvents(envelope);
}

/** Link a run envelope to the durable user message that initiated it. */
export async function linkEnvelopeToInputMessage(link: {
  sessionId: string;
  inputMessageId: string;
  messageCreatedAt: string;
  envelopeId: string;
}): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const readTx = db.transaction(ENVELOPES_STORE, "readonly");
  const existing = await requestResult(
    readTx.objectStore(ENVELOPES_STORE).get(link.envelopeId) as IDBRequest<StoredToolEnvelope | undefined>,
  );

  const writeTx = db.transaction([ENVELOPES_STORE, LINKS_STORE], "readwrite");
  const envelopes = writeTx.objectStore(ENVELOPES_STORE);
  const links = writeTx.objectStore(LINKS_STORE);
  links.put({
    sessionId: link.sessionId,
    messageId: link.inputMessageId,
    messageCreatedAt: link.messageCreatedAt,
    envelopeId: link.envelopeId,
  } satisfies InputMessageEnvelopeLink);
  if (existing) {
    envelopes.put({
      ...existing,
      inputMessageId: link.inputMessageId,
      attachState: "attached",
      updatedAt: nowIso(),
    } satisfies StoredToolEnvelope);
  }
  await txDone(writeTx);
}

export async function getEnvelopeLinksForInputMessages(
  messageIds: string[],
): Promise<Map<string, InputMessageEnvelopeLink>> {
  const links = new Map<string, InputMessageEnvelopeLink>();
  if (typeof indexedDB === "undefined" || messageIds.length === 0) return links;
  const db = await openDb();
  const tx = db.transaction(LINKS_STORE, "readonly");
  const store = tx.objectStore(LINKS_STORE);
  await Promise.all(
    messageIds.map(async (messageId) => {
      const link = await requestResult(
        store.get(messageId) as IDBRequest<
          InputMessageEnvelopeLink | undefined
        >,
      );
      if (link) links.set(messageId, link);
    }),
  );
  return links;
}

export async function deleteEnvelopeForInputMessage(messageId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const readTx = db.transaction(LINKS_STORE, "readonly");
  const readLinks = readTx.objectStore(LINKS_STORE);
  const link = await requestResult(
    readLinks.get(messageId) as IDBRequest<
      InputMessageEnvelopeLink | undefined
    >,
  );
  const remaining = link
    ? await requestResult(
        readLinks.index("envelopeId").getAll(link.envelopeId) as IDBRequest<
          InputMessageEnvelopeLink[]
        >,
      )
    : [];
  if (link) {
    const writeTx = db.transaction([ENVELOPES_STORE, LINKS_STORE], "readwrite");
    const envelopes = writeTx.objectStore(ENVELOPES_STORE);
    const links = writeTx.objectStore(LINKS_STORE);
    links.delete(messageId);
    if (remaining.length <= 1) {
      envelopes.delete(link.envelopeId);
    }
    await txDone(writeTx);
  }
}

export async function deleteEnvelopesForSession(sessionId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const readTx = db.transaction(LINKS_STORE, "readonly");
  const sessionLinks = await getAllFromIndex<InputMessageEnvelopeLink>(
    readTx.objectStore(LINKS_STORE),
    "sessionId",
    sessionId,
  );
  const envelopeIds = new Set(sessionLinks.map((link) => link.envelopeId));
  const writeTx = db.transaction([ENVELOPES_STORE, LINKS_STORE], "readwrite");
  const envelopes = writeTx.objectStore(ENVELOPES_STORE);
  const links = writeTx.objectStore(LINKS_STORE);
  for (const link of sessionLinks) links.delete(link.messageId);
  for (const envelopeId of Array.from(envelopeIds)) envelopes.delete(envelopeId);
  await txDone(writeTx);
}

export async function markEnvelopeOrphaned(envelopeId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const readTx = db.transaction(ENVELOPES_STORE, "readonly");
  const existing = await requestResult(
    readTx.objectStore(ENVELOPES_STORE).get(envelopeId) as IDBRequest<StoredToolEnvelope | undefined>,
  );
  if (existing) {
    const writeTx = db.transaction(ENVELOPES_STORE, "readwrite");
    writeTx.objectStore(ENVELOPES_STORE).put({
      ...existing,
      attachState: "orphaned",
      updatedAt: nowIso(),
    } satisfies StoredToolEnvelope);
    await txDone(writeTx);
  }
}

export async function runEnvelopeGc(params: {
  sessionId: string;
  keepRecent: number;
}): Promise<void> {
  if (typeof indexedDB === "undefined" || params.keepRecent < 0) return;
  const db = await openDb();
  const readTx = db.transaction(LINKS_STORE, "readonly");
  const sessionLinks = await getAllFromIndex<InputMessageEnvelopeLink>(
    readTx.objectStore(LINKS_STORE),
    "sessionId",
    params.sessionId,
  );
  const sorted = sessionLinks
    .slice()
    .sort((left, right) => {
      const time = new Date(right.messageCreatedAt).getTime() - new Date(left.messageCreatedAt).getTime();
      return time || right.messageId.localeCompare(left.messageId);
    });
  const deleteLinks = sorted.slice(params.keepRecent);
  const linkCounts = new Map<string, number>();
  for (const link of sessionLinks) {
    linkCounts.set(link.envelopeId, (linkCounts.get(link.envelopeId) ?? 0) + 1);
  }
  const writeTx = db.transaction([ENVELOPES_STORE, LINKS_STORE], "readwrite");
  const envelopes = writeTx.objectStore(ENVELOPES_STORE);
  const links = writeTx.objectStore(LINKS_STORE);
  for (const link of deleteLinks) {
    links.delete(link.messageId);
    const remainingCount = (linkCounts.get(link.envelopeId) ?? 0) - 1;
    linkCounts.set(link.envelopeId, remainingCount);
    if (remainingCount <= 0) {
      envelopes.delete(link.envelopeId);
    }
  }
  await txDone(writeTx);
}
