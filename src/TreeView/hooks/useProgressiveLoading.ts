import { useRef, useCallback, useEffect, useState } from "react";
import { DATA_LOADING_CONSTANTS } from "../constants/treeConstants";

/**
 * Progressive loading configuration
 */
interface ProgressiveLoadingConfig {
    enabled?: boolean;
    initialLoadSize?: number; // Initial items to load
    chunkSize?: number; // Items per chunk
    loadAheadFactor?: number; // How many screens ahead to load
    unloadThreshold?: number; // Distance to unload items (screens)
    maxLoadedItems?: number; // Maximum items in memory
    debounceDelay?: number; // Debounce for load/unload operations
    cacheSize?: number; // Number of chunks to cache
    debugMode?: boolean;
}

/**
 * Load state for a chunk
 */
interface ChunkState {
    start: number;
    end: number;
    loaded: boolean;
    loading: boolean;
    lastAccessed: number;
    priority: number;
}

/**
 * Progressive loading metrics
 */
interface LoadingMetrics {
    totalChunks: number;
    loadedChunks: number;
    cachedChunks: number;
    loadOperations: number;
    unloadOperations: number;
    averageLoadTime: number;
}

const DEFAULT_CONFIG: Required<ProgressiveLoadingConfig> = {
    enabled: true,
    initialLoadSize: DATA_LOADING_CONSTANTS.INITIAL_LOAD_SIZE,
    chunkSize: DATA_LOADING_CONSTANTS.DEFAULT_CHUNK_SIZE,
    loadAheadFactor: DATA_LOADING_CONSTANTS.LOAD_AHEAD_FACTOR,
    unloadThreshold: DATA_LOADING_CONSTANTS.UNLOAD_THRESHOLD,
    maxLoadedItems: DATA_LOADING_CONSTANTS.MAX_LOADED_ITEMS,
    debounceDelay: 100,
    cacheSize: 10,
    debugMode: false
};

/**
 * Hook for progressive data loading with memory management
 * Efficiently loads and unloads data chunks based on viewport
 */
export function useProgressiveLoading<T>(
    totalItems: number,
    _itemHeight: number,
    visibleCount: number,
    fetchChunk: (start: number, end: number) => Promise<T[]>,
    config: ProgressiveLoadingConfig = {}
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // State
    const [loadedData, setLoadedData] = useState<Map<number, T>>(new Map());
    const [metrics, setMetrics] = useState<LoadingMetrics>({
        totalChunks: 0,
        loadedChunks: 0,
        cachedChunks: 0,
        loadOperations: 0,
        unloadOperations: 0,
        averageLoadTime: 0
    });

    // Refs for performance
    const chunksRef = useRef<Map<string, ChunkState>>(new Map());
    const loadQueueRef = useRef<Set<string>>(new Set());
    const cacheRef = useRef<Map<string, T[]>>(new Map());
    const loadTimerRef = useRef<number | null>(null);
    const loadTimesRef = useRef<number[]>([]);
    const currentViewportRef = useRef({ start: 0, end: visibleCount });

    /**
     * Get chunk key
     */
    const getChunkKey = useCallback((start: number, end: number): string => {
        return `${start}-${end}`;
    }, []);

    /**
     * Calculate chunk boundaries for an index
     */
    const getChunkBounds = useCallback(
        (index: number): { start: number; end: number } => {
            const chunkIndex = Math.floor(index / mergedConfig.chunkSize);
            const start = chunkIndex * mergedConfig.chunkSize;
            const end = Math.min(start + mergedConfig.chunkSize, totalItems);
            return { start, end };
        },
        [mergedConfig.chunkSize, totalItems]
    );

    /**
     * Calculate which chunks should be loaded based on viewport
     */
    const calculateRequiredChunks = useCallback(
        (viewportStart: number, viewportEnd: number): string[] => {
            const requiredChunks: string[] = [];

            // Calculate extended range with load-ahead
            const screenSize = viewportEnd - viewportStart;
            const extendedStart = Math.max(0, viewportStart - screenSize * mergedConfig.loadAheadFactor);
            const extendedEnd = Math.min(totalItems, viewportEnd + screenSize * mergedConfig.loadAheadFactor);

            // Get all chunks in extended range
            for (let i = extendedStart; i < extendedEnd; i += mergedConfig.chunkSize) {
                const bounds = getChunkBounds(i);
                requiredChunks.push(getChunkKey(bounds.start, bounds.end));
            }

            return requiredChunks;
        },
        [mergedConfig, totalItems, getChunkBounds, getChunkKey]
    );

    /**
     * Calculate chunks that can be unloaded
     */
    const calculateUnloadableChunks = useCallback(
        (viewportStart: number, viewportEnd: number): string[] => {
            const unloadable: string[] = [];
            const screenSize = viewportEnd - viewportStart;
            const keepStart = viewportStart - screenSize * mergedConfig.unloadThreshold;
            const keepEnd = viewportEnd + screenSize * mergedConfig.unloadThreshold;

            chunksRef.current.forEach((chunk, key) => {
                if (chunk.loaded && (chunk.end < keepStart || chunk.start > keepEnd)) {
                    unloadable.push(key);
                }
            });

            return unloadable;
        },
        [mergedConfig.unloadThreshold]
    );

    /**
     * Load a chunk of data
     */
    const loadChunk = useCallback(
        async (chunkKey: string) => {
            const [start, end] = chunkKey.split("-").map(Number);

            // Check cache first
            if (cacheRef.current.has(chunkKey)) {
                const cachedData = cacheRef.current.get(chunkKey)!;
                const newData = new Map(loadedData);
                cachedData.forEach((item, index) => {
                    newData.set(start + index, item);
                });
                setLoadedData(newData);

                // Update chunk state
                chunksRef.current.set(chunkKey, {
                    start,
                    end,
                    loaded: true,
                    loading: false,
                    lastAccessed: Date.now(),
                    priority: 0
                });

                return;
            }

            // Mark as loading
            chunksRef.current.set(chunkKey, {
                start,
                end,
                loaded: false,
                loading: true,
                lastAccessed: Date.now(),
                priority: 0
            });

            try {
                const startTime = Date.now();
                const chunkData = await fetchChunk(start, end);
                const loadTime = Date.now() - startTime;

                // Track load times
                loadTimesRef.current.push(loadTime);
                // TODO ADD: Make load time history size configurable
                if (loadTimesRef.current.length > 10) {
                    // TODO FIX: Extract magic number 10 to configuration
                    loadTimesRef.current.shift();
                }

                // Update loaded data
                const newData = new Map(loadedData);
                chunkData.forEach((item, index) => {
                    newData.set(start + index, item);
                });
                setLoadedData(newData);

                // Cache the chunk
                cacheRef.current.set(chunkKey, chunkData);

                // Manage cache size
                if (cacheRef.current.size > mergedConfig.cacheSize) {
                    const sortedCache = Array.from(cacheRef.current.entries()).sort((a, b) => {
                        const chunkA = chunksRef.current.get(a[0]);
                        const chunkB = chunksRef.current.get(b[0]);
                        return (chunkA?.lastAccessed || 0) - (chunkB?.lastAccessed || 0);
                    });

                    // Remove oldest cached chunks
                    const toRemove = sortedCache.slice(0, sortedCache.length - mergedConfig.cacheSize);
                    toRemove.forEach(([key]) => cacheRef.current.delete(key));
                }

                // Update chunk state
                chunksRef.current.set(chunkKey, {
                    start,
                    end,
                    loaded: true,
                    loading: false,
                    lastAccessed: Date.now(),
                    priority: 0
                });

                // Update metrics
                setMetrics(prev => ({
                    ...prev,
                    loadedChunks: Array.from(chunksRef.current.values()).filter(c => c.loaded).length,
                    cachedChunks: cacheRef.current.size,
                    loadOperations: prev.loadOperations + 1,
                    averageLoadTime: loadTimesRef.current.reduce((a, b) => a + b, 0) / loadTimesRef.current.length
                }));

                if (mergedConfig.debugMode) {
                    console.debug(
                        `useProgressiveLoading.ts [LOADING][CHUNK_LOAD]: Loaded chunk ${chunkKey} in ${loadTime}ms`
                    );
                }
            } catch (error) {
                console.error(`Failed to load chunk ${chunkKey}:`, error);
                // TODO ADD: Implement retry logic with exponential backoff
                // TODO ADD: Track failed chunks for potential reload

                // Mark as not loading
                chunksRef.current.set(chunkKey, {
                    start,
                    end,
                    loaded: false,
                    loading: false,
                    lastAccessed: Date.now(),
                    priority: 0
                });
            }
        },
        [loadedData, fetchChunk, mergedConfig]
    );

    /**
     * Unload a chunk of data
     */
    const unloadChunk = useCallback(
        (chunkKey: string) => {
            const [start, end] = chunkKey.split("-").map(Number);

            // Remove from loaded data
            const newData = new Map(loadedData);
            for (let i = start; i < end; i++) {
                newData.delete(i);
            }
            setLoadedData(newData);

            // Update chunk state
            chunksRef.current.delete(chunkKey);

            // Update metrics
            setMetrics(prev => ({
                ...prev,
                loadedChunks: Array.from(chunksRef.current.values()).filter(c => c.loaded).length,
                unloadOperations: prev.unloadOperations + 1
            }));

            if (mergedConfig.debugMode) {
                console.debug(`useProgressiveLoading.ts [LOADING][CHUNK_UNLOAD]: Unloaded chunk ${chunkKey}`);
            }
        },
        [loadedData, mergedConfig.debugMode]
    );

    /**
     * Process load queue
     */
    const processLoadQueue = useCallback(async () => {
        const queue = Array.from(loadQueueRef.current);
        loadQueueRef.current.clear();

        // Sort by priority (distance from viewport)
        queue.sort((a, b) => {
            const chunkA = chunksRef.current.get(a);
            const chunkB = chunksRef.current.get(b);
            return (chunkA?.priority || 0) - (chunkB?.priority || 0);
        });

        // Load chunks sequentially to avoid overwhelming the server
        // TODO ADD: Support parallel loading with configurable concurrency limit
        // TODO ADD: Implement request cancellation for chunks that are no longer needed
        for (const chunkKey of queue) {
            const chunk = chunksRef.current.get(chunkKey);
            if (!chunk || chunk.loaded || chunk.loading) {
                continue;
            }

            await loadChunk(chunkKey);
        }
    }, [loadChunk]);

    /**
     * Update viewport and manage loading/unloading
     */
    const updateViewport = useCallback(
        (start: number, end: number) => {
            currentViewportRef.current = { start, end };

            if (!mergedConfig.enabled) {
                return;
            }

            // Clear existing timer
            if (loadTimerRef.current) {
                window.clearTimeout(loadTimerRef.current);
                loadTimerRef.current = null;
            }

            // Calculate required chunks
            const requiredChunks = calculateRequiredChunks(start, end);

            // Calculate priority based on distance from viewport
            requiredChunks.forEach(chunkKey => {
                const [chunkStart] = chunkKey.split("-").map(Number);
                const distance = Math.min(Math.abs(chunkStart - start), Math.abs(chunkStart - end));

                if (!chunksRef.current.has(chunkKey)) {
                    chunksRef.current.set(chunkKey, {
                        start: chunkStart,
                        end: chunkStart + mergedConfig.chunkSize,
                        loaded: false,
                        loading: false,
                        lastAccessed: Date.now(),
                        priority: distance
                    });
                }
            });

            // Queue chunks for loading
            requiredChunks.forEach(chunkKey => {
                const chunk = chunksRef.current.get(chunkKey);
                if (chunk && !chunk.loaded && !chunk.loading) {
                    loadQueueRef.current.add(chunkKey);
                }
            });

            // Calculate unloadable chunks if we're over the limit
            if (loadedData.size > mergedConfig.maxLoadedItems) {
                const unloadable = calculateUnloadableChunks(start, end);
                unloadable.forEach(chunkKey => unloadChunk(chunkKey));
            }

            // Schedule load processing
            loadTimerRef.current = window.setTimeout(() => {
                processLoadQueue();
            }, mergedConfig.debounceDelay);

            // Update metrics
            setMetrics(prev => ({
                ...prev,
                totalChunks: Math.ceil(totalItems / mergedConfig.chunkSize)
            }));
        },
        [
            mergedConfig,
            calculateRequiredChunks,
            calculateUnloadableChunks,
            loadedData.size,
            unloadChunk,
            processLoadQueue,
            totalItems
        ]
    );

    /**
     * Get item by index
     */
    const getItem = useCallback(
        (index: number): T | undefined => {
            // Update last accessed time for the chunk
            const bounds = getChunkBounds(index);
            const chunkKey = getChunkKey(bounds.start, bounds.end);
            const chunk = chunksRef.current.get(chunkKey);

            if (chunk) {
                chunk.lastAccessed = Date.now();
            }

            return loadedData.get(index);
        },
        [loadedData, getChunkBounds, getChunkKey]
    );

    /**
     * Check if an item is loaded
     */
    const isItemLoaded = useCallback(
        (index: number): boolean => {
            return loadedData.has(index);
        },
        [loadedData]
    );

    /**
     * Check if a range is loaded
     */
    const isRangeLoaded = useCallback(
        (start: number, end: number): boolean => {
            for (let i = start; i < end; i++) {
                if (!loadedData.has(i)) {
                    return false;
                }
            }
            return true;
        },
        [loadedData]
    );

    /**
     * Force load a specific range
     */
    const forceLoadRange = useCallback(
        async (start: number, end: number) => {
            const chunks: string[] = [];

            for (let i = start; i < end; i += mergedConfig.chunkSize) {
                const bounds = getChunkBounds(i);
                chunks.push(getChunkKey(bounds.start, bounds.end));
            }

            for (const chunkKey of chunks) {
                const chunk = chunksRef.current.get(chunkKey);
                if (!chunk || (!chunk.loaded && !chunk.loading)) {
                    await loadChunk(chunkKey);
                }
            }
        },
        [mergedConfig.chunkSize, getChunkBounds, getChunkKey, loadChunk]
    );

    /**
     * Reset all loaded data
     */
    const reset = useCallback(() => {
        setLoadedData(new Map());
        chunksRef.current.clear();
        cacheRef.current.clear();
        loadQueueRef.current.clear();

        if (loadTimerRef.current) {
            window.clearTimeout(loadTimerRef.current);
            loadTimerRef.current = null;
        }

        setMetrics({
            totalChunks: 0,
            loadedChunks: 0,
            cachedChunks: 0,
            loadOperations: 0,
            unloadOperations: 0,
            averageLoadTime: 0
        });
    }, []);

    /**
     * Initial load
     */
    useEffect(() => {
        if (mergedConfig.enabled && totalItems > 0) {
            updateViewport(0, Math.min(mergedConfig.initialLoadSize, totalItems));
        }
    }, [mergedConfig.enabled, mergedConfig.initialLoadSize, totalItems, updateViewport]);

    /**
     * Cleanup
     */
    useEffect(() => {
        return () => {
            if (loadTimerRef.current) {
                window.clearTimeout(loadTimerRef.current);
            }
        };
    }, []);

    return {
        loadedData,
        getItem,
        isItemLoaded,
        isRangeLoaded,
        updateViewport,
        forceLoadRange,
        reset,
        metrics,
        isLoadingEnabled: mergedConfig.enabled
    };
}
