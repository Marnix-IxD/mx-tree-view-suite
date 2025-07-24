/**
 * Browser-compatible timer utilities
 *
 * These utilities ensure consistent typing for browser timers.
 * In browsers, setTimeout/setInterval return numbers, but TypeScript
 * may infer different types depending on the environment.
 */

/**
 * Wrapper for window.setTimeout that ensures correct typing
 */
export function setTimer(callback: () => void, delay: number): number {
    return window.setTimeout(callback, delay);
}

/**
 * Wrapper for window.clearTimeout that ensures correct typing
 */
export function clearTimer(timerId: number | null | undefined): void {
    if (timerId) {
        window.clearTimeout(timerId);
    }
}

/**
 * Wrapper for window.setInterval that ensures correct typing
 */
export function setIntervalTimer(callback: () => void, delay: number): number {
    return window.setInterval(callback, delay);
}

/**
 * Wrapper for window.clearInterval that ensures correct typing
 */
export function clearIntervalTimer(timerId: number | null | undefined): void {
    if (timerId) {
        window.clearInterval(timerId);
    }
}

/**
 * Request animation frame wrapper with consistent typing
 */
export function requestAnimationFrameTimer(callback: FrameRequestCallback): number {
    return window.requestAnimationFrame(callback);
}

/**
 * Cancel animation frame wrapper
 */
export function cancelAnimationFrameTimer(timerId: number | null | undefined): void {
    if (timerId) {
        window.cancelAnimationFrame(timerId);
    }
}
