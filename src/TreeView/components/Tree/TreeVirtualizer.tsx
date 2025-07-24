import { ReactElement, createElement, useRef, useState, useEffect, useCallback } from "react";
import { useVirtualizer } from "../../hooks/useVirtualizer";

export interface TreeVirtualizerProps<T> {
    items: T[];
    itemHeight: number;
    overscan?: number;
    renderItem: (item: T, index: number) => ReactElement;
}

export function TreeVirtualizer<T>({
    items,
    itemHeight,
    overscan = 5,
    renderItem
}: TreeVirtualizerProps<T>): ReactElement {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [_containerHeight, setContainerHeight] = useState(0);

    // Measure container height
    useEffect(() => {
        const measureContainer = () => {
            if (scrollContainerRef.current) {
                setContainerHeight(scrollContainerRef.current.clientHeight);
            }
        };

        measureContainer();

        const resizeObserver = new ResizeObserver(measureContainer);
        if (scrollContainerRef.current) {
            resizeObserver.observe(scrollContainerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    const virtualizer = useVirtualizer({
        count: items.length,
        estimateSize: () => itemHeight,
        getScrollElement: () => scrollContainerRef.current,
        overscan
    });

    const handleScroll = useCallback(() => {
        // TODO ADD: Implement scroll event throttling for performance
        // TODO ADD: Notify parent component about visible range for data preloading
        // Virtual scrolling is handled by the useVirtualizer hook
    }, []);

    return (
        <div
            ref={scrollContainerRef}
            className="tree-virtualizer"
            onScroll={handleScroll}
            style={{
                height: "100%",
                overflow: "auto",
                position: "relative"
            }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative"
                }}
            >
                {virtualizer.getVirtualItems().map(virtualItem => {
                    const item = items[virtualItem.index];

                    return (
                        <div
                            key={virtualItem.index}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`
                            }}
                        >
                            {renderItem(item, virtualItem.index)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
