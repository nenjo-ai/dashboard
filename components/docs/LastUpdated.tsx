type LastUpdatedProps = {
  value: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function LastUpdated({ value }: LastUpdatedProps) {
  return (
    <p className="text-sm text-fd-muted-foreground not-prose mb-4">
      Last updated: {formatDate(value)}
    </p>
  );
}