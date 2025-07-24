# GenerateTestTreeData Java Action

## Overview
This Java action generates test tree data for the Tree View Suite widgets. It creates TreeNode entities with realistic hierarchical structures, including proper parent-child relationships, structure IDs, and sort orders.

## Parameters

1. **Context Manager** (TreeSuiteContextManager)
   - The context manager entity (currently not used, reserved for future enhancements)

2. **Node Count** (Integer/Long)
   - Total number of nodes to generate
   - Must be greater than 0
   - The action will create up to this many nodes

3. **Max Depth** (Integer/Long)
   - Maximum depth of the tree structure
   - Must be greater than 0
   - Level 0 = root nodes, Level 1 = children of root, etc.

## Generated Data

Each TreeNode entity will have:
- **TreeItemID**: Unique UUID for each node
- **StructureID**: Hierarchical ID (e.g., "1.2.3")
- **ParentStructureID**: Parent's structure ID
- **Level**: Depth in the tree (0 for root)
- **SortOrder**: Absolute position in fully expanded tree
- **Name**: Realistic node name with variety
- **Description**: Auto-generated description
- **TreeNode_ParentTreeNode**: Association to parent node

## Features

### Realistic Tree Structure
- Creates 1-5 root nodes
- Child count varies by depth (fewer children deeper in tree)
- Uses normal distribution for child counts (average 3 per node)
- Prevents extremely wide or deep structures

### Name Generation
- Multiple naming patterns for variety
- Categories: Product, Service, Department, Project, etc.
- Adjectives: Core, Advanced, Basic, Premium, etc.
- Hierarchical names (30% chance to inherit from parent)
- Unique identifiers appended to names

### Performance
- Efficient batch creation
- Single commit operation for all nodes
- Proper parent-child relationship setup

## Usage in Mendix

1. **Create a microflow** with the following steps:
   - Create or retrieve a TreeSuiteContextManager entity
   - Add the GenerateTestTreeData Java action
   - Set parameters (e.g., nodeCount: 1000, maxDepth: 5)
   - Handle the Boolean return value

2. **Example microflow**:
   ```
   [Start] → [Create TreeSuiteContextManager] → 
   [GenerateTestTreeData(contextManager, 1000, 5)] → 
   [Show success message] → [End]
   ```

3. **Typical test scenarios**:
   - Small tree: 100 nodes, depth 3
   - Medium tree: 1000 nodes, depth 5
   - Large tree: 10000 nodes, depth 7
   - Deep tree: 500 nodes, depth 10
   - Wide tree: 5000 nodes, depth 3

## Example Output

For nodeCount=50, maxDepth=4, you might get:
```
Root 1 (1)
├── Core Product Alpha (1.1)
│   ├── Core Product Alpha - Item 1 (1.1.1)
│   ├── Core Product Alpha - Item 2 (1.1.2)
│   └── Service Beta-423 (1.1.3)
├── Advanced Module Gamma (1.2)
│   └── Department Theta-789 (1.2.1)
└── Project Delta-234 (1.3)
    ├── Task Epsilon (1.3.1)
    │   └── Component Zeta-567 (1.3.1.1)
    └── Feature Eta (1.3.2)
Root 2 (2)
└── Premium Service Alpha (2.1)
    └── Premium Service Alpha - Item 1 (2.1.1)
```

## Notes

- The actual tree depth may be less than maxDepth if nodeCount is reached first
- Node distribution follows natural patterns (more nodes at middle levels)
- All nodes are committed in a single transaction for consistency
- The action logs a summary message with actual nodes created and depth achieved

## Error Handling

The action validates inputs and throws exceptions for:
- Node count ≤ 0
- Max depth ≤ 0

Ensure proper error handling in your microflow when calling this action.