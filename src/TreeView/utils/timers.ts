/**
 * Timer utilities to handle cross-platform timer type issues
 *
 * JavaScript timers have different return types in different environments:
 * - Browser: setTimeout returns a number
 * - Node.js: setTimeout returns a Timeout object
 *
 * This utility provides a consistent interface that works correctly
 * in Mendix widgets (browser environment) without type casting everywhere.
 */

// Use a type that works for both environments
export type TimerId = ReturnType<typeof setTimeout>;

/**
 * Set a timer that executes a callback after a delay
 * @param callback Function to execute after the delay
 * @param delay Delay in milliseconds
 * @returns Timer ID that can be used with clearTimer
 */
export function setTimer(callback: () => void, delay: number): TimerId {
    return setTimeout(callback, delay);
}

/**
 * Clear a timer set with setTimer
 * @param timerId Timer ID returned from setTimer
 */
export function clearTimer(timerId: TimerId | null | undefined): void {
    if (timerId) {
        clearTimeout(timerId);
    }
}

/**
 * Set an interval that executes a callback repeatedly
 * @param callback Function to execute at each interval
 * @param delay Interval in milliseconds
 * @returns Interval ID that can be used with clearInterval
 */
export function setTimerInterval(callback: () => void, delay: number): TimerId {
    return setInterval(callback, delay);
}

/**
 * Clear an interval set with setTimerInterval
 * @param intervalId Interval ID returned from setTimerInterval
 */
export function clearTimerInterval(intervalId: TimerId | null | undefined): void {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

/**
 * Request an idle callback (with fallback to setTimeout)
 * @param callback Function to execute when the browser is idle
 * @param options Options for requestIdleCallback
 * @returns Handle that can be used with cancelIdleCallback
 */
export function requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number {
    if ("requestIdleCallback" in window) {
        return window.requestIdleCallback(callback, options);
    }
    // Fallback to setTimeout for browsers without requestIdleCallback
    return setTimeout(
        () =>
            callback({
                didTimeout: false,
                timeRemaining: () => 50
            } as IdleDeadline),
        1
    ) as unknown as number;
}

/**
 * Cancel an idle callback
 * @param handle Handle returned from requestIdleCallback
 */
export function cancelIdleCallback(handle: number): void {
    if ("cancelIdleCallback" in window) {
        window.cancelIdleCallback(handle);
    } else {
        clearTimeout(handle);
    }
}
