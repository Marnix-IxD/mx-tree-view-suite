/**
 * Node Highlighting Utilities
 * Handles highlighting for different node content types:
 * - Text-based (nodeLabelAttribute/Expression): Direct text highlighting
 * - Widget-based (nodeContent): Visual effects like glow/pulse
 */

import { ReactElement } from "react";
import { highlightText, IHighlightConfig } from "./textHighlighting";

// Constants for visual effects
const HIGHLIGHT_ANIMATION_DURATION = 2000; // 2 seconds
const NAVIGATION_ANIMATION_DURATION = 3000; // 3 seconds
const PULSE_ANIMATION_NAME = "mx-tree-node-pulse";
const GLOW_ANIMATION_NAME = "mx-tree-node-glow";

export type NodeContentType = "attribute" | "expression" | "widget";

export interface INodeHighlightConfig {
    nodeId: string;
    contentType: NodeContentType;
    searchQuery?: string;
    isSearchMatch?: boolean;
    isNavigationTarget?: boolean;
    isExternalNavigationTarget?: boolean;
}

export interface INodeHighlightResult {
    // For text-based content
    highlightedContent?: ReactElement;
    // For widget-based content
    visualEffectClass?: string;
    visualEffectStyle?: React.CSSProperties;
    // Accessibility
    ariaLabel?: string;
}

/**
 * Main function to determine how to highlight a node based on its content type
 */
export function getNodeHighlighting(
    content: string | ReactElement | null,
    config: INodeHighlightConfig
): INodeHighlightResult {
    const { contentType, searchQuery, isSearchMatch, isNavigationTarget, isExternalNavigationTarget } = config;

    // Handle text-based content (attribute or expression)
    if (contentType !== "widget" && typeof content === "string") {
        const textHighlightConfig: IHighlightConfig = {
            searchQuery: isSearchMatch ? searchQuery : undefined,
            isNavigationTarget: isNavigationTarget || isExternalNavigationTarget,
            caseSensitive: false
        };

        return {
            highlightedContent: highlightText(content, textHighlightConfig),
            ariaLabel: buildAriaLabel(content, isSearchMatch, isNavigationTarget)
        };
    }

    // Handle widget-based content - use visual effects
    if (contentType === "widget") {
        const effects = getVisualEffects(isSearchMatch, isNavigationTarget, isExternalNavigationTarget);
        return {
            visualEffectClass: effects.className,
            visualEffectStyle: effects.style,
            ariaLabel: buildAriaLabel(null, isSearchMatch, isNavigationTarget)
        };
    }

    return {};
}

/**
 * Get visual effects for widget-based nodes
 */
function getVisualEffects(
    isSearchMatch?: boolean,
    isNavigationTarget?: boolean,
    isExternalNavigationTarget?: boolean
): { className?: string; style?: React.CSSProperties } {
    const classes: string[] = [];
    const styles: React.CSSProperties = {};

    if (isSearchMatch) {
        classes.push("mx-tree-node-search-match");
        // Add pulsing animation for search matches
        styles.animation = `${PULSE_ANIMATION_NAME} 1s ease-in-out 2`;
    }

    if (isNavigationTarget || isExternalNavigationTarget) {
        classes.push("mx-tree-node-navigation-target");
        // Add glow effect for navigation targets
        styles.animation = `${GLOW_ANIMATION_NAME} ${NAVIGATION_ANIMATION_DURATION}ms ease-out`;

        if (isExternalNavigationTarget) {
            classes.push("mx-tree-node-external-navigation");
            // Stronger effect for external navigation
            styles.animationIterationCount = "2";
        }
    }

    return {
        className: classes.length > 0 ? classes.join(" ") : undefined,
        style: Object.keys(styles).length > 0 ? styles : undefined
    };
}

/**
 * Build accessibility label
 */
function buildAriaLabel(content: string | null, isSearchMatch?: boolean, isNavigationTarget?: boolean): string {
    const labels: string[] = [];

    if (content) {
        labels.push(content);
    }

    if (isSearchMatch) {
        labels.push("(search match)");
    }

    if (isNavigationTarget) {
        labels.push("(current navigation target)");
    }

    return labels.join(" ");
}

/**
 * CSS animations for visual effects
 * These should be included in the widget's CSS
 */
export const highlightAnimationsCSS = `
/* Pulse animation for search matches */
@keyframes ${PULSE_ANIMATION_NAME} {
    0% {
        background-color: transparent;
        transform: scale(1);
    }
    50% {
        background-color: rgba(255, 200, 0, 0.3);
        transform: scale(1.02);
    }
    100% {
        background-color: transparent;
        transform: scale(1);
    }
}

/* Glow animation for navigation targets */
@keyframes ${GLOW_ANIMATION_NAME} {
    0% {
        background-color: transparent;
        box-shadow: none;
    }
    20% {
        background-color: rgba(0, 123, 255, 0.2);
        box-shadow: 0 0 15px rgba(0, 123, 255, 0.5);
    }
    80% {
        background-color: rgba(0, 123, 255, 0.1);
        box-shadow: 0 0 10px rgba(0, 123, 255, 0.3);
    }
    100% {
        background-color: transparent;
        box-shadow: none;
    }
}

/* Base classes for highlighted nodes */
.mx-tree-node-search-match {
    position: relative;
    transition: all 300ms ease-out;
}

.mx-tree-node-navigation-target {
    position: relative;
    transition: all 300ms ease-out;
}

.mx-tree-node-external-navigation {
    z-index: 1;
}

/* Text highlighting within nodes */
.mx-tree-search-highlight {
    background-color: rgba(255, 200, 0, 0.4);
    color: inherit;
    font-weight: 600;
    padding: 0 2px;
    border-radius: 2px;
}

.mx-tree-navigation-highlight {
    background-color: rgba(0, 123, 255, 0.2);
    color: inherit;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
}

/* Combined highlight (search + navigation) */
.mx-tree-search-highlight.mx-tree-navigation-highlight {
    background-color: rgba(128, 162, 128, 0.3);
    font-weight: 700;
}
`;

/**
 * Deep search within widget content
 * Attempts to find text within complex widget structures
 */
export function searchWidgetContent(element: HTMLElement, searchQuery: string, maxDepth = 5): boolean {
    if (!element || !searchQuery || maxDepth <= 0) {
        return false;
    }

    const query = searchQuery.toLowerCase();

    // Check text content at current level
    const textContent = element.textContent?.toLowerCase();
    if (textContent && textContent.includes(query)) {
        return true;
    }

    // Check attributes that might contain searchable text
    const searchableAttributes = ["title", "alt", "placeholder", "aria-label"];
    for (const attr of searchableAttributes) {
        const value = element.getAttribute(attr)?.toLowerCase();
        if (value && value.includes(query)) {
            return true;
        }
    }

    // Recursively check children
    for (const child of Array.from(element.children)) {
        if (searchWidgetContent(child as HTMLElement, searchQuery, maxDepth - 1)) {
            return true;
        }
    }

    return false;
}

/**
 * Apply temporary highlight effect to a DOM element
 * Used for widget-based nodes after mounting
 */
export function applyTemporaryHighlight(
    element: HTMLElement,
    type: "search" | "navigation",
    duration: number = HIGHLIGHT_ANIMATION_DURATION
): () => void {
    const originalTransition = element.style.transition;
    const originalTransform = element.style.transform;
    const originalBackground = element.style.backgroundColor;
    const originalBoxShadow = element.style.boxShadow;

    // Apply effect based on type
    element.style.transition = "all 300ms ease-out";

    if (type === "search") {
        element.style.backgroundColor = "rgba(255, 200, 0, 0.3)";
        element.style.transform = "scale(1.02)";
    } else {
        element.style.backgroundColor = "rgba(0, 123, 255, 0.2)";
        element.style.boxShadow = "0 0 15px rgba(0, 123, 255, 0.5)";
    }

    // Remove effect after duration
    const timeoutId = window.setTimeout(() => {
        element.style.transition = originalTransition;
        element.style.transform = originalTransform;
        element.style.backgroundColor = originalBackground;
        element.style.boxShadow = originalBoxShadow;
    }, duration);

    // Return cleanup function
    return () => {
        window.clearTimeout(timeoutId);
        element.style.transition = originalTransition;
        element.style.transform = originalTransform;
        element.style.backgroundColor = originalBackground;
        element.style.boxShadow = originalBoxShadow;
    };
}
