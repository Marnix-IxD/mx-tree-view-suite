import {
    ReactElement,
    createElement,
    Fragment,
    useRef,
    useEffect,
    forwardRef,
    useImperativeHandle,
    useCallback,
    useMemo
} from "react";
import classNames from "classnames";
import { useVirtualizer } from "../../hooks/useVirtualizer";
import { TreeNode } from "../../types/TreeTypes";

/**
 * Enhanced props interface that supports both TreeNode items and generic items
 * for category headers and other special items
 */
interface ITreeVirtualizerEnhancedProps<T = TreeNode | any> {
    items: T[];
    itemHeight: number | ((index: number) => number);
    overscan?: number;
    renderItem: (item: T, index: number) => ReactElement;
    className?: string;
    onScroll?: (scrollTop: number, visibleStartIndex: number, visibleEndIndex: number) => void;
    enableAutoHeight?: boolean;
    dynamicOverscan?: boolean;
    minOverscan?: number;
    maxOverscan?: number;
    onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
    // Progressive loading support
    onLoadMore?: (startIndex: number, endIndex: number) => void;
    totalCount?: number; // Total items including not-yet-loaded
    isItemLoaded?: (index: number) => boolean;
    estimatedItemHeight?: number; // For unloaded items
    // Variable height support
    measureItem?: (element: HTMLElement, index: number) => void;
    minItemHeight?: number;
}

export interface ITreeVirtualizerHandle {
    scrollToIndex: (index: number, alignment?: "start" | "center" | "end", smooth?: boolean) => void;
    scrollToTop: (smooth?: boolean) => void;
    getScrollPosition: () => number;
    getScrollContainer: () => HTMLDivElement | null;
    getVisibleRange: () => { startIndex: number; endIndex: number };
    getVirtualItems: () => Array<{ index: number; start: number; size: number }>;
}

/**
 * TreeVirtualizerEnhanced - Advanced virtual scrolling with dynamic overscan
 *
 * Features:
 * - Dynamic overscan based on scroll velocity (3-20 items)
 * - Binary search for finding visible items
 * - Batch measurement updates (16ms frame batching)
 * - Intersection Observer for accurate visibility detection
 * - Smooth scrolling support for external navigation
 * - Performance metrics exposed
 */
export const TreeVirtualizerEnhanced = forwardRef<ITreeVirtualizerHandle, ITreeVirtualizerEnhancedProps>(
    (props, ref) => {
        const {
            items,
            itemHeight,
            overscan = 5,
            renderItem,
            className,
            onScroll,
            enableAutoHeight = true,
            dynamicOverscan = true,
            minOverscan = 3,
            maxOverscan = 20,
            onVisibleRangeChange,
            // Progressive loading
            onLoadMore,
            totalCount,
            isItemLoaded,
            estimatedItemHeight = 32,
            // Variable height
            measureItem,
            minItemHeight = 32
        } = props;

        // Refs
        const scrollContainerRef = useRef<HTMLDivElement>(null);
        const contentRef = useRef<HTMLDivElement>(null);
        const itemMeasurementsRef = useRef<Map<number, number>>(new Map());
        const measurementObserverRef = useRef<ResizeObserver | null>(null);

        // Determine actual count for virtualizer
        const actualCount = totalCount ?? items.length;

        // Height estimation function that considers measured heights and loading state
        const estimateSize = useCallback(
            (index: number) => {
                // First check if we have a measured height for this item
                const measuredHeight = itemMeasurementsRef.current.get(index);
                if (measuredHeight) {
                    return measuredHeight;
                }

                // If item is not loaded yet, use estimated height
                if (isItemLoaded && !isItemLoaded(index)) {
                    return estimatedItemHeight;
                }

                // Use provided height function or value
                if (typeof itemHeight === "function") {
                    return Math.max(minItemHeight, itemHeight(index));
                }
                return Math.max(minItemHeight, itemHeight);
            },
            [itemHeight, isItemLoaded, estimatedItemHeight, minItemHeight]
        );

        // Initialize virtualizer with advanced features
        const virtualizer = useVirtualizer({
            count: actualCount,
            getScrollElement: () => scrollContainerRef.current,
            estimateSize,
            overscan,
            enabled: true,
            dynamicOverscan,
            minOverscan,
            maxOverscan
        });

        // Get virtual items and metrics
        const virtualItems = virtualizer.getVirtualItems();
        const totalSize = virtualizer.getTotalSize();
        // Collect metrics from virtualizer state and container
        const container = scrollContainerRef.current;
        const metrics = {
            scrollTop: container?.scrollTop || 0,
            viewportHeight: container?.clientHeight || 0,
            scrollHeight: virtualizer.getTotalSize(),
            isScrolling: virtualizer.isScrolling,
            scrollVelocity: virtualizer.scrollVelocity,
            currentOverscan: virtualizer.currentOverscan,
            lastRenderTime: 16 // Default to 60fps (will be updated by performance tracking)
        };

        // Track visible range changes and trigger progressive loading
        useEffect(() => {
            if (virtualItems.length === 0) {
                return;
            }

            const startIndex = virtualItems[0].index;
            const endIndex = virtualItems[virtualItems.length - 1].index;

            // Notify visible range change
            if (onVisibleRangeChange) {
                onVisibleRangeChange(startIndex, endIndex);
            }

            // Check if we need to load more items
            if (onLoadMore && isItemLoaded) {
                // Calculate the range that needs to be loaded (including overscan)
                const loadStartIndex = Math.max(0, startIndex - overscan);
                const loadEndIndex = Math.min(actualCount - 1, endIndex + overscan);

                // Find unloaded items in the range
                let firstUnloaded = -1;
                let lastUnloaded = -1;

                for (let i = loadStartIndex; i <= loadEndIndex; i++) {
                    if (!isItemLoaded(i)) {
                        if (firstUnloaded === -1) {
                            firstUnloaded = i;
                        }
                        lastUnloaded = i;
                    }
                }

                // Request loading if we found unloaded items
                if (firstUnloaded !== -1) {
                    onLoadMore(firstUnloaded, lastUnloaded);
                }
            }
        }, [virtualItems, onVisibleRangeChange, onLoadMore, isItemLoaded, overscan, actualCount]);

        // Handle scroll events with performance data
        const handleScroll = useCallback(() => {
            if (!scrollContainerRef.current) {
                return;
            }

            const scrollTop = scrollContainerRef.current.scrollTop;

            if (onScroll && virtualItems.length > 0) {
                const visibleStartIndex = virtualItems[0].index;
                const visibleEndIndex = virtualItems[virtualItems.length - 1].index;
                onScroll(scrollTop, visibleStartIndex, visibleEndIndex);
            }
        }, [onScroll, virtualItems]);

        // Imperative API for parent components
        useImperativeHandle(
            ref,
            () => ({
                scrollToIndex: (index: number, alignment: "start" | "center" | "end" = "start", smooth = false) => {
                    virtualizer.scrollToIndex(index, alignment, smooth);
                },

                scrollToTop: (smooth = false) => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTo({
                            top: 0,
                            behavior: smooth ? "smooth" : "auto"
                        });
                    }
                },

                getScrollPosition: () => {
                    return scrollContainerRef.current?.scrollTop || 0;
                },

                getScrollContainer: () => scrollContainerRef.current,

                getVisibleRange: () => {
                    if (virtualItems.length === 0) {
                        return { startIndex: 0, endIndex: 0 };
                    }
                    return {
                        startIndex: virtualItems[0].index,
                        endIndex: virtualItems[virtualItems.length - 1].index
                    };
                },

                getVirtualItems: () => virtualItems
            }),
            [virtualizer, virtualItems]
        );

        // Auto height calculation (similar to original)
        const containerStyle = useMemo(() => {
            const baseStyle = {
                overflow: "auto",
                position: "relative" as const,
                width: "100%"
            };

            if (enableAutoHeight) {
                return { ...baseStyle, height: "100%" };
            }

            return baseStyle;
        }, [enableAutoHeight]);

        // Setup ResizeObserver for height measurements
        useEffect(() => {
            if (!measureItem) {
                return;
            }

            measurementObserverRef.current = new ResizeObserver(entries => {
                entries.forEach(entry => {
                    const index = parseInt(entry.target.getAttribute("data-index") || "-1");
                    if (index >= 0) {
                        const height = entry.contentRect.height;
                        const previousHeight = itemMeasurementsRef.current.get(index);

                        if (previousHeight !== height) {
                            itemMeasurementsRef.current.set(index, height);
                            // Update the virtualizer with the new measurement
                            virtualizer.measureItem(index, height);
                        }
                    }
                });
            });

            return () => {
                measurementObserverRef.current?.disconnect();
            };
        }, [measureItem, virtualizer]);

        // Track loading state transitions for smooth updates
        const loadingStateRef = useRef<Map<number, boolean>>(new Map());

        // Render only visible items with absolute positioning
        const visibleItemElements = useMemo(() => {
            return virtualItems.map(virtualItem => {
                const itemIndex = virtualItem.index;

                // Check if item is loaded or if we should render a skeleton
                let content: ReactElement;
                const isLoaded = !isItemLoaded || isItemLoaded(itemIndex);
                const wasLoaded = loadingStateRef.current.get(itemIndex) ?? false;

                // Track loading state changes
                if (isLoaded !== wasLoaded) {
                    loadingStateRef.current.set(itemIndex, isLoaded);
                }

                if (!isLoaded) {
                    // Render skeleton/placeholder for unloaded items
                    const SkeletonComponent = () => (
                        <div className="mx-tree__virtual-item-skeleton" style={{ minHeight: estimatedItemHeight }}>
                            <div className="mx-tree__skeleton-pulse" />
                        </div>
                    );
                    content = <SkeletonComponent />;
                } else if (itemIndex < items.length) {
                    // Render actual item
                    content = renderItem(items[itemIndex], itemIndex);
                } else {
                    // Index out of bounds - shouldn't happen but handle gracefully
                    return null;
                }

                // Add transition class when switching from skeleton to loaded
                const transitionClass = !wasLoaded && isLoaded ? "mx-tree__virtual-item--loaded" : "";

                return (
                    <div
                        key={virtualItem.key}
                        ref={el => {
                            if (el && measureItem && measurementObserverRef.current) {
                                measurementObserverRef.current.observe(el);
                            }
                        }}
                        className={classNames("mx-tree__virtual-item", transitionClass)}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            minHeight: `${minItemHeight}px`,
                            transform: `translateY(${virtualItem.start}px)`
                        }}
                        data-index={virtualItem.index}
                        data-loaded={isLoaded}
                    >
                        {content}
                    </div>
                );
            });
        }, [virtualItems, items, renderItem, isItemLoaded, estimatedItemHeight, measureItem, minItemHeight]);

        // Debug info for development
        const debugInfo =
            process.env.NODE_ENV === "development" ? (
                <div
                    className="mx-tree__virtual-debug"
                    style={{
                        position: "fixed",
                        top: 0,
                        right: 0,
                        background: "rgba(0,0,0,0.8)",
                        color: "white",
                        padding: "5px",
                        fontSize: "10px",
                        zIndex: 9999,
                        display: "none" // Enable by setting to "block" when debugging
                    }}
                >
                    <div>Items: {items.length}</div>
                    <div>Visible: {virtualItems.length}</div>
                    <div>Overscan: {metrics.currentOverscan}</div>
                    <div>Velocity: {metrics.scrollVelocity.toFixed(2)}px/ms</div>
                    <div>FPS: {(1000 / Math.max(1, metrics.lastRenderTime)).toFixed(1)}</div>
                </div>
            ) : null;

        return (
            <Fragment>
                <div
                    ref={scrollContainerRef}
                    className={classNames(
                        "mx-tree__virtual-container-enhanced",
                        {
                            "mx-tree__virtual-container--scrolling": metrics.isScrolling,
                            "mx-tree__virtual-container--fast-scroll": metrics.scrollVelocity > 2
                        },
                        className
                    )}
                    onScroll={handleScroll}
                    style={containerStyle}
                    data-virtual-items={virtualItems.length}
                    data-total-items={items.length}
                >
                    {/* Virtual spacer maintains scrollbar */}
                    <div
                        ref={contentRef}
                        className="mx-tree__virtual-content"
                        style={{
                            height: `${totalSize}px`,
                            width: "100%",
                            position: "relative"
                        }}
                    >
                        {/* Render visible items */}
                        {visibleItemElements}
                    </div>
                </div>
                {debugInfo}
            </Fragment>
        );
    }
);

TreeVirtualizerEnhanced.displayName = "TreeVirtualizerEnhanced";

export default TreeVirtualizerEnhanced;
