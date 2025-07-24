import { ReactElement, createElement, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { setTimer, clearTimer } from "../../utils/timers";
import "../../ui/TreeNodeHeader.css";

export type HeaderType = "category" | "path" | "breadcrumb";

interface ITreeNodeHeaderProps {
    displayText: string;
    itemCount?: number;
    showItemCount: boolean;
    animationDuration: number;
    className?: string;
    headerType?: HeaderType;
    separator?: string;
}

/**
 * TreeNodeHeader - Reusable header component for tree nodes
 * Can display category headers, path breadcrumbs, or parent navigation
 * Animates text changes with slide-in effect
 */
export function TreeNodeHeader(props: ITreeNodeHeaderProps): ReactElement {
    const { displayText, itemCount, showItemCount, animationDuration, className, headerType = "category" } = props;

    const [currentText, setCurrentText] = useState(displayText);
    const [isAnimating, setIsAnimating] = useState(false);
    const textRef = useRef<HTMLSpanElement>(null);

    // Animate text changes
    useEffect(() => {
        if (currentText !== displayText) {
            setIsAnimating(true);

            // Wait for animation to complete
            const timer = setTimer(() => {
                setCurrentText(displayText);
                setIsAnimating(false);
            }, animationDuration);

            return () => clearTimer(timer);
        }
    }, [displayText, currentText, animationDuration]);

    // Format display with optional count
    const formattedDisplay =
        showItemCount && itemCount
            ? `${currentText} (${itemCount} ${itemCount === 1 ? "item" : "items"})`
            : currentText;

    // Apply different styling based on header type
    const headerClass = classNames("mx-tree__node-header", `mx-tree__node-header--${headerType}`, className, {
        "mx-tree__node-header--animating": isAnimating
    });

    return (
        <div
            className={headerClass}
            style={
                {
                    "--animation-duration": `${animationDuration}ms`
                } as React.CSSProperties
            }
        >
            <span
                ref={textRef}
                className="mx-tree__node-header__text"
                key={currentText} // Force re-render for animation
            >
                {formattedDisplay}
            </span>
        </div>
    );
}
