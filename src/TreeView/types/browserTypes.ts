/**
 * Browser-compatible type definitions
 *
 * In browsers, setTimeout and setInterval return numbers, not number.
 * This file provides type aliases for browser compatibility.
 */

// Browser timer type - in browsers, setTimeout/setInterval return a number
export type BrowserTimeout = number;

// Re-export for convenience
export type TimeoutHandle = BrowserTimeout;
