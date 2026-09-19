export const RECOVERY_PHRASE_FILENAME = "nenjo-recovery-phrase.txt";
export const RECOVERY_PHRASE_MIME_TYPE = "text/plain;charset=utf-8";

export function recoveryPhraseFileContents(recoveryPhrase: string): string {
  const normalizedPhrase = recoveryPhrase.trim().replace(/\s+/g, " ");
  if (!normalizedPhrase) {
    throw new Error("A recovery phrase is required to create the recovery file.");
  }

  return `${normalizedPhrase}\n`;
}

export function isRecoveryDownloadComplete({
  hasRecoveryBundle,
  recoveryFileDownloaded,
  backupAcknowledged,
}: {
  hasRecoveryBundle: boolean;
  recoveryFileDownloaded: boolean;
  backupAcknowledged: boolean;
}): boolean {
  return hasRecoveryBundle && recoveryFileDownloaded && backupAcknowledged;
}
