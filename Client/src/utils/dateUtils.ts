/**
 * Client-side date utilities for consistent date handling and display
 */

/**
 * Format a date for display in the Eliza AI interface
 * Uses the browser's timezone by default
 */
export function formatForDisplay(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).format(dateObj);
}

/**
 * Format a date for calendar display (YYYY-MM-DD)
 */
export function formatForCalendar(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

/**
 * Format a date for API requests (ISO format)
 */
export function formatForAPI(date: Date): string {
  return date.toISOString();
}

/**
 * Parse a date from API response
 * API always returns dates in ISO format (UTC)
 */
export function parseFromAPI(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTimeString(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((dateObj.getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffInSeconds);

  const times = [
    { seconds: 60 * 60 * 24 * 365, label: 'year' },
    { seconds: 60 * 60 * 24 * 30, label: 'month' },
    { seconds: 60 * 60 * 24 * 7, label: 'week' },
    { seconds: 60 * 60 * 24, label: 'day' },
    { seconds: 60 * 60, label: 'hour' },
    { seconds: 60, label: 'minute' },
    { seconds: 1, label: 'second' }
  ];

  for (const { seconds, label } of times) {
    const interval = Math.floor(absSeconds / seconds);
    if (interval >= 1) {
      const plural = interval === 1 ? '' : 's';
      return diffInSeconds < 0
        ? `${interval} ${label}${plural} ago`
        : `in ${interval} ${label}${plural}`;
    }
  }

  return 'just now';
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return dateObj.getDate() === today.getDate() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getFullYear() === today.getFullYear();
}

/**
 * Format a date for task display
 * Shows relative time for recent/upcoming dates, full date otherwise
 */
export function formatForTask(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInDays = Math.floor((dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (Math.abs(diffInDays) <= 7) {
    return getRelativeTimeString(dateObj);
  }
  return formatForDisplay(dateObj);
}
