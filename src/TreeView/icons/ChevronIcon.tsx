import { ReactElement, createElement } from "react";

interface ChevronIconProps {
    className?: string;
}

export function ChevronIcon({ className }: ChevronIconProps): ReactElement {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M9 18L15 12L9 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
