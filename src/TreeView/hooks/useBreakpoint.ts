import { useState, useEffect } from "react";
import { getActiveBreakpoint, BreakpointSize } from "../utils/breakpointHelpers";

/**
 * Hook to track current breakpoint and provide responsive classes
 */
export function useBreakpoint(containerRef: React.RefObject<HTMLElement>): {
    breakpoint: BreakpointSize;
    breakpointClasses: string;
    width: number;
} {
    const [breakpoint, setBreakpoint] = useState<BreakpointSize>("lg");
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                setWidth(newWidth);

                const newBreakpoint = getActiveBreakpoint(newWidth);
                setBreakpoint(newBreakpoint);
            }
        });

        resizeObserver.observe(containerRef.current);

        // Initial measurement
        const initialWidth = containerRef.current.getBoundingClientRect().width;
        setWidth(initialWidth);
        setBreakpoint(getActiveBreakpoint(initialWidth));

        return () => {
            resizeObserver.disconnect();
        };
    }, [containerRef]);

    // Generate breakpoint classes
    const breakpointClasses = `mx-tree-${breakpoint}`;

    return {
        breakpoint,
        breakpointClasses,
        width
    };
}
