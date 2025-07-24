import { useRef, useMemo, useEffect, useState } from "react";
import { TreeNode } from "../types/TreeTypes";
import { TreeMemoryManager, IMemoryProtectionConfig } from "../utils/treeMemoryManager";
import { useTreeMemoryManagement } from "./useTreeMemoryManagement";

interface UseTreeWithMemoryProps {
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    visibleNodeIds: string[];
    expandedNodes: Set<string>;
    selectedBranches?: Array<{
        branchSelection: string;
        deselectedAncestors: string[];
        deselectedDescendants: string[];
    }>;
    itemHeight: number;
    containerRef: React.RefObject<HTMLDivElement>;
    debugMode: boolean;
    onRequestNodeData?: (nodeIds: string[]) => void;
    onNodeDataLoaded?: (nodeIds: string[]) => void;
    onNodeLoadingError?: (nodeIds: string[], error: string) => void;
}

interface UseTreeWithMemoryReturn {
    enhancedNodes: TreeNode[];
    enhancedNodeMap: Map<string, TreeNode>;
    memoryStats: any;
    recordActivity: (type: "mouse" | "keyboard" | "scroll" | "focus" | "expand") => void;
}

/**
 * Hook that enhances tree nodes with memory management
 * Replaces offloaded nodes with skeleton nodes and triggers reload when needed
 */
export function useTreeWithMemory({
    nodes,
    nodeMap,
    visibleNodeIds,
    expandedNodes,
    selectedBranches,
    itemHeight,
    containerRef,
    debugMode,
    onRequestNodeData,
    onNodeDataLoaded,
    onNodeLoadingError
}: UseTreeWithMemoryProps): UseTreeWithMemoryReturn {
    const memoryManagerRef = useRef<TreeMemoryManager>();
    const previousVisibleRef = useRef<Set<string>>(new Set());
    const loadingNodesRef = useRef<Map<string, { startTime: number; timeout: number }>>(new Map());
    const [loadingStates, setLoadingStates] = useState<Map<string, "idle" | "loading" | "loaded" | "error">>(new Map());

    // Initialize memory manager
    if (!memoryManagerRef.current) {
        memoryManagerRef.current = new TreeMemoryManager(
            5000, // maxCacheSize
            60, // cacheMaxAgeSeconds
            30 // inactivityThresholdSeconds
        );
    }

    // Use the memory management hook
    const { updateViewport, getMemoryStats, recordActivity, updateMemoryProtection } = useTreeMemoryManagement({
        itemHeight,
        containerRef,
        expandedNodes,
        selectedBranches
    });

    // Update memory protection when props change
    useEffect(() => {
        const protectionConfig: IMemoryProtectionConfig = {
            expandedNodes,
            branches: selectedBranches
        };
        updateMemoryProtection(protectionConfig);
    }, [expandedNodes, selectedBranches, updateMemoryProtection]);

    // Update viewport when visible nodes change
    useEffect(() => {
        updateViewport(visibleNodeIds);

        // Check for newly visible skeleton nodes that need data
        const currentVisible = new Set(visibleNodeIds);
        const newlyVisible = visibleNodeIds.filter(id => !previousVisibleRef.current.has(id));
        previousVisibleRef.current = currentVisible;

        if (newlyVisible.length > 0 && memoryManagerRef.current) {
            const skeletonNodeIds: string[] = [];

            newlyVisible.forEach(nodeId => {
                const node = nodeMap.get(nodeId);
                if (node?.isSkeleton) {
                    skeletonNodeIds.push(nodeId);
                }
            });

            if (skeletonNodeIds.length > 0 && onRequestNodeData) {
                if (debugMode) {
                    console.debug(
                        `useTreeWithMemory.ts [MEMORY][LOAD]: Requesting data for ${skeletonNodeIds.length} skeleton nodes`
                    );
                }

                // Mark nodes as loading
                setLoadingStates(prev => {
                    const newStates = new Map(prev);
                    skeletonNodeIds.forEach(nodeId => {
                        newStates.set(nodeId, "loading");

                        // Set timeout for loading failure
                        const timeout = window.setTimeout(() => {
                            if (debugMode) {
                                console.debug(
                                    `useTreeWithMemory.ts [MEMORY][ERROR]: Loading timeout for node ${nodeId}`
                                );
                            }
                            setLoadingStates(states => {
                                const updated = new Map(states);
                                updated.set(nodeId, "error");
                                return updated;
                            });

                            if (onNodeLoadingError) {
                                onNodeLoadingError([nodeId], "Loading timeout");
                            }
                        }, 10000); // 10 second timeout

                        loadingNodesRef.current.set(nodeId, {
                            startTime: Date.now(),
                            timeout
                        });
                    });
                    return newStates;
                });

                onRequestNodeData(skeletonNodeIds);
            }
        }
    }, [visibleNodeIds, nodeMap, updateViewport, onRequestNodeData, onNodeLoadingError, debugMode]);

    // Handle successful node loading
    useEffect(() => {
        const loadedNodeIds: string[] = [];

        // Check which previously skeleton nodes are now loaded
        Array.from(nodeMap.values()).forEach(node => {
            const wasLoading = loadingStates.get(node.id) === "loading";
            const isNowLoaded = !node.isSkeleton;

            if (wasLoading && isNowLoaded) {
                loadedNodeIds.push(node.id);

                // Clear loading timeout
                const loadingInfo = loadingNodesRef.current.get(node.id);
                if (loadingInfo) {
                    clearTimeout(loadingInfo.timeout);
                    loadingNodesRef.current.delete(node.id);
                }
            }
        });

        if (loadedNodeIds.length > 0) {
            if (debugMode) {
                console.debug(`useTreeWithMemory.ts [MEMORY][SUCCESS]: Loaded ${loadedNodeIds.length} nodes`);
            }

            // Update loading states to loaded
            setLoadingStates(prev => {
                const newStates = new Map(prev);
                loadedNodeIds.forEach(nodeId => {
                    newStates.set(nodeId, "loaded");
                });
                return newStates;
            });

            if (onNodeDataLoaded) {
                onNodeDataLoaded(loadedNodeIds);
            }

            // Clear loaded state after transition completes
            setTimeout(() => {
                setLoadingStates(prev => {
                    const newStates = new Map(prev);
                    loadedNodeIds.forEach(nodeId => {
                        newStates.delete(nodeId);
                    });
                    return newStates;
                });
            }, 1000);
        }
    }, [nodeMap, loadingStates, onNodeDataLoaded, debugMode]);

    // Enhance nodes with memory management
    const { enhancedNodes, enhancedNodeMap } = useMemo(() => {
        if (!memoryManagerRef.current) {
            return { enhancedNodes: nodes, enhancedNodeMap: nodeMap };
        }

        const manager = memoryManagerRef.current;
        const newNodes: TreeNode[] = [];
        const newMap = new Map<string, TreeNode>();
        const itemsMap = new Map(Array.from(nodeMap.values()).map(node => [node.id, node.objectItem]));

        // Process each node through memory manager
        const processNode = (node: TreeNode): TreeNode => {
            // Get managed node from memory manager
            const managedNode = manager.getNode(node.id, itemsMap);

            if (!managedNode) {
                // If not in memory manager, create structural data
                manager.createManagedNode(
                    node.objectItem,
                    {
                        id: node.id,
                        parentId: node.parentId,
                        childIds: node.children.map(c => c.id),
                        level: node.level,
                        hasChildren: node.hasChildren || node.children.length > 0,
                        childCount: node.children.length
                    },
                    itemHeight
                );
                return node;
            }

            // Check if this is a skeleton node
            if (managedNode.isSkeleton) {
                if (debugMode) {
                    console.debug(`useTreeWithMemory.ts [MEMORY][SKELETON]: Node ${node.id} is skeleton`);
                }

                // Return skeleton version of the node with loading state
                const loadingState = loadingStates.get(node.id) || "idle";
                const skeletonNode: TreeNode = {
                    ...node,
                    isSkeleton: true,
                    loadingState,
                    // Keep structural properties but indicate data is not loaded
                    label: "",
                    children: node.children.map(processNode) // Process children recursively
                };

                return skeletonNode;
            }

            // Return full node with recursively processed children
            return {
                ...node,
                isSkeleton: false,
                children: node.children.map(processNode)
            };
        };

        // Process all nodes
        nodes.forEach(rootNode => {
            const processedNode = processNode(rootNode);
            newNodes.push(processedNode);
        });

        // Rebuild node map
        const rebuildMap = (node: TreeNode) => {
            newMap.set(node.id, node);
            node.children.forEach(rebuildMap);
        };

        newNodes.forEach(rebuildMap);

        return {
            enhancedNodes: newNodes,
            enhancedNodeMap: newMap
        };
    }, [nodes, nodeMap, itemHeight, debugMode, loadingStates]);

    // Get memory stats
    const memoryStats = useMemo(() => getMemoryStats(), [getMemoryStats]);

    // Log memory stats periodically in debug mode
    useEffect(() => {
        if (!debugMode) {
            return;
        }

        const interval = setInterval(() => {
            const stats = getMemoryStats();
            console.debug("useTreeWithMemory.ts [MEMORY][STATS]:", {
                structuralNodes: stats.structuralNodes,
                cachedNodes: stats.cachedNodes.size,
                maxCacheSize: stats.cachedNodes.maxSize,
                isActive: stats.isActive,
                timeSinceActivity: Math.round(stats.timeSinceActivity / 1000) + "s"
            });
        }, 30000); // Every 30 seconds

        return () => clearInterval(interval);
    }, [debugMode, getMemoryStats]);

    return {
        enhancedNodes,
        enhancedNodeMap,
        memoryStats,
        recordActivity
    };
}
