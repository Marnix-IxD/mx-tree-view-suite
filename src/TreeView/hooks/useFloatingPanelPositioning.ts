/**
 * Advanced positioning hook for floating panels
 * Handles transform parents, scroll containers, and other edge cases
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { getContainingBlock, getAllScrollParents, getScale, getFrameElement } from "../utils/floatingPanelEnhancements";

interface PositioningOptions {
    strategy?: "fixed" | "absolute";
    detectTransformParent?: boolean;
    handleScrollContainers?: boolean;
    handleZoom?: boolean;
    handleIframes?: boolean;
}

interface PositioningResult {
    // Positioning strategy to use
    strategy: "fixed" | "absolute";
    // Container to render portal into
    container: HTMLElement;
    // Offset adjustments for positioning
    offsetX: number;
    offsetY: number;
    // Scale factor for zoom handling
    scale: number;
    // Whether panel should be repositioned
    shouldReposition: boolean;
    // Transform parent if detected
    transformParent: HTMLElement | null;
    // Scroll parents that affect positioning
    scrollParents: Array<HTMLElement | Window>;
}

const DEFAULT_OPTIONS: Required<PositioningOptions> = {
    strategy: "fixed",
    detectTransformParent: true,
    handleScrollContainers: true,
    handleZoom: true,
    handleIframes: true
};

/**
 * Hook to handle complex positioning scenarios for floating panels
 */
export function useFloatingPanelPositioning(
    referenceEl: HTMLElement | null,
    floatingEl: HTMLElement | null,
    options: PositioningOptions = {}
): PositioningResult {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const [shouldReposition, setShouldReposition] = useState(false);
    const [scale, setScale] = useState(1);
    const [transformParent, setTransformParent] = useState<HTMLElement | null>(null);
    const [scrollParents, setScrollParents] = useState<Array<HTMLElement | Window>>([]);
    const scrollPositionsRef = useRef<Map<HTMLElement | Window, { x: number; y: number }>>(new Map());

    /**
     * Detect positioning context and constraints
     */
    const detectPositioningContext = useCallback(() => {
        if (!referenceEl) {
            return;
        }

        // Detect transform parent
        if (mergedOptions.detectTransformParent) {
            const containingBlock = getContainingBlock(referenceEl);
            setTransformParent(containingBlock);
        }

        // Detect scroll parents
        if (mergedOptions.handleScrollContainers) {
            const parents = getAllScrollParents(referenceEl);
            setScrollParents(parents);

            // Store initial scroll positions
            parents.forEach(parent => {
                if (parent instanceof HTMLElement) {
                    scrollPositionsRef.current.set(parent, {
                        x: parent.scrollLeft,
                        y: parent.scrollTop
                    });
                } else {
                    scrollPositionsRef.current.set(parent, {
                        x: window.scrollX,
                        y: window.scrollY
                    });
                }
            });
        }

        // Detect zoom level
        if (mergedOptions.handleZoom) {
            const currentScale = getScale(referenceEl);
            setScale(currentScale);
        }
    }, [referenceEl, mergedOptions]);

    /**
     * Calculate offset adjustments for transform parents
     */
    const calculateOffsets = useCallback((): { offsetX: number; offsetY: number } => {
        if (!referenceEl || !transformParent) {
            return { offsetX: 0, offsetY: 0 };
        }

        // Get bounding rectangles
        const refRect = referenceEl.getBoundingClientRect();
        const parentRect = transformParent.getBoundingClientRect();

        // Calculate the offset between reference element and transform parent
        // This offset is needed when switching from fixed to absolute positioning
        const offsetX = refRect.left - parentRect.left;
        const offsetY = refRect.top - parentRect.top;

        return { offsetX, offsetY };
    }, [referenceEl, transformParent]);

    /**
     * Determine the best container for the portal
     */
    const getPortalContainer = useCallback((): HTMLElement => {
        // If there's a transform parent, we might need to render inside it
        // to maintain proper positioning context
        if (transformParent && mergedOptions.strategy === "absolute") {
            return transformParent;
        }

        // Check for iframe context
        if (mergedOptions.handleIframes && referenceEl) {
            const frameElement = getFrameElement(referenceEl);
            if (frameElement) {
                // Return iframe's document body
                return referenceEl.ownerDocument.body;
            }
        }

        // Default to document.body for fixed positioning
        return document.body;
    }, [transformParent, referenceEl, mergedOptions]);

    /**
     * Handle scroll events on scroll parents
     */
    const handleScroll = useCallback((event: Event) => {
        const target = event.target as HTMLElement | Window;
        const previousPos = scrollPositionsRef.current.get(target);

        if (!previousPos) {
            return;
        }

        let currentX: number;
        let currentY: number;

        if (target instanceof HTMLElement) {
            currentX = target.scrollLeft;
            currentY = target.scrollTop;
        } else {
            currentX = window.scrollX;
            currentY = window.scrollY;
        }

        // Check if scroll position changed significantly
        const deltaX = Math.abs(currentX - previousPos.x);
        const deltaY = Math.abs(currentY - previousPos.y);

        if (deltaX > 1 || deltaY > 1) {
            setShouldReposition(true);
            scrollPositionsRef.current.set(target, { x: currentX, y: currentY });
        }
    }, []);

    /**
     * Handle zoom changes
     */
    const handleZoom = useCallback(() => {
        if (!referenceEl || !mergedOptions.handleZoom) {
            return;
        }

        const newScale = getScale(referenceEl);
        if (Math.abs(newScale - scale) > 0.01) {
            setScale(newScale);
            setShouldReposition(true);
        }
    }, [referenceEl, scale, mergedOptions.handleZoom]);

    // Initial detection
    useEffect(() => {
        detectPositioningContext();
    }, [detectPositioningContext]);

    // Set up scroll listeners
    useEffect(() => {
        if (!mergedOptions.handleScrollContainers) {
            return;
        }

        const scrollListeners: Array<{ target: HTMLElement | Window; handler: EventListener }> = [];

        scrollParents.forEach(parent => {
            const handler = handleScroll;
            parent.addEventListener("scroll", handler, { passive: true });
            scrollListeners.push({ target: parent, handler });
        });

        return () => {
            scrollListeners.forEach(({ target, handler }) => {
                target.removeEventListener("scroll", handler);
            });
        };
    }, [scrollParents, handleScroll, mergedOptions.handleScrollContainers]);

    // Set up zoom detection
    useEffect(() => {
        if (!mergedOptions.handleZoom) {
            return;
        }

        // Use ResizeObserver for more reliable zoom detection
        const resizeObserver = new ResizeObserver(handleZoom);

        if (referenceEl) {
            resizeObserver.observe(referenceEl);
        }

        // Also observe the floating element for size changes
        if (floatingEl) {
            resizeObserver.observe(floatingEl);
        }

        // Also listen to window resize for browser zoom
        window.addEventListener("resize", handleZoom);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleZoom);
        };
    }, [referenceEl, floatingEl, handleZoom, mergedOptions.handleZoom]);

    // Calculate final positioning data
    const { offsetX, offsetY } = calculateOffsets();
    const container = getPortalContainer();
    const strategy = transformParent && mergedOptions.strategy === "fixed" ? "absolute" : mergedOptions.strategy;

    // Reset reposition flag after it's been read
    useEffect(() => {
        if (shouldReposition) {
            const timer = setTimeout(() => setShouldReposition(false), 100);
            return () => clearTimeout(timer);
        }
    }, [shouldReposition]);

    return {
        strategy,
        container,
        offsetX,
        offsetY,
        scale,
        shouldReposition,
        transformParent,
        scrollParents
    };
}

/**
 * Helper to convert fixed coordinates to absolute within a container
 */
export function convertFixedToAbsolute(
    fixedX: number,
    fixedY: number,
    container: HTMLElement
): { x: number; y: number } {
    const containerRect = container.getBoundingClientRect();
    const containerStyle = getComputedStyle(container);

    // Account for container's border and padding
    const borderLeft = parseFloat(containerStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(containerStyle.borderTopWidth) || 0;
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(containerStyle.paddingTop) || 0;

    // Account for container's scroll
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;

    return {
        x: fixedX - containerRect.left - borderLeft - paddingLeft + scrollLeft,
        y: fixedY - containerRect.top - borderTop - paddingTop + scrollTop
    };
}

/**
 * Helper to handle positioning within iframes
 */
export function getIframeOffset(element: HTMLElement): { x: number; y: number } {
    const frameElement = getFrameElement(element);
    if (!frameElement) {
        return { x: 0, y: 0 };
    }

    const frameRect = frameElement.getBoundingClientRect();
    return {
        x: frameRect.left,
        y: frameRect.top
    };
}
