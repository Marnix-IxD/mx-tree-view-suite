import { useEffect, useState, useCallback } from "react";

interface UseAutoHeightOptions {
    enabled?: boolean;
    fallbackMinHeight?: number;
    fallbackMaxHeight?: number;
    fallbackOffsetBottom?: number;
}

interface UseAutoHeightReturn {
    heightStyle: { height: string } | { maxHeight: string } | {};
    strategy: "parent-constrained" | "viewport-calculated" | "unconstrained";
    parentHasHeight: boolean;
}

/**
 * Hook to determine the best height strategy for the tree container
 * Prefers parent constraints, falls back to viewport calculation only when necessary
 */
export function useAutoHeight(
    containerRef: React.RefObject<HTMLElement>,
    options: UseAutoHeightOptions = {}
): UseAutoHeightReturn {
    const { enabled = true, fallbackMinHeight = 200, fallbackMaxHeight = 800, fallbackOffsetBottom = 20 } = options;

    const [state, setState] = useState<UseAutoHeightReturn>({
        heightStyle: {},
        strategy: "unconstrained",
        parentHasHeight: false
    });

    /**
     * Analyze parent containers to determine height strategy
     */
    const analyzeHeightStrategy = useCallback(() => {
        if (!enabled || !containerRef.current) {
            setState({
                heightStyle: {},
                strategy: "unconstrained",
                parentHasHeight: false
            });
            return;
        }

        let parent = containerRef.current.parentElement;

        // Check immediate parent and ancestors for height constraints
        while (parent) {
            const style = window.getComputedStyle(parent);
            const hasExplicitHeight = style.height !== "auto" && style.height !== "" && style.height !== "100%";

            const hasMaxHeight = style.maxHeight !== "none" && style.maxHeight !== "";

            // Check if parent is a flex container with height
            const isFlexItem =
                parent.parentElement &&
                ["flex", "inline-flex"].includes(window.getComputedStyle(parent.parentElement).display);

            // If parent has explicit height or max-height, we can use 100%
            if (hasExplicitHeight || hasMaxHeight) {
                setState({
                    heightStyle: { height: "100%" },
                    strategy: "parent-constrained",
                    parentHasHeight: true
                });
                return;
            }

            // If parent is a flex item with flex-grow in a sized container
            if (isFlexItem && style.flexGrow !== "0" && parent.parentElement) {
                const grandParentStyle = window.getComputedStyle(parent.parentElement);
                if (grandParentStyle.height !== "auto" && grandParentStyle.height !== "") {
                    setState({
                        heightStyle: { height: "100%" },
                        strategy: "parent-constrained",
                        parentHasHeight: true
                    });
                    return;
                }
            }

            parent = parent.parentElement;
        }

        // No height constraints found - calculate based on viewport
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const availableHeight = viewportHeight - rect.top - fallbackOffsetBottom;

        // Constrain to reasonable limits
        const calculatedHeight = Math.min(Math.max(availableHeight, fallbackMinHeight), fallbackMaxHeight);

        setState({
            heightStyle: { maxHeight: `${calculatedHeight}px` },
            strategy: "viewport-calculated",
            parentHasHeight: false
        });
    }, [enabled, containerRef, fallbackMinHeight, fallbackMaxHeight, fallbackOffsetBottom]);

    /**
     * Set up observers
     */
    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Initial analysis
        analyzeHeightStrategy();

        // Re-analyze on window resize
        const handleResize = () => analyzeHeightStrategy();
        window.addEventListener("resize", handleResize);

        // Observe container and parent changes
        let resizeObserver: ResizeObserver | null = null;
        let mutationObserver: MutationObserver | null = null;

        if (containerRef.current) {
            // Watch for size changes
            resizeObserver = new ResizeObserver(() => analyzeHeightStrategy());
            resizeObserver.observe(containerRef.current);

            // Watch for parent style changes
            const parent = containerRef.current.parentElement;
            if (parent) {
                mutationObserver = new MutationObserver(() => analyzeHeightStrategy());
                mutationObserver.observe(parent, {
                    attributes: true,
                    attributeFilter: ["style", "class"]
                });
            }
        }

        return () => {
            window.removeEventListener("resize", handleResize);
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };
    }, [enabled, containerRef, analyzeHeightStrategy]);

    return state;
}

/**
 * Get recommendations for parent container setup
 */
export function getHeightRecommendations(): string[] {
    return [
        "Set an explicit height on the parent container (e.g., height: 400px)",
        "Use max-height on the parent container (e.g., max-height: 600px)",
        "Use CSS Grid with defined row heights (e.g., grid-template-rows: 1fr)",
        "Use Flexbox with flex-grow on a sized container",
        "For Mendix: Place the tree in a container with defined height or use a scroll container widget"
    ];
}
