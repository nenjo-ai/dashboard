/** IANA timezones supported by the current browser, with UTC always available. */
export function supportedIanaTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
}
