import { useCallback, useRef } from "react";
import { NodeState } from "./useTreeAPI";
import { TreeNode } from "../types/TreeTypes";

const BATCH_DELAY = 50; // 50ms delay to batch rapid state changes

interface StateBatcherProps {
    sendBatchStateChange: (
        changes: NodeState[],
        deselectedOrphans?: NodeState[]
    ) => Promise<{ success: boolean; error?: string }>;
    onError?: (error: string) => void;
}

/**
 * Hook to batch multiple state changes from a single user interaction
 * This prevents race conditions when a single click triggers multiple state changes
 */
export function useStateBatcher({ sendBatchStateChange, onError }: StateBatcherProps) {
    const pendingChangesRef = useRef<Map<string, NodeState>>(new Map());
    const deselectedOrphansRef = useRef<Map<string, NodeState>>(new Map());
    const batchTimerRef = useRef<number | null>(null);

    // Process the batch and send to API
    const processBatch = useCallback(async () => {
        const changes = Array.from(pendingChangesRef.current.values());
        const orphans = Array.from(deselectedOrphansRef.current.values());

        if (changes.length === 0) {
            return;
        }

        // Clear pending changes
        pendingChangesRef.current.clear();
        deselectedOrphansRef.current.clear();

        console.debug(`useStateBatcher: Processing batch with ${changes.length} changes`);

        try {
            const result = await sendBatchStateChange(changes, orphans.length > 0 ? orphans : undefined);
            if (!result.success && result.error && onError) {
                onError(result.error);
            }
        } catch (error) {
            console.error("useStateBatcher: Error sending batch", error);
            if (onError) {
                onError("Failed to update node states");
            }
        }
    }, [sendBatchStateChange, onError]);

    // Add a state change to the batch
    const addStateChange = useCallback(
        (node: TreeNode, updates: Partial<NodeState>) => {
            const nodeId = node.id;

            // Get existing pending changes for this node or create new
            const existingChange = pendingChangesRef.current.get(nodeId) || {
                nodeId,
                structureId: node.structureId || "",
                level: node.level
            };

            // Merge with new updates
            const updatedChange: NodeState = {
                ...existingChange,
                ...updates
            };

            pendingChangesRef.current.set(nodeId, updatedChange);

            // Clear existing timer
            if (batchTimerRef.current !== null) {
                window.clearTimeout(batchTimerRef.current);
            }

            // Set new timer to process batch
            batchTimerRef.current = window.setTimeout(() => {
                processBatch();
                batchTimerRef.current = null;
            }, BATCH_DELAY);
        },
        [processBatch]
    );

    // Add deselected orphans (nodes that were deselected as part of a range selection)
    const addDeselectedOrphans = useCallback((nodes: TreeNode[]) => {
        nodes.forEach(node => {
            deselectedOrphansRef.current.set(node.id, {
                nodeId: node.id,
                structureId: node.structureId || "",
                level: node.level
            });
        });
    }, []);

    // Force process any pending changes immediately
    const flush = useCallback(() => {
        if (batchTimerRef.current !== null) {
            window.clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        processBatch();
    }, [processBatch]);

    // Cleanup on unmount
    const cleanup = useCallback(() => {
        if (batchTimerRef.current !== null) {
            window.clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        pendingChangesRef.current.clear();
        deselectedOrphansRef.current.clear();
    }, []);

    return {
        addStateChange,
        addDeselectedOrphans,
        flush,
        cleanup
    };
}
