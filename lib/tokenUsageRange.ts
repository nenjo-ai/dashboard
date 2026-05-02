export type TokenUsageDay = {
  date: string;
  label: string;
  isToday: boolean;
};

export type TokenUsageRange = {
  days: TokenUsageDay[];
  from: string;
  to: string;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildTodayTokenUsageRange(): TokenUsageRange {
  const today = startOfUtcDay(new Date());
  const tomorrow = addUtcDays(today, 1);

  return {
    days: [{ date: isoDate(today), label: "Today", isToday: true }],
    from: today.toISOString(),
    to: tomorrow.toISOString(),
  };
}

export function buildSevenDayTokenUsageRange(): TokenUsageRange {
  const today = startOfUtcDay(new Date());
  const start = addUtcDays(today, -7);
  const end = addUtcDays(today, 1);
  const todayDate = isoDate(today);

  const days = Array.from({ length: 8 }, (_, index) => {
    const day = addUtcDays(start, index);
    const date = isoDate(day);
    const isToday = date === todayDate;
    return {
      date,
      label: isToday ? "Today" : formatDayLabel(day),
      isToday,
    };
  });

  return { days, from: start.toISOString(), to: end.toISOString() };
}
