import { TreeNode } from "../types/TreeTypes";
import { Big } from "big.js";
import { searchWorkerCode } from "../workers/search.worker";
import { treeBuilderWorkerCode } from "../workers/treeBuilder.worker";
import { structureIdWorkerCode } from "../workers/structureId.worker";

export type WorkerType = "search" | "treeBuilder" | "structureId";

export interface IWorkerMessage<T = any> {
    type: string;
    payload: T;
    requestId?: string;
}

export interface IWorkerProgress {
    processed: number;
    total: number;
    operation: string;
}

export interface ISerializedNode {
    id: string;
    label: string;
    parentId: string | null;
    structureId: string | null;
    hasChildren?: boolean;
    childCount?: number;
    level?: number;
    sortValue?: string | number | Date;
}

export class WorkerManager {
    private workers: Map<WorkerType, Worker> = new Map();
    private timers: Map<WorkerType, number> = new Map();
    private activeRequests: Map<string, (result: any) => void> = new Map();
    private progressCallbacks: Map<string, (progress: IWorkerProgress) => void> = new Map();
    private static instance: WorkerManager | null = null;

    // Singleton pattern for global worker management
    static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    /**
     * Check if Web Workers are available in the current environment
     */
    isAvailable(): boolean {
        return typeof Worker !== "undefined";
    }

    getWorker(type: WorkerType): Worker | null {
        // Check if Workers are supported
        if (typeof Worker === "undefined") {
            console.warn("Web Workers not supported in this environment");
            return null;
        }

        // Check if worker already exists
        let worker = this.workers.get(type);

        if (!worker) {
            // Debug logging handled by caller with debugMode
            worker = this.createWorker(type);
            this.workers.set(type, worker);

            // Set up message handler
            worker.addEventListener("message", event => this.handleWorkerMessage(type, event));
            worker.addEventListener("error", error => this.handleWorkerError(type, error));
        }

        // Reset idle timer
        this.resetIdleTimer(type);

        return worker;
    }

    private createWorker(type: WorkerType): Worker {
        let code: string;

        switch (type) {
            case "search":
                code = searchWorkerCode;
                break;
            case "treeBuilder":
                code = treeBuilderWorkerCode;
                break;
            case "structureId":
                code = structureIdWorkerCode;
                break;
            default:
                throw new Error(`Unknown worker type: ${type}`);
        }

        // Create worker from string (inline worker)
        const blob = new Blob([code], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);

        // Clean up blob URL after worker is created
        URL.revokeObjectURL(url);

        return worker;
    }

    private handleWorkerMessage(_type: WorkerType, event: MessageEvent<IWorkerMessage>) {
        const { type: messageType, payload, requestId } = event.data;

        // Handle progress updates
        if (messageType === "PROGRESS" && requestId) {
            const callback = this.progressCallbacks.get(requestId);
            if (callback) {
                callback(payload);
            }
            return;
        }

        // Handle completion
        if (requestId) {
            const resolver = this.activeRequests.get(requestId);
            if (resolver) {
                resolver(payload);
                this.activeRequests.delete(requestId);
                this.progressCallbacks.delete(requestId);
            }
        }
    }

    private handleWorkerError(type: WorkerType, error: ErrorEvent) {
        console.error(`Worker error in ${type}:`, error);

        // Reject all pending requests for this worker
        this.activeRequests.forEach((resolver, _requestId) => {
            resolver({ error: error.message });
        });

        // Terminate and remove the failed worker
        const worker = this.workers.get(type);
        if (worker) {
            worker.terminate();
            this.workers.delete(type);
        }
    }

    private resetIdleTimer(type: WorkerType) {
        // Clear existing timer
        const existingTimer = this.timers.get(type);
        if (existingTimer) {
            window.clearTimeout(existingTimer);
        }

        // Set new 30-second timer
        const timer = window.setTimeout(() => {
            // Debug logging handled by caller with debugMode
            const worker = this.workers.get(type);
            if (worker) {
                worker.terminate();
                this.workers.delete(type);
            }
            this.timers.delete(type);
        }, 30000); // 30 seconds

        this.timers.set(type, timer);
    }

    // Serialize Mendix nodes to plain data
    serializeNodes(nodes: TreeNode[] | Map<string, TreeNode>): ISerializedNode[] {
        const nodeArray = nodes instanceof Map ? Array.from(nodes.values()) : nodes;

        return nodeArray.map(node => ({
            id: node.id,
            label: node.label || "", // Default to empty string if undefined
            parentId: node.parentId,
            structureId: node.structureId || null, // Convert undefined to null
            hasChildren: node.hasChildren,
            childCount: node.children ? node.children.length : undefined, // Calculate from children array
            level: node.level,
            sortValue:
                node.sortValue instanceof Big
                    ? node.sortValue.toNumber()
                    : typeof node.sortValue === "boolean"
                    ? node.sortValue.toString() // Convert boolean to string
                    : (node.sortValue as string | number | undefined)
        }));
    }

    // Send work to a worker with promise-based API
    async sendWork<T>(
        type: WorkerType,
        messageType: string,
        payload: any,
        onProgress?: (progress: IWorkerProgress) => void
    ): Promise<T> {
        const worker = this.getWorker(type);

        // Fallback if workers not supported
        if (!worker) {
            return this.executeFallback(type, messageType, payload, onProgress);
        }

        const requestId = `${type}-${Date.now()}-${Math.random()}`;

        return new Promise(resolve => {
            // Store resolver
            this.activeRequests.set(requestId, resolve);

            // Store progress callback if provided
            if (onProgress) {
                this.progressCallbacks.set(requestId, onProgress);
            }

            // Send message to worker
            worker.postMessage({
                type: messageType,
                payload,
                requestId
            });
        });
    }

    // Execute fallback when workers not available
    private async executeFallback<T>(
        type: WorkerType,
        _messageType: string,
        payload: any,
        onProgress?: (progress: IWorkerProgress) => void
    ): Promise<T> {
        // Import fallback implementations dynamically
        const { executeWithRAFChunking } = await import("./performanceUtils");

        switch (type) {
            case "search":
                return executeWithRAFChunking(() => this.searchFallback(payload), 100, onProgress) as Promise<T>;

            case "treeBuilder":
                return executeWithRAFChunking(() => this.treeBuilderFallback(payload), 50, onProgress) as Promise<T>;

            case "structureId":
                return executeWithRAFChunking(() => this.structureIdFallback(payload), 100, onProgress) as Promise<T>;

            default:
                throw new Error(`No fallback for worker type: ${type}`);
        }
    }

    // Fallback implementations (simplified versions)
    private searchFallback(payload: any) {
        const { nodes, query } = payload;
        const lowerQuery = query.toLowerCase();
        const results: any[] = [];

        for (const node of nodes) {
            if (node.label.toLowerCase().includes(lowerQuery)) {
                results.push({
                    id: node.id,
                    label: node.label,
                    score: node.label.toLowerCase() === lowerQuery ? 100 : 50
                });
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, 100);
    }

    private treeBuilderFallback(payload: any) {
        const { nodes, rootId } = payload;
        const nodeMap = new Map<string, ISerializedNode>(nodes.map((n: ISerializedNode) => [n.id, n]));
        const tree: any[] = [];

        nodes.forEach((node: ISerializedNode) => {
            if (node.parentId === rootId) {
                tree.push(this.buildSubtree(node, nodeMap));
            }
        });

        return tree;
    }

    private buildSubtree(node: ISerializedNode, nodeMap: Map<string, ISerializedNode>): any {
        const children: any[] = [];

        nodeMap.forEach(child => {
            if (child.parentId === node.id) {
                children.push(this.buildSubtree(child, nodeMap));
            }
        });

        return { ...node, children };
    }

    private structureIdFallback(payload: any) {
        const { nodes: _nodes, movedNodeId, newParentId, newIndex } = payload;
        // Simplified structure ID calculation
        const updates: any[] = [
            {
                nodeId: movedNodeId,
                newStructureId: `${newParentId ? newParentId + "." : ""}${newIndex + 1}.`
            }
        ];

        return updates;
    }

    // Cancel a specific request
    cancelRequest(requestId: string) {
        this.activeRequests.delete(requestId);
        this.progressCallbacks.delete(requestId);
    }

    // Clean up all workers
    destroy() {
        // Cancel all pending requests
        this.activeRequests.clear();
        this.progressCallbacks.clear();

        // Terminate all workers
        this.workers.forEach(worker => worker.terminate());
        this.workers.clear();

        // Clear all timers
        this.timers.forEach(timer => window.clearTimeout(timer));
        this.timers.clear();

        // Clear singleton instance
        if (WorkerManager.instance === this) {
            WorkerManager.instance = null;
        }
    }
}
