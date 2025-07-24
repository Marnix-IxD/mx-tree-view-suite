// Tree Builder Worker - Handles tree construction from flat data
export const treeBuilderWorkerCode = `
// Worker context - builds tree structures efficiently
const CHUNK_SIZE = 1000;

self.addEventListener('message', (event) => {
    const { type, payload, requestId } = event.data;
    
    switch (type) {
        case 'BUILD_TREE':
            buildTree(payload, requestId);
            break;
            
        case 'BUILD_TREE_INCREMENTAL':
            buildTreeIncremental(payload, requestId);
            break;
            
        case 'REBUILD_SUBTREE':
            rebuildSubtree(payload, requestId);
            break;
            
        case 'CALCULATE_TREE_STATS':
            calculateTreeStats(payload, requestId);
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
});

function buildTree(payload, requestId) {
    const { nodes, sortAttribute, sortOrder = 'asc', debugMode = false } = payload;
    
    if (debugMode) {
        console.debug('treeBuilder.worker.ts [WORKER][BUILD_TREE]: Building tree from ' + nodes.length + ' nodes');
    }
    
    // First pass: Create node map and identify roots
    const nodeMap = new Map();
    const rootNodes = [];
    const childrenMap = new Map();
    
    // Report start
    self.postMessage({
        type: 'PROGRESS',
        payload: {
            processed: 0,
            total: nodes.length,
            operation: 'indexing'
        },
        requestId
    });
    
    // Index nodes
    nodes.forEach((node, index) => {
        nodeMap.set(node.id, node);
        
        if (!node.parentId) {
            rootNodes.push(node);
        } else {
            if (!childrenMap.has(node.parentId)) {
                childrenMap.set(node.parentId, []);
            }
            childrenMap.get(node.parentId).push(node);
        }
        
        // Progress reporting
        if (index % 5000 === 0) {
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    processed: index,
                    total: nodes.length,
                    operation: 'indexing'
                },
                requestId
            });
        }
    });
    
    // Sort function
    const sortFn = createSortFunction(sortAttribute, sortOrder);
    
    // Sort root nodes
    if (sortFn) {
        rootNodes.sort(sortFn);
    }
    
    // Second pass: Build tree structure
    let processedCount = 0;
    const tree = rootNodes.map(rootNode => {
        const subtree = buildSubtree(
            rootNode, 
            childrenMap, 
            nodeMap, 
            sortFn, 
            1,
            () => {
                processedCount++;
                if (processedCount % 1000 === 0) {
                    self.postMessage({
                        type: 'PROGRESS',
                        payload: {
                            processed: processedCount,
                            total: nodes.length,
                            operation: 'building'
                        },
                        requestId
                    });
                }
            }
        );
        return subtree;
    });
    
    // Calculate statistics
    const stats = {
        totalNodes: nodes.length,
        rootNodes: rootNodes.length,
        maxDepth: calculateMaxDepth(tree),
        averageChildCount: calculateAverageChildCount(childrenMap)
    };
    
    self.postMessage({
        type: 'TREE_BUILT',
        payload: {
            tree,
            nodeMap: Array.from(nodeMap.entries()),
            rootNodeIds: rootNodes.map(n => n.id),
            stats
        },
        requestId
    });
}

function buildTreeIncremental(payload, requestId) {
    const { chunks, chunkIndex, isLast, previousState = {} } = payload;
    
    // Initialize or restore state
    const state = {
        nodeMap: new Map(previousState.nodeMap || []),
        rootNodes: previousState.rootNodes || [],
        childrenMap: new Map(previousState.childrenMap || [])
    };
    
    // Process current chunk
    chunks.forEach(node => {
        state.nodeMap.set(node.id, node);
        
        if (!node.parentId) {
            state.rootNodes.push(node);
        } else {
            if (!state.childrenMap.has(node.parentId)) {
                state.childrenMap.set(node.parentId, []);
            }
            state.childrenMap.get(node.parentId).push(node);
        }
    });
    
    // Report progress
    self.postMessage({
        type: 'PROGRESS',
        payload: {
            processed: state.nodeMap.size,
            total: state.nodeMap.size + (isLast ? 0 : 1000), // Estimate
            operation: 'incremental-build'
        },
        requestId
    });
    
    if (isLast) {
        // Final build
        const tree = state.rootNodes.map(rootNode => 
            buildSubtree(rootNode, state.childrenMap, state.nodeMap, null, 1)
        );
        
        self.postMessage({
            type: 'TREE_BUILT_INCREMENTAL',
            payload: {
                tree,
                nodeMap: Array.from(state.nodeMap.entries()),
                rootNodeIds: state.rootNodes.map(n => n.id)
            },
            requestId
        });
    } else {
        // Return intermediate state
        self.postMessage({
            type: 'INCREMENTAL_STATE',
            payload: {
                state: {
                    nodeMap: Array.from(state.nodeMap.entries()),
                    rootNodes: state.rootNodes,
                    childrenMap: Array.from(state.childrenMap.entries())
                },
                chunkIndex
            },
            requestId
        });
    }
}

function rebuildSubtree(payload, requestId) {
    const { nodeId, nodes, sortAttribute, sortOrder } = payload;
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenMap = new Map();
    
    // Build children map
    nodes.forEach(node => {
        if (node.parentId && node.parentId !== nodeId) {
            if (!childrenMap.has(node.parentId)) {
                childrenMap.set(node.parentId, []);
            }
            childrenMap.get(node.parentId).push(node);
        }
    });
    
    const rootNode = nodeMap.get(nodeId);
    if (!rootNode) {
        self.postMessage({
            type: 'SUBTREE_REBUILT',
            payload: { error: 'Node not found' },
            requestId
        });
        return;
    }
    
    const sortFn = createSortFunction(sortAttribute, sortOrder);
    const subtree = buildSubtree(rootNode, childrenMap, nodeMap, sortFn, 1);
    
    self.postMessage({
        type: 'SUBTREE_REBUILT',
        payload: { subtree },
        requestId
    });
}

function buildSubtree(node, childrenMap, nodeMap, sortFn, level, onProgress) {
    const children = childrenMap.get(node.id) || [];
    
    // Sort children if needed
    if (sortFn && children.length > 0) {
        children.sort(sortFn);
    }
    
    // Track progress
    if (onProgress) {
        onProgress();
    }
    
    // Build tree node
    const treeNode = {
        ...node,
        level,
        hasChildren: children.length > 0,
        childCount: children.length,
        children: children.map(child => 
            buildSubtree(child, childrenMap, nodeMap, sortFn, level + 1, onProgress)
        )
    };
    
    return treeNode;
}

function createSortFunction(sortAttribute, sortOrder) {
    if (!sortAttribute) return null;
    
    const multiplier = sortOrder === 'desc' ? -1 : 1;
    
    return (a, b) => {
        const aVal = a[sortAttribute] || a.sortValue;
        const bVal = b[sortAttribute] || b.sortValue;
        
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return aVal.localeCompare(bVal) * multiplier;
        }
        
        if (aVal instanceof Date && bVal instanceof Date) {
            return (aVal.getTime() - bVal.getTime()) * multiplier;
        }
        
        // Numeric comparison
        return (aVal < bVal ? -1 : 1) * multiplier;
    };
}

function calculateTreeStats(payload, requestId) {
    const { tree } = payload;
    
    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;
    let totalChildren = 0;
    let parentsWithChildren = 0;
    
    function traverse(node, depth) {
        totalNodes++;
        maxDepth = Math.max(maxDepth, depth);
        
        if (!node.children || node.children.length === 0) {
            leafNodes++;
        } else {
            parentsWithChildren++;
            totalChildren += node.children.length;
            node.children.forEach(child => traverse(child, depth + 1));
        }
    }
    
    tree.forEach(root => traverse(root, 1));
    
    const stats = {
        totalNodes,
        leafNodes,
        maxDepth,
        averageChildCount: parentsWithChildren > 0 ? totalChildren / parentsWithChildren : 0,
        parentsWithChildren
    };
    
    self.postMessage({
        type: 'TREE_STATS_CALCULATED',
        payload: stats,
        requestId
    });
}

function calculateMaxDepth(tree) {
    let maxDepth = 0;
    
    function traverse(node, depth) {
        maxDepth = Math.max(maxDepth, depth);
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    }
    
    tree.forEach(root => traverse(root, 1));
    return maxDepth;
}

function calculateAverageChildCount(childrenMap) {
    if (childrenMap.size === 0) return 0;
    
    let totalChildren = 0;
    childrenMap.forEach(children => {
        totalChildren += children.length;
    });
    
    return totalChildren / childrenMap.size;
}
`;
