import { v5 as uuidV5 } from "uuid";

// Changing this namespace would change every retry attempt identity and could
// turn a safe reconnect after reload into a competing retry dispatch.
const CHAT_RETRY_ATTEMPT_NAMESPACE = "b8a4743d-6b4a-4dc7-98d7-da091d5f687b";

/** Return the one retry attempt identity assigned to a failed run. */
export function retryAttemptIdForRun(runEnvelopeId: string): string {
  return uuidV5(runEnvelopeId, CHAT_RETRY_ATTEMPT_NAMESPACE);
}
