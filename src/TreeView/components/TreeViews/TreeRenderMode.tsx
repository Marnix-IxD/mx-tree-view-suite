import { ReactElement, createElement, useEffect, useState } from "react";
import { StandardTreeView } from "./StandardTreeView";
import { FloatingTreeViewEnhanced } from "./FloatingTreeViewEnhanced";
import { SlidingPanelView } from "./SlidingPanelView";
import { TreeViewProps } from "./TreeViewProps";

export interface TreeRenderModeProps extends TreeViewProps {
    renderingMode: "standard" | "floating" | "sliding";
    containerElement?: HTMLElement | null;
    onPreloadRange?: (startStructureId: string, endStructureId: string) => void;
    // StandardTreeView specific props
    onRequestNodeData?: (nodeIds: string[]) => void;
    onNodeDataLoaded?: (nodeIds: string[]) => void;
    onNodeLoadingError?: (nodeIds: string[], error: string) => void;
    selectedBranches?: Array<{
        branchSelection: string;
        deselectedAncestors: string[];
        deselectedDescendants: string[];
    }>;
    datasource?: any;
}

/**
 * TreeRenderMode - Dynamic tree view renderer that switches between modes
 *
 * Supports two methods for determining render mode:
 * 1. Property-based: Uses the renderingMode prop (default)
 * 2. CSS class-based: Checks container element for specific classes
 *
 * CSS classes:
 * - .tree-view-standard or .tree-view: Standard tree view
 * - .tree-view-floating: Floating expansion menu
 * - .tree-view-panels or .tree-view-sliding: Sliding panel navigation
 *
 * The CSS class method allows dynamic runtime switching by changing classes
 */
export function TreeRenderMode(props: TreeRenderModeProps): ReactElement {
    const { renderingMode: propRenderingMode, containerElement, ...treeProps } = props;
    const [renderingMode, setRenderingMode] = useState<"standard" | "floating" | "sliding">(propRenderingMode);

    // Check for CSS classes on the container to determine rendering mode
    useEffect(() => {
        if (!containerElement) {
            setRenderingMode(propRenderingMode);
            return;
        }

        // Function to check CSS classes and determine mode
        const checkRenderMode = () => {
            const classList = containerElement.classList;

            if (classList.contains("tree-view-floating")) {
                setRenderingMode("floating");
            } else if (classList.contains("tree-view-panels") || classList.contains("tree-view-sliding")) {
                setRenderingMode("sliding");
            } else if (classList.contains("tree-view") || classList.contains("tree-view-standard")) {
                setRenderingMode("standard");
            } else {
                // Fallback to prop-based mode
                setRenderingMode(propRenderingMode);
            }
        };

        // Initial check
        checkRenderMode();

        // Set up MutationObserver to watch for class changes
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    checkRenderMode();
                }
            });
        });

        // Watch for viewport width changes to auto-switch modes
        const handleResize = () => {
            const width = window.innerWidth;

            // Auto-switch to sliding panels on mobile
            if (width < 768 && renderingMode !== "sliding") {
                setRenderingMode("sliding");
            } else if (width >= 768 && renderingMode === "sliding" && propRenderingMode !== "sliding") {
                // Switch back to original mode when viewport is larger
                setRenderingMode(propRenderingMode);
            }
        };

        // Add resize listener if auto-switching is desired
        if (containerElement && !containerElement.hasAttribute("data-disable-auto-switch")) {
            window.addEventListener("resize", handleResize);
            handleResize(); // Initial check
        }

        observer.observe(containerElement, {
            attributes: true,
            attributeFilter: ["class"]
        });

        return () => {
            observer.disconnect();
            if (containerElement && !containerElement.hasAttribute("data-disable-auto-switch")) {
                window.removeEventListener("resize", handleResize);
            }
        };
    }, [containerElement, propRenderingMode]);

    // Render the appropriate tree view based on the determined mode
    switch (renderingMode) {
        case "floating":
            return <FloatingTreeViewEnhanced {...treeProps} />;

        case "sliding":
            return (
                <SlidingPanelView
                    {...treeProps}
                    onPreloadRange={props.onPreloadRange}
                    enableTouchGestures={props.enableTouchGestures || true}
                />
            );

        case "standard":
        default:
            return (
                <StandardTreeView
                    {...treeProps}
                    onPreloadRange={props.onPreloadRange}
                    onRequestNodeData={props.onRequestNodeData}
                    onNodeDataLoaded={props.onNodeDataLoaded}
                    onNodeLoadingError={props.onNodeLoadingError}
                    selectedBranches={props.selectedBranches}
                    datasource={props.datasource}
                />
            );
    }
}
