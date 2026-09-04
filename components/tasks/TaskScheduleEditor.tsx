"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pause, Play } from "lucide-react";

import {
  deleteTaskSchedule,
  previewTaskSchedule,
  putTaskSchedule,
  setTaskScheduleEnabled,
} from "@/lib/api";
import { useCurrentOrg, useTaskSchedule } from "@/lib/hooks";
import { scheduledTaskControl } from "@/lib/taskLifecycle";
import {
  describeTaskRecurrence,
  scheduleDateTimeParts,
  weekdayForDate,
} from "@/lib/taskRecurrence";
import type {
  TaskDispatch,
  TaskScheduleDefinitionInput,
  TaskScheduleEnd,
  TaskScheduleIntervalUnit,
  TaskScheduleRecurrence,
  TaskScheduleWeekday,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";

type DispatchMode = TaskDispatch["mode"];
type Frequency = TaskScheduleRecurrence["frequency"];
type EndType = TaskScheduleEnd["type"];

const fieldClass = "theme-surface theme-border mt-1 w-full rounded-lg border px-3 py-2 text-sm";
const WEEKDAYS: Array<{ value: TaskScheduleWeekday; label: string }> = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface TaskScheduleEditorProps {
  taskId: string;
  mode: DispatchMode;
  state?: "queued" | "paused" | "running";
  onModeChange: (mode: DispatchMode) => void;
  onScheduleChanged: () => void;
  onStateChange: (state: TaskScheduleEditorState) => void;
}

export interface TaskScheduleEditorHandle {
  /** Persist only recurrence or dispatch-mode fields that differ from the server. */
  saveChanges: () => Promise<void>;
}

export interface TaskScheduleEditorState {
  dirty: boolean;
  canSave: boolean;
}

/** Calendar-style recurrence editor with cron available as an advanced escape hatch. */
export const TaskScheduleEditor = forwardRef<TaskScheduleEditorHandle, TaskScheduleEditorProps>(
function TaskScheduleEditor({
    taskId,
    mode,
    state,
    onModeChange,
    onScheduleChanged,
    onStateChange,
  }, ref) {
  const { schedule, isLoading, mutate } = useTaskSchedule(taskId);
  const { currentOrg } = useCurrentOrg();
  const organizationTimezone = currentOrg?.timezone ?? "UTC";
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [interval, setInterval] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<TaskScheduleIntervalUnit>("hours");
  const [weekdays, setWeekdays] = useState<TaskScheduleWeekday[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [month, setMonth] = useState(1);
  const [annualDay, setAnnualDay] = useState(1);
  const [cronExpression, setCronExpression] = useState("0 0 9 * * MON-FRI");
  const [endType, setEndType] = useState<EndType>("never");
  const [endDate, setEndDate] = useState("");
  const [endOccurrences, setEndOccurrences] = useState(10);
  const [preview, setPreview] = useState<string[]>([]);
  const [previewPending, setPreviewPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratedScheduleKey, setHydratedScheduleKey] = useState<string | null>(null);
  const previewRevision = useRef(0);

  const timezone = schedule?.definition.timezone ?? organizationTimezone;

  useEffect(() => {
    if (isLoading) return;
    if (schedule) {
      const definition = schedule.definition;
      const local = scheduleDateTimeParts(definition.starts_at, definition.timezone);
      setStartDate(local.date);
      setStartTime(local.time);
      hydrateRecurrence(definition.recurrence, {
        setFrequency, setInterval, setIntervalUnit, setWeekdays, setDayOfMonth,
        setMonth, setAnnualDay, setCronExpression,
      });
      setEndType(definition.end.type);
      if (definition.end.type === "on") setEndDate(definition.end.date);
      if (definition.end.type === "after") setEndOccurrences(definition.end.occurrences);
      setHydratedScheduleKey(`${schedule.id}:${schedule.updated_at}`);
      return;
    }
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    nextHour.setMinutes(0, 0, 0);
    const local = scheduleDateTimeParts(nextHour, organizationTimezone);
    setStartDate(local.date);
    setStartTime(local.time);
    setWeekdays([weekdayForDate(local.date)]);
    setDayOfMonth(Number(local.date.slice(8, 10)));
    setMonth(Number(local.date.slice(5, 7)));
    setAnnualDay(Number(local.date.slice(8, 10)));
    setHydratedScheduleKey("new");
  }, [isLoading, organizationTimezone, schedule]);

  const recurrence = useMemo<TaskScheduleRecurrence>(() => {
    switch (frequency) {
      case "interval": return { frequency, every: interval, unit: intervalUnit };
      case "daily": return { frequency, interval };
      case "weekly": return { frequency, interval, weekdays };
      case "monthly": return { frequency, interval, day_of_month: dayOfMonth };
      case "yearly": return { frequency, interval, month, day: annualDay };
      case "cron": return { frequency, expression: cronExpression.trim() };
    }
  }, [annualDay, cronExpression, dayOfMonth, frequency, interval, intervalUnit, month, weekdays]);

  const end = useMemo<TaskScheduleEnd>(() => {
    if (endType === "on") return { type: "on", date: endDate };
    if (endType === "after") return { type: "after", occurrences: endOccurrences };
    return { type: "never" };
  }, [endDate, endOccurrences, endType]);

  const definition = useMemo<TaskScheduleDefinitionInput | null>(() => {
    if (!startDate || !startTime) return null;
    if (interval < 1 || (frequency === "weekly" && weekdays.length === 0)) return null;
    if (frequency === "cron" && !cronExpression.trim()) return null;
    if (endType === "on" && !endDate) return null;
    if (endType === "after" && endOccurrences < 1) return null;
    return {
      starts_at: `${startDate}T${startTime}:00`,
      recurrence,
      end,
    };
  }, [cronExpression, end, endDate, endOccurrences, endType, frequency, interval, recurrence, startDate, startTime, weekdays.length]);

  useEffect(() => {
    if (mode !== "scheduled" || !definition) {
      setPreview([]);
      return;
    }
    const revision = ++previewRevision.current;
    const timeout = window.setTimeout(async () => {
      setPreviewPending(true);
      try {
        const result = await previewTaskSchedule(taskId, definition);
        if (previewRevision.current === revision) {
          setPreview(result.occurrences);
          setError(null);
        }
      } catch (cause) {
        if (previewRevision.current === revision) {
          setPreview([]);
          setError(cause instanceof Error ? cause.message : "Schedule is not valid");
        }
      } finally {
        if (previewRevision.current === revision) setPreviewPending(false);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [definition, mode, taskId]);

  const persistedDefinition = useMemo<TaskScheduleDefinitionInput | null>(() => {
    if (!schedule) return null;
    const local = scheduleDateTimeParts(schedule.definition.starts_at, schedule.definition.timezone);
    return {
      starts_at: `${local.date}T${local.time}:00`,
      recurrence: schedule.definition.recurrence,
      end: schedule.definition.end,
    };
  }, [schedule]);

  const scheduleDirty = useMemo(() => {
    const scheduleKey = schedule ? `${schedule.id}:${schedule.updated_at}` : "new";
    if (isLoading || hydratedScheduleKey !== scheduleKey) return false;
    if (mode === "manual") return Boolean(schedule);
    if (!schedule) return true;
    return JSON.stringify(definition) !== JSON.stringify(persistedDefinition);
  }, [definition, hydratedScheduleKey, isLoading, mode, persistedDefinition, schedule]);

  const canSave = mode === "manual"
    || !scheduleDirty
    || Boolean(definition && !previewPending && preview.length > 0);

  useEffect(() => {
    onStateChange({ dirty: scheduleDirty, canSave });
  }, [canSave, onStateChange, scheduleDirty]);

  useImperativeHandle(ref, () => ({
    saveChanges: async () => {
      if (!scheduleDirty) return;
      setError(null);
      try {
        if (mode === "manual") {
          if (schedule) {
            await deleteTaskSchedule(taskId);
            await mutate(null, { revalidate: false });
          }
        } else {
          if (!definition) throw new Error("Complete the schedule before saving");
          const updated = await putTaskSchedule(taskId, {
            definition,
            enabled: schedule?.enabled ?? true,
          });
          await mutate(updated, { revalidate: false });
        }
        onScheduleChanged();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Failed to save schedule";
        setError(message);
        throw cause;
      }
    },
  }), [definition, mode, mutate, onScheduleChanged, schedule, scheduleDirty, taskId]);

  /** Persist an explicit pause or resume without changing the recurrence definition. */
  const setScheduleEnabled = async (enabled: boolean) => {
    if (!schedule) return;
    setPending(true);
    setError(null);
    try {
      const updated = await setTaskScheduleEnabled(taskId, enabled);
      await mutate(updated, { revalidate: false });
      onScheduleChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Failed to ${enabled ? "resume" : "pause"} schedule`);
    } finally {
      setPending(false);
    }
  };

  const toggleWeekday = (weekday: TaskScheduleWeekday) => {
    setWeekdays((current) => current.includes(weekday)
      ? current.filter((value) => value !== weekday)
      : [...current, weekday]);
  };

  const scheduleControl = schedule
    ? scheduledTaskControl(schedule.enabled, state)
    : null;

  return (
    <div className="theme-border space-y-3 border-t pt-4">
      <div>
        <p className="theme-text text-sm font-medium">Dispatch mode</p>
        <p className="theme-text-muted mt-1 text-xs">
          Manual tasks run on demand. Scheduled tasks enter the worker inbox at each occurrence.
        </p>
      </div>
      <div aria-label="Dispatch mode" className="theme-surface-muted inline-flex rounded-lg p-1" role="group">
        <Button aria-pressed={mode === "manual"} disabled={pending || isLoading} onClick={() => onModeChange("manual")} size="sm" variant={mode === "manual" ? "primary" : "ghost"}>Manual</Button>
        <Button aria-pressed={mode === "scheduled"} disabled={pending} onClick={() => onModeChange("scheduled")} size="sm" variant={mode === "scheduled" ? "primary" : "ghost"}>Scheduled</Button>
      </div>

      {mode === "scheduled" ? isLoading ? (
        <p className="theme-text-muted text-sm">Loading schedule…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="theme-text text-sm">Starts on<input className={fieldClass} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
            <label className="theme-text text-sm">Time<input className={fieldClass} onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></label>
            <label className="theme-text text-sm">Timezone<input className={`${fieldClass} theme-surface-muted font-mono`} readOnly value={timezone} /></label>
          </div>

          <div className={`grid gap-3 ${frequency === "interval" ? "sm:grid-cols-[minmax(0,1fr)_7rem_9rem]" : "sm:grid-cols-[minmax(0,1fr)_7rem]"}`}>
            <label className="theme-text text-sm">Repeats
              <select className={fieldClass} onChange={(event) => setFrequency(event.target.value as Frequency)} value={frequency}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="interval">Interval</option><option value="cron">Advanced cron</option>
              </select>
            </label>
            {frequency !== "cron" ? <label className="theme-text text-sm">Every<input className={fieldClass} min={1} onChange={(event) => setInterval(Number(event.target.value))} type="number" value={interval} /></label> : null}
            {frequency === "interval" ? <label className="theme-text text-sm">Unit<select className={fieldClass} onChange={(event) => setIntervalUnit(event.target.value as TaskScheduleIntervalUnit)} value={intervalUnit}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label> : null}
          </div>

          {frequency === "weekly" ? <div><p className="theme-text text-sm">On</p><div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((weekday) => <button aria-pressed={weekdays.includes(weekday.value)} className={`rounded-full border px-3 py-1 text-xs ${weekdays.includes(weekday.value) ? "border-deep-space-blue-500 bg-deep-space-blue-500 text-white" : "theme-border theme-text"}`} key={weekday.value} onClick={() => toggleWeekday(weekday.value)} type="button">{weekday.label}</button>)}</div></div> : null}
          {frequency === "monthly" ? <label className="theme-text block max-w-48 text-sm">Day of month<input className={fieldClass} max={31} min={1} onChange={(event) => setDayOfMonth(Number(event.target.value))} type="number" value={dayOfMonth} /></label> : null}
          {frequency === "yearly" ? <div className="grid max-w-md grid-cols-2 gap-3"><label className="theme-text text-sm">Month<select className={fieldClass} onChange={(event) => setMonth(Number(event.target.value))} value={month}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label><label className="theme-text text-sm">Day<input className={fieldClass} max={31} min={1} onChange={(event) => setAnnualDay(Number(event.target.value))} type="number" value={annualDay} /></label></div> : null}
          {frequency === "cron" ? <div className="theme-border theme-surface-muted rounded-lg border p-3"><label className="theme-text text-sm">Cron expression<input className={`${fieldClass} font-mono`} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 0 9 * * MON-FRI" value={cronExpression} /></label><p className="theme-text-muted mt-2 text-xs">Advanced mode uses the organization timezone and six-field cron syntax.</p></div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="theme-text text-sm">Ends<select className={fieldClass} onChange={(event) => setEndType(event.target.value as EndType)} value={endType}><option value="never">Never</option><option value="on">On a date</option><option value="after">After a number of runs</option></select></label>
            {endType === "on" ? <label className="theme-text text-sm">End date<input className={fieldClass} min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label> : null}
            {endType === "after" ? <label className="theme-text text-sm">Runs<input className={fieldClass} min={1} onChange={(event) => setEndOccurrences(Number(event.target.value))} type="number" value={endOccurrences} /></label> : null}
          </div>

          <div className="theme-border theme-surface-muted rounded-lg border p-3">
            <p className="theme-text text-sm font-medium">{describeTaskRecurrence(recurrence)}</p>
            {previewPending ? <p className="theme-text-muted mt-2 text-xs">Calculating upcoming runs…</p> : preview.length ? <ol className="theme-text-muted mt-2 grid gap-1 text-xs sm:grid-cols-3">{preview.map((occurrence) => <li key={occurrence}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(occurrence))}</li>)}</ol> : <p className="theme-text-muted mt-2 text-xs">Complete the schedule to preview upcoming runs.</p>}
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            {scheduleControl === "pause" ? (
              <Button disabled={pending} onClick={() => setScheduleEnabled(false)} size="sm" variant="secondary">
                <Pause size={13} /> Pause
              </Button>
            ) : null}
            {scheduleControl === "resume" ? (
              <Button disabled={pending} onClick={() => setScheduleEnabled(true)} size="sm" variant="secondary">
                <Play size={13} /> Resume
              </Button>
            ) : null}
            {schedule ? (
              <p className="theme-text-muted text-xs">
                {state === "running" ? "Running" : schedule.enabled ? "Queued" : "Paused"} · next {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: schedule.definition.timezone }).format(new Date(schedule.next_run_at))}
              </p>
            ) : (
              <p className="theme-text-muted text-xs">Save to activate scheduled dispatch.</p>
            )}
          </div>
        </div>
      ) : error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
});

type RecurrenceSetters = {
  setFrequency: (value: Frequency) => void;
  setInterval: (value: number) => void;
  setIntervalUnit: (value: TaskScheduleIntervalUnit) => void;
  setWeekdays: (value: TaskScheduleWeekday[]) => void;
  setDayOfMonth: (value: number) => void;
  setMonth: (value: number) => void;
  setAnnualDay: (value: number) => void;
  setCronExpression: (value: string) => void;
};

/** Populate form state from the tagged recurrence returned by the platform. */
function hydrateRecurrence(recurrence: TaskScheduleRecurrence, setters: RecurrenceSetters) {
  setters.setFrequency(recurrence.frequency);
  switch (recurrence.frequency) {
    case "interval": setters.setInterval(recurrence.every); setters.setIntervalUnit(recurrence.unit); break;
    case "daily": setters.setInterval(recurrence.interval); break;
    case "weekly": setters.setInterval(recurrence.interval); setters.setWeekdays(recurrence.weekdays); break;
    case "monthly": setters.setInterval(recurrence.interval); setters.setDayOfMonth(recurrence.day_of_month); break;
    case "yearly": setters.setInterval(recurrence.interval); setters.setMonth(recurrence.month); setters.setAnnualDay(recurrence.day); break;
    case "cron": setters.setCronExpression(recurrence.expression); break;
  }
}
