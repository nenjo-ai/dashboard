export async function commitPasskeyUnlockRegistration<TRegistered>(params: {
  registerRemote: () => Promise<TRegistered>;
  setupLocal: (registered: TRegistered) => Promise<void>;
  revokeRemote: (registered: TRegistered) => Promise<void>;
}): Promise<TRegistered> {
  const registered = await params.registerRemote();
  try {
    await params.setupLocal(registered);
    return registered;
  } catch (err) {
    await params.revokeRemote(registered).catch(() => undefined);
    throw err;
  }
}
