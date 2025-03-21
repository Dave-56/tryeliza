/**
 * Backend date utilities for consistent timezone and date format handling
 */

/**
 * Convert a date to UTC while preserving the local time in the user's timezone
 */
export function toUTC(date: Date, userTimezone: string): Date {
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: userTimezone }));
  const utcDate = new Date(Date.UTC(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    localDate.getHours(),
    localDate.getMinutes(),
    localDate.getSeconds()
  ));
  return utcDate;
}

/**
 * Convert a UTC date to the user's timezone
 */
export function fromUTC(date: Date, userTimezone: string): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: userTimezone }));
}

/**
 * Format a date for database storage (YYYY-MM-DD)
 * Uses en-CA locale as it naturally outputs in YYYY-MM-DD format
 */
export function formatForDB(date: Date, userTimezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Format a date for API responses (ISO format in UTC)
 */
export function formatForAPI(date: Date): string {
  return date.toISOString();
}

/**
 * Parse a date string from API, considering the user's timezone
 */
export function parseFromAPI(dateStr: string, userTimezone: string): Date {
  const date = new Date(dateStr);
  return fromUTC(date, userTimezone);
}

/**
 * Check if a date string is in valid YYYY-MM-DD format
 */
export function isValidDateFormat(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Get the start of day in user's timezone
 */
export function getStartOfDay(date: Date, userTimezone: string): Date {
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: userTimezone }));
  localDate.setHours(0, 0, 0, 0);
  return toUTC(localDate, userTimezone);
}

/**
 * Get the end of day in user's timezone
 */
export function getEndOfDay(date: Date, userTimezone: string): Date {
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: userTimezone }));
  localDate.setHours(23, 59, 59, 999);
  return toUTC(localDate, userTimezone);
}

/**
 * Format a date for display in email summaries
 * This is specifically for the Eliza AI email digest feature
 */
export function formatForEmailSummary(date: Date, userTimezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).format(date);
}
