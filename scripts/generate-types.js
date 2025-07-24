const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Simple XML to TypeScript type generator
async function generateTypesFromXML() {
    const xmlPath = path.join(__dirname, '../src/TreeView.xml');
    const outputPath = path.join(__dirname, '../typings/TreeViewProps.d.ts');
    
    try {
        const xmlContent = fs.readFileSync(xmlPath, 'utf8');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlContent);
        
        // Extract widget info
        const widget = result.widget;
        const widgetName = widget.name[0];
        
        // Generate types content
        let typesContent = `/**
 * This file was generated from TreeView.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { ComponentType, CSSProperties, ReactNode } from "react";
import { ActionValue, DynamicValue, EditableValue, ListAttributeValue, ListExpressionValue, ListReferenceValue, ListValue, ListWidgetValue, ReferenceValue, ReferenceSetValue, SelectionSingleValue, SelectionMultiValue, WebIcon } from "mendix";
import { Big } from "big.js";

`;

        // Add your enum types
        typesContent += `export type ParentRelationTypeEnum = "attribute" | "association" | "structureId";
export type NodeLabelTypeEnum = "attribute" | "expression" | "widget";
export type DisplayAsEnum = "standard" | "floating" | "sliding";
export type DataLoadingModeEnum = "all" | "progressive" | "onDemand";
// ... add other enums

export interface TreeViewContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    datasource: ListValue;
    dataLoadingMode: DataLoadingModeEnum;
    cacheTimeout: number;
    initialLoadLimit: number;
    // ... add all other properties
}

export interface TreeViewPreviewProps {
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    datasource: string;
    dataLoadingMode: DataLoadingModeEnum;
    cacheTimeout: number | null;
    initialLoadLimit: number | null;
    // ... add all other properties
}
`;

        fs.writeFileSync(outputPath, typesContent);
        console.log('Types generated successfully!');
    } catch (error) {
        console.error('Error generating types:', error);
    }
}

generateTypesFromXML();