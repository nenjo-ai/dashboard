import type { PackageInstall, PackageInstallJob } from "./types";

export function packageInstallJobRunning(
  job: PackageInstallJob | null | undefined,
): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function packageInstallVisibleInInstalledList(
  install: PackageInstall,
): boolean {
  return install.status === "installed" || Boolean(install.current_lock_id);
}
