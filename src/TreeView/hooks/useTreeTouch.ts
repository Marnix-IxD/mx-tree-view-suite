import { useRef, useCallback, useEffect, useState } from "react";
import { throttle } from "../utils/performanceUtils";

/**
 * Touch gesture configuration
 */
interface TouchGestureConfig {
    enabled?: boolean;
    swipeThreshold?: number; // Minimum distance for swipe detection (px)
    swipeVelocityThreshold?: number; // Minimum velocity for swipe (px/s)
    tapDelay?: number; // Max time for tap detection (ms)
    doubleTapDelay?: number; // Max time between taps for double tap (ms)
    longPressDelay?: number; // Time to trigger long press (ms)
    preventDefaultOnSwipe?: boolean;
    momentumDecay?: number; // Momentum scrolling decay factor
}

/**
 * Touch gesture state
 */
interface TouchState {
    startX: number;
    startY: number;
    startTime: number;
    currentX: number;
    currentY: number;
    velocityX: number;
    velocityY: number;
    lastMoveTime: number;
    isActive: boolean;
    gesture: GestureType | null;
}

/**
 * Gesture types - Enhanced for tree navigation
 */
export type GestureType =
    | "swipe-left"
    | "swipe-right"
    | "swipe-up"
    | "swipe-down"
    | "tap"
    | "double-tap"
    | "long-press"
    | "drag"
    | "pinch-horizontal"
    | "pinch-vertical"
    | "spread-horizontal"
    | "spread-vertical"
    | "drag-left-to-right"
    | "drag-right-to-left"
    | "context-menu";

/**
 * Swipe direction
 */
export type SwipeDirection = "left" | "right" | "up" | "down";

/**
 * Touch event handlers - Enhanced for tree navigation
 */
export interface TouchHandlers {
    // Basic gestures
    onSwipe?: (direction: SwipeDirection, velocity: number) => void;
    onTap?: (x: number, y: number) => void;
    onDoubleTap?: (x: number, y: number) => void;
    onLongPress?: (x: number, y: number) => void;

    // Mouse-specific gestures
    onMiddleClick?: (x: number, y: number) => void; // Quick expand/collapse
    onRightClick?: (x: number, y: number) => void; // Context menu (web)

    // Drag operations
    onDragStart?: (x: number, y: number) => void;
    onDragMove?: (x: number, y: number, deltaX: number, deltaY: number) => void;
    onDragEnd?: (x: number, y: number, velocityX: number, velocityY: number) => void;

    // Tree-specific gestures
    onPinchHorizontal?: (scale: number, centerX: number, centerY: number) => void; // Go up level
    onPinchVertical?: (scale: number, centerX: number, centerY: number) => void; // Collapse section
    onSpreadHorizontal?: (scale: number, centerX: number, centerY: number) => void; // Expand all at level
    onSpreadVertical?: (scale: number, centerX: number, centerY: number) => void; // Expand deep to level

    // Tree navigation
    onNavigateToParent?: () => void; // Go back to parent level
    onNavigateToChild?: () => void; // Go into selected child

    // Context menu
    onContextMenu?: (x: number, y: number) => void;

    // Directional drags
    onDragLeftToRight?: (velocity: number) => void; // Navigate back through panels
    onDragRightToLeft?: (velocity: number) => void; // Show context menu
}

const DEFAULT_CONFIG: Required<TouchGestureConfig> = {
    enabled: true,
    swipeThreshold: 50,
    swipeVelocityThreshold: 300,
    tapDelay: 150, // Reduced for better responsiveness
    doubleTapDelay: 300,
    longPressDelay: 500,
    preventDefaultOnSwipe: true,
    momentumDecay: 0.95
};

/**
 * Hook for handling touch gestures on tree view
 */
export function useTreeTouch(
    elementRef: React.RefObject<HTMLElement>,
    handlers: TouchHandlers,
    config: TouchGestureConfig = {}
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Touch state
    const touchState = useRef<TouchState>({
        startX: 0,
        startY: 0,
        startTime: 0,
        currentX: 0,
        currentY: 0,
        velocityX: 0,
        velocityY: 0,
        lastMoveTime: 0,
        isActive: false,
        gesture: null
    });

    // Gesture detection state
    const lastTapTime = useRef(0);
    const longPressTimer = useRef<number | null>(null);
    const pinchStartDistance = useRef(0);
    const pinchStartData = useRef<{
        distance: number;
        horizontal: boolean;
        touch1: { x: number; y: number };
        touch2: { x: number; y: number };
    } | null>(null);
    const [isGestureActive, setIsGestureActive] = useState(false);
    const touchSampleCount = useRef(0);

    /**
     * Calculate distance between two touch points
     */
    const getTouchDistance = useCallback((touch1: Touch, touch2: Touch): number => {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }, []);

    /**
     * Determine if pinch is primarily horizontal or vertical
     */
    const getPinchOrientation = useCallback((touch1: Touch, touch2: Touch): "horizontal" | "vertical" => {
        const dx = Math.abs(touch1.clientX - touch2.clientX);
        const dy = Math.abs(touch1.clientY - touch2.clientY);
        return dx > dy ? "horizontal" : "vertical";
    }, []);

    /**
     * Gesture precedence rules for conflict resolution
     */
    const gestureConflictResolver = useCallback((gestures: GestureType[]): GestureType => {
        // Priority order: multi-touch > swipe > drag > tap
        if (gestures.some(g => g.includes("pinch") || g.includes("spread"))) {
            return gestures.find(g => g.includes("pinch") || g.includes("spread"))!;
        }
        if (gestures.some(g => g.includes("swipe"))) {
            return gestures.find(g => g.includes("swipe"))!;
        }
        if (gestures.some(g => g.includes("drag"))) {
            return gestures.find(g => g.includes("drag"))!;
        }
        return gestures.find(g => g.includes("tap")) || gestures[0];
    }, []);

    /**
     * Smart gesture differentiation: tap vs swipe vs drag
     */
    const differentiateGesture = useCallback(
        (state: TouchState): "tap" | "swipe" | "drag" => {
            const distance = Math.sqrt(
                Math.pow(state.currentX - state.startX, 2) + Math.pow(state.currentY - state.startY, 2)
            );
            const duration = Date.now() - state.startTime;
            const velocity = Math.sqrt(state.velocityX ** 2 + state.velocityY ** 2);

            // Immediate tap (< 150ms, < 10px movement)
            const movementThreshold = 10; // px - threshold for tap vs drag detection
            if (duration < mergedConfig.tapDelay && distance < movementThreshold) {
                return "tap";
            }

            // Fast swipe (high velocity, significant distance)
            if (velocity > mergedConfig.swipeVelocityThreshold && distance > mergedConfig.swipeThreshold) {
                return "swipe";
            }

            // Slow drag (low velocity, any distance)
            const dragVelocityThreshold = 100; // px/s - threshold for drag detection
            if (velocity < dragVelocityThreshold && distance > 10) {
                return "drag";
            }

            // Default to tap if movement is minimal
            return distance < 10 ? "tap" : "drag";
        },
        [mergedConfig]
    );

    /**
     * Calculate velocity from touch movement
     */
    const calculateVelocity = useCallback(
        (deltaX: number, deltaY: number, deltaTime: number): { vx: number; vy: number } => {
            if (deltaTime === 0) {
                return { vx: 0, vy: 0 };
            }

            const vx = (deltaX / deltaTime) * 1000; // px/s
            const vy = (deltaY / deltaTime) * 1000; // px/s

            return { vx, vy };
        },
        []
    );

    /**
     * Detect swipe gesture
     */
    const detectSwipe = useCallback((): SwipeDirection | null => {
        const state = touchState.current;
        const deltaX = state.currentX - state.startX;
        const deltaY = state.currentY - state.startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        const velocity = Math.sqrt(state.velocityX ** 2 + state.velocityY ** 2);

        // Check if movement meets swipe criteria
        if (velocity < mergedConfig.swipeVelocityThreshold) {
            return null;
        }

        if (absX > absY && absX > mergedConfig.swipeThreshold) {
            return deltaX > 0 ? "right" : "left";
        } else if (absY > mergedConfig.swipeThreshold) {
            return deltaY > 0 ? "down" : "up";
        }

        return null;
    }, [mergedConfig]);

    /**
     * Handle touch start
     */
    const handleTouchStart = useCallback(
        (event: TouchEvent) => {
            if (!mergedConfig.enabled) {
                return;
            }

            const touch = event.touches[0];
            const now = Date.now();

            // Update touch state
            touchState.current = {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: now,
                currentX: touch.clientX,
                currentY: touch.clientY,
                velocityX: 0,
                velocityY: 0,
                lastMoveTime: now,
                isActive: true,
                gesture: null
            };

            setIsGestureActive(true);

            // Check for double tap
            if (now - lastTapTime.current < mergedConfig.doubleTapDelay) {
                handlers.onDoubleTap?.(touch.clientX, touch.clientY);
                lastTapTime.current = 0;
                touchState.current.gesture = "double-tap";
                return;
            }

            // Start long press timer (context menu alternative)
            longPressTimer.current = window.setTimeout(() => {
                if (touchState.current.isActive && !touchState.current.gesture) {
                    handlers.onLongPress?.(touch.clientX, touch.clientY);
                    handlers.onContextMenu?.(touch.clientX, touch.clientY);
                    touchState.current.gesture = "context-menu";
                }
            }, mergedConfig.longPressDelay);

            // Handle pinch start
            if (event.touches.length === 2) {
                const distance = getTouchDistance(event.touches[0], event.touches[1]);
                const orientation = getPinchOrientation(event.touches[0], event.touches[1]);

                pinchStartDistance.current = distance;
                pinchStartData.current = {
                    distance,
                    horizontal: orientation === "horizontal",
                    touch1: { x: event.touches[0].clientX, y: event.touches[0].clientY },
                    touch2: { x: event.touches[1].clientX, y: event.touches[1].clientY }
                };

                // Use gesture conflict resolver to determine gesture priority
                const potentialGestures: GestureType[] = [
                    orientation === "horizontal" ? "pinch-horizontal" : "pinch-vertical"
                ];
                touchState.current.gesture = gestureConflictResolver(potentialGestures);
            }

            // Start drag
            handlers.onDragStart?.(touch.clientX, touch.clientY);
        },
        [mergedConfig, handlers, getTouchDistance, getPinchOrientation, gestureConflictResolver]
    );

    /**
     * Handle touch move - raw unthrottled handler
     */
    const handleTouchMoveRaw = useCallback(
        (event: TouchEvent) => {
            if (!mergedConfig.enabled || !touchState.current.isActive) {
                return;
            }

            const now = Date.now();
            const touch = event.touches[0];
            const state = touchState.current;
            const deltaTime = now - state.lastMoveTime;
            const deltaX = touch.clientX - state.currentX;
            const deltaY = touch.clientY - state.currentY;

            // Sample every 3rd touch point for velocity calculation (performance optimization)
            touchSampleCount.current++;
            let vx = state.velocityX;
            let vy = state.velocityY;

            const touchSamplingRate = 3; // Sample every 3rd touch point for velocity
            if (touchSampleCount.current % touchSamplingRate === 0) {
                const velocityCalc = calculateVelocity(deltaX, deltaY, deltaTime);
                vx = velocityCalc.vx;
                vy = velocityCalc.vy;
            }

            // Update state
            state.currentX = touch.clientX;
            state.currentY = touch.clientY;
            state.velocityX = vx;
            state.velocityY = vy;
            state.lastMoveTime = now;

            // Cancel long press if moved too much
            const totalDeltaX = touch.clientX - state.startX;
            const totalDeltaY = touch.clientY - state.startY;
            const distance = Math.sqrt(totalDeltaX ** 2 + totalDeltaY ** 2);

            const longPressMovementTolerance = 10; // px - max movement for long press
            if (distance > longPressMovementTolerance && longPressTimer.current) {
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }

            // Handle pinch gestures
            if (event.touches.length === 2 && pinchStartData.current) {
                const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
                const scale = currentDistance / pinchStartData.current.distance;
                const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
                const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

                // Determine if it's a pinch (closer) or spread (farther)
                const isPinch = scale < 1;
                const isSpread = scale > 1;

                if (pinchStartData.current.horizontal) {
                    if (isPinch) {
                        handlers.onPinchHorizontal?.(scale, centerX, centerY);
                        state.gesture = "pinch-horizontal";
                    } else if (isSpread) {
                        handlers.onSpreadHorizontal?.(scale, centerX, centerY);
                        state.gesture = "spread-horizontal";
                    }
                } else {
                    if (isPinch) {
                        handlers.onPinchVertical?.(scale, centerX, centerY);
                        state.gesture = "pinch-vertical";
                    } else if (isSpread) {
                        handlers.onSpreadVertical?.(scale, centerX, centerY);
                        state.gesture = "spread-vertical";
                    }
                }

                if (mergedConfig.preventDefaultOnSwipe) {
                    event.preventDefault();
                }
                return;
            }

            // Handle drag
            if (!state.gesture || state.gesture === "drag") {
                state.gesture = "drag";
                handlers.onDragMove?.(touch.clientX, touch.clientY, deltaX, deltaY);

                // Prevent default if swiping
                const swipeDirection = detectSwipe();
                if (swipeDirection && mergedConfig.preventDefaultOnSwipe) {
                    event.preventDefault();
                }
            }
        },
        [mergedConfig, calculateVelocity, detectSwipe, handlers, getTouchDistance]
    );

    /**
     * Throttled touch move handler (60fps)
     */
    const handleTouchMove = useCallback(
        throttle(handleTouchMoveRaw, 16), // Throttle to 60fps
        [handleTouchMoveRaw]
    );

    /**
     * Handle touch end
     */
    const handleTouchEnd = useCallback(
        (_event: TouchEvent) => {
            if (!mergedConfig.enabled || !touchState.current.isActive) {
                return;
            }

            const state = touchState.current;
            const now = Date.now();

            // Clear timers
            if (longPressTimer.current) {
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }

            // Detect gesture type using smart differentiation
            if (!state.gesture) {
                const gestureType = differentiateGesture(state);

                if (gestureType === "swipe") {
                    const swipeDirection = detectSwipe();
                    if (swipeDirection) {
                        const velocity = Math.sqrt(state.velocityX ** 2 + state.velocityY ** 2);
                        handlers.onSwipe?.(swipeDirection, velocity);
                        state.gesture = `swipe-${swipeDirection}` as GestureType;

                        // Tree-specific swipe navigation
                        if (swipeDirection === "left") {
                            handlers.onNavigateToParent?.();
                        } else if (swipeDirection === "right") {
                            handlers.onNavigateToChild?.();
                        }
                    }
                } else if (gestureType === "drag") {
                    // Detect directional drag patterns
                    const deltaX = state.currentX - state.startX;
                    const deltaY = state.currentY - state.startY;
                    const absX = Math.abs(deltaX);
                    const absY = Math.abs(deltaY);
                    const velocity = Math.sqrt(state.velocityX ** 2 + state.velocityY ** 2);

                    // Horizontal drag dominates
                    const directionalDragThreshold = 30; // px - minimum distance for directional drag
                    if (absX > absY && absX > directionalDragThreshold) {
                        if (deltaX > 0) {
                            // Left to right drag
                            handlers.onDragLeftToRight?.(velocity);
                            state.gesture = "drag-left-to-right";
                        } else {
                            // Right to left drag
                            handlers.onDragRightToLeft?.(velocity);
                            state.gesture = "drag-right-to-left";
                        }
                    }
                } else if (gestureType === "tap") {
                    // Tap detected
                    handlers.onTap?.(state.startX, state.startY);
                    lastTapTime.current = now;
                    state.gesture = "tap";
                }
            }

            // End drag
            if (state.gesture === "drag") {
                handlers.onDragEnd?.(state.currentX, state.currentY, state.velocityX, state.velocityY);
            }

            // Reset state
            state.isActive = false;
            setIsGestureActive(false);
        },
        [mergedConfig, detectSwipe, handlers]
    );

    /**
     * Handle touch cancel
     */
    const handleTouchCancel = useCallback(() => {
        if (longPressTimer.current) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        touchState.current.isActive = false;
        setIsGestureActive(false);
    }, []);

    /**
     * Apply momentum scrolling
     */
    const applyMomentum = useCallback(
        (initialVelocityX: number, initialVelocityY: number, onUpdate: (x: number, y: number) => void) => {
            let vx = initialVelocityX;
            let vy = initialVelocityY;
            let x = 0;
            let y = 0;

            const animate = () => {
                // Apply velocity
                // Calculate frame time for accurate momentum
                const frameTime = 1000 / 60; // Default to 60fps
                x += (vx * frameTime) / 1000; // Convert to pixels per frame
                y += (vy * frameTime) / 1000;

                // Apply decay
                vx *= mergedConfig.momentumDecay;
                vy *= mergedConfig.momentumDecay;

                // Continue if velocity is significant
                if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
                    onUpdate(x, y);
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
        },
        [mergedConfig.momentumDecay]
    );

    /**
     * Handle mouse events for web compatibility
     */
    const handleMouseDown = useCallback(
        (event: MouseEvent) => {
            if (!mergedConfig.enabled) {
                return;
            }

            // Middle click (button 1)
            if (event.button === 1) {
                handlers.onMiddleClick?.(event.clientX, event.clientY);
                event.preventDefault();
                return;
            }

            // Right click (button 2)
            if (event.button === 2) {
                handlers.onRightClick?.(event.clientX, event.clientY);
                handlers.onContextMenu?.(event.clientX, event.clientY);
                event.preventDefault();
            }
        },
        [mergedConfig, handlers]
    );

    /**
     * Handle context menu event (right-click)
     */
    const handleContextMenu = useCallback(
        (event: MouseEvent) => {
            if (!mergedConfig.enabled) {
                return;
            }

            handlers.onContextMenu?.(event.clientX, event.clientY);
            event.preventDefault();
        },
        [mergedConfig, handlers]
    );

    /**
     * Set up event listeners
     */
    useEffect(() => {
        const element = elementRef.current;
        if (!element || !mergedConfig.enabled) {
            return;
        }

        // Use passive listeners for better performance
        const touchOptions: AddEventListenerOptions = { passive: !mergedConfig.preventDefaultOnSwipe };
        const mouseOptions: AddEventListenerOptions = { passive: false }; // Need to prevent default for mouse

        // Touch events
        element.addEventListener("touchstart", handleTouchStart, touchOptions);
        element.addEventListener("touchmove", handleTouchMove, touchOptions);
        element.addEventListener("touchend", handleTouchEnd, touchOptions);
        element.addEventListener("touchcancel", handleTouchCancel, touchOptions);

        // Mouse events for web compatibility
        element.addEventListener("mousedown", handleMouseDown, mouseOptions);
        element.addEventListener("contextmenu", handleContextMenu, mouseOptions);

        return () => {
            // Touch events
            element.removeEventListener("touchstart", handleTouchStart);
            element.removeEventListener("touchmove", handleTouchMove);
            element.removeEventListener("touchend", handleTouchEnd);
            element.removeEventListener("touchcancel", handleTouchCancel);

            // Mouse events
            element.removeEventListener("mousedown", handleMouseDown);
            element.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [
        elementRef,
        mergedConfig,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handleTouchCancel,
        handleMouseDown,
        handleContextMenu
    ]);

    return {
        isGestureActive,
        applyMomentum,
        // Expose current gesture for UI feedback
        currentGesture: touchState.current.gesture,
        // Expose velocity for animations
        currentVelocity: {
            x: touchState.current.velocityX,
            y: touchState.current.velocityY
        }
    };
}
