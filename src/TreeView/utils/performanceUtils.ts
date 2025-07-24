import { setTimer, clearTimer, TimerId } from "./timers";

/**
 * Debounce function to limit execution frequency
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: TimerId | null = null;

    return function debounced(...args: Parameters<T>) {
        clearTimer(timeout);

        timeout = setTimer(() => {
            func(...args);
        }, wait);
    };
}

/**
 * Throttle function to limit execution frequency
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return function throttled(...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimer(() => {
                inThrottle = false;
            }, limit);
        }
    };
}

/**
 * Request idle callback polyfill
 */
export const requestIdleCallback =
    typeof window !== "undefined" && window.requestIdleCallback
        ? window.requestIdleCallback
        : (callback: IdleRequestCallback) => {
              const start = Date.now();
              return setTimer(() => {
                  callback({
                      didTimeout: false,
                      timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
                  });
              }, 1) as unknown as number;
          };

/**
 * Cancel idle callback polyfill
 */
export const cancelIdleCallback =
    typeof window !== "undefined" && window.cancelIdleCallback
        ? window.cancelIdleCallback
        : (id: number) => clearTimer(id as unknown as TimerId);

/**
 * Batch updates for better performance
 */
export class BatchProcessor<T> {
    private items: T[] = [];
    private processing = false;
    private processor: (items: T[]) => void;
    private delay: number;
    private timeout: TimerId | null = null;

    constructor(processor: (items: T[]) => void, delay = 16) {
        this.processor = processor;
        this.delay = delay;
    }

    add(item: T) {
        this.items.push(item);
        this.scheduleProcess();
    }

    private scheduleProcess() {
        clearTimer(this.timeout);

        this.timeout = setTimer(() => {
            this.process();
        }, this.delay);
    }

    private process() {
        if (this.processing || this.items.length === 0) {
            return;
        }

        this.processing = true;
        const batch = this.items.splice(0, this.items.length);

        requestIdleCallback(() => {
            this.processor(batch);
            this.processing = false;

            if (this.items.length > 0) {
                this.scheduleProcess();
            }
        });
    }

    flush() {
        clearTimer(this.timeout);
        this.process();
    }
}

/**
 * Execute heavy operations in chunks using requestAnimationFrame
 * This provides better browser support than requestIdleCallback (especially Safari)
 */
export async function executeWithRAFChunking<T>(
    operation: (chunk: any[]) => T[],
    chunkSize = 100,
    onProgress?: (progress: { processed: number; total: number; operation: string }) => void,
    data?: any[]
): Promise<T[]> {
    if (!data || data.length === 0) {
        return [];
    }

    const results: T[] = [];
    let processed = 0;
    const total = data.length;

    // Process data in chunks
    for (let i = 0; i < total; i += chunkSize) {
        const chunk = data.slice(i, Math.min(i + chunkSize, total));

        // Wait for next animation frame
        await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
                // Process chunk
                const chunkResults = operation(chunk);
                results.push(...chunkResults);
                processed += chunk.length;

                // Report progress
                if (onProgress) {
                    onProgress({
                        processed,
                        total,
                        operation: "processing"
                    });
                }

                resolve();
            });
        });
    }

    return results;
}

/**
 * Performance-optimized tree traversal with RAF chunking
 */
export async function traverseTreeWithRAF<T>(
    tree: T[],
    visitor: (node: T, depth: number) => void,
    getChildren: (node: T) => T[],
    chunkSize = 50
): Promise<void> {
    const queue: Array<{ node: T; depth: number }> = tree.map(node => ({ node, depth: 0 }));
    let processed = 0;

    while (queue.length > 0) {
        // Process a chunk of nodes
        const chunk = queue.splice(0, Math.min(chunkSize, queue.length));

        await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
                chunk.forEach(({ node, depth }) => {
                    visitor(node, depth);

                    // Add children to queue
                    const children = getChildren(node);
                    if (children && children.length > 0) {
                        queue.push(
                            ...children.map(child => ({
                                node: child,
                                depth: depth + 1
                            }))
                        );
                    }
                });

                processed += chunk.length;
                resolve();
            });
        });
    }
}

/**
 * Measure performance of an operation
 */
export async function measurePerformance<T>(
    operation: () => T | Promise<T>,
    label: string,
    debugMode = false
): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await operation();
    const duration = performance.now() - start;

    if (debugMode) {
        console.debug(`performanceUtils.ts [PERFORMANCE][MEASURE]: ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
}

/**
 * Memory-efficient array chunking
 */
export function* chunkArray<T>(array: T[], chunkSize: number): Generator<T[]> {
    for (let i = 0; i < array.length; i += chunkSize) {
        yield array.slice(i, i + chunkSize);
    }
}
