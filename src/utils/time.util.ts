/**
 * Time utility functions for handling timestamps
 */

/**
 * Get today's date at 00:00:00 UTC as Unix timestamp
 * @returns Unix timestamp for today at midnight (UTC)
 */
export function getTodayMidnightTimestamp(): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.floor(today.getTime() / 1000);
}

/**
 * Get Unix timestamp from Date object
 * @param date Date object
 * @returns Unix timestamp in seconds
 */
export function getUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Get current Unix timestamp
 * @returns Current Unix timestamp in seconds
 */
export function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if a timestamp is within today (UTC)
 * @param timestamp Unix timestamp in seconds
 * @returns true if timestamp is within today (UTC)
 */
export function isToday(timestamp: number): boolean {
  const todayStart = getTodayMidnightTimestamp();
  const todayEnd = todayStart + 24 * 60 * 60; // Add 24 hours
  return timestamp >= todayStart && timestamp < todayEnd;
}
