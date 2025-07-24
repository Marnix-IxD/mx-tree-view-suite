// Structure ID Worker - Handles structure ID calculations and updates
export const structureIdWorkerCode = `
// Worker context - calculates structure IDs for drag & drop operations
self.addEventListener('message', (event) => {
    const { type, payload, requestId } = event.data;
    
    switch (type) {
        case 'CALCULATE_STRUCTURE_IDS':
            calculateStructureIds(payload, requestId);
            break;
            
        case 'UPDATE_AFTER_MOVE':
            updateAfterMove(payload, requestId);
            break;
            
        case 'VALIDATE_STRUCTURE_IDS':
            validateStructureIds(payload, requestId);
            break;
            
        case 'RECALCULATE_SUBTREE':
            recalculateSubtree(payload, requestId);
            break;
            
        default:
            console.debug('[StructureIdWorker][HandleMessage] Unknown message type:', type);
    }
});

function calculateStructureIds(payload, requestId) {
    const { nodes, parentRelationType, sortAttribute, sortOrder } = payload;
    
    if (parentRelationType === 'structureId') {
        // Structure IDs should already exist
        self.postMessage({
            type: 'STRUCTURE_IDS_CALCULATED',
            payload: {
                updates: [],
                message: 'Structure IDs already provided'
            },
            requestId
        });
        return;
    }
    
    console.debug('[StructureIdWorker][CalculateStructureIds] Processing', nodes.length, 'nodes');
    
    // Build parent-child relationships
    const childrenMap = new Map();
    const rootNodes = [];
    
    nodes.forEach(node => {
        if (!node.parentId) {
            rootNodes.push(node);
        } else {
            if (!childrenMap.has(node.parentId)) {
                childrenMap.set(node.parentId, []);
            }
            childrenMap.get(node.parentId).push(node);
        }
    });
    
    // Sort if needed
    const sortFn = createSortFunction(sortAttribute, sortOrder);
    if (sortFn) {
        rootNodes.sort(sortFn);
        childrenMap.forEach(children => children.sort(sortFn));
    }
    
    // Calculate structure IDs
    const updates = [];
    let processed = 0;
    
    rootNodes.forEach((node, index) => {
        const structureId = (index + 1) + '.';
        updates.push({
            nodeId: node.id,
            structureId,
            level: 1
        });
        
        processed++;
        
        // Process children recursively
        processChildren(node.id, structureId, 2, childrenMap, sortFn, updates, () => {
            processed++;
            if (processed % 1000 === 0) {
                self.postMessage({
                    type: 'PROGRESS',
                    payload: {
                        processed,
                        total: nodes.length,
                        operation: 'structure-id-calculation'
                    },
                    requestId
                });
            }
        });
    });
    
    self.postMessage({
        type: 'STRUCTURE_IDS_CALCULATED',
        payload: {
            updates,
            totalProcessed: processed
        },
        requestId
    });
}

function updateAfterMove(payload, requestId) {
    const { nodes, movedNodeId, newParentId, newIndex, oldParentId } = payload;
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const movedNode = nodeMap.get(movedNodeId);
    
    if (!movedNode) {
        self.postMessage({
            type: 'MOVE_UPDATE_COMPLETE',
            payload: { error: 'Moved node not found' },
            requestId
        });
        return;
    }
    
    const updates = [];
    
    // 1. Update moved node and its descendants
    const newParentStructureId = newParentId ? nodeMap.get(newParentId)?.structureId || '' : '';
    const newStructureId = newParentStructureId + (newIndex + 1) + '.';
    
    updates.push({
        nodeId: movedNodeId,
        structureId: newStructureId,
        parentId: newParentId,
        updates: {
            structureId: newStructureId,
            parentId: newParentId
        }
    });
    
    // Update descendants
    const descendants = findDescendants(movedNodeId, nodes);
    descendants.forEach(desc => {
        const oldPrefix = movedNode.structureId;
        const newPrefix = newStructureId;
        const updatedStructureId = desc.structureId.replace(oldPrefix, newPrefix);
        
        updates.push({
            nodeId: desc.id,
            structureId: updatedStructureId,
            updates: {
                structureId: updatedStructureId
            }
        });
    });
    
    // 2. Update siblings at old location
    if (oldParentId !== undefined) {
        const oldSiblings = nodes.filter(n => 
            n.parentId === oldParentId && 
            n.id !== movedNodeId
        ).sort((a, b) => {
            const aIndex = parseInt(a.structureId.split('.').pop() || '0');
            const bIndex = parseInt(b.structureId.split('.').pop() || '0');
            return aIndex - bIndex;
        });
        
        oldSiblings.forEach((sibling, index) => {
            const parentPrefix = oldParentId ? nodeMap.get(oldParentId)?.structureId || '' : '';
            const newSiblingStructureId = parentPrefix + (index + 1) + '.';
            
            if (sibling.structureId !== newSiblingStructureId) {
                updates.push({
                    nodeId: sibling.id,
                    structureId: newSiblingStructureId,
                    updates: {
                        structureId: newSiblingStructureId
                    }
                });
                
                // Update this sibling's descendants
                const siblingDescendants = findDescendants(sibling.id, nodes);
                siblingDescendants.forEach(desc => {
                    const updatedStructureId = desc.structureId.replace(
                        sibling.structureId,
                        newSiblingStructureId
                    );
                    updates.push({
                        nodeId: desc.id,
                        structureId: updatedStructureId,
                        updates: {
                            structureId: updatedStructureId
                        }
                    });
                });
            }
        });
    }
    
    // 3. Update siblings at new location
    const newSiblings = nodes.filter(n => 
        n.parentId === newParentId && 
        n.id !== movedNodeId
    );
    
    // Insert moved node at new index
    newSiblings.splice(newIndex, 0, movedNode);
    
    newSiblings.forEach((sibling, index) => {
        if (sibling.id === movedNodeId) return; // Already updated
        
        const parentPrefix = newParentId ? nodeMap.get(newParentId)?.structureId || '' : '';
        const newSiblingStructureId = parentPrefix + (index + 1) + '.';
        
        if (sibling.structureId !== newSiblingStructureId) {
            updates.push({
                nodeId: sibling.id,
                structureId: newSiblingStructureId,
                updates: {
                    structureId: newSiblingStructureId
                }
            });
            
            // Update this sibling's descendants
            const siblingDescendants = findDescendants(sibling.id, nodes);
            siblingDescendants.forEach(desc => {
                const updatedStructureId = desc.structureId.replace(
                    sibling.structureId,
                    newSiblingStructureId
                );
                updates.push({
                    nodeId: desc.id,
                    structureId: updatedStructureId,
                    updates: {
                        structureId: updatedStructureId
                    }
                });
            });
        }
    });
    
    self.postMessage({
        type: 'MOVE_UPDATE_COMPLETE',
        payload: {
            updates,
            affectedCount: updates.length
        },
        requestId
    });
}

function validateStructureIds(payload, requestId) {
    const { nodes } = payload;
    const issues = [];
    const structureIdMap = new Map();
    const childrenByParent = new Map();
    
    // First pass: check for duplicates and build maps
    nodes.forEach(node => {
        // Check for duplicate structure IDs
        if (node.structureId) {
            if (structureIdMap.has(node.structureId)) {
                issues.push({
                    type: 'duplicate',
                    nodeId: node.id,
                    structureId: node.structureId,
                    conflictsWith: structureIdMap.get(node.structureId)
                });
            } else {
                structureIdMap.set(node.structureId, node.id);
            }
        }
        
        // Build children map
        if (node.parentId) {
            if (!childrenByParent.has(node.parentId)) {
                childrenByParent.set(node.parentId, []);
            }
            childrenByParent.get(node.parentId).push(node);
        }
    });
    
    // Second pass: validate structure and sequence
    nodes.forEach(node => {
        if (!node.structureId) {
            issues.push({
                type: 'missing',
                nodeId: node.id,
                message: 'Missing structure ID'
            });
            return;
        }
        
        // Validate format
        if (!/^(\\d+\\.)+$/.test(node.structureId)) {
            issues.push({
                type: 'invalid-format',
                nodeId: node.id,
                structureId: node.structureId,
                message: 'Invalid structure ID format'
            });
        }
        
        // Check parent-child consistency
        if (node.parentId) {
            const parent = nodes.find(n => n.id === node.parentId);
            if (parent && parent.structureId) {
                if (!node.structureId.startsWith(parent.structureId)) {
                    issues.push({
                        type: 'inconsistent-hierarchy',
                        nodeId: node.id,
                        structureId: node.structureId,
                        parentStructureId: parent.structureId,
                        message: 'Structure ID does not match parent hierarchy'
                    });
                }
            }
        }
    });
    
    // Check for gaps in sequences
    childrenByParent.forEach((children, parentId) => {
        const parent = nodes.find(n => n.id === parentId);
        const parentPrefix = parent?.structureId || '';
        
        const childIndices = children
            .map(child => {
                const parts = child.structureId.split('.');
                return parseInt(parts[parts.length - 2] || '0');
            })
            .filter(index => !isNaN(index))
            .sort((a, b) => a - b);
        
        for (let i = 0; i < childIndices.length; i++) {
            if (childIndices[i] !== i + 1) {
                issues.push({
                    type: 'sequence-gap',
                    parentId,
                    expectedIndex: i + 1,
                    actualIndex: childIndices[i],
                    message: 'Gap in structure ID sequence'
                });
                break;
            }
        }
    });
    
    const isValid = issues.length === 0;
    
    self.postMessage({
        type: 'VALIDATION_COMPLETE',
        payload: {
            isValid,
            issues,
            stats: {
                totalNodes: nodes.length,
                nodesWithStructureId: structureIdMap.size,
                duplicates: issues.filter(i => i.type === 'duplicate').length,
                missing: issues.filter(i => i.type === 'missing').length
            }
        },
        requestId
    });
}

function recalculateSubtree(payload, requestId) {
    const { rootNodeId, nodes, sortAttribute, sortOrder } = payload;
    
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const rootNode = nodeMap.get(rootNodeId);
    
    if (!rootNode) {
        self.postMessage({
            type: 'SUBTREE_RECALCULATED',
            payload: { error: 'Root node not found' },
            requestId
        });
        return;
    }
    
    // Find all descendants
    const descendants = findDescendants(rootNodeId, nodes);
    const affectedNodes = [rootNode, ...descendants];
    
    // Build children map for affected nodes
    const childrenMap = new Map();
    affectedNodes.forEach(node => {
        const children = descendants.filter(d => d.parentId === node.id);
        if (children.length > 0) {
            childrenMap.set(node.id, children);
        }
    });
    
    // Sort if needed
    const sortFn = createSortFunction(sortAttribute, sortOrder);
    if (sortFn) {
        childrenMap.forEach(children => children.sort(sortFn));
    }
    
    // Recalculate structure IDs
    const updates = [];
    const baseStructureId = rootNode.structureId;
    const level = (baseStructureId.match(/\\./g) || []).length;
    
    // Process children of root
    const rootChildren = childrenMap.get(rootNodeId) || [];
    rootChildren.forEach((child, index) => {
        const newStructureId = baseStructureId.slice(0, -1) + '.' + (index + 1) + '.';
        updates.push({
            nodeId: child.id,
            structureId: newStructureId,
            updates: { structureId: newStructureId }
        });
        
        // Recursively update descendants
        processChildren(child.id, newStructureId, level + 2, childrenMap, sortFn, updates);
    });
    
    self.postMessage({
        type: 'SUBTREE_RECALCULATED',
        payload: { updates },
        requestId
    });
}

// Helper functions
function processChildren(parentId, parentStructureId, level, childrenMap, sortFn, updates, onProgress) {
    const children = childrenMap.get(parentId) || [];
    
    children.forEach((child, index) => {
        const structureId = parentStructureId + (index + 1) + '.';
        updates.push({
            nodeId: child.id,
            structureId,
            level
        });
        
        if (onProgress) onProgress();
        
        // Recurse for grandchildren
        processChildren(child.id, structureId, level + 1, childrenMap, sortFn, updates, onProgress);
    });
}

function findDescendants(nodeId, nodes) {
    const descendants = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    function collectDescendants(parentId) {
        nodes.forEach(node => {
            if (node.parentId === parentId) {
                descendants.push(node);
                collectDescendants(node.id);
            }
        });
    }
    
    collectDescendants(nodeId);
    return descendants;
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
        
        return (aVal < bVal ? -1 : 1) * multiplier;
    };
}
`;
