import {
    ReactElement,
    createElement,
    useRef,
    useState,
    useEffect,
    useCallback,
    memo,
    Fragment,
    MutableRefObject,
    RefObject
} from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import {
    useFloating,
    autoUpdate,
    offset,
    flip,
    shift,
    autoPlacement,
    hide,
    size,
    FloatingFocusManager,
    useDismiss,
    useRole,
    useInteractions,
    useTransitionStyles,
    useHover,
    safePolygon
} from "../../utils/floatingPanelUtils";
import { TreeViewProps } from "./TreeViewProps";
import { TreeNode, SelectionMode } from "../../types/TreeTypes";
import { TreeNodeComponent } from "../TreeNode/TreeNodeComponent";
import { setTimer, clearTimer, TimerId } from "../../utils/timers";
import { TreeLoadingBar } from "../Tree/TreeLoadingBar";
import { useScreenReaderAnnouncer, treeAnnouncements } from "../../utils/screenReaderAnnouncer";
import { useFloatingPanelScrollPreservation } from "../../hooks/useFloatingPanelScrollPreservation";
import { useElasticPullBack } from "../../hooks/useElasticPullBack";
import { useFloatingPanelTouch } from "../../utils/floatingPanelEnhancements";
import { useFloatingPanelPositioning } from "../../hooks/useFloatingPanelPositioning";

interface FloatingPanelInstance {
    id: string;
    parentNode: TreeNode | null;
    children: TreeNode[];
    level: number;
    x?: number;
    y?: number;
}

interface FloatingTreeViewEnhancedProps extends TreeViewProps {
    // Additional props for floating behavior
    hoverDelay?: number;
    panelWidth?: number;
    panelMaxHeight?: number;
    offsetFromParent?: number;
    treeOperations?: {
        expandPath: (nodeIds: string[]) => Promise<void>;
        ensureNodeLoaded: (nodeId: string) => Promise<void>;
        navigateToNode: (nodeId: string) => Promise<void>;
    };
}

/**
 * FloatingPanel - Individual floating panel showing children of a node
 */

const FloatingPanel = memo(
    ({
        panel,
        onNodeClick,
        onNodeHover,
        onClose,
        selectedNodes,
        highlightedNodes,
        focusedNodeId,
        hoveredNodeId,
        searchQuery,
        showIcons,
        nodeContent,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent,
        expandIcon,
        collapseIcon,
        selectionMode,
        debugMode,
        parentRef,
        offsetPx = 4,
        maxHeight = 400,
        width = 250
    }: {
        panel: FloatingPanelInstance;
        onNodeClick: (node: TreeNode) => void;
        onNodeHover: (node: TreeNode) => void;
        onClose: (panelId: string) => void;
        selectedNodes: Set<string>;
        highlightedNodes: Set<string>;
        focusedNodeId: string | null;
        hoveredNodeId: string | null;
        searchQuery: string;
        showIcons?: boolean;
        nodeContent?: any;
        nodeLabelType?: string;
        nodeLabelAttribute?: any;
        nodeLabelExpression?: any;
        nodeLabelContent?: any;
        expandIcon?: any;
        collapseIcon?: any;
        selectionMode?: string;
        debugMode?: boolean;
        parentRef?: HTMLElement | null;
        offsetPx?: number;
        maxHeight?: number;
        width?: number;
    }) => {
        const [isOpen, setIsOpen] = useState(true);
        const [focusedIndex, setFocusedIndex] = useState<number>(-1);
        const hoverTimeoutRef = useRef<TimerId | null>(null);
        const panelContentRef = useRef<HTMLDivElement>(null);
        const panelRef = useRef<HTMLDivElement>(null);
        const announcer = useScreenReaderAnnouncer();
        const [referenceElement, setReferenceElement] = useState<HTMLElement | null>(null);

        // Setup floating UI with smart positioning
        const { refs, floatingStyles, context, update, placement } = useFloating({
            open: isOpen,
            onOpenChange: setIsOpen,
            middleware: [
                offset(offsetPx),
                autoPlacement({
                    allowedPlacements: ["right", "left", "bottom", "top"],
                    autoAlignment: true
                }),
                flip({
                    fallbackAxisSideDirection: "start"
                }),
                shift({ padding: 8 }),
                size({
                    apply({ availableWidth, availableHeight, elements }) {
                        Object.assign(elements.floating.style, {
                            maxWidth: `${Math.min(width, availableWidth - 16)}px`,
                            maxHeight: `${Math.min(maxHeight, availableHeight - 16)}px`
                        });
                    }
                }),
                hide()
            ],
            whileElementsMounted: autoUpdate,
            placement: "right-start"
        });

        // Get panel placement from middleware data
        const panelPlacement = placement?.side || "right";

        // Setup elastic pull-back animation
        const elasticPullBack = useElasticPullBack(panelRef, {
            maxPullDistance: 80,
            elasticFactor: 0.4,
            snapBackDuration: 250,
            closeThreshold: 50,
            onClose: () => {
                setIsOpen(false);
                onClose(panel.id);
            }
        });

        // Set panel position for elastic calculations
        useEffect(() => {
            elasticPullBack.setPanelPosition(panelPlacement);
        }, [panelPlacement, elasticPullBack]);

        // Setup touch interactions with real-time drag
        const { getTouchProps } = useFloatingPanelTouch(
            {
                refs: {
                    reference: refs.reference as React.RefObject<HTMLElement>,
                    floating: panelRef
                },
                onOpenChange: setIsOpen,
                onStartDrag: (x, position) => {
                    elasticPullBack.startDrag(x, position);
                },
                onUpdateDrag: x => {
                    elasticPullBack.updateDrag(x);
                },
                onEndDrag: velocity => {
                    elasticPullBack.endDrag(velocity);
                },
                onQuickSwipe: (direction, velocity) => {
                    elasticPullBack.handleQuickSwipe(direction, velocity);
                },
                open: isOpen
            },
            {
                longPressDelay: 500,
                preventDefaultTouch: true,
                enableDragNavigation: true,
                panelPlacement
            }
        );

        // Use advanced positioning hook to handle edge cases
        const positioningData = useFloatingPanelPositioning(referenceElement, panelRef.current, {
            strategy: "fixed",
            detectTransformParent: true,
            handleScrollContainers: true,
            handleZoom: true
        });

        // Set the reference element to the parent panel or provided position
        useEffect(() => {
            if (parentRef) {
                refs.setReference(parentRef);
                setReferenceElement(parentRef);
            } else if (panel.x !== undefined && panel.y !== undefined) {
                // Create a virtual element for positioning
                const virtualEl = {
                    getBoundingClientRect: () => {
                        const rect = {
                            x: panel.x!,
                            y: panel.y!,
                            top: panel.y!,
                            left: panel.x!,
                            bottom: panel.y!,
                            right: panel.x!,
                            width: 0,
                            height: 0,
                            toJSON() {
                                return this;
                            }
                        };
                        return rect as DOMRect;
                    }
                } as any;
                refs.setReference(virtualEl);
                setReferenceElement(null); // Virtual elements don't need transform detection
            }
        }, [parentRef, panel.x, panel.y, refs]);

        // Reposition panel when positioning context changes
        useEffect(() => {
            if (positioningData.shouldReposition && update) {
                update();
            }
        }, [positioningData.shouldReposition, update]);

        const hover = useHover(context, {
            handleClose: safePolygon({
                requireIntent: false,
                buffer: 100
            }),
            delay: { open: 0, close: 300 }
        });

        const dismiss = useDismiss(context, {
            ancestorScroll: true,
            bubbles: true
        });

        const role = useRole(context, { role: "menu" });

        // Keyboard navigation
        const handleKeyDown = useCallback(
            (event: React.KeyboardEvent) => {
                const { key } = event;
                const itemCount = panel.children.length;

                if (itemCount === 0) {
                    return;
                }

                switch (key) {
                    case "ArrowDown":
                        event.preventDefault();
                        const nextIndex = (focusedIndex + 1) % itemCount;
                        setFocusedIndex(nextIndex);
                        const nextNode = panel.children[nextIndex];
                        announcer(
                            treeAnnouncements.navigationTo(nextNode.label || "", panel.level, {
                                current: nextIndex + 1,
                                total: itemCount
                            })
                        );
                        break;
                    case "ArrowUp":
                        event.preventDefault();
                        const prevIndex = (focusedIndex - 1 + itemCount) % itemCount;
                        setFocusedIndex(prevIndex);
                        const prevNode = panel.children[prevIndex];
                        announcer(
                            treeAnnouncements.navigationTo(prevNode.label || "", panel.level, {
                                current: prevIndex + 1,
                                total: itemCount
                            })
                        );
                        break;
                    case "ArrowRight":
                    case "Enter":
                        if (focusedIndex >= 0 && focusedIndex < itemCount) {
                            const node = panel.children[focusedIndex];
                            const hasChildren = node.children.length > 0 || !node.isLeaf;
                            if (hasChildren) {
                                event.preventDefault();
                                onNodeClick(node);
                                announcer(treeAnnouncements.nodeExpanded(node.label || "", node.children.length));
                            }
                        }
                        break;
                    case "ArrowLeft":
                    case "Escape":
                        event.preventDefault();
                        onClose(panel.id);
                        if (panel.parentNode) {
                            announcer(treeAnnouncements.nodeCollapsed(panel.parentNode.label || ""));
                        }
                        break;
                    case "Home":
                        event.preventDefault();
                        setFocusedIndex(0);
                        break;
                    case "End":
                        event.preventDefault();
                        setFocusedIndex(itemCount - 1);
                        break;
                    case " ":
                        if (focusedIndex >= 0 && focusedIndex < itemCount) {
                            event.preventDefault();
                            onNodeClick(panel.children[focusedIndex]);
                        }
                        break;
                }
            },
            [panel.children, focusedIndex, onNodeClick, onClose, panel.id, panel.level, panel.parentNode, announcer]
        );

        // Focus the panel when it opens
        useEffect(() => {
            if (isOpen && refs.floating.current) {
                refs.floating.current.focus();
                if (debugMode) {
                    console.debug(`FloatingTreeViewEnhanced [FOCUS]: Panel ${panel.id} focused`);
                }
            }
        }, [isOpen, refs.floating, debugMode, panel.id]);

        // Focus the item when focusedIndex changes
        useEffect(() => {
            if (focusedIndex >= 0 && panelContentRef.current) {
                const items = panelContentRef.current.querySelectorAll(".mx-tree-node");
                const item = items[focusedIndex] as HTMLElement;
                if (item) {
                    item.focus();
                }
            }
        }, [focusedIndex]);

        const { getFloatingProps } = useInteractions([hover, dismiss, role]);

        const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
            duration: 150,
            initial: {
                opacity: 0,
                transform: "scale(0.95)"
            }
        });

        // Handle panel mouse interactions
        const handleMouseEnter = useCallback(() => {
            if (hoverTimeoutRef.current) {
                clearTimer(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }
            if (debugMode) {
                console.debug(`FloatingTreeViewEnhanced [HOVER]: Mouse entered panel ${panel.id}`);
            }
        }, [debugMode, panel.id]);

        const handleMouseLeave = useCallback(() => {
            if (debugMode) {
                console.debug(`FloatingTreeViewEnhanced [HOVER]: Mouse left panel ${panel.id}, closing in 300ms`);
            }
            hoverTimeoutRef.current = setTimer(() => {
                onClose(panel.id);
            }, 300);
        }, [panel.id, onClose, debugMode]);

        useEffect(() => {
            return () => {
                if (hoverTimeoutRef.current) {
                    clearTimer(hoverTimeoutRef.current);
                }
            };
        }, []);

        if (!isOpen || !isMounted) {
            return null;
        }

        // Apply positioning adjustments
        const adjustedStyles = {
            ...floatingStyles,
            ...transitionStyles,
            width: `${width}px`,
            zIndex: 1000 + panel.level,
            // Apply scale compensation for zoom
            transform: `${floatingStyles.transform || ""} scale(${1 / positioningData.scale})`,
            transformOrigin: "top left"
        };

        // Add offset adjustments if using absolute positioning within transform parent
        if (positioningData.strategy === "absolute" && positioningData.transformParent) {
            adjustedStyles.position = "absolute";
            if (typeof adjustedStyles.left === "number") {
                adjustedStyles.left -= positioningData.offsetX;
            }
            if (typeof adjustedStyles.top === "number") {
                adjustedStyles.top -= positioningData.offsetY;
            }
        }

        return createPortal(
            createElement(FloatingFocusManager, {
                context: {
                    refs: {
                        floating: refs.floating as RefObject<HTMLElement>
                    }
                },
                modal: false,
                children: createElement(
                    "div",
                    {
                        ref: (element: HTMLDivElement | null) => {
                            refs.setFloating(element);
                            if (element) {
                                (panelRef as MutableRefObject<HTMLDivElement | null>).current = element;
                            }
                        },
                        className: classNames("mx-tree__floating-panel", {
                            "mx-tree__floating-panel--level-0": panel.level === 0,
                            "mx-tree__floating-panel--has-parent": panel.parentNode !== null,
                            "mx-tree__floating-panel--transform-parent": !!positioningData.transformParent,
                            "mx-tree__floating-panel--zoomed": positioningData.scale !== 1
                        }),
                        style: adjustedStyles,
                        ...getFloatingProps(),
                        ...getTouchProps(),
                        onMouseEnter: handleMouseEnter,
                        onMouseLeave: handleMouseLeave,
                        onKeyDown: handleKeyDown,
                        tabIndex: 0,
                        role: "menu",
                        "aria-label": panel.parentNode ? `Submenu for ${panel.parentNode.label}` : "Tree menu",
                        "data-panel-id": panel.id,
                        "data-panel-strategy": positioningData.strategy
                    },
                    panel.parentNode &&
                        createElement(
                            "div",
                            { className: "mx-tree__floating-panel-header" },
                            createElement(
                                "span",
                                { className: "mx-tree__floating-panel-title" },
                                panel.parentNode.label
                            )
                        ),

                    createElement(
                        "div",
                        { className: "mx-tree__floating-panel-content", ref: panelContentRef },
                        panel.children.length === 0
                            ? createElement(
                                  "div",
                                  { className: "mx-tree__floating-panel-empty" },
                                  "No items to display"
                              )
                            : panel.children.map((node, index) => {
                                  const isSelected = selectedNodes.has(node.id);
                                  const isHighlighted = highlightedNodes.has(node.id);
                                  const isFocused = focusedNodeId === node.id || focusedIndex === index;
                                  const isHovered = hoveredNodeId === node.id || focusedIndex === index;
                                  const hasChildren = node.children.length > 0 || !node.isLeaf;

                                  return createElement(
                                      "div",
                                      {
                                          key: node.id,
                                          role: "menuitem",
                                          "aria-haspopup": hasChildren ? "true" : undefined,
                                          "aria-expanded": hasChildren ? "false" : undefined,
                                          "aria-selected": isSelected ? "true" : "false",
                                          "aria-posinset": index + 1,
                                          "aria-setsize": panel.children.length,
                                          "aria-level": panel.level + 1,
                                          "data-node-id": node.id
                                      },
                                      createElement(TreeNodeComponent, {
                                          key: node.id,
                                          node,
                                          level: 0,
                                          isExpanded: false,
                                          isSelected,
                                          isVisible: true,
                                          isHighlighted,
                                          isFocused,
                                          isHovered,
                                          isSticky: false,
                                          isLastChild: index === panel.children.length - 1,
                                          isSearchMatch: false,
                                          searchQuery,
                                          indentSize: 0,
                                          showLines: false,
                                          showIcons: showIcons || false,
                                          nodeContent,
                                          nodeLabelType:
                                              (nodeLabelType as "attribute" | "expression" | "widget") || "attribute",
                                          nodeLabelAttribute,
                                          nodeLabelExpression,
                                          nodeLabelContent,
                                          expandIcon,
                                          collapseIcon,
                                          enableVisibilityToggle: false,
                                          onClick: () => onNodeClick(node),
                                          onHover: () => onNodeHover(node),
                                          onContextMenu: () => {},
                                          onToggleExpanded: () => onNodeClick(node),
                                          onToggleVisibility: () => {},
                                          selectionMode: (selectionMode as SelectionMode) || "none"
                                      })
                                  );
                              })
                    ),

                    createElement(TreeLoadingBar, { isLoading: false })
                )
            }),
            positioningData.container || document.body
        );
    }
);

FloatingPanel.displayName = "FloatingPanel";

/**
 * FloatingTreeViewEnhanced - Cascading floating panels for tree navigation
 * Each node with children opens a new floating panel showing its children
 */
export function FloatingTreeViewEnhanced(props: FloatingTreeViewEnhancedProps): ReactElement {
    const {
        // Tree data
        rootNodes,
        nodeMap,
        expandedNodes,
        selectedNodes,
        highlightedNodes,
        focusedNodeId,
        hoveredNodeId,
        isLoading,
        isUnavailable,

        // Handlers
        handleNodeClick,
        handleNodeHover,
        toggleExpanded,

        // UI Configuration
        searchQuery,
        showIcons,
        nodeContent,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent,
        expandIcon,
        collapseIcon,
        selectionMode,
        debugMode,

        // Floating specific
        hoverDelay = 300,
        panelWidth = 250,
        panelMaxHeight = 400,
        offsetFromParent = 4
    } = props;

    const [openPanels, setOpenPanels] = useState<Map<string, FloatingPanelInstance>>(new Map());
    const [activePanelId, setActivePanelId] = useState<string | null>(null);
    const [rootFocusedIndex, setRootFocusedIndex] = useState<number>(-1);
    const panelRefs = useRef<Map<string, HTMLElement>>(new Map());
    const hoverTimeoutRef = useRef<TimerId | null>(null);
    const rootContainerRef = useRef<HTMLDivElement>(null);
    const announcer = useScreenReaderAnnouncer();

    // Use scroll preservation for floating panels
    const { navigateToPanelNode, clearPanelHistory } = useFloatingPanelScrollPreservation({
        openPanels,
        nodeMap,
        debugMode: debugMode || false
    });

    // Generate a unique panel ID
    const generatePanelId = useCallback((nodeId: string, level: number) => {
        return `panel-${nodeId}-${level}`;
    }, []);

    // Open a panel for a node's children
    const openPanel = useCallback(
        (parentNode: TreeNode) => {
            const panelId = generatePanelId(parentNode.id, parentNode.level + 1);

            // Close any panels at the same level or deeper
            const newPanels = new Map(openPanels);
            openPanels.forEach((panel, id) => {
                if (panel.level >= parentNode.level + 1) {
                    newPanels.delete(id);
                }
            });

            // Create new panel
            const newPanel: FloatingPanelInstance = {
                id: panelId,
                parentNode,
                children: parentNode.children,
                level: parentNode.level + 1
            };

            newPanels.set(panelId, newPanel);
            setOpenPanels(newPanels);
            setActivePanelId(panelId);

            // Announce panel opening
            const nodeLabel = parentNode.label || parentNode.objectItem?.id || "Node";
            announcer(treeAnnouncements.nodeExpanded(nodeLabel, parentNode.children.length));

            // Trigger expansion in the tree state
            if (!expandedNodes.has(parentNode.id) && toggleExpanded) {
                toggleExpanded(parentNode.id);
            }

            // If we're navigating to a specific child, scroll to it after panel renders
            if (focusedNodeId && parentNode.children.some(child => child.id === focusedNodeId)) {
                requestAnimationFrame(() => {
                    navigateToPanelNode(focusedNodeId, panelId);
                });
            }
        },
        [generatePanelId, openPanels, expandedNodes, toggleExpanded, announcer, focusedNodeId, navigateToPanelNode]
    );

    // Close a panel and all its children
    const closePanel = useCallback(
        (panelId: string) => {
            const panel = openPanels.get(panelId);
            if (!panel) {
                return;
            }

            const newPanels = new Map(openPanels);

            // Remove this panel and all deeper panels
            openPanels.forEach((p, id) => {
                if (p.level >= panel.level) {
                    newPanels.delete(id);
                    clearPanelHistory(id);
                }
            });

            setOpenPanels(newPanels);

            // Update active panel
            if (activePanelId === panelId) {
                const remainingPanels = Array.from(newPanels.values());
                setActivePanelId(remainingPanels.length > 0 ? remainingPanels[remainingPanels.length - 1].id : null);
            }

            // Announce panel closing
            if (panel.parentNode) {
                const nodeLabel = panel.parentNode.label || panel.parentNode.objectItem?.id || "Node";
                announcer(treeAnnouncements.nodeCollapsed(nodeLabel));
            }
        },
        [openPanels, activePanelId, announcer, clearPanelHistory]
    );

    // Handle node click - open/close child panel
    const handleNodeClickInternal = useCallback(
        (node: TreeNode) => {
            // Call the original handler
            if (handleNodeClick) {
                handleNodeClick(node);
            }

            const hasChildren = node.children.length > 0 || !node.isLeaf;
            if (!hasChildren) {
                return;
            }

            const panelId = generatePanelId(node.id, node.level + 1);
            const existingPanel = openPanels.get(panelId);

            if (existingPanel) {
                // Close this panel and all its children
                closePanel(panelId);
            } else {
                // Open new panel for this node's children
                openPanel(node);
            }
        },
        [handleNodeClick, openPanels, generatePanelId, closePanel, openPanel]
    );

    // Handle node hover - open child panel after delay
    const handleNodeHoverInternal = useCallback(
        (node: TreeNode) => {
            // Call the original handler
            if (handleNodeHover) {
                handleNodeHover(node);
            }

            // Clear any pending hover timeout
            if (hoverTimeoutRef.current) {
                clearTimer(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }

            const hasChildren = node.children.length > 0 || !node.isLeaf;
            if (!hasChildren) {
                return;
            }

            // Set timeout to open panel
            hoverTimeoutRef.current = setTimer(() => {
                openPanel(node);
            }, hoverDelay);
        },
        [handleNodeHover, hoverDelay, openPanel]
    );

    // Close all panels when clicking outside
    const handleDocumentClick = useCallback(
        (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Check if click is inside any panel or the main tree
            const isInsidePanel = Array.from(document.querySelectorAll(".mx-tree__floating-panel")).some(panel =>
                panel.contains(target)
            );
            const isInsideTree = document.querySelector(".mx-tree__floating-root")?.contains(target);

            if (!isInsidePanel && !isInsideTree) {
                // Clear history for all panels before closing
                openPanels.forEach((_, panelId) => {
                    clearPanelHistory(panelId);
                });
                setOpenPanels(new Map());
                setActivePanelId(null);
            }
        },
        [openPanels, clearPanelHistory]
    );

    useEffect(() => {
        document.addEventListener("click", handleDocumentClick);
        return () => {
            document.removeEventListener("click", handleDocumentClick);
        };
    }, [handleDocumentClick]);

    // Cleanup hover timeout on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimer(hoverTimeoutRef.current);
            }
        };
    }, []);

    // Handle root panel keyboard navigation
    const handleRootKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            const { key } = event;
            const itemCount = rootNodes.length;

            if (itemCount === 0) {
                return;
            }

            switch (key) {
                case "ArrowDown":
                    event.preventDefault();
                    setRootFocusedIndex(prev => (prev + 1) % itemCount);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    setRootFocusedIndex(prev => (prev - 1 + itemCount) % itemCount);
                    break;
                case "ArrowRight":
                case "Enter":
                    if (rootFocusedIndex >= 0 && rootFocusedIndex < itemCount) {
                        const node = rootNodes[rootFocusedIndex];
                        const hasChildren = node.children.length > 0 || !node.isLeaf;
                        if (hasChildren) {
                            event.preventDefault();
                            handleNodeClickInternal(node);
                        }
                    }
                    break;
                case "Home":
                    event.preventDefault();
                    setRootFocusedIndex(0);
                    break;
                case "End":
                    event.preventDefault();
                    setRootFocusedIndex(itemCount - 1);
                    break;
                case " ":
                    if (rootFocusedIndex >= 0 && rootFocusedIndex < itemCount) {
                        event.preventDefault();
                        handleNodeClickInternal(rootNodes[rootFocusedIndex]);
                    }
                    break;
            }
        },
        [rootNodes, rootFocusedIndex, handleNodeClickInternal]
    );

    // Focus root item when index changes
    useEffect(() => {
        if (rootFocusedIndex >= 0 && rootContainerRef.current) {
            const items = rootContainerRef.current.querySelectorAll(".mx-tree-node");
            const item = items[rootFocusedIndex] as HTMLElement;
            if (item) {
                item.focus();
            }
        }
    }, [rootFocusedIndex]);

    return createElement(
        Fragment,
        null,
        createElement(
            "div",
            {
                ref: rootContainerRef,
                className: classNames("mx-tree__floating-root", {
                    "mx-tree__floating-root--loading": isLoading,
                    "mx-tree__floating-root--unavailable": isUnavailable
                }),
                onKeyDown: handleRootKeyDown,
                tabIndex: 0,
                role: "tree",
                "aria-label": "Tree navigation menu"
            },
            isLoading &&
                createElement(
                    "div",
                    { className: "mx-tree__loading" },
                    createElement("div", { className: "mx-tree__loading-spinner" }),
                    createElement("span", null, "Loading tree data...")
                ),

            isUnavailable &&
                createElement(
                    "div",
                    { className: "mx-tree__unavailable" },
                    createElement("span", null, "No data available")
                ),

            !isLoading &&
                !isUnavailable &&
                rootNodes.length === 0 &&
                createElement(
                    "div",
                    { className: "mx-tree__empty" },
                    createElement("span", null, "No items to display")
                ),

            !isLoading &&
                !isUnavailable &&
                rootNodes.map((node, index) => {
                    const isSelected = selectedNodes.has(node.id);
                    const isHighlighted = highlightedNodes.has(node.id);
                    const isFocused = focusedNodeId === node.id || rootFocusedIndex === index;
                    const isHovered = hoveredNodeId === node.id || rootFocusedIndex === index;

                    return createElement(
                        "div",
                        {
                            key: node.id,
                            ref: (el: HTMLDivElement | null) => {
                                if (el) {
                                    panelRefs.current.set(node.id, el);
                                }
                            }
                        },
                        createElement(TreeNodeComponent, {
                            node,
                            level: 0,
                            isExpanded: false,
                            isSelected,
                            isVisible: true,
                            isHighlighted,
                            isFocused,
                            isHovered,
                            isSticky: false,
                            isLastChild: index === rootNodes.length - 1,
                            isSearchMatch: false,
                            searchQuery,
                            indentSize: 0,
                            showLines: false,
                            showIcons: showIcons || false,
                            nodeContent,
                            nodeLabelType: (nodeLabelType as "attribute" | "expression" | "widget") || "attribute",
                            nodeLabelAttribute,
                            nodeLabelExpression,
                            nodeLabelContent,
                            expandIcon,
                            collapseIcon,
                            enableVisibilityToggle: false,
                            onClick: () => handleNodeClickInternal(node),
                            onHover: () => handleNodeHoverInternal(node),
                            onContextMenu: () => {},
                            onToggleExpanded: () => handleNodeClickInternal(node),
                            onToggleVisibility: () => {},
                            selectionMode: (selectionMode as SelectionMode) || "none"
                        })
                    );
                }),

            createElement(TreeLoadingBar, { isLoading })
        ),

        Array.from(openPanels.values()).map(panel => {
            const parentRef = panel.parentNode ? panelRefs.current.get(panel.parentNode.id) : null;

            return createElement(FloatingPanel, {
                key: panel.id,
                panel,
                onNodeClick: handleNodeClickInternal,
                onNodeHover: handleNodeHoverInternal,
                onClose: closePanel,
                selectedNodes,
                highlightedNodes,
                focusedNodeId,
                hoveredNodeId,
                searchQuery,
                showIcons,
                nodeContent,
                nodeLabelType,
                nodeLabelAttribute,
                nodeLabelExpression,
                nodeLabelContent,
                expandIcon,
                collapseIcon,
                selectionMode,
                debugMode,
                parentRef,
                offsetPx: offsetFromParent,
                maxHeight: panelMaxHeight,
                width: panelWidth
            });
        }),

        debugMode &&
            createElement(
                "div",
                { className: "mx-tree__floating-debug" },
                `Open panels: ${openPanels.size} | Active: ${activePanelId || "none"}`
            )
    );
}

// Memoize for performance
export default memo(FloatingTreeViewEnhanced);
