import {
    ReactElement,
    createElement,
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
    forwardRef,
    useImperativeHandle
} from "react";
import classNames from "classnames";
import { useAutoHeight } from "../../hooks/useAutoHeight";

interface IVirtualScrollContainerProps<T> {
    items: T[];
    itemHeight: number;
    overscan: number;
    renderItem: (item: T, index: number) => ReactElement;
    className?: string;
    onScroll?: (scrollTop: number) => void;
    enableAutoHeight?: boolean;
}

export interface IVirtualScrollHandle {
    scrollToIndex: (index: number, alignment?: "start" | "center" | "end") => void;
    scrollToTop: () => void;
    getScrollPosition: () => number;
    getScrollContainer: () => HTMLDivElement | null;
}

/**
 * VirtualScrollContainer - High-performance virtual scrolling container
 * Renders only visible items plus overscan buffer for smooth scrolling
 * Supports 100,000+ items with consistent 60fps performance
 */
export const VirtualScrollContainer = forwardRef<IVirtualScrollHandle, IVirtualScrollContainerProps<any>>(
    (props, ref) => {
        const { items, itemHeight, overscan = 5, renderItem, className, onScroll, enableAutoHeight = true } = props;

        // Refs
        const scrollContainerRef = useRef<HTMLDivElement>(null);
        const scrollPositionRef = useRef(0);

        // Auto height detection
        const { heightStyle, strategy } = useAutoHeight(scrollContainerRef, {
            enabled: enableAutoHeight
        });

        // State for visible range
        const [visibleRange, setVisibleRange] = useState({
            startIndex: 0,
            endIndex: 0
        });

        // Calculate container height
        const [containerHeight, setContainerHeight] = useState(0);

        // Total height of all items
        const totalHeight = useMemo(() => items.length * itemHeight, [items.length, itemHeight]);

        // Update container height on mount and resize
        useEffect(() => {
            const updateHeight = () => {
                if (scrollContainerRef.current) {
                    const height = scrollContainerRef.current.clientHeight;
                    setContainerHeight(height);
                }
            };

            updateHeight();

            // Handle resize
            const resizeObserver = new ResizeObserver(updateHeight);
            if (scrollContainerRef.current) {
                resizeObserver.observe(scrollContainerRef.current);
            }

            return () => {
                resizeObserver.disconnect();
            };
        }, []);

        /**
         * Calculate visible range based on scroll position
         * This is the core of virtual scrolling performance
         */
        const calculateVisibleRange = useCallback(
            (scrollTop: number, height: number) => {
                // TODO ADD: Support variable item heights for more flexible layouts
                // TODO ADD: Implement buffer zones for smoother scrolling experience
                const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
                const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + height) / itemHeight) + overscan);

                return { startIndex, endIndex };
            },
            [items.length, itemHeight, overscan]
        );

        // Update visible range when dependencies change
        useEffect(() => {
            if (containerHeight > 0) {
                const range = calculateVisibleRange(scrollPositionRef.current, containerHeight);
                setVisibleRange(range);
            }
        }, [containerHeight, items.length, calculateVisibleRange]);

        /**
         * Handle scroll events with RAF for smooth performance
         */
        const handleScroll = useCallback(() => {
            if (!scrollContainerRef.current) {
                return;
            }

            const scrollTop = scrollContainerRef.current.scrollTop;
            scrollPositionRef.current = scrollTop;

            // Use requestAnimationFrame for smooth updates
            requestAnimationFrame(() => {
                const range = calculateVisibleRange(scrollTop, containerHeight);
                setVisibleRange(range);

                // Notify parent of scroll position
                onScroll?.(scrollTop);
            });
        }, [calculateVisibleRange, containerHeight, onScroll]);

        /**
         * Imperative API for parent components
         */
        useImperativeHandle(
            ref,
            () => ({
                scrollToIndex: (index: number, alignment: "start" | "center" | "end" = "start") => {
                    if (!scrollContainerRef.current) {
                        return;
                    }

                    let scrollTop: number;

                    switch (alignment) {
                        case "center":
                            scrollTop = index * itemHeight - containerHeight / 2 + itemHeight / 2;
                            break;
                        case "end":
                            scrollTop = (index + 1) * itemHeight - containerHeight;
                            break;
                        case "start":
                        default:
                            scrollTop = index * itemHeight;
                            break;
                    }

                    // Clamp to valid range
                    scrollTop = Math.max(0, Math.min(scrollTop, totalHeight - containerHeight));

                    scrollContainerRef.current.scrollTop = scrollTop;
                },

                scrollToTop: () => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = 0;
                    }
                },

                getScrollPosition: () => scrollPositionRef.current,

                getScrollContainer: () => scrollContainerRef.current
            }),
            [containerHeight, itemHeight, totalHeight]
        );

        /**
         * Render visible items with proper positioning
         */
        const visibleItems = useMemo(() => {
            const items = [];

            for (let i = visibleRange.startIndex; i <= visibleRange.endIndex; i++) {
                if (i < props.items.length) {
                    items.push(
                        <div
                            key={i}
                            className="mx-tree__virtual-scroll-item"
                            style={{
                                position: "absolute",
                                top: i * itemHeight,
                                height: itemHeight,
                                width: "100%"
                            }}
                        >
                            {renderItem(props.items[i], i)}
                        </div>
                    );
                }
            }

            return items;
        }, [visibleRange, props.items, itemHeight, renderItem]);

        // Combine base styles with auto height styles
        const containerStyle = {
            overflow: "auto",
            position: "relative" as const,
            width: "100%",
            ...heightStyle,
            // If no height constraint found, still use 100% as default
            ...(Object.keys(heightStyle).length === 0 ? { height: "100%" } : {})
        };

        // Add debug classes for development
        const containerClasses = classNames(
            "mx-tree__virtual-scroll-container",
            {
                "mx-tree__virtual-scroll-container--parent-constrained": strategy === "parent-constrained",
                "mx-tree__virtual-scroll-container--viewport-calculated": strategy === "viewport-calculated",
                "mx-tree__virtual-scroll-container--unconstrained": strategy === "unconstrained"
            },
            className
        );

        return (
            <div
                ref={scrollContainerRef}
                className={containerClasses}
                onScroll={handleScroll}
                style={containerStyle}
                data-height-strategy={strategy}
            >
                {/* Spacer to maintain correct scroll height */}
                <div
                    className="mx-tree__virtual-scroll-spacer"
                    style={{
                        height: totalHeight,
                        width: "100%",
                        position: "relative"
                    }}
                >
                    {/* Render only visible items */}
                    {visibleItems}
                </div>
            </div>
        );
    }
);

// Add display name for debugging
VirtualScrollContainer.displayName = "VirtualScrollContainer";

// Export with proper typing
export default VirtualScrollContainer as <T>(
    props: IVirtualScrollContainerProps<T> & { ref?: import("react").Ref<IVirtualScrollHandle> }
) => ReactElement;
