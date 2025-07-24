/**
 * Hook for elastic pull-back animation on floating panels
 * Provides smooth spring-like animation when dragging panels beyond their bounds
 * Supports real-time elastic resistance during drag and cancellation
 */

import { useCallback, useRef, useState, useEffect } from "react";

interface ElasticPullBackOptions {
    maxPullDistance?: number; // Maximum pixels the panel can be pulled
    elasticFactor?: number; // How much resistance to apply (0-1, higher = more resistance)
    snapBackDuration?: number; // Duration of snap-back animation in ms
    threshold?: number; // Minimum pull distance to trigger visual feedback
    closeThreshold?: number; // Distance to trigger panel close
    onClose?: () => void; // Callback when panel should close
}

const DEFAULT_OPTIONS: Required<Omit<ElasticPullBackOptions, "onClose">> = {
    maxPullDistance: 100,
    elasticFactor: 0.3,
    snapBackDuration: 300,
    threshold: 10,
    closeThreshold: 50
};

export function useElasticPullBack(panelRef: React.RefObject<HTMLElement>, options?: ElasticPullBackOptions) {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const [isDragging, setIsDragging] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const startPosRef = useRef<number>(0);
    const currentPosRef = useRef<number>(0);
    const animationRef = useRef<number | null>(null);
    const panelPositionRef = useRef<"left" | "right" | "top" | "bottom">("right");
    const dragDirectionRef = useRef<"closing" | "elastic" | null>(null);

    /**
     * Calculate elastic pull distance with resistance
     */
    const calculateElasticDistance = useCallback(
        (rawDistance: number): number => {
            const { maxPullDistance, elasticFactor } = mergedOptions;

            // Apply elastic resistance formula
            // As the pull increases, resistance increases exponentially
            const normalizedDistance = Math.min(Math.abs(rawDistance), maxPullDistance);
            const resistance = 1 - Math.pow(normalizedDistance / maxPullDistance, elasticFactor);
            return Math.sign(rawDistance) * normalizedDistance * resistance;
        },
        [mergedOptions]
    );

    /**
     * Determine if drag is in closing direction or elastic direction
     */
    const getDragDirection = useCallback(
        (deltaX: number, panelPosition: "left" | "right" | "top" | "bottom"): "closing" | "elastic" => {
            if (panelPosition === "left") {
                // Panel on left: drag left (<0) closes, drag right (>0) is elastic
                return deltaX < 0 ? "closing" : "elastic";
            } else if (panelPosition === "right") {
                // Panel on right: drag right (>0) closes, drag left (<0) is elastic
                return deltaX > 0 ? "closing" : "elastic";
            }
            // For top/bottom, we could add vertical drag support
            return "elastic";
        },
        []
    );

    /**
     * Start drag operation
     */
    const startDrag = useCallback((startX: number, panelPosition: "left" | "right" | "top" | "bottom" = "right") => {
        startPosRef.current = startX;
        currentPosRef.current = startX;
        panelPositionRef.current = panelPosition;
        setIsDragging(true);

        // Cancel any ongoing animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
    }, []);

    /**
     * Update drag position with real-time elastic feedback
     */
    const updateDrag = useCallback(
        (currentX: number) => {
            if (!isDragging) {
                return;
            }

            currentPosRef.current = currentX;
            const rawDeltaX = currentX - startPosRef.current;
            const direction = getDragDirection(rawDeltaX, panelPositionRef.current);
            dragDirectionRef.current = direction;

            if (direction === "elastic") {
                // Apply elastic resistance
                const elasticDistance = calculateElasticDistance(rawDeltaX);
                setPullDistance(elasticDistance);
            } else {
                // Closing direction - no resistance, full movement
                setPullDistance(rawDeltaX);
            }
        },
        [isDragging, calculateElasticDistance, getDragDirection]
    );

    /**
     * End drag - determine if we should close or snap back
     * Handles both quick swipes and slow drags
     */
    const endDrag = useCallback(
        (velocity?: number) => {
            if (!isDragging) {
                return;
            }

            const finalDeltaX = currentPosRef.current - startPosRef.current;
            const direction = dragDirectionRef.current || getDragDirection(finalDeltaX, panelPositionRef.current);
            const absDistance = Math.abs(pullDistance || finalDeltaX);
            const absVelocity = Math.abs(velocity || 0);

            // Quick swipe detection - velocity-based
            const SWIPE_VELOCITY_THRESHOLD = 300; // px/s
            const isQuickSwipe = absVelocity > SWIPE_VELOCITY_THRESHOLD;

            // Determine action based on gesture type
            if (isQuickSwipe) {
                // Quick swipe - use velocity to determine action
                if (direction === "closing") {
                    // Fast swipe in closing direction always closes
                    animateClose();
                } else {
                    // Fast swipe in elastic direction triggers elastic animation
                    // Set initial pull distance based on velocity for visual feedback
                    const swipeDistance =
                        Math.sign(finalDeltaX) * Math.min(mergedOptions.maxPullDistance * 0.7, absVelocity / 10);
                    setPullDistance(swipeDistance);
                    snapBack(velocity);
                }
            } else {
                // Slow drag - use distance thresholds
                if (direction === "closing" && absDistance > mergedOptions.closeThreshold) {
                    // Dragged far enough to close
                    animateClose();
                } else if (direction === "elastic" && absDistance < mergedOptions.threshold) {
                    // Distance too small, just reset
                    setPullDistance(0);
                    setIsDragging(false);
                } else {
                    // Snap back to original position
                    snapBack(velocity);
                }
            }
        },
        [isDragging, pullDistance, mergedOptions, getDragDirection]
    );

    /**
     * Cancel drag - immediately return to original position
     */
    const cancelDrag = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        setPullDistance(0);
        setIsDragging(false);
        dragDirectionRef.current = null;
    }, []);

    /**
     * Animate panel closing
     */
    const animateClose = useCallback(() => {
        const startDistance = pullDistance;
        const targetDistance = panelPositionRef.current === "left" ? -300 : 300;
        const startTime = Date.now();
        const duration = 200; // Faster for closing

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic for smooth close
            const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
            const easedProgress = easeOutCubic(progress);

            const currentDistance = startDistance + (targetDistance - startDistance) * easedProgress;
            setPullDistance(currentDistance);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                // Trigger close callback
                if (mergedOptions.onClose) {
                    mergedOptions.onClose();
                }
                setPullDistance(0);
                setIsDragging(false);
                animationRef.current = null;
            }
        };

        animationRef.current = requestAnimationFrame(animate);
    }, [pullDistance, mergedOptions]);

    /**
     * Snap back animation when released in elastic mode
     */
    const snapBack = useCallback(
        (velocity?: number) => {
            if (!isDragging) {
                return;
            }

            const startDistance = pullDistance;
            const startTime = Date.now();
            // Adjust duration based on velocity - faster velocity = quicker snap back
            const velocityFactor = velocity ? Math.max(0.5, Math.min(1.5, 1000 / Math.abs(velocity))) : 1;
            const duration = mergedOptions.snapBackDuration * velocityFactor;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function for spring-like effect
                const easeOutElastic = (t: number): number => {
                    if (t === 0 || t === 1) {
                        return t;
                    }
                    const p = 0.3;
                    const s = p / 4;
                    return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
                };

                const easedProgress = easeOutElastic(progress);
                const currentDistance = startDistance * (1 - easedProgress);

                setPullDistance(currentDistance);

                if (progress < 1) {
                    animationRef.current = requestAnimationFrame(animate);
                } else {
                    setPullDistance(0);
                    setIsDragging(false);
                    animationRef.current = null;
                }
            };

            animationRef.current = requestAnimationFrame(animate);
        },
        [isDragging, pullDistance, mergedOptions.snapBackDuration]
    );

    /**
     * Apply transform to panel element
     */
    useEffect(() => {
        if (!panelRef.current) {
            return;
        }

        if (Math.abs(pullDistance) > mergedOptions.threshold) {
            // Apply transform with will-change for better performance
            panelRef.current.style.transform = `translateX(${pullDistance}px)`;
            panelRef.current.style.willChange = "transform";

            // Add visual feedback classes
            panelRef.current.classList.add("mx-tree__panel--elastic-pulling");

            // Optional: Add shadow/opacity effect based on pull distance
            const opacity = 1 - (Math.abs(pullDistance) / mergedOptions.maxPullDistance) * 0.3;
            panelRef.current.style.opacity = opacity.toString();
        } else {
            // Reset styles
            panelRef.current.style.transform = "";
            panelRef.current.style.willChange = "";
            panelRef.current.style.opacity = "";
            panelRef.current.classList.remove("mx-tree__panel--elastic-pulling");
        }
    }, [pullDistance, panelRef, mergedOptions]);

    /**
     * Cleanup animation on unmount
     */
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    /**
     * Handle quick swipe gesture without drag lifecycle
     * Used for fast swipe gestures detected by touch handlers
     */
    const handleQuickSwipe = useCallback(
        (direction: "left" | "right", velocity: number) => {
            const swipeDirection = direction === "left" ? -1 : 1;
            const panelPosition = panelPositionRef.current;

            // Determine if swipe is in closing or elastic direction
            const isClosingSwipe =
                (panelPosition === "left" && direction === "left") ||
                (panelPosition === "right" && direction === "right");

            if (isClosingSwipe) {
                // Animate close
                setPullDistance(swipeDirection * mergedOptions.closeThreshold);
                animateClose();
            } else {
                // Elastic pull-back animation
                const swipeDistance = swipeDirection * Math.min(mergedOptions.maxPullDistance * 0.7, velocity / 10);
                setPullDistance(swipeDistance);
                setIsDragging(true); // Temporarily set for snapBack
                snapBack(velocity);
            }
        },
        [mergedOptions, animateClose, snapBack]
    );

    return {
        isDragging,
        pullDistance,
        dragDirection: dragDirectionRef.current,
        // Core drag methods
        startDrag,
        updateDrag,
        endDrag,
        cancelDrag,
        // Quick swipe handler
        handleQuickSwipe,
        // Panel position setter
        setPanelPosition: (position: "left" | "right" | "top" | "bottom") => {
            panelPositionRef.current = position;
        },
        // Helper to determine if currently in elastic mode
        isElastic: dragDirectionRef.current === "elastic",
        // Helper to determine if drag would close panel
        wouldClose: dragDirectionRef.current === "closing" && Math.abs(pullDistance) > mergedOptions.closeThreshold
    };
}

/**
 * CSS styles for elastic pull-back effect
 * Add these to your TreeView styles
 */
export const elasticPullBackStyles = `
.mx-tree__panel--elastic-pulling {
    transition: none !important; /* Disable normal transitions during pull */
    cursor: grabbing;
}

.mx-tree__floating-panel {
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                opacity 0.3s ease-out;
}

/* Optional: Add subtle shadow that increases with pull distance */
.mx-tree__panel--elastic-pulling::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
    opacity: var(--pull-shadow-opacity, 0);
    transition: opacity 0.2s;
}
`;
