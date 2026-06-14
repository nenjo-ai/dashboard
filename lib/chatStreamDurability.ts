"use client";

const DB_NAME = "nenjo-chat-streams";
const STORE_NAME = "snapshots";
const CHANNEL_NAME = "nenjo-chat-stream";

export type ChatStreamToolSnapshot = {
  name: string;
  args: string;
  textPreview?: string;
  status?: "running" | "completed" | "failed";
  outputPreview?: string;
  errorPreview?: string;
  children?: ChatStreamToolSnapshot[];
};

export type ChatStreamSnapshot = {
  sessionId: string;
  agentId?: string;
  requestId: string;
  responseId?: string;
  content: string;
  activeTools?: ChatStreamToolSnapshot[];
  livePreview?: string;
  activeRunTrace?: unknown;
  status: "streaming" | "done" | "error";
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadChatStreamSnapshot(sessionId: string): Promise<ChatStreamSnapshot | undefined> {
  try {
    return (await withStore("readonly", (store) => store.get(sessionId))) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function persistChatStreamSnapshot(snapshot: ChatStreamSnapshot): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.put(snapshot));
  } catch {
    // ignore
  }
}

export async function clearChatStreamSnapshot(sessionId: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(sessionId));
  } catch {
    // ignore
  }
}

export function notifyChatStreamSnapshot(snapshot: ChatStreamSnapshot | { sessionId: string; clear: true }): void {
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
