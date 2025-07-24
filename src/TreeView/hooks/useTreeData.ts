import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { ObjectItem, ListReferenceValue } from "mendix";
import { TreeNode, TreeDataHookProps } from "../types/TreeTypes";
import {
    buildTreeFromStructureId,
    buildTreeFromParentId,
    buildTreeFromAssociation,
    sortNodes
} from "../utils/treeBuilder";
import { getDescendantIds as getDescendantIdsUtil } from "../utils/treeTraversal";
import { useSmartDataLoader } from "./useSmartDataLoader";
import {
    StructureIDMode,
    detectStructureIDMode,
    generateStructureIdsFromParentId,
    generateStructureIdsFromAssociation,
    validateTreeStructure,
    detectCircularReferences,
    StructureIDValidationResult
} from "../utils/structureIdGenerator";
import { WorkerManager, ISerializedNode } from "../utils/workerManager";
import { PERFORMANCE_THRESHOLDS, TREE_LIMITS } from "../constants/treeConstants";

export function useTreeData(props: TreeDataHookProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadedChildren, setLoadedChildren] = useState<Map<string, ObjectItem[]>>(new Map());
    const [dynamicItems, setDynamicItems] = useState<ObjectItem[]>([]);
    const [, setLoadedLevels] = useState<Set<number>>(new Set([0]));
    const workerManagerRef = useRef<WorkerManager | null>(null);

    // Initialize worker manager
    useEffect(() => {
        workerManagerRef.current = WorkerManager.getInstance();
        return () => {
            // Worker manager is singleton, don't destroy on unmount
        };
    }, []);

    // Initialize smart data loader
    const {
        loadChildren: smartLoadChildren,
        searchNodes,
        getTotalCount,
        clearCache
    } = useSmartDataLoader({
        ...props,
        dataLoadingMode: props.dataLoadingMode || "progressive",
        initialLoadLimit: props.initialLoadLimit || 100
    });

    // Determine if we should use smart loading
    const shouldUseSmartLoading = useMemo(() => {
        if (props.dataLoadingMode === "all") {
            return false;
        }
        if (props.dataLoadingMode === "onDemand") {
            return true;
        }

        // Progressive mode: auto-detect based on data size
        const totalCount = getTotalCount();
        return totalCount > PERFORMANCE_THRESHOLDS.SMART_LOADING_THRESHOLD;
    }, [props.dataLoadingMode, getTotalCount]);

    // Helper function to build tree using Web Worker

    const buildTreeWithWorker = useCallback(
        async (
            items: ObjectItem[],
            nodeIdAttribute: any,
            parentIdAttribute: any,
            structureIdAttribute: any,
            sortOrderAttribute: any
        ): Promise<TreeNode[] | null> => {
            const workerManager = workerManagerRef.current;

            if (!workerManager || items.length < 500) {
                // Not worth using worker for small datasets
                return null;
            }

            try {
                // Serialize nodes for worker
                const serializedNodes: ISerializedNode[] = items.map(item => ({
                    id: String(nodeIdAttribute.get(item).value || ""),
                    label: String(nodeIdAttribute.get(item).value || ""),
                    parentId: parentIdAttribute ? String(parentIdAttribute.get(item).value || null) : null,
                    structureId: structureIdAttribute ? String(structureIdAttribute.get(item).value || null) : null,
                    sortValue: sortOrderAttribute ? sortOrderAttribute.get(item).value : undefined
                }));

                // Send to worker
                const result = await workerManager.sendWork<any>(
                    "treeBuilder",
                    "BUILD_TREE",
                    {
                        nodes: serializedNodes,
                        sortOrderAttribute: sortOrderAttribute?.id,
                        debugMode: props.debugMode
                    },
                    progress => {
                        if (props.debugMode) {
                            console.debug(
                                `useTreeData.ts [DATA][BUILD_TREE]: Tree building progress: ${progress.processed}/${progress.total}`
                            );
                        }
                    }
                );

                // Create object item map for reconnection
                const itemMap = new Map<string, ObjectItem>();
                items.forEach(item => {
                    const id = String(nodeIdAttribute.get(item).value || "");
                    itemMap.set(id, item);
                });

                // Reconnect with ObjectItems
                const reconnectTree = (nodes: any[]): TreeNode[] => {
                    return nodes.map(node => ({
                        ...node,
                        objectItem: itemMap.get(node.id)!,
                        children: node.children ? reconnectTree(node.children) : []
                    }));
                };

                return reconnectTree(result.tree);
            } catch (error) {
                console.warn("Worker tree building failed, falling back to main thread:", error);
                return null;
            }
        },
        []
    );

    // State for worker-built tree
    const [workerTreeNodes, setWorkerTreeNodes] = useState<TreeNode[] | null>(null);

    // Try to build tree with worker for large datasets
    useEffect(() => {
        const items = [...(props.datasource?.items || []), ...dynamicItems];

        if (items.length >= PERFORMANCE_THRESHOLDS.WORKER_THRESHOLD && !workerTreeNodes) {
            buildTreeWithWorker(
                items,
                props.nodeIdAttribute,
                props.parentIdAttribute,
                props.structureIdAttribute,
                props.sortOrderAttribute
            ).then(result => {
                if (result) {
                    setWorkerTreeNodes(result);
                }
            });
        }
    }, [props.datasource?.items, dynamicItems, buildTreeWithWorker, workerTreeNodes]);

    // Track previous items and results to detect actual data changes
    const previousItemsRef = useRef<ObjectItem[]>([]);
    const previousResultRef = useRef<{
        nodes: TreeNode[];
        nodeMap: Map<string, TreeNode>;
        rootNodes: TreeNode[];
        structureIdMode: StructureIDMode;
        generatedStructureIds: Map<string, string>;
        validationResult: StructureIDValidationResult | null;
    } | null>(null);

    // Build tree structure with structure ID support
    const { nodes, nodeMap, rootNodes, structureIdMode, generatedStructureIds, validationResult } = useMemo(() => {
        // Combine datasource items with dynamically loaded items
        const allItems = [...(props.datasource?.items || []), ...dynamicItems];

        if (allItems.length === 0) {
            return {
                nodes: [],
                nodeMap: new Map(),
                rootNodes: [],
                structureIdMode: StructureIDMode.AUTO_GENERATED,
                generatedStructureIds: new Map(),
                validationResult: null
            };
        }

        // Check if items have actually changed by comparing object references
        const itemsChanged =
            allItems.length !== previousItemsRef.current.length ||
            allItems.some((item, index) => item !== previousItemsRef.current[index]);

        if (!itemsChanged && previousResultRef.current) {
            // Items haven't changed, reuse the existing result to prevent unnecessary re-renders
            console.debug("useTreeData [DATA][CACHE] Reusing existing nodeMap as items haven't changed");
            return previousResultRef.current;
        }

        // Items have changed, update the reference
        previousItemsRef.current = allItems;

        let treeNodes: TreeNode[] = [];
        const items = allItems;
        let structureIdMode = StructureIDMode.AUTO_GENERATED;
        let generatedIds = new Map<string, string>();

        // Detect structure ID mode and validate tree structure
        if (props.structureIdAttribute) {
            structureIdMode = detectStructureIDMode(items, props.structureIdAttribute);
        }

        // Validate tree structure and check for issues
        const validationResult = validateTreeStructure(items, props.nodeIdAttribute, props.structureIdAttribute);

        // Check for circular references if using parent relationships
        if (props.parentIdAttribute && props.parentRelationType === "attribute") {
            const circularErrors = detectCircularReferences(items, props.nodeIdAttribute, props.parentIdAttribute);
            validationResult.errors.push(...circularErrors);
            if (circularErrors.length > 0) {
                validationResult.isValid = false;
            }
        }

        // Log validation results
        if (validationResult.errors.length > 0) {
            console.error("Tree validation errors:", validationResult.errors);
        }
        if (validationResult.warnings.length > 0) {
            console.warn("Tree validation warnings:", validationResult.warnings);
        }

        // Performance warning for large datasets without structure IDs
        if (
            structureIdMode === StructureIDMode.AUTO_GENERATED &&
            items.length > PERFORMANCE_THRESHOLDS.LARGE_DATASET_WARNING * 10
        ) {
            console.warn(
                `Large dataset (${items.length} nodes) without structure IDs detected. ` +
                    `Client-side generation may take ${Math.round(
                        items.length / PERFORMANCE_THRESHOLDS.NODE_PROCESSING_RATE
                    )}ms+. ` +
                    `Consider using server-side structure ID generation for optimal performance.`
            );
        }

        // If worker succeeded, use its result
        if (workerTreeNodes) {
            treeNodes = workerTreeNodes;
        } else {
            // Build tree based on parent relation type
            switch (props.parentRelationType) {
                case "structureId":
                    if (props.structureIdAttribute) {
                        treeNodes = buildTreeFromStructureId(
                            items,
                            props.nodeIdAttribute,
                            props.structureIdAttribute,
                            props.visibilityAttribute
                        );
                    } else {
                        // Graceful degradation: show all items as root level
                        treeNodes = createFlatTreeStructure(items);
                    }
                    break;

                case "association":
                    if (props.parentAssociation) {
                        treeNodes = buildTreeFromAssociation(
                            items,
                            props.nodeIdAttribute,
                            props.parentAssociation,
                            props.visibilityAttribute
                        );

                        // Generate structure IDs if needed (client-side only, not committed)
                        if (structureIdMode !== StructureIDMode.USER_PROVIDED && props.structureIdAttribute) {
                            // Ensure parentAssociation is ListReferenceValue, not ListReferenceSetValue
                            const parentAssoc = props.parentAssociation;
                            if (parentAssoc && "get" in parentAssoc) {
                                // Type check: only use ListReferenceValue (single reference)
                                const testValue = parentAssoc.get(items[0]);
                                if (testValue && !Array.isArray(testValue.value)) {
                                    generatedIds = generateStructureIdsFromAssociation(
                                        items,
                                        props.nodeIdAttribute,
                                        parentAssoc as ListReferenceValue,
                                        undefined,
                                        props.sortOrderAttribute
                                    );
                                }
                            }
                        }
                    } else {
                        // Graceful degradation: show all items as root level
                        treeNodes = createFlatTreeStructure(items);
                    }
                    break;

                case "attribute":
                default:
                    if (props.parentIdAttribute) {
                        treeNodes = buildTreeFromParentId(
                            items,
                            props.nodeIdAttribute,
                            props.parentIdAttribute,
                            props.visibilityAttribute
                        );

                        // Generate structure IDs if needed (client-side only, not committed)
                        if (structureIdMode !== StructureIDMode.USER_PROVIDED && props.structureIdAttribute) {
                            generatedIds = generateStructureIdsFromParentId(
                                items,
                                props.nodeIdAttribute,
                                props.parentIdAttribute,
                                undefined,
                                props.sortOrderAttribute
                            );
                        }
                    } else {
                        // Graceful degradation: show all items as root level
                        treeNodes = createFlatTreeStructure(items);
                    }
                    break;
            }
        }

        // Helper function for graceful degradation
        function createFlatTreeStructure(items: ObjectItem[]): TreeNode[] {
            // Show warning if there are many items
            if (items.length > PERFORMANCE_THRESHOLDS.FLAT_STRUCTURE_WARNING) {
                console.warn(
                    `Tree widget showing ${items.length} items in flat structure due to missing tree relationship data. ` +
                        `Consider configuring parentIdAttribute, parentAssociation, or structureIdAttribute for proper tree structure.`
                );
            }

            return items.map((item, index) => {
                // Safe attribute access with error handling
                const nodeIdAttr = props.nodeIdAttribute?.get(item);
                const nodeId = nodeIdAttr?.value ? String(nodeIdAttr.value) : `node-${index}`;

                return {
                    id: nodeId,
                    label: nodeId,
                    parentId: null,
                    structureId: `${index + 1}.`, // Generate simple structure IDs
                    level: 0,
                    path: [], // Root nodes have empty path
                    children: [],
                    isExpanded: false,
                    isVisible: true,
                    isLeaf: true,
                    objectItem: item,
                    _generatedStructureId: true
                };
            });
        }

        // Apply sorting if configured
        if (props.sortOrderAttribute) {
            // Use sortOrderAttribute for sorting by the numeric order
            treeNodes = sortNodes(treeNodes, props.sortOrderAttribute, "asc");
        }

        // Create node map for fast lookups
        const map = new Map<string, TreeNode>();
        const roots: TreeNode[] = [];

        const addToMap = (node: TreeNode) => {
            // Apply generated structure ID if available (session-only, not committed to database)
            if (generatedIds.has(node.id)) {
                node.structureId = generatedIds.get(node.id);
                node._generatedStructureId = true; // Mark as generated (session-only)

                // IMPORTANT: Do NOT set the value in the attribute to avoid database commits
                // The generated structure ID is only used for tree navigation logic
            }

            map.set(node.id, node);
            if (!node.parentId) {
                roots.push(node);
            }
            node.children.forEach(addToMap);
        };

        treeNodes.forEach(addToMap);

        // Expand to default level
        if (props.defaultExpandLevel > 0) {
            const expandToLevel = (node: TreeNode, currentLevel: number) => {
                if (currentLevel < props.defaultExpandLevel) {
                    node.isExpanded = true;
                    // Note: expandedAttribute removed from XML - expanded state is managed via state API
                    node.children.forEach(child => expandToLevel(child, currentLevel + 1));
                }
            };
            roots.forEach(root => expandToLevel(root, 0));
        }

        // Create the result object
        const result = {
            nodes: treeNodes,
            nodeMap: map,
            rootNodes: roots,
            structureIdMode,
            generatedStructureIds: generatedIds,
            validationResult
        };

        // Store the result for future comparisons
        previousResultRef.current = result;

        return result;
    }, [
        props.datasource,
        props.nodeIdAttribute,
        props.parentRelationType,
        props.parentIdAttribute,
        props.parentAssociation,
        props.structureIdAttribute,
        props.visibilityAttribute,
        props.sortOrderAttribute,
        props.defaultExpandLevel,
        dynamicItems,
        workerTreeNodes
    ]);

    // Load initial data if using smart loading
    useEffect(() => {
        if (shouldUseSmartLoading && dynamicItems.length === 0) {
            loadInitialData();
        }
    }, [shouldUseSmartLoading]);

    // Load initial data for smart loading
    const loadInitialData = useCallback(async () => {
        if (!shouldUseSmartLoading) {
            return;
        }

        setIsLoading(true);
        try {
            // Load root level nodes
            const rootItems = await smartLoadChildren({ level: 0 });
            setDynamicItems(rootItems);

            // If initial load limit is set, also load first few levels
            if (props.initialLoadLimit && props.initialLoadLimit > 0) {
                const itemsToLoad: ObjectItem[] = [...rootItems];
                let currentLevel = 0;

                while (itemsToLoad.length < props.initialLoadLimit && currentLevel < TREE_LIMITS.INITIAL_LOAD_DEPTH) {
                    currentLevel++;
                    const levelToLoad = currentLevel;
                    const nextLevelItems = await smartLoadChildren({ level: levelToLoad });
                    itemsToLoad.push(...nextLevelItems);
                    setLoadedLevels(prev => new Set([...prev, levelToLoad]));
                }

                setDynamicItems(itemsToLoad);
            }
        } catch (error) {
            console.error("Error loading initial data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [shouldUseSmartLoading, smartLoadChildren, props.initialLoadLimit]);

    // Load children for a node
    const loadChildren = useCallback(
        async (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (!node || loadedChildren.has(nodeId)) {
                return;
            }

            setIsLoading(true);
            try {
                if (shouldUseSmartLoading) {
                    // Use smart loader for level-based loading
                    const children = await smartLoadChildren({
                        parentId: nodeId,
                        level: node.level + 1
                    });

                    // Add loaded children to dynamic items
                    setDynamicItems(prev => [...prev, ...children]);
                    setLoadedChildren(prev => new Map(prev).set(nodeId, children));
                    setLoadedLevels(prev => new Set([...prev, node.level + 1]));
                } else if (props.dataLoadingMode !== "all") {
                    // Note: lazyLoadAction removed from XML - lazy loading handled via API endpoints
                    console.debug("Lazy loading requested but no smart loading configured");
                }
            } catch (error) {
                console.error("Error loading children:", error);
            } finally {
                setIsLoading(false);
            }
        },
        [nodeMap, loadedChildren, shouldUseSmartLoading, smartLoadChildren, props.dataLoadingMode]
    );

    // Refresh nodes when datasource changes
    const refreshNodes = useCallback(() => {
        // Force a refresh by clearing loaded children and dynamic items
        setLoadedChildren(new Map());
        setDynamicItems([]);
        setLoadedLevels(new Set([0]));
        clearCache();

        // Reload initial data if using smart loading
        if (shouldUseSmartLoading) {
            loadInitialData();
        }
    }, [shouldUseSmartLoading, loadInitialData, clearCache]);

    // Get visible nodes based on expansion state
    const getVisibleNodes = useCallback((node: TreeNode, expandedNodes: Set<string>): TreeNode[] => {
        const visible: TreeNode[] = [node];

        if (expandedNodes.has(node.id) && node.children.length > 0) {
            node.children.forEach(child => {
                visible.push(...getVisibleNodes(child, expandedNodes));
            });
        }

        return visible;
    }, []);

    // Get all descendant IDs - wrapper around the centralized utility
    const getDescendantIds = useCallback(
        (nodeId: string): string[] => {
            const node = nodeMap.get(nodeId);
            if (!node) {
                return [];
            }
            // Use the centralized implementation from treeTraversal utils
            return getDescendantIdsUtil(node, false); // false = don't include the node itself
        },
        [nodeMap]
    );

    // Get ancestor IDs
    const getAncestorIds = useCallback(
        (nodeId: string): string[] => {
            const ids: string[] = [];
            let current = nodeMap.get(nodeId);

            while (current?.parentId) {
                ids.push(current.parentId);
                current = nodeMap.get(current.parentId);
            }

            return ids;
        },
        [nodeMap]
    );

    // Find node by path
    const findNodeByPath = useCallback(
        (path: string[]): TreeNode | null => {
            if (path.length === 0) {
                return null;
            }

            let current: TreeNode | undefined = rootNodes.find(r => r.id === path[0]);

            for (let i = 1; i < path.length && current; i++) {
                current = current.children.find(c => c.id === path[i]);
            }

            return current || null;
        },
        [rootNodes]
    );

    // Get structure ID for a node
    const getStructureId = useCallback(
        (nodeId: string): string | null => {
            const node = nodeMap.get(nodeId);
            if (!node) {
                return null;
            }

            // Return existing structure ID if available
            if (node.structureId) {
                return node.structureId;
            }

            // Generate on demand if needed
            if (structureIdMode !== StructureIDMode.USER_PROVIDED && generatedStructureIds.has(nodeId)) {
                return generatedStructureIds.get(nodeId) || null;
            }

            return null;
        },
        [nodeMap, structureIdMode, generatedStructureIds]
    );

    // Find node by structure ID
    const findNodeByStructureId = useCallback(
        (structureId: string): TreeNode | null => {
            for (const node of nodeMap.values()) {
                if (node.structureId === structureId) {
                    return node;
                }
            }

            // Check generated IDs if not found
            for (const [nodeId, genStructureId] of generatedStructureIds.entries()) {
                if (genStructureId === structureId) {
                    return nodeMap.get(nodeId) || null;
                }
            }

            return null;
        },
        [nodeMap, generatedStructureIds]
    );

    return {
        nodes,
        nodeMap,
        rootNodes,
        isLoading,
        loadChildren,
        refreshNodes,
        getVisibleNodes,
        getDescendantIds,
        getAncestorIds,
        findNodeByPath,
        searchNodes, // Expose search functionality
        shouldUseSmartLoading,
        // Structure ID related
        structureIdMode,
        generatedStructureIds,
        getStructureId,
        findNodeByStructureId,
        // Validation
        validationResult
    };
}
