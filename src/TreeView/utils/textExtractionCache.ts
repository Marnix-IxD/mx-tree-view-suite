import { ReactNode } from "react";

/**
 * Interface for cached text content
 */
export interface ICachedTextContent {
    text: string;
    timestamp: number;
    version?: string; // Optional version identifier for cache invalidation
}

/**
 * Text extraction cache for type-ahead search
 * Stores extracted text content from nodes to avoid expensive re-extraction
 */
export class TextExtractionCache {
    private cache: Map<string, ICachedTextContent>;
    private readonly maxSize: number;
    private readonly ttl: number; // Time to live in milliseconds
    private accessOrder: string[]; // Track access order for LRU

    constructor(maxSize = 10000, ttlMinutes = 10) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttlMinutes * 60 * 1000;
        this.accessOrder = [];
    }

    /**
     * Get cached text content for a node
     */
    get(nodeId: string, version?: string): string | null {
        const cached = this.cache.get(nodeId);

        if (!cached) {
            return null;
        }

        // Check if cache is still valid
        const now = Date.now();
        if (now - cached.timestamp > this.ttl) {
            this.cache.delete(nodeId);
            this.removeFromAccessOrder(nodeId);
            return null;
        }

        // Check version if provided
        if (version !== undefined && cached.version !== version) {
            this.cache.delete(nodeId);
            this.removeFromAccessOrder(nodeId);
            return null;
        }

        // Update access order
        this.updateAccessOrder(nodeId);

        return cached.text;
    }

    /**
     * Set cached text content for a node
     */
    set(nodeId: string, text: string, version?: string): void {
        // Check if we need to evict items
        if (!this.cache.has(nodeId) && this.cache.size >= this.maxSize) {
            this.evictLeastRecentlyUsed();
        }

        this.cache.set(nodeId, {
            text,
            timestamp: Date.now(),
            version
        });

        this.updateAccessOrder(nodeId);
    }

    /**
     * Clear specific node from cache
     */
    invalidate(nodeId: string): void {
        this.cache.delete(nodeId);
        this.removeFromAccessOrder(nodeId);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    /**
     * Get current cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Batch get for multiple nodes
     */
    getMany(nodeIds: string[]): Map<string, string> {
        const results = new Map<string, string>();

        for (const nodeId of nodeIds) {
            const text = this.get(nodeId);
            if (text !== null) {
                results.set(nodeId, text);
            }
        }

        return results;
    }

    /**
     * Batch set for multiple nodes
     */
    setMany(entries: Array<{ nodeId: string; text: string; version?: string }>): void {
        for (const { nodeId, text, version } of entries) {
            this.set(nodeId, text, version);
        }
    }

    /**
     * Update access order for LRU
     */
    private updateAccessOrder(nodeId: string): void {
        this.removeFromAccessOrder(nodeId);
        this.accessOrder.push(nodeId);
    }

    /**
     * Remove from access order
     */
    private removeFromAccessOrder(nodeId: string): void {
        const index = this.accessOrder.indexOf(nodeId);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }

    /**
     * Evict least recently used item
     */
    private evictLeastRecentlyUsed(): void {
        if (this.accessOrder.length > 0) {
            const nodeId = this.accessOrder.shift()!;
            this.cache.delete(nodeId);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        ttlMinutes: number;
    } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: 0, // Could be implemented with hit/miss tracking
            ttlMinutes: this.ttl / (60 * 1000)
        };
    }
}

/**
 * Enhanced text extraction that includes alt text from images
 */
export function extractTextContentWithAlt(node: ReactNode): string {
    if (node === null || node === undefined) {
        return "";
    }

    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }

    if (Array.isArray(node)) {
        return node.map(extractTextContentWithAlt).join(" ");
    }

    if (typeof node === "object" && "props" in node) {
        const element = node as React.ReactElement;

        // Extract alt text from images
        if (element.type === "img" && element.props.alt) {
            return element.props.alt;
        }

        // Extract aria-label if present
        if (element.props["aria-label"]) {
            return element.props["aria-label"];
        }

        // Extract title if present
        if (element.props.title) {
            return element.props.title;
        }

        // Recursively extract from children
        if (element.props.children) {
            return extractTextContentWithAlt(element.props.children);
        }
    }

    return "";
}

// Singleton instance for the application
let textExtractionCache: TextExtractionCache | null = null;

export function getTextExtractionCache(): TextExtractionCache {
    if (!textExtractionCache) {
        textExtractionCache = new TextExtractionCache();
    }
    return textExtractionCache;
}

export function clearTextExtractionCache(): void {
    if (textExtractionCache) {
        textExtractionCache.clear();
    }
}
