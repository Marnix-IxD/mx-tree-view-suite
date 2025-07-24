import { useCallback, useEffect, useRef, useState } from "react";

interface VirtualizerOptions {
    count: number;
    getScrollElement: () => HTMLElement | null;
    estimateSize: (index: number) => number;
    overscan?: number;
    enabled?: boolean;
    dynamicOverscan?: boolean;
    minOverscan?: number;
    maxOverscan?: number;
}

interface VirtualItem {
    key: string | number;
    index: number;
    start: number;
    size: number;
}

export function useVirtualizer(options: VirtualizerOptions) {
    const {
        count,
        getScrollElement,
        estimateSize,
        overscan = 5,
        enabled = true,
        dynamicOverscan = true,
        minOverscan = 3,
        maxOverscan = 20
    } = options;

    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    const [currentOverscan, setCurrentOverscan] = useState(overscan);
    const scrollElementRef = useRef<HTMLElement | null>(null);
    const measurementsRef = useRef<Map<number, number>>(new Map());
    const scrollVelocityRef = useRef(0);
    const lastScrollTimeRef = useRef(Date.now());
    const scrollPositionHistoryRef = useRef<number[]>([]);

    // Calculate item positions
    const getItemPosition = useCallback(
        (index: number): { start: number; size: number } => {
            let start = 0;

            for (let i = 0; i < index; i++) {
                const measuredSize = measurementsRef.current.get(i);
                start += measuredSize || estimateSize(i);
            }

            const size = measurementsRef.current.get(index) || estimateSize(index);

            return { start, size };
        },
        [estimateSize]
    );

    // Get total size
    const getTotalSize = useCallback((): number => {
        let total = 0;

        for (let i = 0; i < count; i++) {
            const measuredSize = measurementsRef.current.get(i);
            total += measuredSize || estimateSize(i);
        }

        return total;
    }, [count, estimateSize]);

    // Get virtual items
    const getVirtualItems = useCallback((): VirtualItem[] => {
        if (!enabled || !containerHeight) {
            // Return all items if virtualization is disabled
            return Array.from({ length: count }, (_, i) => {
                const { start, size } = getItemPosition(i);
                return {
                    key: i,
                    index: i,
                    start,
                    size
                };
            });
        }

        const items: VirtualItem[] = [];

        // Binary search for start index
        const findStartIndex = () => {
            let low = 0;
            let high = count - 1;
            let bestIndex = 0;

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const { start } = getItemPosition(mid);

                if (start <= scrollTop) {
                    bestIndex = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            return Math.max(0, bestIndex - currentOverscan);
        };

        // Binary search for end index
        const findEndIndex = () => {
            let low = 0;
            let high = count - 1;
            let bestIndex = count - 1;
            const scrollBottom = scrollTop + containerHeight;

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const { start } = getItemPosition(mid);

                if (start <= scrollBottom) {
                    low = mid + 1;
                } else {
                    bestIndex = mid;
                    high = mid - 1;
                }
            }

            return Math.min(count - 1, bestIndex + currentOverscan);
        };

        const startIndex = findStartIndex();
        const endIndex = findEndIndex();

        // Create virtual items
        for (let i = startIndex; i <= endIndex; i++) {
            const { start, size } = getItemPosition(i);
            items.push({
                key: i,
                index: i,
                start,
                size
            });
        }

        return items;
    }, [enabled, count, containerHeight, scrollTop, currentOverscan, getItemPosition]);

    // Batch measurement updates
    const pendingMeasurementsRef = useRef<Map<number, number>>(new Map());
    const measurementTimeoutRef = useRef<number | null>(null);

    // Forward declare handleScroll
    const handleScrollRef = useRef<() => void>();

    const flushMeasurements = useCallback(() => {
        if (pendingMeasurementsRef.current.size > 0) {
            // Apply all pending measurements
            pendingMeasurementsRef.current.forEach((size, index) => {
                measurementsRef.current.set(index, size);
            });
            pendingMeasurementsRef.current.clear();

            // Trigger single re-render
            const scrollElement = getScrollElement();
            if (scrollElement && handleScrollRef.current) {
                handleScrollRef.current();
            }
        }
    }, [getScrollElement]);

    // Measure item
    const measureItem = useCallback(
        (index: number, size: number) => {
            const previousSize = measurementsRef.current.get(index);

            if (previousSize !== size) {
                // Add to pending measurements
                pendingMeasurementsRef.current.set(index, size);

                // Clear existing timeout
                if (measurementTimeoutRef.current) {
                    window.clearTimeout(measurementTimeoutRef.current);
                }

                // Batch measurements - flush after 16ms (next frame)
                measurementTimeoutRef.current = window.setTimeout(() => {
                    flushMeasurements();
                    measurementTimeoutRef.current = null;
                }, 16);
            }
        },
        [flushMeasurements]
    );

    // Calculate scroll velocity and update dynamic overscan
    const calculateVelocityAndOverscan = useCallback(
        (currentScrollTop: number) => {
            if (!dynamicOverscan) {
                return;
            }

            const now = Date.now();
            const timeDelta = now - lastScrollTimeRef.current;

            // Add current position to history
            scrollPositionHistoryRef.current.push(currentScrollTop);

            // Keep only last 10 positions for velocity calculation
            if (scrollPositionHistoryRef.current.length > 10) {
                scrollPositionHistoryRef.current.shift();
            }

            // Calculate velocity if we have enough history
            if (scrollPositionHistoryRef.current.length >= 2 && timeDelta > 0) {
                const positions = scrollPositionHistoryRef.current;
                const distance = Math.abs(positions[positions.length - 1] - positions[0]);
                const timeSpan = timeDelta * positions.length;

                // Velocity in pixels per millisecond
                const velocity = distance / timeSpan;
                scrollVelocityRef.current = velocity;

                // Calculate dynamic overscan based on velocity
                let newOverscan = overscan;

                if (velocity > 2) {
                    // Very fast scrolling
                    newOverscan = maxOverscan;
                } else if (velocity > 1) {
                    // Fast scrolling
                    newOverscan = Math.min(maxOverscan, overscan * 3);
                } else if (velocity > 0.5) {
                    // Medium scrolling
                    newOverscan = Math.min(maxOverscan, overscan * 2);
                } else if (velocity < 0.1) {
                    // Slow or stopped
                    newOverscan = minOverscan;
                }

                // Update overscan if it changed significantly
                if (Math.abs(newOverscan - currentOverscan) > 1) {
                    setCurrentOverscan(Math.round(newOverscan));
                }
            }

            lastScrollTimeRef.current = now;
        },
        [dynamicOverscan, overscan, minOverscan, maxOverscan, currentOverscan]
    );

    // Handle scroll
    const handleScroll = useCallback(() => {
        const scrollElement = getScrollElement();
        if (!scrollElement) {
            return;
        }

        const newScrollTop = scrollElement.scrollTop;
        setScrollTop(newScrollTop);
        calculateVelocityAndOverscan(newScrollTop);
    }, [getScrollElement, calculateVelocityAndOverscan]);

    // Assign to ref for use in flushMeasurements
    handleScrollRef.current = handleScroll;

    // Handle resize
    const handleResize = useCallback(() => {
        const scrollElement = getScrollElement();
        if (!scrollElement) {
            return;
        }

        setContainerHeight(scrollElement.clientHeight);
    }, [getScrollElement]);

    // Setup scroll and resize listeners
    useEffect(() => {
        const scrollElement = getScrollElement();
        if (!scrollElement || !enabled) {
            return;
        }

        scrollElementRef.current = scrollElement;

        // Initial measurements
        setScrollTop(scrollElement.scrollTop);
        setContainerHeight(scrollElement.clientHeight);

        // Add listeners
        scrollElement.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleResize);

        // Intersection observer for accurate visibility detection
        let intersectionObserver: IntersectionObserver | null = null;
        if (typeof IntersectionObserver !== "undefined") {
            intersectionObserver = new IntersectionObserver(
                entries => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            // Item is visible - ensure it's measured accurately
                            const index = parseInt(entry.target.getAttribute("data-index") || "0");
                            if (!isNaN(index)) {
                                const rect = entry.target.getBoundingClientRect();
                                measureItem(index, rect.height);
                            }
                        }
                    });
                },
                {
                    root: scrollElement,
                    rootMargin: "50px",
                    threshold: 0.01
                }
            );
        }

        // ResizeObserver for container size changes with debouncing
        let resizeObserver: ResizeObserver | null = null;
        let resizeTimeout: number | null = null;

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                // Clear existing timeout
                if (resizeTimeout) {
                    window.clearTimeout(resizeTimeout);
                }

                // Debounce resize events - 150ms delay
                resizeTimeout = window.setTimeout(() => {
                    handleResize();
                    resizeTimeout = null;
                }, 150);
            });
            resizeObserver.observe(scrollElement);
        }

        return () => {
            scrollElement.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
            resizeObserver?.disconnect();
            intersectionObserver?.disconnect();
            if (resizeTimeout) {
                window.clearTimeout(resizeTimeout);
            }
            if (measurementTimeoutRef.current) {
                window.clearTimeout(measurementTimeoutRef.current);
            }
        };
    }, [getScrollElement, enabled, handleScroll, handleResize]);

    // Scroll to index with smooth scrolling support
    const scrollToIndex = useCallback(
        (index: number, align: "start" | "center" | "end" = "start", smooth = true) => {
            const scrollElement = getScrollElement();
            if (!scrollElement) {
                return;
            }

            const { start, size } = getItemPosition(index);
            let scrollPosition = start;

            if (align === "center") {
                scrollPosition = start - (containerHeight - size) / 2;
            } else if (align === "end") {
                scrollPosition = start - containerHeight + size;
            }

            scrollPosition = Math.max(0, scrollPosition);

            if (smooth && "scrollBehavior" in document.documentElement.style) {
                // Use native smooth scrolling if available
                scrollElement.scrollTo({
                    top: scrollPosition,
                    behavior: "smooth"
                });
            } else {
                // Fallback to instant scroll or implement custom smooth scrolling
                const startScroll = scrollElement.scrollTop;
                const distance = scrollPosition - startScroll;
                const duration = Math.min(500, Math.abs(distance) * 0.5); // Max 500ms
                const startTime = performance.now();

                const animateScroll = (currentTime: number) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);

                    // Easing function for smooth animation
                    const easeProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

                    scrollElement.scrollTop = startScroll + distance * easeProgress;

                    if (progress < 1) {
                        requestAnimationFrame(animateScroll);
                    }
                };

                if (smooth && duration > 0) {
                    requestAnimationFrame(animateScroll);
                } else {
                    scrollElement.scrollTop = scrollPosition;
                }
            }
        },
        [getScrollElement, getItemPosition, containerHeight]
    );

    // Scroll to offset
    const scrollToOffset = useCallback(
        (offset: number) => {
            const scrollElement = getScrollElement();
            if (!scrollElement) {
                return;
            }

            scrollElement.scrollTop = offset;
        },
        [getScrollElement]
    );

    return {
        getVirtualItems,
        getTotalSize,
        scrollToIndex,
        scrollToOffset,
        measureItem,
        // Performance metrics
        scrollVelocity: scrollVelocityRef.current,
        currentOverscan,
        isScrolling: scrollVelocityRef.current > 0.1
    };
}
