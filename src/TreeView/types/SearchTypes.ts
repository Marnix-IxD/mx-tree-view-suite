// SearchTypes.ts - Advanced search type definitions

import { ListAttributeValue } from "mendix";
import { Big } from "big.js";

/**
 * Supported attribute types for search
 */
export type SearchAttributeType = "String" | "Integer" | "Long" | "Decimal" | "Boolean" | "DateTime" | "Enum";

/**
 * Search operators by attribute type
 */
export type StringOperator = "contains" | "startsWith" | "endsWith" | "equals" | "notEquals" | "regex";
export type NumericOperator =
    | "equals"
    | "notEquals"
    | "greater"
    | "less"
    | "greaterOrEqual"
    | "lessOrEqual"
    | "between";
export type BooleanOperator = "equals";
export type DateOperator = "equals" | "notEquals" | "greater" | "greaterOrEqual" | "less" | "lessOrEqual" | "between";
export type EnumOperator = "equals" | "notEquals";

export type SearchOperator = StringOperator | NumericOperator | BooleanOperator | DateOperator | EnumOperator;

/**
 * Filter definition for a single attribute
 */
export interface ISearchFilter {
    // Attribute configuration
    attribute: ListAttributeValue<string | Big | boolean | Date>;
    attributeName: string;
    attributeType: SearchAttributeType;

    // Search criteria
    operator: SearchOperator;
    value?: any;
    value2?: any; // For "between" operator

    // Metadata
    displayName?: string;
    enumOptions?: Array<{ key: string; caption: string }>;
}

/**
 * Search request structure for REST API
 */
export interface ISearchRequest {
    // Entity information
    entity: string;

    // Search filters
    filters: Array<{
        attributeName: string;
        attributeType: SearchAttributeType;
        operator: SearchOperator;
        value: any;
        value2?: any;
    }>;

    // Search options
    logic: "AND" | "OR";
    includeAncestors: boolean;
    expandResults: boolean;

    // Pagination
    limit: number;
    offset: number;

    // Performance options
    cacheKey?: string;
    timeout?: number;
}

/**
 * Search response structure from REST API
 */
export interface ISearchResponse {
    // Matching nodes
    results: Array<{
        nodeId: string;
        structureId: string;
        matches: Array<{
            attribute: string;
            matchedValue: string;
            highlights?: Array<{ start: number; end: number }>;
        }>;
    }>;

    // Ancestor information for tree expansion
    ancestors: Array<{
        nodeId: string;
        structureId: string;
        level: number;
    }>;

    // Metadata
    total: number;
    executionTime: number;
    cached: boolean;

    // For progressive loading
    hasMore: boolean;
    nextOffset: number;
}

/**
 * Search mode configuration
 */
export interface ISearchMode {
    type: "single" | "multi" | "advanced";
    primaryAttribute?: ISearchFilter;
    filters: ISearchFilter[];
    supportedOperators: SearchOperator[];
}

/**
 * Filter builder result
 */
export interface IFilterExpression {
    xpath?: string; // For Mendix XPath queries
    oql?: string; // For OQL queries
    rest?: ISearchRequest; // For REST API calls
}

/**
 * Specialized search request for tree view
 */
export interface ITreeSearchRequest extends ISearchRequest {
    // Additional tree-specific options
    nodeIdAttribute?: string;
    parentAttribute?: string;
    structureIdAttribute?: string;
}
