import { SearchResult } from "../types/TreeTypes";

/**
 * Simple LRU cache for search results
 */
export class SearchCache {
    private cache = new Map<string, CacheEntry>();
    private readonly maxSize: number;
    private readonly ttl: number; // Time to live in milliseconds

    constructor(maxSize = 100, ttl: number = 5 * 60 * 1000) {
        // 5 minutes default
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    /**
     * Get search results from cache
     */
    get(query: string): SearchResult[] | null {
        const normalizedQuery = this.normalizeQuery(query);
        const entry = this.cache.get(normalizedQuery);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiry) {
            this.cache.delete(normalizedQuery);
            return null;
        }

        // Move to end (LRU)
        this.cache.delete(normalizedQuery);
        this.cache.set(normalizedQuery, entry);

        return entry.results;
    }

    /**
     * Store search results in cache
     */
    set(query: string, results: SearchResult[]): void {
        const normalizedQuery = this.normalizeQuery(query);

        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(normalizedQuery)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        // Add to cache
        this.cache.set(normalizedQuery, {
            results,
            timestamp: Date.now(),
            expiry: Date.now() + this.ttl,
            query: normalizedQuery
        });
    }

    /**
     * Check if we have a valid cache entry
     */
    has(query: string): boolean {
        return this.get(query) !== null;
    }

    /**
     * Clear specific query from cache
     */
    delete(query: string): void {
        const normalizedQuery = this.normalizeQuery(query);
        this.cache.delete(normalizedQuery);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Clean up expired entries
     */
    cleanup(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        this.cache.forEach((entry, key) => {
            if (now > entry.expiry) {
                expiredKeys.push(key);
            }
        });

        expiredKeys.forEach(key => this.cache.delete(key));
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        let expired = 0;
        let valid = 0;
        const now = Date.now();

        this.cache.forEach(entry => {
            if (now > entry.expiry) {
                expired++;
            } else {
                valid++;
            }
        });

        return {
            total: this.cache.size,
            valid,
            expired,
            maxSize: this.maxSize,
            ttl: this.ttl
        };
    }

    /**
     * Normalize query for consistent caching
     */
    private normalizeQuery(query: string): string {
        return query.toLowerCase().trim();
    }

    /**
     * Get partial matches from cache (for autocomplete)
     */
    getPartialMatches(partialQuery: string): Array<{ query: string; results: SearchResult[] }> {
        const normalized = this.normalizeQuery(partialQuery);
        const matches: Array<{ query: string; results: SearchResult[] }> = [];
        const now = Date.now();

        this.cache.forEach((entry, key) => {
            if (key.startsWith(normalized) && now <= entry.expiry) {
                matches.push({
                    query: entry.query,
                    results: entry.results
                });
            }
        });

        return matches;
    }
}

interface CacheEntry {
    results: SearchResult[];
    timestamp: number;
    expiry: number;
    query: string;
}

export interface CacheStats {
    total: number;
    valid: number;
    expired: number;
    maxSize: number;
    ttl: number;
}

// Cache instances registry
const cacheInstances = new Map<string, SearchCache>();

/**
 * Get or create a search cache instance
 * @param key - Unique identifier for the cache instance (default: "default")
 * @param maxSize - Maximum number of cached queries (default: 100)
 * @param ttl - Time to live in milliseconds (default: 5 minutes)
 * @returns SearchCache instance
 */
export function getSearchCache(key = "default", maxSize?: number, ttl?: number): SearchCache {
    if (!cacheInstances.has(key)) {
        cacheInstances.set(key, new SearchCache(maxSize, ttl));
    }
    return cacheInstances.get(key)!;
}

/**
 * Clear a specific cache instance
 * @param key - Cache instance identifier
 */
export function clearSearchCache(key = "default"): void {
    const cache = cacheInstances.get(key);
    if (cache) {
        cache.clear();
    }
}

/**
 * Remove a cache instance entirely
 * @param key - Cache instance identifier
 */
export function removeSearchCache(key = "default"): void {
    cacheInstances.delete(key);
}

/**
 * Get all cache instances for debugging/monitoring
 */
export function getAllCacheStats(): Map<string, CacheStats> {
    const stats = new Map<string, CacheStats>();
    cacheInstances.forEach((cache, key) => {
        stats.set(key, cache.getStats());
    });
    return stats;
}
