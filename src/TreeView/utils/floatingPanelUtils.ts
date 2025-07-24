/**
 * Custom floating panel utilities to replace @floating-ui/react
 * Provides smart positioning, viewport edge detection, and interaction handling
 * for the TreeView floating panel mode
 */

import { RefObject, MutableRefObject, useEffect, useRef, useState, useCallback, useMemo } from "react";

// Constants
const PANEL_OFFSET = 8;
const VIEWPORT_PADDING = 8;
// const SAFE_TRIANGLE_PADDING = 20; // Removed - using dynamic buffer from safePolygon options
const ANIMATION_DURATION = 200;
const DEFAULT_PANEL_WIDTH = 250;
const DEFAULT_PANEL_HEIGHT = 400;

// Types
export interface IPosition {
    x: number;
    y: number;
}

export interface ISize {
    width: number;
    height: number;
}

export type IPlacementSide = "top" | "right" | "bottom" | "left";
export type IPlacementAlignment = "start" | "center" | "end";

export interface IPlacement {
    side: IPlacementSide;
    alignment: IPlacementAlignment;
}

// For compatibility with floating-ui API
export type IPlacementString =
    | "top"
    | "right"
    | "bottom"
    | "left"
    | "top-start"
    | "top-end"
    | "right-start"
    | "right-end"
    | "bottom-start"
    | "bottom-end"
    | "left-start"
    | "left-end";

// Convert string placement to IPlacement object
export function parsePlacement(placement: IPlacementString | IPlacement): IPlacement {
    if (typeof placement === "string") {
        const [side, alignment] = placement.split("-") as [IPlacementSide, IPlacementAlignment?];
        return { side, alignment: alignment || "center" };
    }
    return placement;
}

export interface IFloatingStyles {
    position: "absolute" | "fixed";
    top: number | string;
    left: number | string;
    width?: number | string;
    height?: number | string;
    maxWidth?: number | string;
    maxHeight?: number | string;
    opacity?: number;
    transform?: string;
    transition?: string;
    visibility?: "visible" | "hidden";
    zIndex?: number;
}

export interface IFloatingContext {
    referenceElement: HTMLElement | null;
    floatingElement: HTMLElement | null;
    placement: IPlacement;
    isPositioned: boolean;
    strategy: "absolute" | "fixed";
}

export interface IMiddlewareData {
    hide?: { referenceHidden: boolean };
    shift?: { x: number; y: number };
    flip?: { overflows: Array<{ placement: string; overflows: number[] }>; fallbackAxisSideDirection?: string };
    size?: {
        availableWidth: number;
        availableHeight: number;
        apply?: (args: {
            availableWidth: number;
            availableHeight: number;
            elements: { floating: HTMLElement };
        }) => void;
    };
    allowedPlacements?: IPlacement[];
    [key: string]: any; // Allow additional middleware data
}

// Utility functions
function getViewportDimensions(): ISize {
    return {
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight
    };
}

function getElementBounds(element: HTMLElement): DOMRect {
    return element.getBoundingClientRect();
}

function isElementInViewport(rect: DOMRect, padding = VIEWPORT_PADDING): boolean {
    const viewport = getViewportDimensions();
    return (
        rect.top >= padding &&
        rect.left >= padding &&
        rect.bottom <= viewport.height - padding &&
        rect.right <= viewport.width - padding
    );
}

/**
 * Calculate optimal position for floating element
 */
function calculatePosition(
    reference: DOMRect,
    floating: ISize,
    preferredPlacement: IPlacement,
    viewport: ISize
): { position: IPosition; actualPlacement: IPlacement } {
    const placements: IPlacement[] = [
        { side: "right", alignment: "start" },
        { side: "left", alignment: "start" },
        { side: "bottom", alignment: "start" },
        { side: "top", alignment: "start" }
    ];

    // Start with preferred placement
    if (preferredPlacement) {
        placements.unshift(preferredPlacement);
    }

    for (const placement of placements) {
        const pos = getPositionForPlacement(reference, floating, placement);
        const floatingRect = {
            top: pos.y,
            left: pos.x,
            bottom: pos.y + floating.height,
            right: pos.x + floating.width,
            width: floating.width,
            height: floating.height
        } as DOMRect;

        if (isElementInViewport(floatingRect)) {
            return { position: pos, actualPlacement: placement };
        }
    }

    // If no placement fits perfectly, use the one with most visible area
    const bestPlacement = placements[0];
    const bestPos = getPositionForPlacement(reference, floating, bestPlacement);

    // Constrain to viewport
    bestPos.x = Math.max(VIEWPORT_PADDING, Math.min(bestPos.x, viewport.width - floating.width - VIEWPORT_PADDING));
    bestPos.y = Math.max(VIEWPORT_PADDING, Math.min(bestPos.y, viewport.height - floating.height - VIEWPORT_PADDING));

    return { position: bestPos, actualPlacement: bestPlacement };
}

function getPositionForPlacement(reference: DOMRect, floating: ISize, placement: IPlacement): IPosition {
    let x = 0;
    let y = 0;

    // Calculate base position based on side
    switch (placement.side) {
        case "top":
            x = reference.left;
            y = reference.top - floating.height - PANEL_OFFSET;
            break;
        case "right":
            x = reference.right + PANEL_OFFSET;
            y = reference.top;
            break;
        case "bottom":
            x = reference.left;
            y = reference.bottom + PANEL_OFFSET;
            break;
        case "left":
            x = reference.left - floating.width - PANEL_OFFSET;
            y = reference.top;
            break;
    }

    // Adjust for alignment
    if (placement.side === "top" || placement.side === "bottom") {
        switch (placement.alignment) {
            case "center":
                x = reference.left + (reference.width - floating.width) / 2;
                break;
            case "end":
                x = reference.right - floating.width;
                break;
        }
    } else {
        switch (placement.alignment) {
            case "center":
                y = reference.top + (reference.height - floating.height) / 2;
                break;
            case "end":
                y = reference.bottom - floating.height;
                break;
        }
    }

    return { x, y };
}

/**
 * Main hook for floating element positioning
 */
export function useFloating(options: {
    placement?: IPlacement | IPlacementString;
    strategy?: "absolute" | "fixed";
    middleware?: IMiddleware[];
    whileElementsMounted?: (reference: HTMLElement, floating: HTMLElement, update: () => void) => () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}): {
    refs: {
        setReference: (node: HTMLElement | null) => void;
        setFloating: (node: HTMLElement | null) => void;
        reference: MutableRefObject<HTMLElement | null>;
        floating: MutableRefObject<HTMLElement | null>;
    };
    floatingStyles: IFloatingStyles;
    placement: IPlacement;
    middlewareData: IMiddlewareData;
    isPositioned: boolean;
    update: () => void;
    context: IFloatingContext & {
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        refs: {
            reference: MutableRefObject<HTMLElement | null>;
            floating: MutableRefObject<HTMLElement | null>;
        };
    };
} {
    const [referenceElement, setReferenceElement] = useState<HTMLElement | null>(null);
    const [floatingElement, setFloatingElement] = useState<HTMLElement | null>(null);
    const [floatingStyles, setFloatingStyles] = useState<IFloatingStyles>({
        position: options.strategy || "absolute",
        top: 0,
        left: 0,
        visibility: "hidden"
    });
    const [placement, setPlacement] = useState<IPlacement>(() => {
        const defaultPlacement = options.placement || "right-start";
        return parsePlacement(defaultPlacement);
    });
    const [isPositioned, setIsPositioned] = useState(false);
    const [middlewareData, setMiddlewareData] = useState<IMiddlewareData>({});

    const referenceRef = useRef<HTMLElement | null>(null);
    const floatingRef = useRef<HTMLElement | null>(null);

    const update = useCallback(() => {
        if (!referenceElement || !floatingElement) {
            return;
        }

        const referenceRect = getElementBounds(referenceElement);
        const floatingRect = getElementBounds(floatingElement);
        const viewport = getViewportDimensions();

        // Check if reference is hidden
        if (referenceRect.width === 0 || referenceRect.height === 0) {
            setFloatingStyles(prev => ({ ...prev, visibility: "hidden" }));
            setMiddlewareData(prev => ({ ...prev, hide: { referenceHidden: true } }));
            return;
        }

        const floatingSize = {
            width: floatingRect.width || DEFAULT_PANEL_WIDTH,
            height: floatingRect.height || DEFAULT_PANEL_HEIGHT
        };

        // Calculate position
        const parsedPlacement = options.placement ? parsePlacement(options.placement) : placement;
        const { position, actualPlacement } = calculatePosition(referenceRect, floatingSize, parsedPlacement, viewport);

        // Apply middleware
        let finalPosition = { ...position };
        const newMiddlewareData: IMiddlewareData = {};

        if (options.middleware) {
            for (const middleware of options.middleware) {
                const result = middleware({
                    reference: referenceRect,
                    floating: floatingSize,
                    placement: actualPlacement,
                    position: finalPosition,
                    viewport,
                    middlewareData: newMiddlewareData
                });

                if (result.position) {
                    finalPosition = result.position;
                }
                if (result.data) {
                    Object.assign(newMiddlewareData, result.data);
                }
            }
        }

        // Apply size middleware's apply function if present
        if (newMiddlewareData.size?.apply && floatingElement) {
            const sizeData = newMiddlewareData.size as any;
            sizeData.apply({
                availableWidth: sizeData.availableWidth,
                availableHeight: sizeData.availableHeight,
                elements: { floating: floatingElement }
            });
        }

        setFloatingStyles({
            position: options.strategy || "absolute",
            top: finalPosition.y,
            left: finalPosition.x,
            visibility: "visible",
            opacity: 1,
            transform: "none",
            transition: `opacity ${ANIMATION_DURATION}ms, transform ${ANIMATION_DURATION}ms`
        });
        setPlacement(actualPlacement);
        setIsPositioned(true);
        setMiddlewareData(newMiddlewareData);
    }, [referenceElement, floatingElement, options.placement, options.strategy, options.middleware, placement]);

    // Set up auto-update
    useEffect(() => {
        if (!referenceElement || !floatingElement || !options.whileElementsMounted) {
            return;
        }

        const cleanup = options.whileElementsMounted(referenceElement, floatingElement, update);
        return cleanup;
    }, [referenceElement, floatingElement, options.whileElementsMounted, update]);

    // Update on element changes
    useEffect(() => {
        update();
    }, [referenceElement, floatingElement, update]);

    const context: IFloatingContext & {
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        refs: {
            reference: MutableRefObject<HTMLElement | null>;
            floating: MutableRefObject<HTMLElement | null>;
        };
    } = {
        referenceElement,
        floatingElement,
        placement,
        isPositioned,
        strategy: options.strategy || "absolute",
        open: options.open,
        onOpenChange: options.onOpenChange,
        refs: {
            reference: referenceRef,
            floating: floatingRef
        }
    };

    return {
        refs: {
            setReference: (node: HTMLElement | null) => {
                referenceRef.current = node;
                setReferenceElement(node);
            },
            setFloating: (node: HTMLElement | null) => {
                floatingRef.current = node;
                setFloatingElement(node);
            },
            reference: referenceRef,
            floating: floatingRef
        },
        floatingStyles,
        placement,
        middlewareData,
        isPositioned,
        update,
        context
    };
}

// Middleware types and implementations
export type IMiddleware = (context: {
    reference: DOMRect;
    floating: ISize;
    placement: IPlacement;
    position: IPosition;
    viewport: ISize;
    middlewareData: IMiddlewareData;
}) => {
    position?: IPosition;
    data?: Partial<IMiddlewareData>;
};

export const offset = (value: number): IMiddleware => {
    return ({ position, placement }) => {
        // Apply offset based on placement side
        const offsetPosition = { ...position };

        switch (placement.side) {
            case "top":
                offsetPosition.y -= value;
                break;
            case "right":
                offsetPosition.x += value;
                break;
            case "bottom":
                offsetPosition.y += value;
                break;
            case "left":
                offsetPosition.x -= value;
                break;
        }

        return { position: offsetPosition, data: {} };
    };
};

export const flip = (options?: { fallbackAxisSideDirection?: string }): IMiddleware => {
    return (_context): { position?: IPosition; data?: Partial<IMiddlewareData> } => {
        // Flip logic is already handled in calculatePosition
        return {
            position: undefined,
            data: {
                flip: {
                    overflows: [], // Empty array since flip logic is handled in calculatePosition
                    fallbackAxisSideDirection: options?.fallbackAxisSideDirection
                }
            }
        };
    };
};

export const shift = (options?: { padding?: number }): IMiddleware => {
    const padding = options?.padding || VIEWPORT_PADDING;
    return ({ position, floating, viewport }) => {
        const shiftedPosition = { ...position };

        // Ensure panel stays within viewport
        shiftedPosition.x = Math.max(padding, Math.min(shiftedPosition.x, viewport.width - floating.width - padding));
        shiftedPosition.y = Math.max(padding, Math.min(shiftedPosition.y, viewport.height - floating.height - padding));

        return {
            position: shiftedPosition,
            data: {
                shift: {
                    x: shiftedPosition.x - position.x,
                    y: shiftedPosition.y - position.y
                }
            }
        };
    };
};

export const size = (options?: {
    padding?: number;
    apply?: (args: { availableWidth: number; availableHeight: number; elements: { floating: HTMLElement } }) => void;
}): IMiddleware => {
    return ({ viewport }) => {
        const padding = options?.padding || VIEWPORT_PADDING;
        const availableWidth = viewport.width - padding * 2;
        const availableHeight = viewport.height - padding * 2;

        // Store size data for apply function
        return {
            position: undefined,
            data: {
                size: {
                    availableWidth,
                    availableHeight,
                    apply: options?.apply
                }
            }
        };
    };
};

export const hide = (): IMiddleware => {
    return ({ reference }) => {
        const isHidden = reference.width === 0 || reference.height === 0;
        return {
            data: {
                hide: { referenceHidden: isHidden }
            }
        };
    };
};

export const autoPlacement = (options?: {
    allowedPlacements?: IPlacementString[];
    autoAlignment?: boolean;
}): IMiddleware => {
    // Convert string placements to IPlacement objects
    const placements: IPlacement[] =
        options?.allowedPlacements?.map(p => {
            const [side, alignment] = p.split("-") as [IPlacementSide, IPlacementAlignment?];
            return { side, alignment: alignment || "center" };
        }) || [];

    // Auto placement is handled in calculatePosition
    return () => ({ position: undefined, data: { allowedPlacements: placements } });
};

/**
 * Auto-update positioning when elements change
 */
export const autoUpdate = (reference: HTMLElement, floating: HTMLElement, update: () => void): (() => void) => {
    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const scheduleUpdate = () => {
        if (frameId === null) {
            frameId = requestAnimationFrame(() => {
                frameId = null;
                update();
            });
        }
    };

    // Watch for size changes
    resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(reference);
    resizeObserver.observe(floating);

    // Watch for DOM changes that might affect position
    mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(reference, {
        attributes: true,
        attributeFilter: ["style", "class"]
    });

    // Watch for scroll
    const scrollParents = getScrollParents(reference);
    scrollParents.forEach(parent => {
        parent.addEventListener("scroll", scheduleUpdate, { passive: true });
    });

    // Watch for window resize
    window.addEventListener("resize", scheduleUpdate);

    // Initial update
    scheduleUpdate();

    // Cleanup function
    return () => {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
        }
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        scrollParents.forEach(parent => {
            parent.removeEventListener("scroll", scheduleUpdate);
        });
        window.removeEventListener("resize", scheduleUpdate);
    };
};

function getScrollParents(element: HTMLElement): Array<HTMLElement | Window> {
    const parents: Array<HTMLElement | Window> = [];
    let current = element.parentElement;

    while (current) {
        const style = getComputedStyle(current);
        if (style.overflow !== "visible" || style.position === "fixed") {
            parents.push(current);
        }
        current = current.parentElement;
    }

    parents.push(window);
    return parents;
}

/**
 * Focus management for floating panels
 */
export interface IFloatingFocusManagerProps {
    context: {
        refs: {
            floating: RefObject<HTMLElement>;
        };
    };
    children: React.ReactNode;
    modal?: boolean;
}

export function FloatingFocusManager({ context, children }: IFloatingFocusManagerProps): React.ReactElement {
    useEffect(() => {
        const floating = context.refs.floating.current;
        if (!floating) {
            return;
        }

        // Store previously focused element
        const previouslyFocused = document.activeElement as HTMLElement;

        // Focus first focusable element in floating panel
        const focusableElements = floating.querySelectorAll<HTMLElement>(
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }

        // Trap focus within floating element
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Tab") {
                return;
            }

            const focusableElements = Array.from(
                floating.querySelectorAll<HTMLElement>(
                    'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
                )
            );

            if (focusableElements.length === 0) {
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                lastElement.focus();
                event.preventDefault();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                firstElement.focus();
                event.preventDefault();
            }
        };

        floating.addEventListener("keydown", handleKeyDown);

        return () => {
            floating.removeEventListener("keydown", handleKeyDown);
            // Restore focus on cleanup
            if (previouslyFocused && previouslyFocused.focus) {
                previouslyFocused.focus();
            }
        };
    }, [context.refs.floating]);

    return children as React.ReactElement;
}

/**
 * Dismiss behavior for floating elements
 */
export function useDismiss(
    context: {
        refs: {
            floating: RefObject<HTMLElement>;
            reference: RefObject<HTMLElement>;
        };
        onOpenChange?: (open: boolean) => void;
    },
    _options?: {
        ancestorScroll?: boolean;
        bubbles?: boolean;
    }
): {
    getReferenceProps: (props?: any) => any;
    getFloatingProps: (props?: any) => any;
} {
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                context.onOpenChange?.(false);
            }
        };

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const floating = context.refs.floating.current;
            const reference = context.refs.reference.current;

            if (floating && reference && !floating.contains(target) && !reference.contains(target)) {
                context.onOpenChange?.(false);
            }
        };

        document.addEventListener("keydown", handleEscape);
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [context]);

    return {
        getReferenceProps: (props = {}) => props,
        getFloatingProps: (props = {}) => props
    };
}

/**
 * ARIA role management
 */
export function useRole(
    _context: any,
    options?: { role?: string }
): {
    getReferenceProps: (props?: any) => any;
    getFloatingProps: (props?: any) => any;
} {
    const role = options?.role || "dialog";

    return {
        getReferenceProps: (props = {}) => ({
            ...props,
            "aria-expanded": true,
            "aria-haspopup": role
        }),
        getFloatingProps: (props = {}) => ({
            ...props,
            role
        })
    };
}

/**
 * Combine interaction hooks
 */
export function useInteractions(
    interactions: Array<{
        getReferenceProps?: (props?: any) => any;
        getFloatingProps?: (props?: any) => any;
    }>
): {
    getReferenceProps: (props?: any) => any;
    getFloatingProps: (props?: any) => any;
} {
    return {
        getReferenceProps: (props = {}) => {
            return interactions.reduce((acc, interaction) => {
                return interaction.getReferenceProps ? interaction.getReferenceProps(acc) : acc;
            }, props);
        },
        getFloatingProps: (props = {}) => {
            return interactions.reduce((acc, interaction) => {
                return interaction.getFloatingProps ? interaction.getFloatingProps(acc) : acc;
            }, props);
        }
    };
}

/**
 * Transition styles for smooth animations
 */
export function useTransitionStyles(
    context: {
        isPositioned: boolean;
        placement: IPlacement;
    },
    options?: {
        duration?: number;
        initial?: React.CSSProperties;
    }
): {
    isMounted: boolean;
    styles: React.CSSProperties;
} {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        if (context.isPositioned) {
            setIsMounted(true);
        }
    }, [context.isPositioned]);

    const styles = useMemo(() => {
        const side = context.placement.side;
        const transforms: Record<string, string> = {
            top: "translateY(10px)",
            right: "translateX(-10px)",
            bottom: "translateY(-10px)",
            left: "translateX(10px)"
        };

        const duration = options?.duration || ANIMATION_DURATION;
        const initial = options?.initial || {};

        return {
            opacity: isMounted ? 1 : initial.opacity ?? 0,
            transform: isMounted ? "none" : initial.transform ?? transforms[side],
            transition: `opacity ${duration}ms, transform ${duration}ms`,
            ...initial
        };
    }, [isMounted, context.placement.side]);

    return { isMounted, styles };
}

/**
 * Hover and touch interaction with safe polygon
 * Supports both mouse and touch devices
 */
export function useHover(
    context: {
        refs: {
            floating: RefObject<HTMLElement>;
            reference: RefObject<HTMLElement>;
        };
        onOpenChange?: (open: boolean) => void;
    },
    options?: {
        delay?: { open?: number; close?: number };
        handleClose?: any;
        enabled?: boolean;
        touchEnabled?: boolean;
    }
): {
    getReferenceProps: (props?: any) => any;
    getFloatingProps: (props?: any) => any;
} {
    const timeoutRef = useRef<number | null>(null);
    const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const safePolygonOptionsRef = useRef<any>(null);

    // Extract safe polygon options if provided
    if (options?.handleClose) {
        safePolygonOptionsRef.current = options.handleClose;
    }

    const handleMouseEnter = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        const delay = options?.delay?.open || 0;
        if (delay > 0) {
            timeoutRef.current = window.setTimeout(() => {
                context.onOpenChange?.(true);
            }, delay);
        } else {
            context.onOpenChange?.(true);
        }
    }, [context, options?.delay?.open]);

    const handleMouseLeave = useCallback(
        (event: MouseEvent) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            // Store mouse position for safe polygon check
            mousePositionRef.current = { x: event.clientX, y: event.clientY };

            // Check if moving to floating element
            const relatedTarget = event.relatedTarget as HTMLElement;
            const floating = context.refs.floating.current;
            const reference = context.refs.reference.current;

            if ((floating && floating.contains(relatedTarget)) || (reference && reference.contains(relatedTarget))) {
                return;
            }

            // Apply safe polygon check if configured
            if (safePolygonOptionsRef.current && reference && floating) {
                const buffer = safePolygonOptionsRef.current.buffer || 0;
                if (isWithinSafePolygon(event, reference, floating, buffer)) {
                    // Set up a check to see if mouse enters floating element
                    const checkInterval = setInterval(() => {
                        const currentMousePos = mousePositionRef.current;
                        if (
                            !isWithinSafePolygon(
                                { clientX: currentMousePos.x, clientY: currentMousePos.y } as MouseEvent,
                                reference,
                                floating,
                                buffer
                            )
                        ) {
                            clearInterval(checkInterval);
                            context.onOpenChange?.(false);
                        }
                    }, 100);

                    // Clear interval after delay
                    setTimeout(() => clearInterval(checkInterval), options?.delay?.close || 300);
                    return;
                }
            }

            const delay = options?.delay?.close || 0;
            if (delay > 0) {
                timeoutRef.current = window.setTimeout(() => {
                    context.onOpenChange?.(false);
                }, delay);
            } else {
                context.onOpenChange?.(false);
            }
        },
        [context, options?.delay?.close]
    );

    useEffect(() => {
        const reference = context.refs.reference.current;
        const floating = context.refs.floating.current;

        if (!reference || !floating) {
            return;
        }

        // Track mouse position globally for safe polygon
        const handleMouseMove = (event: MouseEvent) => {
            mousePositionRef.current = { x: event.clientX, y: event.clientY };
        };

        reference.addEventListener("mouseenter", handleMouseEnter);
        reference.addEventListener("mouseleave", handleMouseLeave as any);
        floating.addEventListener("mouseenter", handleMouseEnter);
        floating.addEventListener("mouseleave", handleMouseLeave as any);
        document.addEventListener("mousemove", handleMouseMove);

        return () => {
            reference.removeEventListener("mouseenter", handleMouseEnter);
            reference.removeEventListener("mouseleave", handleMouseLeave as any);
            floating.removeEventListener("mouseenter", handleMouseEnter);
            floating.removeEventListener("mouseleave", handleMouseLeave as any);
            document.removeEventListener("mousemove", handleMouseMove);

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [handleMouseEnter, handleMouseLeave, context.refs.reference, context.refs.floating]);

    return {
        getReferenceProps: (props = {}) => props,
        getFloatingProps: (props = {}) => props
    };
}

export function safePolygon(options?: { buffer?: number; blockPointerEvents?: boolean; requireIntent?: boolean }): any {
    // Return options to be used by useHover
    return options;
}

/**
 * Check if mouse position is within the safe polygon area
 * Creates a triangular area between reference and floating elements
 */
function isWithinSafePolygon(
    event: { clientX: number; clientY: number },
    reference: HTMLElement,
    floating: HTMLElement,
    buffer: number
): boolean {
    const refRect = reference.getBoundingClientRect();
    const floatRect = floating.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;

    // Create polygon points based on the relative positions
    // This creates a triangular safe area between reference and floating elements
    const polygonPoints: Array<{ x: number; y: number }> = [];

    // Determine which side the floating element is on
    const isRight = floatRect.left >= refRect.right;
    const isLeft = floatRect.right <= refRect.left;
    const isBottom = floatRect.top >= refRect.bottom;
    const isTop = floatRect.bottom <= refRect.top;

    if (isRight) {
        // Floating is to the right of reference
        polygonPoints.push(
            { x: refRect.right - buffer, y: refRect.top - buffer },
            { x: refRect.right - buffer, y: refRect.bottom + buffer },
            { x: floatRect.left + buffer, y: floatRect.bottom + buffer },
            { x: floatRect.left + buffer, y: floatRect.top - buffer }
        );
    } else if (isLeft) {
        // Floating is to the left of reference
        polygonPoints.push(
            { x: refRect.left + buffer, y: refRect.top - buffer },
            { x: refRect.left + buffer, y: refRect.bottom + buffer },
            { x: floatRect.right - buffer, y: floatRect.bottom + buffer },
            { x: floatRect.right - buffer, y: floatRect.top - buffer }
        );
    } else if (isBottom) {
        // Floating is below reference
        polygonPoints.push(
            { x: refRect.left - buffer, y: refRect.bottom - buffer },
            { x: refRect.right + buffer, y: refRect.bottom - buffer },
            { x: floatRect.right + buffer, y: floatRect.top + buffer },
            { x: floatRect.left - buffer, y: floatRect.top + buffer }
        );
    } else if (isTop) {
        // Floating is above reference
        polygonPoints.push(
            { x: refRect.left - buffer, y: refRect.top + buffer },
            { x: refRect.right + buffer, y: refRect.top + buffer },
            { x: floatRect.right + buffer, y: floatRect.bottom - buffer },
            { x: floatRect.left - buffer, y: floatRect.bottom - buffer }
        );
    }

    // Check if point is inside polygon using ray casting algorithm
    return isPointInsidePolygon(x, y, polygonPoints);
}

/**
 * Ray casting algorithm to check if point is inside polygon
 */
function isPointInsidePolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x;
        const yi = points[i].y;
        const xj = points[j].x;
        const yj = points[j].y;

        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}
