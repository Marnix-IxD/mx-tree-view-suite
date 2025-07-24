import { useRef, useCallback, useEffect } from "react";
import { EditableValue } from "mendix";
import { setTimer, clearTimer, TimerId } from "../utils/timers";
import { safeSetAttributeValue } from "../utils/mendixHelpers";

/**
 * Attribute update optimization configuration
 */
interface AttributeOptimizationConfig {
    enabled?: boolean;
    batchDelay?: number; // Delay before flushing batch updates (ms)
    useDiffing?: boolean; // Only update changed values
    useIdleCallback?: boolean; // Use requestIdleCallback for updates
    debugMode?: boolean;
}

/**
 * Attribute update entry
 */
interface AttributeUpdate {
    attribute: EditableValue<string>;
    value: string;
    timestamp: number;
}

/**
 * Attribute state for diffing
 */
interface AttributeState {
    [key: string]: string;
}

const DEFAULT_CONFIG: Required<AttributeOptimizationConfig> = {
    enabled: true,
    batchDelay: 50,
    useDiffing: true,
    useIdleCallback: true,
    debugMode: false
};

/**
 * Hook for optimized attribute updates
 * Batches multiple attribute changes to reduce Mendix server calls
 */
export function useOptimizedAttributes(config: AttributeOptimizationConfig = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Refs for performance
    const updateQueueRef = useRef<Map<string, AttributeUpdate>>(new Map());
    const lastStateRef = useRef<AttributeState>({});
    const batchTimerRef = useRef<TimerId | null>(null);
    const idleCallbackRef = useRef<number | null>(null);
    const updateCountRef = useRef({ total: 0, batched: 0, skipped: 0 });

    /**
     * Check if value has actually changed
     */
    const hasValueChanged = useCallback(
        (key: string, newValue: string): boolean => {
            if (!mergedConfig.useDiffing) {
                return true;
            }

            const oldValue = lastStateRef.current[key];

            // Handle different types
            if (oldValue === newValue) {
                return false;
            }
            if (oldValue == null && newValue == null) {
                return false;
            }
            if (oldValue == null || newValue == null) {
                return true;
            }

            // Array comparison
            if (Array.isArray(oldValue) && Array.isArray(newValue)) {
                if (oldValue.length !== newValue.length) {
                    return true;
                }
                return oldValue.some((v, i) => v !== newValue[i]);
            }

            // Object comparison (shallow)
            if (typeof oldValue === "object" && typeof newValue === "object") {
                // TODO ADD: Support deep object comparison option for nested structures
                // TODO FIX: Handle Date, RegExp, and other special object types
                const oldKeys = Object.keys(oldValue);
                const newKeys = Object.keys(newValue);
                if (oldKeys.length !== newKeys.length) {
                    return true;
                }
                return oldKeys.some(k => oldValue[k] !== newValue[k]);
            }

            return oldValue !== newValue;
        },
        [mergedConfig.useDiffing]
    );

    /**
     * Process the update queue
     */
    const processUpdateQueue = useCallback(() => {
        if (updateQueueRef.current.size === 0) {
            return;
        }

        const updates = Array.from(updateQueueRef.current.values());
        updateQueueRef.current.clear();

        if (mergedConfig.debugMode) {
            console.debug(
                `useOptimizedAttributes.ts [ATTRIBUTES][BATCH_UPDATE]: Processing ${updates.length} batched attribute updates`
            );
        }

        // Apply all updates
        updates.forEach(({ attribute, value }) => {
            const success = safeSetAttributeValue(attribute, value, "attribute");
            if (success) {
                updateCountRef.current.batched++;
            }
        });

        // Update state snapshot
        updates.forEach(({ attribute, value }) => {
            const key = (attribute as any).id || String(attribute); // TODO FIX: Better way to generate unique keys for attributes
            // TODO ADD: Cache attribute IDs to avoid repeated type casting
            lastStateRef.current[key] = value;
        });
    }, [mergedConfig.debugMode]);

    /**
     * Schedule update processing
     */
    const scheduleProcessing = useCallback(() => {
        // Clear any existing timers
        if (batchTimerRef.current) {
            clearTimer(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        if (idleCallbackRef.current) {
            cancelIdleCallback(idleCallbackRef.current);
            idleCallbackRef.current = null;
        }

        if (mergedConfig.useIdleCallback && "requestIdleCallback" in window) {
            // Use idle callback for better performance
            idleCallbackRef.current = requestIdleCallback(() => processUpdateQueue(), {
                timeout: mergedConfig.batchDelay
            });
        } else {
            // Fallback to setTimeout
            batchTimerRef.current = setTimer(processUpdateQueue, mergedConfig.batchDelay);
        }
    }, [mergedConfig, processUpdateQueue]);

    /**
     * Queue an attribute update
     */
    const updateAttribute = useCallback(
        (attribute: EditableValue<string>, value: string) => {
            updateCountRef.current.total++;

            if (!mergedConfig.enabled) {
                // Optimization disabled - update immediately
                safeSetAttributeValue(attribute, value, "attribute");
                return;
            }

            const key = (attribute as any).id || String(attribute);

            // Check if value has changed
            if (!hasValueChanged(key, value)) {
                updateCountRef.current.skipped++;
                if (mergedConfig.debugMode) {
                    console.debug(
                        `useOptimizedAttributes.ts [ATTRIBUTES][SKIP]: Skipped unchanged attribute update: ${key}`
                    );
                }
                return;
            }

            // Add to queue
            updateQueueRef.current.set(key, {
                attribute,
                value,
                timestamp: Date.now()
            });

            // Schedule processing
            scheduleProcessing();
        },
        [mergedConfig, hasValueChanged, scheduleProcessing]
    );

    /**
     * Batch update multiple attributes
     */
    const batchUpdateAttributes = useCallback(
        (
            updates: Array<{
                attribute: EditableValue<any>;
                value: any;
            }>
        ) => {
            if (!mergedConfig.enabled || updates.length === 0) {
                // Update immediately
                updates.forEach(({ attribute, value }) => {
                    safeSetAttributeValue(attribute, value, "attribute");
                });
                return;
            }

            // Add all to queue
            updates.forEach(({ attribute, value }) => {
                const key = (attribute as any).id || String(attribute);

                if (hasValueChanged(key, value)) {
                    updateQueueRef.current.set(key, {
                        attribute,
                        value,
                        timestamp: Date.now()
                    });
                } else {
                    updateCountRef.current.skipped++;
                }
            });

            updateCountRef.current.total += updates.length;

            // Schedule processing
            scheduleProcessing();
        },
        [mergedConfig, hasValueChanged, scheduleProcessing]
    );

    /**
     * Force immediate flush of pending updates
     */
    const flushUpdates = useCallback(() => {
        // Cancel scheduled processing
        if (batchTimerRef.current) {
            clearTimer(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        if (idleCallbackRef.current) {
            cancelIdleCallback(idleCallbackRef.current);
            idleCallbackRef.current = null;
        }

        // Process immediately
        processUpdateQueue();
    }, [processUpdateQueue]);

    /**
     * Get optimization statistics
     */
    const getStats = useCallback(() => {
        const { total, batched, skipped } = updateCountRef.current;
        const saved = skipped + (total - batched - skipped);
        const reductionRate = total > 0 ? saved / total : 0;
        // TODO ADD: Track update timing metrics for performance analysis

        return {
            totalUpdates: total,
            batchedUpdates: batched,
            skippedUpdates: skipped,
            savedUpdates: saved,
            reductionRate,
            pendingUpdates: updateQueueRef.current.size
        };
    }, []);

    /**
     * Reset statistics
     */
    const resetStats = useCallback(() => {
        updateCountRef.current = { total: 0, batched: 0, skipped: 0 };
    }, []);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            // Flush any pending updates
            if (updateQueueRef.current.size > 0) {
                processUpdateQueue();
            }

            // Clear timers
            if (batchTimerRef.current) {
                clearTimer(batchTimerRef.current);
            }
            if (idleCallbackRef.current) {
                cancelIdleCallback(idleCallbackRef.current);
            }
        };
    }, [processUpdateQueue]);

    return {
        updateAttribute,
        batchUpdateAttributes,
        flushUpdates,
        getStats,
        resetStats,
        isOptimizationEnabled: mergedConfig.enabled
    };
}
