import { ReactElement, createElement, useEffect, Fragment } from "react";
import { ContextMenuAction } from "../../types/TreeTypes";
import "../../ui/TreeContextMenu.css";

export interface TreeContextMenuProps {
    x: number;
    y: number;
    actions: ContextMenuAction[];
    onClose: () => void;
}

export function TreeContextMenu({ x, y, actions, onClose }: TreeContextMenuProps): ReactElement {
    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent): void => {
            const target = e.target as HTMLElement;
            if (!target.closest(".mx-tree-context-menu")) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    // Position menu to stay within viewport
    const adjustPosition = (): { left: number; top: number } => {
        // TODO REFACTOR: Use Floating UI for smarter positioning instead of manual calculations
        const menuWidth = 200; // TODO FIX: Measure actual menu width
        const menuHeight = actions.length * 36; // TODO FIX: Measure actual menu height
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x;
        let adjustedY = y;

        // Adjust horizontal position
        if (x + menuWidth > viewportWidth) {
            adjustedX = viewportWidth - menuWidth - 10;
        }

        // Adjust vertical position
        if (y + menuHeight > viewportHeight) {
            adjustedY = viewportHeight - menuHeight - 10;
        }

        return { left: adjustedX, top: adjustedY };
    };

    const position = adjustPosition();

    return (
        <Fragment>
            <div className="mx-tree-context-menu-overlay" onClick={onClose} />
            <div className="mx-tree-context-menu" style={position} role="menu" aria-label="Context menu">
                {actions.map((action, index) => (
                    <button
                        key={index}
                        className="mx-tree-context-menu-item"
                        onClick={e => {
                            e.stopPropagation();
                            action.action();
                        }}
                        role="menuitem"
                    >
                        {action.icon && <span className="mx-tree-context-menu-item-icon">{action.icon}</span>}
                        <span className="mx-tree-context-menu-item-label">{action.label}</span>
                    </button>
                ))}
            </div>
        </Fragment>
    );
}
