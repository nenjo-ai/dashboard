import type {
  TaskScheduleRecurrence,
  TaskScheduleWeekday,
} from "./types";

const WEEKDAY_LABELS: Record<TaskScheduleWeekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** Convert a UTC instant into stable calendar form fields in one IANA timezone. */
export function scheduleDateTimeParts(
  instant: string | Date,
  timezone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** Human-readable recurrence summary used next to occurrence previews. */
export function describeTaskRecurrence(recurrence: TaskScheduleRecurrence): string {
  switch (recurrence.frequency) {
    case "interval":
      return `Every ${recurrence.every} ${recurrence.unit}`;
    case "daily":
      return recurrence.interval === 1 ? "Every day" : `Every ${recurrence.interval} days`;
    case "weekly": {
      const cadence = recurrence.interval === 1 ? "Every week" : `Every ${recurrence.interval} weeks`;
      const days = recurrence.weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(", ");
      return `${cadence} on ${days}`;
    }
    case "monthly":
      return `${recurrence.interval === 1 ? "Every month" : `Every ${recurrence.interval} months`} on day ${recurrence.day_of_month}`;
    case "yearly":
      return `${recurrence.interval === 1 ? "Every year" : `Every ${recurrence.interval} years`} on ${recurrence.month}/${recurrence.day}`;
    case "cron":
      return "Advanced cron schedule";
  }
}

/** Weekday matching an HTML date input, independent of the browser locale. */
export function weekdayForDate(date: string): TaskScheduleWeekday {
  const weekdays: TaskScheduleWeekday[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
}
