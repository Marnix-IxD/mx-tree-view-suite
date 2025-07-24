import { ReactElement, createElement, useEffect, useState, useRef } from "react";
import classNames from "classnames";
import { requestIdleCallback, cancelIdleCallback } from "../../utils/timers";

interface IHoverMetrics {
    totalEvents: number;
    skippedEvents: number;
    sentEvents: number;
    reductionRate: number;
}

interface IScrollMetrics {
    scrollEvents: number;
    preloadTriggers: number;
    velocityPeak: number;
    averageVelocity: number;
    memoryUsage: number;
}

interface IPerformanceMetrics {
    totalNodes: number;
    expandedCount: number;
    selectedCount: number;
    visibleCount: number;
    renderTime?: number;
    fps?: number;
    memoryUsage?: number;
    hoverMetrics?: IHoverMetrics | null;
    scrollMetrics?: IScrollMetrics | null;
}

interface IPerformanceOverlayProps {
    metrics: IPerformanceMetrics | null;
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    expanded?: boolean;
}

/**
 * PerformanceOverlay - Debug overlay showing real-time performance metrics
 * Helps developers optimize tree performance with large datasets
 */
export function PerformanceOverlay(props: IPerformanceOverlayProps): ReactElement {
    const { metrics, position = "bottom-right", expanded: defaultExpanded = true } = props;

    const [expanded, setExpanded] = useState(defaultExpanded);
    const [fps, setFps] = useState(60);
    const [renderTime, setRenderTime] = useState(0);
    const frameCountRef = useRef(0);
    const lastTimeRef = useRef(performance.now());

    // Calculate FPS
    useEffect(() => {
        let animationFrameId: number;

        const calculateFps = () => {
            frameCountRef.current++;
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTimeRef.current;

            // Update FPS every second
            if (deltaTime >= 1000) {
                const currentFps = Math.round((frameCountRef.current * 1000) / deltaTime);
                setFps(currentFps);
                frameCountRef.current = 0;
                lastTimeRef.current = currentTime;
            }

            animationFrameId = requestAnimationFrame(calculateFps);
        };

        if (expanded) {
            animationFrameId = requestAnimationFrame(calculateFps);
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [expanded]);

    // Measure render time
    useEffect(() => {
        const startTime = performance.now();

        // Use requestIdleCallback to measure after render
        const handle = requestIdleCallback(() => {
            const endTime = performance.now();
            setRenderTime(Math.round(endTime - startTime));
        });

        return () => cancelIdleCallback(handle);
    }, [metrics]);

    // Get memory usage if available
    const getMemoryUsage = (): number | null => {
        if ("memory" in performance) {
            // @ts-ignore - performance.memory is not in TypeScript types
            const memory = performance.memory as { usedJSHeapSize: number };
            return Math.round(memory.usedJSHeapSize / 1048576); // Convert to MB
        }
        return null;
    };

    // Performance thresholds
    const PERFORMANCE_THRESHOLDS = {
        fps: { good: 55, warning: 30 },
        renderTime: { good: 16, warning: 50 },
        memory: { good: 50, warning: 100 }
    };

    // Export metrics to console
    const exportMetrics = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            fps,
            renderTime,
            memoryUsage,
            nodeStats: {
                total: metrics?.totalNodes,
                visible: metrics?.visibleCount,
                expanded: metrics?.expandedCount,
                selected: metrics?.selectedCount
            },
            hoverMetrics: metrics?.hoverMetrics,
            scrollMetrics: metrics?.scrollMetrics
        };
        console.log("Performance Metrics Export:", exportData);
        console.table(exportData);
    };

    if (!metrics) {
        return <div />;
    }

    const memoryUsage = getMemoryUsage();
    const fpsClass =
        fps >= PERFORMANCE_THRESHOLDS.fps.good ? "good" : fps >= PERFORMANCE_THRESHOLDS.fps.warning ? "warning" : "bad";
    const renderTimeClass =
        renderTime <= PERFORMANCE_THRESHOLDS.renderTime.good
            ? "good"
            : renderTime <= PERFORMANCE_THRESHOLDS.renderTime.warning
            ? "warning"
            : "bad";

    return (
        <div
            className={classNames("performance-overlay", `performance-overlay--${position}`, {
                "performance-overlay--expanded": expanded,
                "performance-overlay--collapsed": !expanded
            })}
        >
            <button
                className="performance-overlay-toggle"
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? "Collapse performance metrics" : "Expand performance metrics"}
            >
                <span className="performance-overlay-toggle-icon">{expanded ? "−" : "+"}</span>
                <span className="performance-overlay-title">Performance</span>
            </button>

            {expanded && (
                <div className="performance-overlay-content">
                    {/* Node Statistics */}
                    <div className="performance-metric-group">
                        <h4 className="performance-metric-title">Tree Stats</h4>
                        <div className="performance-metric">
                            <span className="performance-metric-label">Total Nodes:</span>
                            <span className="performance-metric-value">{metrics.totalNodes}</span>
                        </div>
                        <div className="performance-metric">
                            <span className="performance-metric-label">Visible:</span>
                            <span className="performance-metric-value">{metrics.visibleCount}</span>
                        </div>
                        <div className="performance-metric">
                            <span className="performance-metric-label">Expanded:</span>
                            <span className="performance-metric-value">{metrics.expandedCount}</span>
                        </div>
                        <div className="performance-metric">
                            <span className="performance-metric-label">Selected:</span>
                            <span className="performance-metric-value">{metrics.selectedCount}</span>
                        </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="performance-metric-group">
                        <h4 className="performance-metric-title">Performance</h4>
                        <div className="performance-metric">
                            <span className="performance-metric-label">FPS:</span>
                            <span className={`performance-metric-value performance-metric-value--${fpsClass}`}>
                                {fps}
                            </span>
                        </div>
                        <div className="performance-metric">
                            <span className="performance-metric-label">Render:</span>
                            <span className={`performance-metric-value performance-metric-value--${renderTimeClass}`}>
                                {renderTime}ms
                            </span>
                        </div>
                        {memoryUsage !== null && (
                            <div className="performance-metric">
                                <span className="performance-metric-label">Memory:</span>
                                <span className="performance-metric-value">{memoryUsage}MB</span>
                            </div>
                        )}
                    </div>

                    {/* Hover Optimization Metrics */}
                    {metrics.hoverMetrics && (
                        <div className="performance-metric-group">
                            <h4 className="performance-metric-title">Hover Optimization</h4>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Total Events:</span>
                                <span className="performance-metric-value">{metrics.hoverMetrics.totalEvents}</span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Skipped:</span>
                                <span className="performance-metric-value">{metrics.hoverMetrics.skippedEvents}</span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Sent:</span>
                                <span className="performance-metric-value">{metrics.hoverMetrics.sentEvents}</span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Reduction:</span>
                                <span className="performance-metric-value performance-metric-value--good">
                                    {Math.round(metrics.hoverMetrics.reductionRate * 100)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Scroll Optimization Metrics */}
                    {metrics.scrollMetrics && (
                        <div className="performance-metric-group">
                            <h4 className="performance-metric-title">Smart Scrolling</h4>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Scroll Events:</span>
                                <span className="performance-metric-value">{metrics.scrollMetrics.scrollEvents}</span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Preloads:</span>
                                <span className="performance-metric-value">
                                    {metrics.scrollMetrics.preloadTriggers}
                                </span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Peak Velocity:</span>
                                <span className="performance-metric-value">
                                    {Math.round(metrics.scrollMetrics.velocityPeak)}px/s
                                </span>
                            </div>
                            <div className="performance-metric">
                                <span className="performance-metric-label">Avg Velocity:</span>
                                <span className="performance-metric-value">
                                    {Math.round(metrics.scrollMetrics.averageVelocity)}px/s
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Performance Warnings */}
                    {(fps < PERFORMANCE_THRESHOLDS.fps.warning ||
                        renderTime > PERFORMANCE_THRESHOLDS.renderTime.warning) && (
                        <div className="performance-warnings">
                            {fps < PERFORMANCE_THRESHOLDS.fps.warning && (
                                <div className="performance-warning">⚠️ Low FPS detected ({fps}fps)</div>
                            )}
                            {renderTime > PERFORMANCE_THRESHOLDS.renderTime.warning && (
                                <div className="performance-warning">⚠️ Slow render time ({renderTime}ms)</div>
                            )}
                        </div>
                    )}

                    {/* Export Button */}
                    <button
                        className="performance-export-button"
                        onClick={exportMetrics}
                        title="Export metrics to console"
                    >
                        Export Metrics
                    </button>
                </div>
            )}
        </div>
    );
}

// Don't memoize this component as it needs to update frequently
export default PerformanceOverlay;
