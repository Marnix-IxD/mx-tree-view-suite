// searchValueDetector.ts - Intelligent search value type detection

import { SearchAttributeType } from "../types/SearchTypes";

/**
 * Detected value types from user input
 */
export interface IDetectedValue {
    type: "string" | "numeric" | "date" | "boolean";
    value: any;
    confidence: number; // 0-1, how confident we are about this type
}

/**
 * Date parsing patterns to try
 */
const DATE_PATTERNS = [
    // ISO formats
    /^\d{4}-\d{2}-\d{2}$/, // 2024-03-15
    /^\d{4}\/\d{2}\/\d{2}$/, // 2024/03/15

    // Common formats
    /^\d{2}-\d{2}-\d{4}$/, // 03-15-2024
    /^\d{2}\/\d{2}\/\d{4}$/, // 03/15/2024
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 3/15/24 or 3/15/2024

    // Month names
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}$/i, // Mar 15, 2024
    /^\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i // 15 March 2024
];

/**
 * Detects possible types for a search value
 */
export function detectSearchValueTypes(value: string): IDetectedValue[] {
    const types: IDetectedValue[] = [];
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return types;
    }

    // 1. Check for boolean
    const lowerValue = trimmedValue.toLowerCase();
    if (
        lowerValue === "true" ||
        lowerValue === "false" ||
        lowerValue === "yes" ||
        lowerValue === "no" ||
        lowerValue === "1" ||
        lowerValue === "0"
    ) {
        const boolValue = lowerValue === "true" || lowerValue === "yes" || lowerValue === "1";
        types.push({
            type: "boolean",
            value: boolValue,
            confidence: 1.0
        });
    }

    // 2. Check for numeric
    // Integer or decimal
    if (/^-?\d+\.?\d*$/.test(trimmedValue)) {
        const numValue = parseFloat(trimmedValue);
        if (!isNaN(numValue)) {
            types.push({
                type: "numeric",
                value: numValue,
                confidence: 1.0
            });
        }
    }

    // Scientific notation
    if (/^-?\d+\.?\d*e[+-]?\d+$/i.test(trimmedValue)) {
        const numValue = parseFloat(trimmedValue);
        if (!isNaN(numValue)) {
            types.push({
                type: "numeric",
                value: numValue,
                confidence: 0.9 // Slightly lower confidence for scientific notation
            });
        }
    }

    // 3. Check for date
    // First try direct parsing
    const directDate = Date.parse(trimmedValue);
    if (!isNaN(directDate)) {
        types.push({
            type: "date",
            value: new Date(directDate),
            confidence: 0.8
        });
    }

    // Try specific patterns
    for (const pattern of DATE_PATTERNS) {
        if (pattern.test(trimmedValue)) {
            const dateValue = new Date(trimmedValue);
            if (!isNaN(dateValue.getTime())) {
                // Check if already added
                const exists = types.some(t => t.type === "date" && t.value.getTime() === dateValue.getTime());
                if (!exists) {
                    types.push({
                        type: "date",
                        value: dateValue,
                        confidence: 0.9
                    });
                }
                break;
            }
        }
    }

    // 4. Always include string (lowest priority)
    types.push({
        type: "string",
        value: trimmedValue,
        confidence: 1.0 // String is always valid
    });

    return types;
}

/**
 * Determines the best operator for a given attribute type and detected value type
 */
export function getBestOperator(
    attributeType: SearchAttributeType,
    detectedType: "string" | "numeric" | "date" | "boolean"
): string {
    // If types match perfectly
    if (attributeType === "String" && detectedType === "string") {
        return "contains";
    }
    if (
        (attributeType === "Integer" || attributeType === "Long" || attributeType === "Decimal") &&
        detectedType === "numeric"
    ) {
        return "equals";
    }
    if (attributeType === "DateTime" && detectedType === "date") {
        return "equals";
    }
    if (attributeType === "Boolean" && detectedType === "boolean") {
        return "equals";
    }

    // Fallback logic for mismatches
    switch (attributeType) {
        case "String":
        case "Enum":
            return "contains"; // Always search string/enum with contains
        case "Integer":
        case "Long":
        case "Decimal":
            return detectedType === "string" ? "equals" : "equals"; // Will try to parse
        case "Boolean":
            return "equals";
        case "DateTime":
            return "equals"; // Will try to parse
        default:
            return "equals";
    }
}

/**
 * Converts a detected value to the appropriate type for an attribute
 */
export function convertValueForAttribute(detectedValue: IDetectedValue, attributeType: SearchAttributeType): any {
    // Direct type matches
    if (attributeType === "String" || attributeType === "Enum") {
        return detectedValue.value.toString();
    }

    if (attributeType === "Boolean" && detectedValue.type === "boolean") {
        return detectedValue.value;
    }

    if ((attributeType === "Integer" || attributeType === "Long") && detectedValue.type === "numeric") {
        return Math.floor(detectedValue.value);
    }

    if (attributeType === "Decimal" && detectedValue.type === "numeric") {
        return detectedValue.value;
    }

    if (attributeType === "DateTime" && detectedValue.type === "date") {
        return detectedValue.value;
    }

    // Type conversions
    if (attributeType === "Boolean") {
        const strValue = detectedValue.value.toString().toLowerCase();
        return strValue === "true" || strValue === "yes" || strValue === "1";
    }

    if (
        (attributeType === "Integer" || attributeType === "Long" || attributeType === "Decimal") &&
        detectedValue.type === "string"
    ) {
        const parsed = parseFloat(detectedValue.value);
        if (!isNaN(parsed)) {
            return attributeType === "Decimal" ? parsed : Math.floor(parsed);
        }
        return null; // Can't convert
    }

    if (attributeType === "DateTime" && detectedValue.type === "string") {
        const parsed = Date.parse(detectedValue.value);
        if (!isNaN(parsed)) {
            return new Date(parsed);
        }
        return null; // Can't convert
    }

    // Default: return as string
    return detectedValue.value.toString();
}

/**
 * Checks if a detected value type is compatible with an attribute type
 */
export function isCompatibleType(
    detectedType: "string" | "numeric" | "date" | "boolean",
    attributeType: SearchAttributeType
): boolean {
    switch (attributeType) {
        case "String":
        case "Enum":
            return true; // Everything can be converted to string
        case "Integer":
        case "Long":
        case "Decimal":
            return (
                detectedType === "numeric" || (detectedType === "string" && /^-?\d+\.?\d*$/.test(detectedType as any))
            );
        case "Boolean":
            return detectedType === "boolean" || detectedType === "string";
        case "DateTime":
            return detectedType === "date" || detectedType === "string";
        default:
            return false;
    }
}
