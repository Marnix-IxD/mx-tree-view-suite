/**
 * Search Delay Manager
 * Implements minimum character requirements and scaling delays for secure search
 */

// Constants
const DEFAULT_MIN_CHARS = 6;
const MIN_ALLOWED_CHARS = 3;
const MAX_ALLOWED_CHARS = 10;
const SCALING_DELAY_PER_CHAR = 200; // ms per character below default
const BASE_DEBOUNCE_DELAY = 300; // Base delay in ms

export interface ISearchDelayConfig {
    minCharacters: number;
    enableScalingDelay: boolean;
    baseDebounce: number;
}

export class SearchDelayManager {
    private config: ISearchDelayConfig;

    constructor(config: Partial<ISearchDelayConfig> = {}) {
        this.config = {
            minCharacters: this.validateMinChars(config.minCharacters ?? DEFAULT_MIN_CHARS),
            enableScalingDelay: config.enableScalingDelay ?? true,
            baseDebounce: config.baseDebounce ?? BASE_DEBOUNCE_DELAY
        };
    }

    /**
     * Validate and constrain minimum character setting
     */
    private validateMinChars(chars: number): number {
        return Math.max(MIN_ALLOWED_CHARS, Math.min(MAX_ALLOWED_CHARS, chars));
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ISearchDelayConfig>): void {
        if (config.minCharacters !== undefined) {
            this.config.minCharacters = this.validateMinChars(config.minCharacters);
        }
        if (config.enableScalingDelay !== undefined) {
            this.config.enableScalingDelay = config.enableScalingDelay;
        }
        if (config.baseDebounce !== undefined) {
            this.config.baseDebounce = Math.max(0, config.baseDebounce);
        }
    }

    /**
     * Check if search query meets minimum character requirement
     */
    isQueryValid(query: string): boolean {
        return query.trim().length >= this.config.minCharacters;
    }

    /**
     * Get the search delay based on query length and configuration
     */
    getSearchDelay(query: string): number {
        const trimmedLength = query.trim().length;

        // Query too short
        if (trimmedLength < this.config.minCharacters) {
            return -1; // Indicates search should not execute
        }

        // Base delay
        let delay = this.config.baseDebounce;

        // Add scaling delay if enabled
        if (this.config.enableScalingDelay) {
            const charsBelowDefault = Math.max(0, DEFAULT_MIN_CHARS - trimmedLength);
            const scalingDelay = charsBelowDefault * SCALING_DELAY_PER_CHAR;
            delay += scalingDelay;
        }

        return delay;
    }

    /**
     * Get informative message about search requirements
     */
    getSearchRequirementMessage(currentLength: number): string | null {
        if (currentLength < this.config.minCharacters) {
            const remaining = this.config.minCharacters - currentLength;
            return `Enter ${remaining} more character${remaining === 1 ? "" : "s"} to search`;
        }
        return null;
    }

    /**
     * Calculate estimated wait time for a query
     */
    getEstimatedWaitTime(query: string): number {
        const delay = this.getSearchDelay(query);
        return delay === -1 ? 0 : delay;
    }

    /**
     * Get configuration summary
     */
    getConfigSummary(): {
        minCharacters: number;
        enableScalingDelay: boolean;
        baseDebounce: number;
        scalingDelayPerChar: number;
    } {
        return {
            ...this.config,
            scalingDelayPerChar: SCALING_DELAY_PER_CHAR
        };
    }
}

/**
 * Create a debounced search function with delay management
 */
export function createManagedSearchFunction<T extends (...args: any[]) => any>(
    searchFn: T,
    delayManager: SearchDelayManager
): (query: string, ...args: Parameters<T> extends [string, ...infer Rest] ? Rest : never[]) => void {
    let timeoutId: number | null = null;

    return (query: string, ...args: any[]) => {
        // Clear existing timeout
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }

        // Get delay for this query
        const delay = delayManager.getSearchDelay(query);

        // Query too short - don't search
        if (delay === -1) {
            return;
        }

        // Schedule search with calculated delay
        timeoutId = window.setTimeout(() => {
            searchFn(query, ...args);
            timeoutId = null;
        }, delay);
    };
}
