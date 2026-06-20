"use client";

export function retryEncryptedPushNotifications(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  void navigator.serviceWorker.ready
    .then((registration) => {
      const worker =
        registration.active ??
        navigator.serviceWorker.controller ??
        registration.waiting ??
        registration.installing;

      worker?.postMessage({ type: "retry-encrypted-notifications" });
    })
    .catch(() => {
      // Push notifications are best-effort and should not block vault unlock.
    });
}
