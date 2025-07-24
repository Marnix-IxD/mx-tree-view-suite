import { useRef, useCallback, useEffect, useState } from "react";
import { TreeNode } from "../types/TreeTypes";

interface LevelScrollState {
    nodeId: string | null; // null for root level
    scrollTop: number;
    focusedIndex: number;
    timestamp: number;
}

interface NavigationAnimation {
    direction: "forward" | "backward";
    fromLevel: number;
    toLevel: number;
}

interface UseSlidingPanelScrollPreservationProps {
    currentLevelIndex: number;
    navigationHistory: Array<{ nodeId: string | null; scrollPosition: number }>;
    currentLevelNodes: TreeNode[];
    containerRef: React.RefObject<HTMLElement>;
    nodeMap: Map<string, TreeNode>;
    debugMode: boolean;
    onNavigateToNode?: (nodeId: string) => Promise<void>;
    onAnimationStart?: (direction: "forward" | "backward") => void;
    onAnimationComplete?: () => void;
}

interface UseSlidingPanelScrollPreservationReturn {
    saveCurrentScroll: () => void;
    restoreScroll: (levelIndex: number) => void;
    navigateToNode: (nodeId: string) => Promise<void>;
    navigateWithAnimation: (targetNode: TreeNode, direction: "forward" | "backward") => Promise<void>;
    getFocusedNodeForLevel: (levelIndex: number) => string | null;
    maintainFocusDuringNavigation: () => void;
    animationState: NavigationAnimation | null;
}

/**
 * Specialized scroll preservation for sliding panel view
 * Handles single-panel navigation with slide animations
 */
export function useSlidingPanelScrollPreservation({
    currentLevelIndex,
    navigationHistory,
    currentLevelNodes,
    containerRef,
    nodeMap,
    debugMode,
    onNavigateToNode,
    onAnimationStart,
    onAnimationComplete
}: UseSlidingPanelScrollPreservationProps): UseSlidingPanelScrollPreservationReturn {
    const levelScrollStates = useRef<Map<number, LevelScrollState>>(new Map());
    const [animatingNavigation, setAnimatingNavigation] = useState<NavigationAnimation | null>(null);
    const lastFocusedNodes = useRef<Map<number, string>>(new Map());

    /**
     * Save current scroll position and focused item
     */
    const saveCurrentScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const scrollTop = container.scrollTop;
        const focusedElement = container.querySelector(":focus") as HTMLElement;
        let focusedIndex = -1;

        if (focusedElement) {
            const nodeId = focusedElement.getAttribute("data-node-id");
            if (nodeId) {
                focusedIndex = currentLevelNodes.findIndex(n => n.id === nodeId);
            }
        }

        const state: LevelScrollState = {
            nodeId: navigationHistory[currentLevelIndex]?.nodeId || null,
            scrollTop,
            focusedIndex,
            timestamp: Date.now()
        };

        levelScrollStates.current.set(currentLevelIndex, state);

        if (debugMode) {
            console.debug(
                `useSlidingPanelScrollPreservation.ts [SAVE]: Level ${currentLevelIndex} scroll=${scrollTop} focus=${focusedIndex}`
            );
        }
    }, [currentLevelIndex, navigationHistory, currentLevelNodes, containerRef, debugMode]);

    /**
     * Restore scroll position for a specific level
     */
    const restoreScroll = useCallback(
        (levelIndex: number) => {
            const container = containerRef.current;
            if (!container) {
                return;
            }

            const state = levelScrollStates.current.get(levelIndex);
            if (!state) {
                // Default to top
                container.scrollTop = 0;
                return;
            }

            // Restore scroll position
            container.scrollTop = state.scrollTop;

            // Restore focus if possible
            if (state.focusedIndex >= 0 && state.focusedIndex < currentLevelNodes.length) {
                const nodeToFocus = currentLevelNodes[state.focusedIndex];
                if (nodeToFocus) {
                    lastFocusedNodes.current.set(levelIndex, nodeToFocus.id);

                    // Focus after render
                    requestAnimationFrame(() => {
                        const element = container.querySelector(`[data-node-id="${nodeToFocus.id}"]`) as HTMLElement;
                        if (element) {
                            element.focus();
                        }
                    });
                }
            }

            if (debugMode) {
                console.debug(
                    `useSlidingPanelScrollPreservation.ts [RESTORE]: Level ${levelIndex} to scroll=${state.scrollTop}`
                );
            }
        },
        [currentLevelNodes, containerRef, debugMode]
    );

    /**
     * Navigate to a specific node across levels
     */
    const navigateToNode = useCallback(
        async (targetNodeId: string) => {
            // Get path to target node
            const path: string[] = [];
            let currentId: string | null = targetNodeId;

            while (currentId) {
                path.unshift(currentId);
                const node = nodeMap.get(currentId);
                currentId = node?.parentId || null;
            }

            if (debugMode) {
                console.debug(`useSlidingPanelScrollPreservation.ts [NAVIGATE]: Path to ${targetNodeId}:`, path);
            }

            // Save current position before navigating
            saveCurrentScroll();

            // Determine target level
            const targetLevel = path.length - 1;

            // Animate navigation
            if (targetLevel > currentLevelIndex) {
                // Navigate forward
                for (let i = currentLevelIndex + 1; i <= targetLevel; i++) {
                    const nodeId = path[i - 1]; // Parent node for this level
                    await navigateWithAnimation(nodeMap.get(nodeId)!, "forward");
                }
            } else if (targetLevel < currentLevelIndex) {
                // Navigate backward
                for (let i = currentLevelIndex - 1; i >= targetLevel; i--) {
                    await navigateWithAnimation(nodeMap.get(path[i])!, "backward");
                }
            }

            // Scroll to and highlight target node
            requestAnimationFrame(() => {
                const container = containerRef.current;
                if (!container) {
                    return;
                }

                const targetElement = container.querySelector(`[data-node-id="${targetNodeId}"]`) as HTMLElement;
                if (targetElement) {
                    // Scroll into view
                    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

                    // Highlight
                    targetElement.classList.add("mx-tree__node--highlighted");
                    setTimeout(() => {
                        targetElement.classList.remove("mx-tree__node--highlighted");
                    }, 2000);

                    // Focus
                    targetElement.focus();
                }
            });
        },
        [currentLevelIndex, nodeMap, saveCurrentScroll, containerRef, debugMode]
    );

    /**
     * Navigate with slide animation
     */
    const navigateWithAnimation = useCallback(
        async (targetNode: TreeNode, direction: "forward" | "backward"): Promise<void> => {
            const fromLevel = currentLevelIndex;
            const toLevel = direction === "forward" ? fromLevel + 1 : fromLevel - 1;

            // Prevent overlapping animations
            if (animatingNavigation) {
                if (debugMode) {
                    console.debug(
                        "useSlidingPanelScrollPreservation [ANIMATION]: Animation already in progress, skipping"
                    );
                }
                return;
            }

            setAnimatingNavigation({ direction, fromLevel, toLevel });

            // Notify parent of animation start
            if (onAnimationStart) {
                onAnimationStart(direction);
            }

            // Trigger navigation through parent component
            if (onNavigateToNode) {
                await onNavigateToNode(targetNode.id);
            }

            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, 300));

            setAnimatingNavigation(null);

            // Notify parent of animation complete
            if (onAnimationComplete) {
                onAnimationComplete();
            }

            // Restore scroll for new level
            restoreScroll(toLevel);
        },
        [
            currentLevelIndex,
            animatingNavigation,
            debugMode,
            onNavigateToNode,
            restoreScroll,
            onAnimationStart,
            onAnimationComplete
        ]
    );

    /**
     * Get the last focused node for a level
     */
    const getFocusedNodeForLevel = useCallback((levelIndex: number): string | null => {
        return lastFocusedNodes.current.get(levelIndex) || null;
    }, []);

    /**
     * Maintain focus during navigation
     */
    const maintainFocusDuringNavigation = useCallback(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        // If we have a previously focused node for this level, restore focus
        const focusedNodeId = getFocusedNodeForLevel(currentLevelIndex);
        if (focusedNodeId) {
            const element = container.querySelector(`[data-node-id="${focusedNodeId}"]`) as HTMLElement;
            if (element) {
                element.focus();
                return;
            }
        }

        // Otherwise focus first item
        const firstNode = container.querySelector(".mx-tree-node") as HTMLElement;
        if (firstNode) {
            firstNode.focus();
        }
    }, [currentLevelIndex, getFocusedNodeForLevel, containerRef]);

    // Save scroll when level changes
    useEffect(() => {
        return () => {
            // Save current scroll before unmounting
            saveCurrentScroll();
        };
    }, [currentLevelIndex, saveCurrentScroll]);

    // Track focused nodes
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const handleFocus = (event: FocusEvent) => {
            const target = event.target as HTMLElement;
            const nodeId = target.getAttribute("data-node-id");
            if (nodeId) {
                lastFocusedNodes.current.set(currentLevelIndex, nodeId);
            }
        };

        container.addEventListener("focusin", handleFocus);
        return () => container.removeEventListener("focusin", handleFocus);
    }, [currentLevelIndex, containerRef]);

    // Handle swipe gesture scroll preservation
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        let touchStartY = 0;

        const handleTouchStart = (e: TouchEvent) => {
            touchStartY = e.touches[0].clientY;
        };

        const handleTouchMove = (e: TouchEvent) => {
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;

            // If we're at the edge and trying to scroll further, prevent default
            const container = containerRef.current!;
            if (
                (container.scrollTop === 0 && deltaY < 0) ||
                (container.scrollTop >= container.scrollHeight - container.clientHeight && deltaY > 0)
            ) {
                e.preventDefault();
            }
        };

        const container = containerRef.current;
        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
        };
    }, [containerRef]);

    // Clean up old states
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const maxAge = 10 * 60 * 1000; // 10 minutes

            levelScrollStates.current.forEach((state, level) => {
                if (now - state.timestamp > maxAge && Math.abs(level - currentLevelIndex) > 5) {
                    levelScrollStates.current.delete(level);
                    lastFocusedNodes.current.delete(level);
                }
            });
        }, 5 * 60 * 1000); // Check every 5 minutes

        return () => clearInterval(interval);
    }, [currentLevelIndex]);

    return {
        saveCurrentScroll,
        restoreScroll,
        navigateToNode,
        navigateWithAnimation,
        getFocusedNodeForLevel,
        maintainFocusDuringNavigation,
        animationState: animatingNavigation
    };
}
