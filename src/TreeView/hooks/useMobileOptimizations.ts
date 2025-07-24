import { useEffect, useCallback, useState, useRef } from "react";
import { setTimer } from "../utils/timers";

/**
 * Mobile optimization configuration
 */
interface MobileOptimizationConfig {
    enabled?: boolean;
    minTouchTargetSize?: number; // Minimum touch target size in pixels
    enableMomentumScrolling?: boolean;
    enableRubberBandEffect?: boolean;
    reducedMotion?: boolean;
    narrowScreenThreshold?: number; // Width threshold for narrow screen optimizations
    touchFeedbackDelay?: number; // Haptic feedback delay
}

/**
 * Device capabilities
 */
interface DeviceCapabilities {
    hasTouch: boolean;
    hasHapticFeedback: boolean;
    prefersReducedMotion: boolean;
    isNarrowScreen: boolean;
    pixelRatio: number;
    orientation: "portrait" | "landscape";
}

const DEFAULT_CONFIG: Required<MobileOptimizationConfig> = {
    enabled: true,
    minTouchTargetSize: 44, // iOS Human Interface Guidelines
    enableMomentumScrolling: true,
    enableRubberBandEffect: true,
    reducedMotion: false,
    narrowScreenThreshold: 768,
    touchFeedbackDelay: 10
};

/**
 * Hook for mobile-specific optimizations
 */
export function useMobileOptimizations(
    containerRef: React.RefObject<HTMLElement>,
    config: MobileOptimizationConfig = {}
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>({
        hasTouch: false,
        hasHapticFeedback: false,
        prefersReducedMotion: false,
        isNarrowScreen: false,
        pixelRatio: 1,
        orientation: "portrait"
    });

    const rubberBandRef = useRef({
        isActive: false,
        startY: 0,
        currentY: 0,
        maxStretch: 100 // TODO ADD: Make maxStretch configurable via props
        // TODO ADD: Support horizontal rubber band effect for horizontal scrolling
    });

    /**
     * Detect device capabilities
     */
    useEffect(() => {
        const detectCapabilities = () => {
            const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
            const hasHapticFeedback = "vibrate" in navigator;
            const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const isNarrowScreen = window.innerWidth < mergedConfig.narrowScreenThreshold;
            const pixelRatio = window.devicePixelRatio || 1;
            const orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";

            setDeviceCapabilities({
                hasTouch,
                hasHapticFeedback,
                prefersReducedMotion: mergedConfig.reducedMotion || prefersReducedMotion,
                isNarrowScreen,
                pixelRatio,
                orientation
            });
        };

        detectCapabilities();

        // Re-detect on resize/orientation change
        window.addEventListener("resize", detectCapabilities);
        window.addEventListener("orientationchange", detectCapabilities);

        return () => {
            window.removeEventListener("resize", detectCapabilities);
            window.removeEventListener("orientationchange", detectCapabilities);
        };
    }, [mergedConfig]);

    /**
     * Apply touch-friendly styling
     */
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !mergedConfig.enabled) {
            return;
        }

        // Apply minimum touch target sizes
        // TODO REFACTOR: Move these styles to CSS files instead of injecting them dynamically
        // TODO ADD: Use CSS-in-JS solution for better type safety and performance
        const style = document.createElement("style");
        style.textContent = `
            .tree-node-clickable {
                min-height: ${mergedConfig.minTouchTargetSize}px;
                min-width: ${mergedConfig.minTouchTargetSize}px;
                position: relative;
            }
            
            .tree-node-clickable::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                min-width: ${mergedConfig.minTouchTargetSize}px;
                min-height: ${mergedConfig.minTouchTargetSize}px;
                z-index: 0;
            }
            
            /* Momentum scrolling */
            ${
                mergedConfig.enableMomentumScrolling
                    ? `
                .tree-scroll-container {
                    -webkit-overflow-scrolling: touch;
                    overflow-scrolling: touch;
                }
            `
                    : ""
            }
            
            /* Reduced motion */
            ${
                deviceCapabilities.prefersReducedMotion
                    ? `
                * {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                }
            `
                    : ""
            }
            
            /* Narrow screen optimizations */
            ${
                deviceCapabilities.isNarrowScreen
                    ? `
                .tree-node-content {
                    padding-left: 8px;
                    padding-right: 8px;
                }
                
                .tree-toolbar {
                    flex-wrap: wrap;
                    gap: 4px;
                }
                
                .tree-breadcrumb {
                    font-size: 14px;
                }
            `
                    : ""
            }
        `;

        container.appendChild(style);

        return () => {
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        };
    }, [containerRef, mergedConfig, deviceCapabilities]);

    /**
     * Provide haptic feedback
     */
    const provideHapticFeedback = useCallback(
        (pattern: number | number[] = 10) => {
            if (!deviceCapabilities.hasHapticFeedback || deviceCapabilities.prefersReducedMotion) {
                return;
            }

            try {
                navigator.vibrate(pattern);
            } catch (error) {
                console.debug("Haptic feedback not available:", error); // TODO FIX: Use proper logging instead of console
            }
        },
        [deviceCapabilities]
    );

    /**
     * Apply rubber band effect for overscroll
     */
    const applyRubberBandEffect = useCallback(
        (scrollTop: number, scrollHeight: number, clientHeight: number): number => {
            if (!mergedConfig.enableRubberBandEffect || deviceCapabilities.prefersReducedMotion) {
                return scrollTop;
            }

            const maxScroll = scrollHeight - clientHeight;
            let adjustedScrollTop = scrollTop;

            if (scrollTop < 0) {
                // Overscroll at top
                const overscroll = Math.abs(scrollTop);
                const resistance = 0.5; // TODO ADD: Make resistance factor configurable
                adjustedScrollTop = -overscroll * resistance;
            } else if (scrollTop > maxScroll) {
                // Overscroll at bottom
                const overscroll = scrollTop - maxScroll;
                const resistance = 0.5; // TODO ADD: Make resistance factor configurable
                adjustedScrollTop = maxScroll + overscroll * resistance;
            }

            return adjustedScrollTop;
        },
        [mergedConfig.enableRubberBandEffect, deviceCapabilities.prefersReducedMotion]
    );

    /**
     * Handle touch start for rubber band effect
     */
    const handleTouchStart = useCallback(
        (event: TouchEvent) => {
            if (!mergedConfig.enableRubberBandEffect) {
                return;
            }

            const touch = event.touches[0];
            rubberBandRef.current = {
                isActive: true,
                startY: touch.clientY,
                currentY: touch.clientY,
                maxStretch: 100
            };
        },
        [mergedConfig.enableRubberBandEffect]
    );

    /**
     * Handle touch move for rubber band effect
     */
    const handleTouchMove = useCallback(
        (event: TouchEvent) => {
            if (!mergedConfig.enableRubberBandEffect || !rubberBandRef.current.isActive) {
                return;
            }

            const container = containerRef.current;
            if (!container) {
                return;
            }

            const touch = event.touches[0];
            const deltaY = touch.clientY - rubberBandRef.current.startY;

            // Check if at scroll boundaries
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtTop = scrollTop <= 0;
            const isAtBottom = scrollTop >= scrollHeight - clientHeight;

            if ((isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
                // Apply rubber band resistance
                const resistance = 0.5;
                const stretch = deltaY * resistance;
                const maxStretch = rubberBandRef.current.maxStretch;
                const boundedStretch = Math.max(-maxStretch, Math.min(maxStretch, stretch));

                // Apply visual transform
                container.style.transform = `translateY(${boundedStretch}px)`;
                event.preventDefault();
            }

            rubberBandRef.current.currentY = touch.clientY;
        },
        [containerRef, mergedConfig.enableRubberBandEffect]
    );

    /**
     * Handle touch end for rubber band effect
     */
    const handleTouchEnd = useCallback(() => {
        if (!mergedConfig.enableRubberBandEffect || !rubberBandRef.current.isActive) {
            return;
        }

        const container = containerRef.current;
        if (!container) {
            return;
        }

        // Animate back to original position
        container.style.transition = "transform 0.3s ease-out"; // TODO ADD: Make animation duration configurable
        container.style.transform = "translateY(0)";

        setTimer(() => {
            container.style.transition = "";
        }, 300); // TODO FIX: Match timeout with transition duration

        rubberBandRef.current.isActive = false;
    }, [containerRef, mergedConfig.enableRubberBandEffect]);

    /**
     * Set up rubber band effect listeners
     */
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !mergedConfig.enableRubberBandEffect) {
            return;
        }

        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, [containerRef, mergedConfig.enableRubberBandEffect, handleTouchStart, handleTouchMove, handleTouchEnd]);

    /**
     * Get optimized scroll behavior based on device
     */
    const getScrollBehavior = useCallback((): ScrollBehavior => {
        return deviceCapabilities.prefersReducedMotion ? "auto" : "smooth";
    }, [deviceCapabilities.prefersReducedMotion]);

    /**
     * Check if should use virtual scrolling based on device
     */
    const shouldUseVirtualScrolling = useCallback(
        (itemCount: number): boolean => {
            // Use virtual scrolling more aggressively on mobile devices
            if (deviceCapabilities.hasTouch) {
                return itemCount > 50; // Lower threshold for mobile // TODO ADD: Make thresholds configurable
            }
            return itemCount > 100; // TODO ADD: Make desktop threshold configurable
        },
        [deviceCapabilities.hasTouch]
    );

    return {
        deviceCapabilities,
        provideHapticFeedback,
        applyRubberBandEffect,
        getScrollBehavior,
        shouldUseVirtualScrolling,
        // Expose config for components to use
        touchTargetSize: mergedConfig.minTouchTargetSize,
        isNarrowScreen: deviceCapabilities.isNarrowScreen,
        hasTouch: deviceCapabilities.hasTouch,
        prefersReducedMotion: deviceCapabilities.prefersReducedMotion
    };
}
