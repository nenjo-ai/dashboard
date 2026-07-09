export async function tryPasskeyUnlockMethods<T>(
  methods: T[],
  tryUnlock: (method: T) => Promise<boolean>,
): Promise<void> {
  if (methods.length === 0) {
    throw new Error("No local device unlock method is configured on this browser.");
  }

  let lastError: unknown = null;
  for (const method of methods) {
    try {
      if (await tryUnlock(method)) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Device unlock was cancelled or no configured method was available.");
}
