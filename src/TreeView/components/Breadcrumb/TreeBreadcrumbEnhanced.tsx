import { ReactElement, createElement, useRef, useState, useEffect, useCallback, useMemo, Fragment, memo } from "react";
import classNames from "classnames";
import { TreeNode } from "../../types/TreeTypes";

interface ITreeBreadcrumbEnhancedProps {
    path: TreeNode[];
    // eslint-disable-next-line no-unused-vars -- Interface parameter name for documentation
    onNodeClick: (node: TreeNode) => void;
    className?: string;
    separator?: string | ReactElement;
    maxVisibleItems?: number;
    collapseMode?: "dropdown" | "ellipsis" | "scroll";
}

const DEFAULT_SEPARATOR = "/";
const DEFAULT_MAX_VISIBLE = 5;
const SCROLL_BUTTON_WIDTH = 40;

/**
 * TreeBreadcrumbEnhanced - Smart breadcrumb navigation with overflow handling
 * Supports horizontal scrolling, dropdown collapse, and dynamic expressions
 */
export function TreeBreadcrumbEnhanced(props: ITreeBreadcrumbEnhancedProps): ReactElement {
    const {
        path,
        onNodeClick,
        className,
        separator = DEFAULT_SEPARATOR,
        maxVisibleItems = DEFAULT_MAX_VISIBLE,
        collapseMode = "scroll"
    } = props;

    // Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showStartButton, setShowStartButton] = useState(false);
    const [showEndButton, setShowEndButton] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Create a stable string representation of the path for comparison
    const pathKey = useMemo(() => {
        return path.map(node => node.id).join("/");
    }, [path]);

    // Debug logging to track re-renders
    useEffect(() => {
        console.debug(
            `TreeBreadcrumbEnhanced [BREADCRUMB][RENDER] Path updated - length: ${path.length}, pathKey: "${pathKey}"`
        );
    }, [pathKey]);

    /**
     * Check scroll position and update button visibility
     */
    const checkScrollButtons = useCallback(() => {
        if (!scrollContainerRef.current || collapseMode !== "scroll") {
            return;
        }

        const container = scrollContainerRef.current;
        const { scrollLeft, scrollWidth, clientWidth } = container;

        // Show start button if scrolled past start
        setShowStartButton(scrollLeft > 0);

        // Show end button if more content to the right
        setShowEndButton(scrollLeft + clientWidth < scrollWidth - 1);
    }, [collapseMode]);

    // Check scroll buttons on mount and scroll
    useEffect(() => {
        checkScrollButtons();

        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        // Use ResizeObserver to detect size changes
        const resizeObserver = new ResizeObserver(checkScrollButtons);
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, [checkScrollButtons, pathKey]); // Re-check when path content actually changes

    /**
     * Handle scroll events
     */
    const handleScroll = useCallback(() => {
        checkScrollButtons();
    }, [checkScrollButtons]);

    /**
     * Scroll to start of breadcrumb
     */
    const scrollToStart = useCallback(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                left: 0,
                behavior: "smooth"
            });
        }
    }, []);

    /**
     * Scroll to end of breadcrumb
     */
    const scrollToEnd = useCallback(() => {
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            container.scrollTo({
                left: container.scrollWidth,
                behavior: "smooth"
            });
        }
    }, []);

    /**
     * Get visible and collapsed items based on mode
     */
    const { visibleItems, collapsedItems } = useMemo(() => {
        if (collapseMode === "dropdown" && path.length > maxVisibleItems) {
            // Show first item, dropdown, and last few items
            const firstItems = path.slice(0, 1);
            const lastItems = path.slice(-(maxVisibleItems - 2));
            const collapsed = path.slice(1, -(maxVisibleItems - 2));

            return {
                visibleItems: [...firstItems, null, ...lastItems], // null represents dropdown
                collapsedItems: collapsed
            };
        } else if (collapseMode === "ellipsis" && path.length > maxVisibleItems) {
            // Show first few and last few items
            const halfVisible = Math.floor((maxVisibleItems - 1) / 2);
            const firstItems = path.slice(0, halfVisible);
            const lastItems = path.slice(-halfVisible);

            return {
                visibleItems: [...firstItems, null, ...lastItems], // null represents ellipsis
                collapsedItems: []
            };
        }

        // Scroll mode or no collapse needed
        return {
            visibleItems: path,
            collapsedItems: []
        };
    }, [path, maxVisibleItems, collapseMode]);

    /**
     * Render a breadcrumb item
     */
    const renderItem = (node: TreeNode | null, index: number): ReactElement => {
        // TODO REFACTOR: Extract dropdown and ellipsis rendering to separate components for better code organization
        // Handle dropdown/ellipsis placeholder
        if (node === null) {
            if (collapseMode === "dropdown") {
                return (
                    <div key="dropdown" className="mx-tree-breadcrumb-dropdown-container">
                        <button
                            className="mx-tree-breadcrumb-dropdown-button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            aria-label="Show more items"
                            aria-expanded={dropdownOpen}
                        >
                            <span className="mx-tree-breadcrumb-dropdown-icon">•••</span>
                        </button>

                        {dropdownOpen && (
                            <div className="mx-tree-breadcrumb-dropdown-menu">
                                {collapsedItems.map((item, _index) => (
                                    <button
                                        key={item.id}
                                        className="mx-tree-breadcrumb-dropdown-item"
                                        onClick={() => {
                                            onNodeClick(item);
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        {item.label || item.id}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            } else {
                // Ellipsis mode
                return (
                    <span key="ellipsis" className="mx-tree-breadcrumb-ellipsis">
                        •••
                    </span>
                );
            }
        }

        // Regular breadcrumb item
        const isLast = index === visibleItems.length - 1;

        return (
            <Fragment key={node.id}>
                {index > 0 && (
                    <span className="mx-tree-breadcrumb-separator" aria-hidden="true">
                        {separator}
                    </span>
                )}

                <button
                    className={classNames("mx-tree-breadcrumb-item", {
                        "mx-tree-breadcrumb-item-active": isLast
                    })}
                    onClick={() => onNodeClick(node)}
                    disabled={isLast}
                    aria-current={isLast ? "page" : undefined}
                >
                    <span className="mx-tree-breadcrumb-label">{node.label || node.id}</span>
                </button>
            </Fragment>
        );
    };

    return (
        <nav
            className={classNames("mx-tree-breadcrumb-enhanced", className, {
                "mx-tree-breadcrumb-scroll": collapseMode === "scroll",
                "mx-tree-breadcrumb-dropdown": collapseMode === "dropdown",
                "mx-tree-breadcrumb-ellipsis": collapseMode === "ellipsis"
            })}
            aria-label="Breadcrumb navigation"
        >
            {/* Start scroll button */}
            {collapseMode === "scroll" && showStartButton && (
                <button
                    className="mx-tree-breadcrumb-scroll-button mx-tree-breadcrumb-scroll-button-start"
                    onClick={scrollToStart}
                    aria-label="Scroll to start"
                    style={{ width: SCROLL_BUTTON_WIDTH }}
                >
                    <span className="mx-tree-breadcrumb-scroll-icon">«</span>
                </button>
            )}

            {/* Breadcrumb items container */}
            <div
                ref={scrollContainerRef}
                className="mx-tree-breadcrumb-items-container"
                onScroll={handleScroll}
                style={{
                    overflowX: collapseMode === "scroll" ? "auto" : "visible",
                    scrollbarWidth: "none", // Hide scrollbar
                    msOverflowStyle: "none" // Hide scrollbar in IE
                }}
            >
                <div className="mx-tree-breadcrumb-items">
                    {visibleItems.map((item, index) => renderItem(item, index))}
                </div>
            </div>

            {/* End scroll button */}
            {collapseMode === "scroll" && showEndButton && (
                <button
                    className="mx-tree-breadcrumb-scroll-button mx-tree-breadcrumb-scroll-button-end"
                    onClick={scrollToEnd}
                    aria-label="Scroll to end"
                    style={{ width: SCROLL_BUTTON_WIDTH }}
                >
                    <span className="mx-tree-breadcrumb-scroll-icon">»</span>
                </button>
            )}
        </nav>
    );
}

// Memoize for performance
export default memo(TreeBreadcrumbEnhanced);
