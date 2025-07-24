import { useCallback, useEffect } from "react";
import { TreeKeyboardHookProps } from "../types/TreeTypes";
import { useTypeAheadSearch, isTypeAheadKey } from "./useTypeAheadSearch";
import { useScreenReaderAnnouncer, treeAnnouncements } from "../utils/screenReaderAnnouncer";

export function useTreeKeyboard(props: TreeKeyboardHookProps) {
    const {
        containerRef,
        nodes,
        nodeMap,
        expandedNodes,
        selectedNodes,
        focusedNodeId,
        setFocusedNodeId,
        toggleExpanded,
        toggleSelection,
        selectNode,
        clearSelection,
        enabled,
        isNodeSelected,
        selectionMode,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent
    } = props;

    // Screen reader announcer
    const announce = useScreenReaderAnnouncer();

    // Get flat list of visible nodes
    const getVisibleNodes = useCallback(() => {
        const visible: string[] = [];

        const traverse = (nodeId: string) => {
            visible.push(nodeId);
            const node = nodeMap.get(nodeId);
            if (node && expandedNodes.has(nodeId) && node.children.length > 0) {
                node.children.forEach(child => traverse(child.id));
            }
        };

        // Start from root nodes
        nodes.forEach(node => {
            if (!node.parentId) {
                traverse(node.id);
            }
        });

        return visible;
    }, [nodes, nodeMap, expandedNodes]);

    // Navigate to previous/next node
    const navigateToNode = useCallback(
        (direction: "up" | "down") => {
            const visibleNodes = getVisibleNodes();
            if (visibleNodes.length === 0) {
                return;
            }

            const currentIndex = focusedNodeId ? visibleNodes.indexOf(focusedNodeId) : -1;

            let newIndex: number;
            if (direction === "up") {
                newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
            } else {
                newIndex = currentIndex < visibleNodes.length - 1 ? currentIndex + 1 : visibleNodes.length - 1;
            }

            const newNodeId = visibleNodes[newIndex];
            if (newNodeId) {
                setFocusedNodeId(newNodeId);
                scrollNodeIntoView(newNodeId);

                // Announce navigation
                const node = nodeMap.get(newNodeId);
                if (node) {
                    announce(
                        treeAnnouncements.navigationTo(node.label || newNodeId, node.level || 0, {
                            current: newIndex + 1,
                            total: visibleNodes.length
                        })
                    );
                }
            }
        },
        [focusedNodeId, setFocusedNodeId, getVisibleNodes, nodeMap, announce]
    );

    // Navigate to parent node
    const navigateToParent = useCallback(() => {
        if (!focusedNodeId) {
            return;
        }

        const node = nodeMap.get(focusedNodeId);
        if (node?.parentId) {
            setFocusedNodeId(node.parentId);
            scrollNodeIntoView(node.parentId);
        }
    }, [focusedNodeId, nodeMap, setFocusedNodeId]);

    // Navigate to first child
    const navigateToFirstChild = useCallback(() => {
        if (!focusedNodeId) {
            return;
        }

        const node = nodeMap.get(focusedNodeId);
        if (node && !node.isLeaf && expandedNodes.has(node.id) && node.children.length > 0) {
            const firstChildId = node.children[0].id;
            setFocusedNodeId(firstChildId);
            scrollNodeIntoView(firstChildId);
        }
    }, [focusedNodeId, nodeMap, expandedNodes, setFocusedNodeId]);

    // Navigate to selected nodes (Alt+Arrow functionality)
    const navigateToSelectedNode = useCallback(
        (direction: "next" | "previous" | "first" | "last") => {
            if (selectedNodes.size === 0) {
                return;
            }

            const visibleNodes = getVisibleNodes();
            const checkSelected = isNodeSelected || ((nodeId: string) => selectedNodes.has(nodeId));
            const selectedVisible = visibleNodes.filter(nodeId => checkSelected(nodeId));

            if (selectedVisible.length === 0) {
                return;
            }

            let targetNodeId: string | undefined;

            if (direction === "first") {
                targetNodeId = selectedVisible[0];
            } else if (direction === "last") {
                targetNodeId = selectedVisible[selectedVisible.length - 1];
            } else {
                const currentSelectedIndex = focusedNodeId ? selectedVisible.indexOf(focusedNodeId) : -1;

                if (direction === "next") {
                    if (currentSelectedIndex === -1 || currentSelectedIndex === selectedVisible.length - 1) {
                        // No current selection or at the end, go to first
                        targetNodeId = selectedVisible[0];
                    } else {
                        targetNodeId = selectedVisible[currentSelectedIndex + 1];
                    }
                } else {
                    // previous
                    if (currentSelectedIndex === -1 || currentSelectedIndex === 0) {
                        // No current selection or at the beginning, go to last
                        targetNodeId = selectedVisible[selectedVisible.length - 1];
                    } else {
                        targetNodeId = selectedVisible[currentSelectedIndex - 1];
                    }
                }
            }

            if (targetNodeId) {
                setFocusedNodeId(targetNodeId);
                scrollNodeIntoView(targetNodeId);
            }
        },
        [selectedNodes, focusedNodeId, setFocusedNodeId, getVisibleNodes, isNodeSelected]
    );

    // Scroll node into view
    const scrollNodeIntoView = useCallback(
        (nodeId: string) => {
            if (!containerRef.current) {
                return;
            }

            // Find the node element using data-node-id attribute
            const nodeElement = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`);

            if (nodeElement) {
                nodeElement.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }
        },
        [containerRef]
    );

    // Type-ahead search
    const typeAheadSearch = useTypeAheadSearch({
        nodeMap,
        focusedNodeId,
        setFocusedNodeId,
        getVisibleNodes,
        scrollNodeIntoView,
        enabled,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent
    });

    // Handle keyboard events
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!enabled || !containerRef.current?.contains(event.target as Node)) {
                return;
            }

            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            const isShift = event.shiftKey;

            switch (event.key) {
                case "ArrowUp":
                    event.preventDefault();
                    if (event.altKey) {
                        // Alt+Up: Navigate to previous selected node
                        navigateToSelectedNode("previous");
                    } else if (isShift && focusedNodeId) {
                        // Extend selection up
                        const visibleNodes = getVisibleNodes();
                        const currentIndex = visibleNodes.indexOf(focusedNodeId);
                        if (currentIndex > 0) {
                            const prevNodeId = visibleNodes[currentIndex - 1];
                            toggleSelection(prevNodeId);
                            setFocusedNodeId(prevNodeId);
                        }
                    } else {
                        navigateToNode("up");
                    }
                    break;

                case "ArrowDown":
                    event.preventDefault();
                    if (event.altKey) {
                        // Alt+Down: Navigate to next selected node
                        navigateToSelectedNode("next");
                    } else if (isShift && focusedNodeId) {
                        // Extend selection down
                        const visibleNodes = getVisibleNodes();
                        const currentIndex = visibleNodes.indexOf(focusedNodeId);
                        if (currentIndex < visibleNodes.length - 1) {
                            const nextNodeId = visibleNodes[currentIndex + 1];
                            toggleSelection(nextNodeId);
                            setFocusedNodeId(nextNodeId);
                        }
                    } else {
                        navigateToNode("down");
                    }
                    break;

                case "ArrowLeft":
                    event.preventDefault();
                    if (!focusedNodeId) {
                        return;
                    }

                    const leftNode = nodeMap.get(focusedNodeId);
                    if (leftNode && !leftNode.isLeaf && expandedNodes.has(focusedNodeId)) {
                        // Collapse node
                        toggleExpanded(focusedNodeId);
                    } else {
                        // Navigate to parent
                        navigateToParent();
                    }
                    break;

                case "ArrowRight":
                    event.preventDefault();
                    if (!focusedNodeId) {
                        return;
                    }

                    const rightNode = nodeMap.get(focusedNodeId);
                    if (rightNode && !rightNode.isLeaf) {
                        if (!expandedNodes.has(focusedNodeId)) {
                            // Expand node
                            toggleExpanded(focusedNodeId);
                        } else {
                            // Navigate to first child
                            navigateToFirstChild();
                        }
                    }
                    break;

                case "Enter":
                case " ": // Space
                    event.preventDefault();
                    if (focusedNodeId) {
                        const node = nodeMap.get(focusedNodeId);
                        if (isCtrlOrCmd && event.key === " ") {
                            // Ctrl+Space: Toggle selection without moving focus
                            toggleSelection(focusedNodeId);
                            // Announce selection change
                            if (node) {
                                const isSelected = isNodeSelected ? isNodeSelected(focusedNodeId) : false;
                                announce(
                                    isSelected
                                        ? treeAnnouncements.nodeDeselected(
                                              node.label || focusedNodeId,
                                              selectedNodes.size - 1
                                          )
                                        : treeAnnouncements.nodeSelected(
                                              node.label || focusedNodeId,
                                              selectedNodes.size + 1
                                          )
                                );
                            }
                        } else if (event.key === " " && node && !node.isLeaf) {
                            // Space toggles expansion
                            toggleExpanded(focusedNodeId);
                            // Announce expansion change
                            const isExpanded = expandedNodes.has(focusedNodeId);
                            announce(
                                isExpanded
                                    ? treeAnnouncements.nodeCollapsed(node.label || focusedNodeId)
                                    : treeAnnouncements.nodeExpanded(node.label || focusedNodeId, node.children?.length)
                            );
                        } else {
                            // Enter selects node
                            selectNode(focusedNodeId);
                            // Announce selection
                            if (node) {
                                announce(treeAnnouncements.nodeSelected(node.label || focusedNodeId));
                            }
                        }
                    }
                    break;

                case "Home":
                    event.preventDefault();
                    if (isCtrlOrCmd) {
                        if (selectedNodes.size > 0) {
                            // Ctrl+Home with selection: Go to first selected node
                            navigateToSelectedNode("first");
                        } else {
                            // Ctrl+Home: Go to first node
                            const visibleNodes = getVisibleNodes();
                            if (visibleNodes.length > 0) {
                                setFocusedNodeId(visibleNodes[0]);
                                scrollNodeIntoView(visibleNodes[0]);
                            }
                        }
                    }
                    break;

                case "End":
                    event.preventDefault();
                    if (isCtrlOrCmd) {
                        if (selectedNodes.size > 0) {
                            // Ctrl+End with selection: Go to last selected node
                            navigateToSelectedNode("last");
                        } else {
                            // Ctrl+End: Go to last node
                            const visibleNodes = getVisibleNodes();
                            if (visibleNodes.length > 0) {
                                const lastId = visibleNodes[visibleNodes.length - 1];
                                setFocusedNodeId(lastId);
                                scrollNodeIntoView(lastId);
                            }
                        }
                    }
                    break;

                case "a":
                case "A":
                    if (isCtrlOrCmd) {
                        event.preventDefault();
                        if (isShift) {
                            // Ctrl+Shift+A: Deselect all
                            clearSelection();
                            announce(treeAnnouncements.allDeselected());
                        } else if (selectionMode === "multi") {
                            // Ctrl+A: Select all visible nodes (only in multi-select mode)
                            const visibleNodes = getVisibleNodes();
                            visibleNodes.forEach(nodeId => {
                                selectNode(nodeId);
                            });
                            announce(treeAnnouncements.allSelected(visibleNodes.length));
                        }
                    }
                    break;

                case "Escape":
                    event.preventDefault();
                    // Clear type-ahead search first if active
                    if (typeAheadSearch.isSearching) {
                        typeAheadSearch.clearSearch();
                        announce("Search cleared");
                    } else {
                        // Then clear selection
                        clearSelection();
                        announce(treeAnnouncements.allDeselected());
                    }
                    break;

                case "*":
                    // Expand all siblings
                    event.preventDefault();
                    if (focusedNodeId) {
                        const node = nodeMap.get(focusedNodeId);
                        if (node?.parentId) {
                            // Expand all siblings
                            const parent = nodeMap.get(node.parentId);
                            parent?.children.forEach(sibling => {
                                if (!sibling.isLeaf && !expandedNodes.has(sibling.id)) {
                                    toggleExpanded(sibling.id);
                                }
                            });
                        } else {
                            // No parent (root level), expand all root nodes
                            nodes.forEach(rootNode => {
                                if (!rootNode.parentId && !rootNode.isLeaf && !expandedNodes.has(rootNode.id)) {
                                    toggleExpanded(rootNode.id);
                                }
                            });
                        }
                    }
                    break;

                default:
                    // Handle type-ahead search for printable characters
                    if (isTypeAheadKey(event)) {
                        const handled = typeAheadSearch.handleCharacter(event.key);
                        if (handled) {
                            event.preventDefault();
                            // Announce the navigation
                            const node = nodeMap.get(focusedNodeId || "");
                            if (node && focusedNodeId) {
                                announce(treeAnnouncements.navigationTo(node.label || focusedNodeId, node.level || 0));
                            }
                        }
                    }
                    break;
            }
        },
        [
            enabled,
            containerRef,
            focusedNodeId,
            nodeMap,
            nodes,
            expandedNodes,
            selectedNodes,
            navigateToNode,
            navigateToParent,
            navigateToFirstChild,
            navigateToSelectedNode,
            toggleExpanded,
            toggleSelection,
            selectNode,
            clearSelection,
            setFocusedNodeId,
            scrollNodeIntoView,
            getVisibleNodes,
            selectionMode,
            typeAheadSearch,
            announce
        ]
    );

    // Attach keyboard event listeners
    useEffect(() => {
        if (!enabled) {
            return;
        }

        document.addEventListener("keydown", handleKeyDown);
        // TODO ADD: Add keyboard event listener to container for better scoping
        // TODO ADD: Support for type-ahead search (accumulate keystrokes to jump to matching nodes)
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [enabled, handleKeyDown]);

    // Focus management
    useEffect(() => {
        if (!containerRef.current || !focusedNodeId) {
            return;
        }

        // Find and focus the node element
        const nodeElement = containerRef.current.querySelector(`[role="treeitem"][tabindex="0"]`) as HTMLElement; // TODO FIX: Find node by focusedNodeId instead of just first focusable node

        if (nodeElement && document.activeElement !== nodeElement) {
            nodeElement.focus();
        }
    }, [containerRef, focusedNodeId]);
}
