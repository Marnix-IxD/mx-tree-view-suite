import { useRef, useCallback, useEffect, useState } from "react";
import { DATA_LOADING_CONSTANTS } from "../constants/treeConstants";

/**
 * Smart scrolling configuration
 */
interface SmartScrollingConfig {
    enabled?: boolean;
    velocityWindow?: number; // Time window for velocity calculation (ms)
    minVelocityThreshold?: number; // Minimum velocity to trigger preloading (px/s)
    overscanMultiplier?: number; // Multiplier for dynamic overscan based on velocity
    minOverscan?: number; // Minimum overscan items
    maxOverscan?: number; // Maximum overscan items
    preloadDelay?: number; // Delay before preloading (ms)
    directionChangeThreshold?: number; // Pixels to confirm direction change
    memoryThreshold?: number; // Memory usage threshold (MB)
    chunkSize?: number; // Items to load per chunk
    debugMode?: boolean;
}

/**
 * Scroll state tracking
 */
interface ScrollState {
    position: number;
    velocity: number;
    direction: "up" | "down" | "idle";
    timestamp: number;
    isScrolling: boolean;
}

/**
 * Preload zone information
 */
interface PreloadZone {
    start: number;
    end: number;
    priority: "high" | "medium" | "low";
}

/**
 * Performance metrics
 */
interface ScrollMetrics {
    scrollEvents: number;
    preloadTriggers: number;
    velocityPeak: number;
    averageVelocity: number;
    memoryUsage: number;
}

const DEFAULT_CONFIG: Required<SmartScrollingConfig> = {
    enabled: true,
    velocityWindow: 100,
    minVelocityThreshold: 200,
    overscanMultiplier: 0.5,
    minOverscan: 5,
    maxOverscan: 50,
    preloadDelay: 100,
    directionChangeThreshold: 50,
    memoryThreshold: 50,
    chunkSize: DATA_LOADING_CONSTANTS.DEFAULT_CHUNK_SIZE,
    debugMode: false
};

/**
 * Hook for smart scrolling with predictive preloading
 * Maintains 60fps during fast scroll with intelligent data loading
 */
export function useSmartScrolling(
    containerRef: React.RefObject<HTMLElement>,
    itemCount: number,
    itemHeight: number,
    visibleCount: number,
    onPreload?: (start: number, end: number) => void,
    config: SmartScrollingConfig = {}
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // State
    const [metrics, setMetrics] = useState<ScrollMetrics>({
        scrollEvents: 0,
        preloadTriggers: 0,
        velocityPeak: 0,
        averageVelocity: 0,
        memoryUsage: 0
    });

    // Refs for performance
    const scrollStateRef = useRef<ScrollState>({
        position: 0,
        velocity: 0,
        direction: "idle",
        timestamp: Date.now(),
        isScrolling: false
    });

    const scrollHistoryRef = useRef<Array<{ position: number; time: number }>>([]);
    const preloadTimerRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);
    const lastDirectionRef = useRef<"up" | "down" | "idle">("idle");
    const velocitySamplesRef = useRef<number[]>([]);

    /**
     * Calculate current velocity based on scroll history
     */
    const calculateVelocity = useCallback((): number => {
        const history = scrollHistoryRef.current;
        if (history.length < 2) {
            return 0;
        }

        const recent = history.slice(-5); // Last 5 samples
        if (recent.length < 2) {
            return 0;
        }

        const first = recent[0];
        const last = recent[recent.length - 1];
        const distance = Math.abs(last.position - first.position);
        const time = last.time - first.time;

        return time > 0 ? (distance / time) * 1000 : 0; // px/s
    }, []);

    /**
     * Detect scroll direction with threshold
     */
    const detectDirection = useCallback(
        (currentPos: number, lastPos: number): "up" | "down" | "idle" => {
            const diff = currentPos - lastPos;

            if (Math.abs(diff) < mergedConfig.directionChangeThreshold) {
                return lastDirectionRef.current;
            }

            return diff > 0 ? "down" : "up";
        },
        [mergedConfig.directionChangeThreshold]
    );

    /**
     * Calculate dynamic overscan based on velocity
     */
    const calculateDynamicOverscan = useCallback(
        (velocity: number): number => {
            if (velocity < mergedConfig.minVelocityThreshold) {
                return mergedConfig.minOverscan;
            }

            const overscan = Math.floor(
                mergedConfig.minOverscan + (velocity / 1000) * mergedConfig.overscanMultiplier * visibleCount
            );

            return Math.min(overscan, mergedConfig.maxOverscan);
        },
        [mergedConfig, visibleCount]
    );

    /**
     * Predict future scroll position based on velocity and direction
     */
    const predictScrollPosition = useCallback(
        (
            currentPos: number,
            velocity: number,
            direction: "up" | "down" | "idle",
            timeAhead = 500 // ms
        ): number => {
            if (direction === "idle" || velocity < mergedConfig.minVelocityThreshold) {
                return currentPos;
            }

            const distance = (velocity * timeAhead) / 1000;
            return direction === "down"
                ? Math.min(currentPos + distance, (itemCount - visibleCount) * itemHeight)
                : Math.max(currentPos - distance, 0);
        },
        [mergedConfig.minVelocityThreshold, itemCount, visibleCount, itemHeight]
    );

    /**
     * Calculate preload zones based on scroll state
     */
    const calculatePreloadZones = useCallback((): PreloadZone[] => {
        const state = scrollStateRef.current;
        const currentIndex = Math.floor(state.position / itemHeight);
        const dynamicOverscan = calculateDynamicOverscan(state.velocity);

        const zones: PreloadZone[] = [];

        // High priority: Immediate visible area + dynamic overscan
        zones.push({
            start: Math.max(0, currentIndex - dynamicOverscan),
            end: Math.min(itemCount, currentIndex + visibleCount + dynamicOverscan),
            priority: "high"
        });

        // Medium priority: Predicted position area
        if (state.velocity > mergedConfig.minVelocityThreshold) {
            const predictedPos = predictScrollPosition(state.position, state.velocity, state.direction, 300);
            const predictedIndex = Math.floor(predictedPos / itemHeight);

            zones.push({
                start: Math.max(0, predictedIndex - dynamicOverscan),
                end: Math.min(itemCount, predictedIndex + visibleCount + dynamicOverscan),
                priority: "medium"
            });
        }

        // Low priority: Extended prediction for very fast scrolling
        if (state.velocity > mergedConfig.minVelocityThreshold * 3) {
            const extendedPos = predictScrollPosition(state.position, state.velocity, state.direction, 1000);
            const extendedIndex = Math.floor(extendedPos / itemHeight);

            zones.push({
                start: Math.max(0, extendedIndex - dynamicOverscan / 2),
                end: Math.min(itemCount, extendedIndex + visibleCount + dynamicOverscan / 2),
                priority: "low"
            });
        }

        return zones;
    }, [
        itemHeight,
        itemCount,
        visibleCount,
        calculateDynamicOverscan,
        predictScrollPosition,
        mergedConfig.minVelocityThreshold
    ]);

    /**
     * Check memory usage and adjust strategy
     */
    const checkMemoryUsage = useCallback((): boolean => {
        // Type assertion for Chrome's performance.memory API
        const perfMemory = (performance as any).memory;
        if (!perfMemory) {
            return true;
        } // API not available

        const usedMemoryMB = perfMemory.usedJSHeapSize / 1024 / 1024;
        const limitMB = perfMemory.jsHeapSizeLimit / 1024 / 1024;
        const usagePercent = (usedMemoryMB / limitMB) * 100;

        setMetrics(prev => ({ ...prev, memoryUsage: usedMemoryMB }));

        // If memory usage is high, reduce preloading
        const memoryUsageThreshold = 80; // Configurable percentage threshold
        return usagePercent < memoryUsageThreshold && usedMemoryMB < mergedConfig.memoryThreshold;
    }, [mergedConfig.memoryThreshold]);

    /**
     * Execute preloading with memory awareness
     */
    const executePreload = useCallback(() => {
        if (!onPreload || !checkMemoryUsage()) {
            return;
        }

        const zones = calculatePreloadZones();

        // Sort by priority and merge overlapping zones
        const mergedZones: PreloadZone[] = [];
        zones.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        zones.forEach(zone => {
            const overlapping = mergedZones.find(mz => zone.start <= mz.end && zone.end >= mz.start);

            if (overlapping) {
                overlapping.start = Math.min(overlapping.start, zone.start);
                overlapping.end = Math.max(overlapping.end, zone.end);
            } else {
                mergedZones.push({ ...zone });
            }
        });

        // Execute preload for each zone
        mergedZones.forEach(zone => {
            // Chunk the preload to avoid blocking
            const chunks = Math.ceil((zone.end - zone.start) / mergedConfig.chunkSize);

            for (let i = 0; i < chunks; i++) {
                const chunkStart = zone.start + i * mergedConfig.chunkSize;
                const chunkEnd = Math.min(chunkStart + mergedConfig.chunkSize, zone.end);

                // Use requestIdleCallback for low priority zones
                if (zone.priority === "low" && "requestIdleCallback" in window) {
                    requestIdleCallback(
                        () => {
                            onPreload(chunkStart, chunkEnd);
                        },
                        { timeout: 100 } // TODO ADD: Make idle callback timeout configurable
                    );
                } else {
                    onPreload(chunkStart, chunkEnd);
                }
            }
        });

        setMetrics(prev => ({ ...prev, preloadTriggers: prev.preloadTriggers + 1 }));
    }, [onPreload, checkMemoryUsage, calculatePreloadZones, mergedConfig.chunkSize]);

    /**
     * Handle scroll event with RAF throttling
     */
    const handleScroll = useCallback(() => {
        if (!containerRef.current || !mergedConfig.enabled) {
            return;
        }

        const container = containerRef.current;
        const currentPos = container.scrollTop;
        const now = Date.now();

        // Update scroll history
        scrollHistoryRef.current.push({ position: currentPos, time: now });
        // TODO ADD: Make scroll history size configurable
        if (scrollHistoryRef.current.length > 10) {
            // TODO FIX: Extract magic number 10 to configuration
            scrollHistoryRef.current.shift();
        }

        // Calculate velocity and direction
        const velocity = calculateVelocity();
        const direction = detectDirection(currentPos, scrollStateRef.current.position);

        // Track velocity samples
        velocitySamplesRef.current.push(velocity);
        if (velocitySamplesRef.current.length > 20) {
            // TODO ADD: Make velocity sample size configurable
            velocitySamplesRef.current.shift();
        }

        // Update scroll state
        scrollStateRef.current = {
            position: currentPos,
            velocity,
            direction,
            timestamp: now,
            isScrolling: true
        };

        lastDirectionRef.current = direction;

        // Update metrics
        setMetrics(prev => ({
            ...prev,
            scrollEvents: prev.scrollEvents + 1,
            velocityPeak: Math.max(prev.velocityPeak, velocity),
            averageVelocity: velocitySamplesRef.current.reduce((a, b) => a + b, 0) / velocitySamplesRef.current.length
        }));

        // Clear existing timers
        if (preloadTimerRef.current) {
            window.clearTimeout(preloadTimerRef.current);
            preloadTimerRef.current = null;
        }

        // Schedule preload based on velocity
        const delay =
            velocity > mergedConfig.minVelocityThreshold * 2
                ? mergedConfig.preloadDelay / 2 // Faster preload for fast scrolling
                : mergedConfig.preloadDelay;

        preloadTimerRef.current = window.setTimeout(() => {
            executePreload();
            scrollStateRef.current.isScrolling = false;
        }, delay);

        if (mergedConfig.debugMode) {
            console.debug(
                `useSmartScrolling.ts [SCROLL][METRICS]: pos=${currentPos.toFixed(0)}, vel=${velocity.toFixed(
                    0
                )}px/s, dir=${direction}`
            );
        }
    }, [containerRef, mergedConfig, calculateVelocity, detectDirection, executePreload]);

    /**
     * RAF-throttled scroll handler
     */
    const rafScrollHandler = useCallback(() => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
            handleScroll();
            rafRef.current = null;
        });
    }, [handleScroll]);

    /**
     * Get current overscan based on scroll state
     */
    const getDynamicOverscan = useCallback((): number => {
        return calculateDynamicOverscan(scrollStateRef.current.velocity);
    }, [calculateDynamicOverscan]);

    /**
     * Force preload for a specific range
     */
    const forcePreload = useCallback(
        (start: number, end: number) => {
            if (onPreload) {
                onPreload(start, end);
            }
        },
        [onPreload]
    );

    /**
     * Reset metrics
     */
    const resetMetrics = useCallback(() => {
        setMetrics({
            scrollEvents: 0,
            preloadTriggers: 0,
            velocityPeak: 0,
            averageVelocity: 0,
            memoryUsage: 0
        });
        velocitySamplesRef.current = [];
    }, []);

    /**
     * Setup scroll listener
     */
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !mergedConfig.enabled) {
            return;
        }

        // Use passive listener for better performance
        container.addEventListener("scroll", rafScrollHandler, { passive: true });

        // Initial preload
        executePreload();

        return () => {
            container.removeEventListener("scroll", rafScrollHandler);

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            if (preloadTimerRef.current) {
                window.clearTimeout(preloadTimerRef.current);
            }
        };
    }, [containerRef, mergedConfig.enabled, rafScrollHandler, executePreload]);

    return {
        scrollState: scrollStateRef.current,
        dynamicOverscan: getDynamicOverscan(),
        metrics,
        resetMetrics,
        forcePreload,
        isOptimizationEnabled: mergedConfig.enabled
    };
}
