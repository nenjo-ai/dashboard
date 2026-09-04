"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { updateCurrentOrg } from "@/lib/api";
import { toast } from "@/lib/toast";
import { supportedIanaTimezones } from "@/lib/timezones";

interface OrganizationTimezonePanelProps {
  timezone: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}

export function OrganizationTimezonePanel({
  timezone,
  canEdit,
  onSaved,
}: OrganizationTimezonePanelProps) {
  const [value, setValue] = useState(timezone);
  const [pending, setPending] = useState(false);
  const timezones = useMemo(supportedIanaTimezones, []);
  const normalized = value.trim();
  const dirty = normalized !== timezone;

  useEffect(() => setValue(timezone), [timezone]);

  async function saveTimezone() {
    if (!canEdit || !normalized || !dirty) return;
    setPending(true);
    try {
      await updateCurrentOrg({ timezone: normalized });
      await onSaved();
      toast.success("Organization timezone updated");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to update organization timezone",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="theme-border theme-surface rounded-2xl border p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="theme-surface-muted rounded-lg p-2">
          <Clock3 className="h-4 w-4" />
        </div>
        <div>
          <h2 className="theme-text text-sm font-semibold">Organization timezone</h2>
          <p className="theme-text-muted mt-1 max-w-2xl text-xs leading-5">
            Used for schedules and the clock context supplied to agents. Changing it keeps existing
            schedules at the same local wall-clock time in the new timezone.
          </p>
        </div>
      </div>

      <form
        className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void saveTimezone();
        }}
      >
        <label className="theme-text min-w-0 flex-1 text-sm">
          IANA timezone
          <input
            className="theme-surface theme-border mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
            disabled={!canEdit || pending}
            list="organization-timezones"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
          <datalist id="organization-timezones">
            {timezones.map((zone) => <option key={zone} value={zone} />)}
          </datalist>
        </label>
        {canEdit ? (
          <Button disabled={pending || !dirty || !normalized} type="submit">
            {pending ? "Saving…" : "Save timezone"}
          </Button>
        ) : null}
      </form>
      {!canEdit ? (
        <p className="theme-text-muted mt-3 text-xs">You need the org:write scope to change this setting.</p>
      ) : null}
    </section>
  );
}
