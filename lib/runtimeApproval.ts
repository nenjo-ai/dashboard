export function normalizeRuntimeVerificationCode(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function runtimeApprovalCanSubmit(input: {
  verificationCode: string | null | undefined;
  hasAccountContentKey: boolean;
  hasSigningKey: boolean;
  busy: boolean;
}): boolean {
  return (
    normalizeRuntimeVerificationCode(input.verificationCode).length > 0 &&
    input.hasAccountContentKey &&
    input.hasSigningKey &&
    !input.busy
  );
}
