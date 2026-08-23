"use client";

import type { ChatStreamRequest } from "./types";

const DB_NAME = "nenjo-chat-streams";
const STORE_NAME = "snapshots";
const CHANNEL_NAME = "nenjo-chat-stream";

let databasePromise: Promise<IDBDatabase> | undefined;
let mutationTail = Promise.resolve();

export type ChatStreamToolSnapshot = {
  callId?: string;
  parentCallId?: string;
  name: string;
  args: string;
  textPreview?: string;
  status?: "running" | "completed" | "failed";
  outputPreview?: string;
  errorPreview?: string;
  providerNative?: boolean;
  provider?: string;
  children?: ChatStreamToolSnapshot[];
};

export type ChatStreamSnapshot = {
  sessionId: string;
  agentId?: string;
  requestId: string;
  /** The encrypted, idempotent request body used to reconnect after navigation. */
  request?: ChatStreamRequest;
  responseId?: string;
  runId?: string;
  lastSequence?: number;
  content: string;
  activeTools?: ChatStreamToolSnapshot[];
  livePreview?: string;
  activeRunTrace?: unknown;
  status:
    | "connecting"
    | "generating"
    | "using_tool"
    | "retrying"
    | "failed"
    | "cancelled"
    | "completed"
    | "streaming"
    | "done"
    | "error";
  updatedAt: number;
};

export type ChatStreamClearSnapshot = {
  sessionId: string;
  clear: true;
  /** Only clear state owned by this response; older clears must not stop a new turn. */
  responseId?: string;
};

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error);
    };
  });
  return databasePromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    let result!: T;
    req.onsuccess = () => {
      result = req.result;
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Keep snapshot puts and terminal clears ordered within this browser page. */
function serializeMutation(work: () => Promise<void>): Promise<void> {
  const mutation = mutationTail.then(work, work);
  mutationTail = mutation.catch(() => undefined);
  return mutation;
}

/**
 * Delete a persisted stream only when the clear still owns the stored turn.
 * The ownership check and deletion share one transaction so a newer snapshot
 * cannot be written between them and then removed by an older cleanup task.
 */
async function deleteSnapshotIfOwned(
  sessionId: string,
  responseId?: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    const existingRequest = store.get(sessionId);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as ChatStreamSnapshot | undefined;
      const unscopedClearWouldDeleteActiveResponse =
        responseId === undefined && existing?.responseId !== undefined;
      const clearBelongsToDifferentResponse =
        responseId !== undefined &&
        existing !== undefined &&
        existing.responseId !== responseId;
      if (
        unscopedClearWouldDeleteActiveResponse ||
        clearBelongsToDifferentResponse
      ) {
        return;
      }
      store.delete(sessionId);
    };
  });
}

export async function loadChatStreamSnapshot(
  sessionId: string,
): Promise<ChatStreamSnapshot | undefined> {
  try {
    return (
      (await withStore("readonly", (store) => store.get(sessionId))) ??
      undefined
    );
  } catch {
    return undefined;
  }
}

export async function persistChatStreamSnapshot(
  snapshot: ChatStreamSnapshot,
): Promise<void> {
  try {
    await serializeMutation(async () => {
      await withStore("readwrite", (store) => store.put(snapshot));
    });
  } catch {
    // ignore
  }
}

export async function clearChatStreamSnapshot(
  sessionId: string,
  responseId?: string,
): Promise<void> {
  try {
    await serializeMutation(() => deleteSnapshotIfOwned(sessionId, responseId));
  } catch {
    // ignore
  }
}

export function notifyChatStreamSnapshot(
  snapshot: ChatStreamSnapshot | ChatStreamClearSnapshot,
): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(snapshot);
    channel.close();
  } catch {
    // ignore
  }

  try {
    navigator.serviceWorker.controller?.postMessage({
      type: "chat-stream-snapshot",
      snapshot,
    });
  } catch {
    // ignore
  }
}
