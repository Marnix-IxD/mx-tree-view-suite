/**
 * Subscription Manager for efficient mx.data subscription handling
 * Manages subscriptions for visible nodes and handles cleanup
 */

import "../types/mendixClientApi";

interface ISubscription {
    guid: string;
    handle: string;
    timestamp: number;
    isSelected: boolean;
    isVisible: boolean;
}

interface ISubscriptionConfig {
    cacheTimeout: number; // ms before unsubscribing from non-visible items
    batchSize: number; // Number of subscriptions to process at once
    debounceDelay: number; // ms to wait before processing subscription changes
}

export class SubscriptionManager {
    private subscriptions = new Map<string, ISubscription>();
    private pendingSubscribe = new Set<string>();
    private pendingUnsubscribe = new Set<string>();
    private selectedNodes = new Set<string>();
    private visibleNodes = new Set<string>();
    private processTimer: number | null = null;

    constructor(
        private config: ISubscriptionConfig = {
            cacheTimeout: 15000,
            batchSize: 50,
            debounceDelay: 100
        }
    ) {}

    /**
     * Update visible nodes and schedule subscription updates
     */
    updateVisibleNodes(nodeGuids: string[]): void {
        const newVisible = new Set(nodeGuids);

        // Find nodes that are no longer visible
        this.visibleNodes.forEach(guid => {
            if (!newVisible.has(guid) && !this.selectedNodes.has(guid)) {
                this.pendingUnsubscribe.add(guid);
            }
        });

        // Find newly visible nodes
        newVisible.forEach(guid => {
            if (!this.visibleNodes.has(guid)) {
                this.pendingSubscribe.add(guid);
                this.pendingUnsubscribe.delete(guid); // Cancel any pending unsubscribe
            }
        });

        this.visibleNodes = newVisible;
        this.scheduleProcessing();
    }

    /**
     * Update selected nodes (never unsubscribe from these)
     */
    updateSelectedNodes(nodeGuids: string[]): void {
        this.selectedNodes = new Set(nodeGuids);

        // Ensure selected nodes are subscribed
        nodeGuids.forEach(guid => {
            if (!this.subscriptions.has(guid)) {
                this.pendingSubscribe.add(guid);
            }
            this.pendingUnsubscribe.delete(guid); // Never unsubscribe from selected
        });

        // Update subscription flags
        this.subscriptions.forEach((sub, guid) => {
            sub.isSelected = this.selectedNodes.has(guid);
        });

        this.scheduleProcessing();
    }

    /**
     * Subscribe to a node's changes
     */
    private subscribe(guid: string, callback: (guid: string) => void): void {
        if (this.subscriptions.has(guid)) {
            // Already subscribed, just update visibility
            const sub = this.subscriptions.get(guid)!;
            sub.isVisible = this.visibleNodes.has(guid);
            sub.timestamp = Date.now();
            return;
        }

        try {
            const handle = window.mx.data.subscribe({
                guid,
                callback: () => callback(guid)
            });

            this.subscriptions.set(guid, {
                guid,
                handle,
                timestamp: Date.now(),
                isSelected: this.selectedNodes.has(guid),
                isVisible: this.visibleNodes.has(guid)
            });
        } catch (error) {
            console.error(`Failed to subscribe to ${guid}:`, error);
        }
    }

    /**
     * Unsubscribe from a node's changes
     */
    private unsubscribe(guid: string): void {
        const subscription = this.subscriptions.get(guid);
        if (!subscription) {
            return;
        }

        try {
            window.mx.data.unsubscribe(subscription.handle);
            this.subscriptions.delete(guid);
        } catch (error) {
            console.error(`Failed to unsubscribe from ${guid}:`, error);
        }
    }

    /**
     * Schedule batch processing of subscription changes
     */
    private scheduleProcessing(): void {
        if (this.processTimer) {
            window.clearTimeout(this.processTimer);
        }

        this.processTimer = window.setTimeout(() => {
            this.processPendingChanges();
        }, this.config.debounceDelay);
    }

    /**
     * Process pending subscription changes in batches
     */
    private processPendingChanges(): void {
        // Process new subscriptions
        const toSubscribe = Array.from(this.pendingSubscribe).slice(0, this.config.batchSize);
        toSubscribe.forEach(guid => {
            this.subscribe(guid, this.handleObjectChange.bind(this));
            this.pendingSubscribe.delete(guid);
        });

        // Process unsubscriptions
        const toUnsubscribe = Array.from(this.pendingUnsubscribe).slice(0, this.config.batchSize);
        toUnsubscribe.forEach(guid => {
            this.unsubscribe(guid);
            this.pendingUnsubscribe.delete(guid);
        });

        // Clean up expired subscriptions
        this.cleanupExpiredSubscriptions();

        // Schedule next batch if needed
        if (this.pendingSubscribe.size > 0 || this.pendingUnsubscribe.size > 0) {
            this.scheduleProcessing();
        }
    }

    /**
     * Clean up subscriptions that haven't been visible for too long
     */
    private cleanupExpiredSubscriptions(): void {
        const now = Date.now();
        const expiredGuids: string[] = [];

        this.subscriptions.forEach((sub, guid) => {
            // Never expire selected nodes
            if (sub.isSelected) {
                return;
            }

            // Check if non-visible node has expired
            if (!sub.isVisible && now - sub.timestamp > this.config.cacheTimeout) {
                expiredGuids.push(guid);
            }
        });

        // Unsubscribe from expired nodes
        expiredGuids.forEach(guid => {
            this.unsubscribe(guid);
        });
    }

    /**
     * Handle object change callback
     */
    private handleObjectChange(guid: string): void {
        // This will be overridden by the consumer
        // Default implementation just updates timestamp
        const sub = this.subscriptions.get(guid);
        if (sub) {
            sub.timestamp = Date.now();
        }
    }

    /**
     * Set the object change callback
     */
    setChangeCallback(callback: (guid: string) => void): void {
        this.handleObjectChange = callback;
    }

    /**
     * Get subscription statistics
     */
    getStats(): {
        totalSubscriptions: number;
        visibleSubscriptions: number;
        selectedSubscriptions: number;
        pendingSubscribe: number;
        pendingUnsubscribe: number;
    } {
        let visibleCount = 0;
        let selectedCount = 0;

        this.subscriptions.forEach(sub => {
            if (sub.isVisible) {
                visibleCount++;
            }
            if (sub.isSelected) {
                selectedCount++;
            }
        });

        return {
            totalSubscriptions: this.subscriptions.size,
            visibleSubscriptions: visibleCount,
            selectedSubscriptions: selectedCount,
            pendingSubscribe: this.pendingSubscribe.size,
            pendingUnsubscribe: this.pendingUnsubscribe.size
        };
    }

    /**
     * Force immediate processing of all pending changes
     */
    flush(): void {
        if (this.processTimer) {
            window.clearTimeout(this.processTimer);
            this.processTimer = null;
        }

        // Process all pending changes
        while (this.pendingSubscribe.size > 0 || this.pendingUnsubscribe.size > 0) {
            this.processPendingChanges();
        }
    }

    /**
     * Clean up all subscriptions
     */
    destroy(): void {
        if (this.processTimer) {
            window.clearTimeout(this.processTimer);
        }

        // Unsubscribe from everything
        this.subscriptions.forEach((sub, guid) => {
            try {
                window.mx.data.unsubscribe(sub.handle);
            } catch (error) {
                console.error(`Failed to unsubscribe from ${guid} during cleanup:`, error);
            }
        });

        this.subscriptions.clear();
        this.pendingSubscribe.clear();
        this.pendingUnsubscribe.clear();
        this.selectedNodes.clear();
        this.visibleNodes.clear();
    }

    /**
     * Check if a node is currently subscribed
     */
    isSubscribed(guid: string): boolean {
        return this.subscriptions.has(guid);
    }

    /**
     * Get all subscribed GUIDs
     */
    getSubscribedGuids(): string[] {
        return Array.from(this.subscriptions.keys());
    }
}
