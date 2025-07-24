/**
 * Smart request manager for server-side search with cancellation and timeout
 */
export class SearchRequestManager {
    private activeRequests = new Map<string, AbortController>();
    private requestTimers = new Map<string, number>();
    private requestHistory: string[] = [];
    private readonly MAX_HISTORY = 10;
    private debugMode: boolean;

    constructor(debugMode = false) {
        this.debugMode = debugMode;
    }

    /**
     * Perform a search with smart cancellation and timeout
     */
    async performSearch<T>(
        query: string,
        searchFn: (signal: AbortSignal) => Promise<T>,
        options: {
            timeout?: number;
            onTimeout?: () => void;
            onCancel?: () => void;
        } = {}
    ): Promise<T> {
        const { timeout = 5000, onTimeout, onCancel } = options;

        // Smart cancellation of previous requests
        this.cancelPreviousIfNeeded(query);

        // Track query history
        this.addToHistory(query);

        // Create new AbortController for this request
        const controller = new AbortController();
        this.activeRequests.set(query, controller);

        // Set timeout
        const timer = window.setTimeout(() => {
            controller.abort();
            this.cleanup(query);
            onTimeout?.();
        }, timeout);

        this.requestTimers.set(query, timer);

        try {
            // Perform the search with abort signal
            const result = await searchFn(controller.signal);
            return result;
        } catch (error: any) {
            if (error.name === "AbortError") {
                onCancel?.();
                throw new Error("Search cancelled");
            }
            throw error;
        } finally {
            this.cleanup(query);
        }
    }

    /**
     * Smart cancellation logic - only cancel if query changed significantly
     */
    private cancelPreviousIfNeeded(newQuery: string): void {
        this.activeRequests.forEach((controller, oldQuery) => {
            if (this.shouldCancelRequest(oldQuery, newQuery)) {
                if (this.debugMode) {
                    console.debug(
                        `searchRequestManager.ts [SEARCH][CANCEL]: Cancelling search for "${oldQuery}" due to new search "${newQuery}"`
                    );
                }
                controller.abort();
                this.cleanup(oldQuery);
            }
        });
    }

    /**
     * Determine if we should cancel a previous request
     */
    private shouldCancelRequest(oldQuery: string, newQuery: string): boolean {
        // Don't cancel if just appending characters (refining search)
        if (newQuery.startsWith(oldQuery) && newQuery.length > oldQuery.length) {
            return false;
        }

        // Don't cancel if just removed a few characters (backspace)
        if (oldQuery.startsWith(newQuery) && oldQuery.length - newQuery.length <= 2) {
            return false;
        }

        // Cancel for significant changes
        return true;
    }

    /**
     * Clean up request tracking
     */
    private cleanup(query: string): void {
        // Clear abort controller
        const controller = this.activeRequests.get(query);
        if (controller) {
            this.activeRequests.delete(query);
        }

        // Clear timeout
        const timer = this.requestTimers.get(query);
        if (timer) {
            window.clearTimeout(timer);
            this.requestTimers.delete(query);
        }
    }

    /**
     * Track query history for potential optimizations
     */
    private addToHistory(query: string): void {
        this.requestHistory.push(query);
        if (this.requestHistory.length > this.MAX_HISTORY) {
            this.requestHistory.shift();
        }
    }

    /**
     * Cancel all active requests
     */
    cancelAll(): void {
        this.activeRequests.forEach((controller, query) => {
            controller.abort();
            this.cleanup(query);
        });
    }

    /**
     * Get active request count
     */
    getActiveRequestCount(): number {
        return this.activeRequests.size;
    }

    /**
     * Check if a specific query is still active
     */
    isRequestActive(query: string): boolean {
        return this.activeRequests.has(query);
    }

    /**
     * Get request history (for debugging/analytics)
     */
    getRequestHistory(): string[] {
        return [...this.requestHistory];
    }
}
