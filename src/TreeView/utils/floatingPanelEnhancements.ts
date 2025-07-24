/**
 * Enhanced floating panel utilities that integrate with existing TreeView utilities
 * Leverages useTreeTouch, useTreeKeyboard, and screenReaderAnnouncer
 * Complements the base floatingPanelUtils.ts with production-ready features
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useTreeTouch, TouchHandlers, SwipeDirection } from "../hooks/useTreeTouch";
import { useScreenReaderAnnouncer, treeAnnouncements } from "./screenReaderAnnouncer";

// Constants for touch handling
const TOUCH_DELAY_MS = 500; // Long press to open
export const TOUCH_SAFE_AREA_BUFFER = 50; // Larger buffer for touch
export const MIN_TOUCH_TARGET_SIZE = 44; // WCAG touch target minimum

/**
 * Detect if device has touch support
 */
export function isTouchDevice(): boolean {
    return (
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
}

/**
 * Get visual viewport for mobile zoom handling
 */
export function getVisualViewport(): {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale: number;
} {
    const visualViewport = window.visualViewport;
    if (visualViewport) {
        return {
            width: visualViewport.width,
            height: visualViewport.height,
            offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop,
            scale: visualViewport.scale
        };
    }

    // Fallback for browsers without visual viewport API
    return {
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: 0,
        offsetTop: 0,
        scale: 1
    };
}

/**
 * Detect RTL (right-to-left) direction
 */
export function isRTL(element: HTMLElement): boolean {
    return getComputedStyle(element).direction === "rtl";
}

/**
 * Enhanced floating panel touch interaction using existing useTreeTouch
 * Provides consistent touch handling across the TreeView
 *
 * Gesture Logic:
 * - Real-time drag with elastic resistance when pulling "outward"
 * - Drag to close when pushing panel "away" (natural gesture)
 * - Elastic pull-back animation when dragging in wrong direction
 * - Cancel drag by returning to original position
 * - Vertical swipes reserved for scrolling within panel
 *
 * This ensures gestures feel natural regardless of screen position or RTL layouts
 */
export function useFloatingPanelTouch(
    context: {
        refs: {
            reference: React.RefObject<HTMLElement>;
            floating: React.RefObject<HTMLElement>;
        };
        onOpenChange?: (open: boolean) => void;
        onStartDrag?: (x: number, panelPosition: "left" | "right" | "top" | "bottom") => void;
        onUpdateDrag?: (x: number) => void;
        onEndDrag?: (velocity: number) => void;
        onQuickSwipe?: (direction: "left" | "right", velocity: number) => void;
        open?: boolean;
    },
    options?: {
        longPressDelay?: number;
        preventDefaultTouch?: boolean;
        enableDragNavigation?: boolean;
        panelPlacement?: "left" | "right" | "top" | "bottom";
    }
) {
    const announce = useScreenReaderAnnouncer();
    const isDraggingRef = useRef(false);
    const startXRef = useRef(0);

    // Define touch handlers for floating panels
    const touchHandlers: TouchHandlers = {
        // Tap to toggle panel (only if not dragging)
        onTap: useCallback(() => {
            if (!isDraggingRef.current) {
                const newState = !context.open;
                context.onOpenChange?.(newState);
                announce(newState ? "Panel opened" : "Panel closed");
            }
        }, [context, announce]),

        // Double tap to expand all children in panel
        onDoubleTap: useCallback(() => {
            announce("Expanding all items in panel");
            // This would be connected to tree expansion logic
        }, [announce]),

        // Long press for context menu
        onLongPress: useCallback(
            (_x: number, _y: number) => {
                context.onOpenChange?.(true);
                announce("Panel menu opened");
            },
            [context, announce]
        ),

        // Drag start - initiate elastic drag
        onDragStart: useCallback(
            (x: number, _y: number) => {
                if (!options?.enableDragNavigation) {
                    return;
                }

                isDraggingRef.current = true;
                startXRef.current = x;
                const panelPlacement = options?.panelPlacement || "right";
                context.onStartDrag?.(x, panelPlacement);
            },
            [context, options]
        ),

        // Drag move - update elastic position in real-time
        onDragMove: useCallback(
            (x: number, _y: number, _deltaX: number, _deltaY: number) => {
                if (!options?.enableDragNavigation || !isDraggingRef.current) {
                    return;
                }

                context.onUpdateDrag?.(x);
            },
            [context, options]
        ),

        // Drag end - trigger close or snap-back
        onDragEnd: useCallback(
            (_x: number, _y: number, velocityX: number, _velocityY: number) => {
                if (!options?.enableDragNavigation || !isDraggingRef.current) {
                    return;
                }

                isDraggingRef.current = false;
                context.onEndDrag?.(velocityX);
            },
            [context, options]
        ),

        // Quick swipe detection - always active for fast gestures
        onSwipe: useCallback(
            (direction: SwipeDirection, velocity: number) => {
                // Quick swipes should trigger immediate action
                if (direction === "left" || direction === "right") {
                    context.onQuickSwipe?.(direction, velocity);
                }
                // Vertical swipes reserved for scrolling
            },
            [context]
        ),

        // Context menu
        onContextMenu: useCallback(() => {
            announce("Context menu opened");
        }, [announce])
    };

    // Use the existing touch hook
    const touchResult = useTreeTouch(context.refs.reference, touchHandlers, {
        enabled: isTouchDevice(),
        longPressDelay: options?.longPressDelay || TOUCH_DELAY_MS,
        preventDefaultOnSwipe: options?.preventDefaultTouch
    });

    return {
        ...touchResult,
        getTouchProps: (props: any = {}) => ({
            ...props,
            "data-touch-enabled": "true",
            "data-gesture-active": touchResult.isGestureActive
        })
    };
}

/**
 * Enhanced accessibility hook using existing screenReaderAnnouncer
 * Provides ARIA attributes and announcements for floating panels
 */
export function useFloatingPanelAccessibility(
    context: {
        refs: {
            reference: React.RefObject<HTMLElement>;
            floating: React.RefObject<HTMLElement>;
        };
        open?: boolean;
        placement?: { side: string; alignment: string };
        nodeLabel?: string;
        childCount?: number;
    },
    options?: {
        role?: string;
        labelledBy?: string;
        describedBy?: string;
        announceOnOpen?: string;
        announceOnClose?: string;
    }
) {
    const announce = useScreenReaderAnnouncer();

    // Announce open/close state changes with context
    useEffect(() => {
        if (context.open) {
            const message =
                options?.announceOnOpen ||
                (context.nodeLabel
                    ? treeAnnouncements.nodeExpanded(context.nodeLabel, context.childCount)
                    : "Panel opened");
            announce(message);
        } else if (context.open === false) {
            const message =
                options?.announceOnClose ||
                (context.nodeLabel ? treeAnnouncements.nodeCollapsed(context.nodeLabel) : "Panel closed");
            announce(message);
        }
    }, [context.open, context.nodeLabel, context.childCount, options, announce]);

    return {
        getReferenceProps: (props: any = {}) => ({
            ...props,
            "aria-expanded": context.open,
            "aria-haspopup": options?.role || "menu",
            "aria-controls": context.open ? props.id || "floating-panel" : undefined,
            "aria-labelledby": options?.labelledBy,
            "aria-describedby": options?.describedBy
        }),
        getFloatingProps: (props: any = {}) => ({
            ...props,
            role: options?.role || "menu",
            "aria-labelledby": options?.labelledBy,
            "aria-describedby": options?.describedBy,
            "aria-orientation":
                context.placement?.side === "left" || context.placement?.side === "right" ? "vertical" : "horizontal"
        })
    };
}

/**
 * Detect transform parents and stacking contexts
 */
export function getContainingBlock(element: HTMLElement): HTMLElement | null {
    let currentElement = element.parentElement;

    while (currentElement && currentElement !== document.documentElement) {
        const style = getComputedStyle(currentElement);

        // Check for transform-related properties
        if (
            style.transform !== "none" ||
            style.perspective !== "none" ||
            style.containerType !== "normal" ||
            style.willChange === "transform" ||
            style.willChange === "perspective" ||
            // @ts-ignore - backdropFilter might not exist in older TS
            (style.backdropFilter && style.backdropFilter !== "none") ||
            // @ts-ignore - WebKit specific
            (style.webkitBackdropFilter && style.webkitBackdropFilter !== "none")
        ) {
            return currentElement;
        }

        // Check for fixed positioning
        if (style.position === "fixed") {
            return currentElement;
        }

        currentElement = currentElement.parentElement;
    }

    return null;
}

/**
 * Get all scroll parents including those with overflow: clip
 */
export function getAllScrollParents(element: HTMLElement): Array<HTMLElement | Window> {
    const scrollParents: Array<HTMLElement | Window> = [];
    let current = element.parentElement;

    while (current && current !== document.documentElement) {
        const style = getComputedStyle(current);

        // Check for scrollable elements
        if (style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible") {
            // Skip elements with display that doesn't support overflow
            const display = style.display;
            if (display !== "inline" && display !== "contents") {
                scrollParents.push(current);
            }
        }

        // Check for position fixed (stops propagation)
        if (style.position === "fixed") {
            break;
        }

        current = current.parentElement;
    }

    // Always include window
    scrollParents.push(window);
    return scrollParents;
}

/**
 * Detect zoom level using scale calculation
 */
export function getScale(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    const cssWidth = element.offsetWidth;

    if (cssWidth === 0) {
        return 1;
    }

    const scale = width / cssWidth;
    return Number.isFinite(scale) ? scale : 1;
}

/**
 * Enhanced keyboard navigation for floating panels
 * Integrates with tree keyboard navigation patterns
 */
export function useFloatingPanelKeyboardNavigation(
    context: {
        refs: {
            reference: React.RefObject<HTMLElement>;
            floating: React.RefObject<HTMLElement>;
        };
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        onNavigateBack?: () => void;
        onNavigateForward?: () => void;
    },
    options?: {
        closeOnEscape?: boolean;
        openOnArrowDown?: boolean;
        openOnSpace?: boolean;
        focusOnOpen?: boolean;
    }
) {
    const announce = useScreenReaderAnnouncer();

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const isReferenceEvent = context.refs.reference.current?.contains(event.target as Node);
            const isFloatingEvent = context.refs.floating.current?.contains(event.target as Node);

            if (!isReferenceEvent && !isFloatingEvent) {
                return;
            }

            const isCtrlOrCmd = event.ctrlKey || event.metaKey;

            switch (event.key) {
                case "Escape":
                    if (options?.closeOnEscape !== false && context.open) {
                        event.preventDefault();
                        context.onOpenChange?.(false);
                        // Return focus to reference
                        context.refs.reference.current?.focus();
                        announce("Panel closed");
                    }
                    break;

                case "ArrowDown":
                    if (options?.openOnArrowDown && !context.open && isReferenceEvent) {
                        event.preventDefault();
                        context.onOpenChange?.(true);
                        announce("Panel opened");
                    }
                    break;

                case "ArrowLeft":
                    // Navigate back to parent panel
                    if (isFloatingEvent && context.onNavigateBack) {
                        event.preventDefault();
                        context.onNavigateBack();
                        announce("Navigating to parent panel");
                    }
                    break;

                case "ArrowRight":
                    // Navigate forward to child panel
                    if (isFloatingEvent && context.onNavigateForward) {
                        event.preventDefault();
                        context.onNavigateForward();
                        announce("Opening child panel");
                    }
                    break;

                case " ": // Space
                case "Enter":
                    if (options?.openOnSpace && isReferenceEvent && !isCtrlOrCmd) {
                        event.preventDefault();
                        const newState = !context.open;
                        context.onOpenChange?.(newState);
                        announce(newState ? "Panel opened" : "Panel closed");
                    }
                    break;

                case "Home":
                    // Navigate to first item in panel
                    if (isFloatingEvent && isCtrlOrCmd) {
                        event.preventDefault();
                        const firstItem = context.refs.floating.current?.querySelector<HTMLElement>(
                            '[role="treeitem"]:first-child'
                        );
                        firstItem?.focus();
                        announce("Navigated to first item");
                    }
                    break;

                case "End":
                    // Navigate to last item in panel
                    if (isFloatingEvent && isCtrlOrCmd) {
                        event.preventDefault();
                        const items = context.refs.floating.current?.querySelectorAll<HTMLElement>('[role="treeitem"]');
                        if (items && items.length > 0) {
                            items[items.length - 1].focus();
                            announce("Navigated to last item");
                        }
                    }
                    break;

                case "Tab":
                    // Let FloatingFocusManager handle tab navigation
                    break;
            }
        },
        [context, options, announce]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Focus first item when opened
    useEffect(() => {
        if (context.open && options?.focusOnOpen && context.refs.floating.current) {
            // Delay to ensure panel is rendered
            setTimeout(() => {
                const firstFocusable = context.refs.floating.current?.querySelector<HTMLElement>(
                    '[role="treeitem"], a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                firstFocusable?.focus();
                announce("Panel opened, focus on first item");
            }, 100);
        }
    }, [context.open, context.refs.floating, options?.focusOnOpen, announce]);

    return {
        getReferenceProps: (props: any = {}) => ({
            ...props,
            tabIndex: 0,
            "aria-keyshortcuts": "Enter Space ArrowDown"
        })
    };
}

/**
 * Detect if element is in an iframe
 */
export function getFrameElement(element: HTMLElement): HTMLIFrameElement | null {
    const win = element.ownerDocument?.defaultView;
    if (win && win !== window && win.frameElement) {
        return win.frameElement as HTMLIFrameElement;
    }
    return null;
}

/**
 * Handle high contrast mode
 */
export function useHighContrastMode() {
    const [isHighContrast, setIsHighContrast] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-contrast: high)");

        const handleChange = (e: MediaQueryListEvent) => {
            setIsHighContrast(e.matches);
        };

        setIsHighContrast(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);

        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    return isHighContrast;
}
