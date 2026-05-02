import { listWorkerAccountKeyTargets, syncWorkerAccountKeys } from "./api";
import { wrapAccountContentKeyForWorker } from "./cryptoContent";

export async function syncCurrentUserAckToActiveWorkers(): Promise<void> {
  const targets = await listWorkerAccountKeyTargets().catch(() => []);
  if (targets.length === 0) {
    return;
  }

  const workers = await Promise.all(
    targets.map(async (target) => ({
      api_key_id: target.api_key_id,
      wrapped_ack: await wrapAccountContentKeyForWorker({
        workerPublicKey: target.enc_public_key,
      }),
    })),
  );

  await syncWorkerAccountKeys({ workers });
}
