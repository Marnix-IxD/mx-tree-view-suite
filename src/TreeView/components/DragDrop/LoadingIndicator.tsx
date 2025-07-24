import { ReactElement, createElement, useEffect, useState } from "react";
import { setTimer, clearTimer } from "../../utils/timers";
import "../../ui/LoadingIndicator.css";

interface LoadingIndicatorProps {
    nodeId: string;
    message: string;
    type?: "loading" | "success" | "error";
}

export function LoadingIndicator({ nodeId, message, type = "loading" }: LoadingIndicatorProps): ReactElement {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Fade in after mount
        const timer = setTimer(() => setIsVisible(true), 10);
        return () => clearTimer(timer);
    }, []);

    const className = [
        "tree-loading-indicator",
        isVisible ? "tree-loading-indicator--visible" : "",
        `tree-loading-indicator--${type}`
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={className} data-node-id={nodeId}>
            {type === "loading" ? (
                <div className="tree-loading-spinner">
                    <span className="tree-loading-dot tree-loading-dot--1"></span>
                    <span className="tree-loading-dot tree-loading-dot--2"></span>
                    <span className="tree-loading-dot tree-loading-dot--3"></span>
                </div>
            ) : null}
            {/* TODO ADD: Add icons for success and error states */}
            {/* TODO ADD: Add auto-dismiss timer for success/error messages */}
            <span className="tree-loading-message">{message}</span>
        </div>
    );
}
