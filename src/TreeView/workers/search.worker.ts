// Search Worker - Handles all search operations in a separate thread
export const searchWorkerCode = `
// Worker context - no access to DOM or main thread objects
const CHUNK_SIZE = 1000;
const MAX_RESULTS = 100;

// Message handler
self.addEventListener('message', (event) => {
    const { type, payload, requestId } = event.data;
    
    switch (type) {
        case 'SEARCH':
            performSearch(payload, requestId);
            break;
            
        case 'FUZZY_SEARCH':
            performFuzzySearch(payload, requestId);
            break;
            
        case 'SEARCH_WITH_FILTERS':
            performFilteredSearch(payload, requestId);
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
});

function performSearch(payload, requestId) {
    const { nodes, query, searchableAttributes = ['label'] } = payload;
    
    if (!query || !nodes || nodes.length === 0) {
        self.postMessage({
            type: 'SEARCH_COMPLETE',
            payload: { results: [] },
            requestId
        });
        return;
    }
    
    const results = [];
    const lowerQuery = query.toLowerCase();
    const processed = { count: 0 };
    
    // Process in chunks for progress reporting
    for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
        const chunk = nodes.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(node => {
            const score = calculateSearchScore(node, lowerQuery, searchableAttributes);
            if (score > 0) {
                results.push({
                    id: node.id,
                    label: node.label,
                    parentId: node.parentId,
                    structureId: node.structureId,
                    score,
                    highlights: getHighlights(node, lowerQuery, searchableAttributes)
                });
            }
            processed.count++;
        });
        
        // Report progress
        if (i % (CHUNK_SIZE * 5) === 0 || i + CHUNK_SIZE >= nodes.length) {
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    processed: processed.count,
                    total: nodes.length,
                    operation: 'search'
                },
                requestId
            });
        }
    }
    
    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, MAX_RESULTS);
    
    self.postMessage({
        type: 'SEARCH_COMPLETE',
        payload: {
            results: topResults,
            totalFound: results.length,
            query
        },
        requestId
    });
}

function performFuzzySearch(payload, requestId) {
    const { nodes, query, threshold = 0.6 } = payload;
    
    if (!query || !nodes || nodes.length === 0) {
        self.postMessage({
            type: 'FUZZY_SEARCH_COMPLETE',
            payload: { results: [] },
            requestId
        });
        return;
    }
    
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    nodes.forEach((node, index) => {
        const similarity = calculateFuzzySimilarity(node.label.toLowerCase(), lowerQuery);
        
        if (similarity >= threshold) {
            results.push({
                id: node.id,
                label: node.label,
                parentId: node.parentId,
                structureId: node.structureId,
                similarity,
                score: Math.round(similarity * 100)
            });
        }
        
        // Progress reporting
        if (index % 5000 === 0) {
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    processed: index,
                    total: nodes.length,
                    operation: 'fuzzy-search'
                },
                requestId
            });
        }
    });
    
    // Sort by similarity
    results.sort((a, b) => b.similarity - a.similarity);
    
    self.postMessage({
        type: 'FUZZY_SEARCH_COMPLETE',
        payload: {
            results: results.slice(0, MAX_RESULTS),
            totalFound: results.length,
            query
        },
        requestId
    });
}

function performFilteredSearch(payload, requestId) {
    const { nodes, query, filters } = payload;
    const { hasChildren, minLevel, maxLevel, parentIds } = filters || {};
    
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    nodes.forEach(node => {
        // Apply filters
        if (hasChildren !== undefined && node.hasChildren !== hasChildren) return;
        if (minLevel !== undefined && (node.level || 0) < minLevel) return;
        if (maxLevel !== undefined && (node.level || 0) > maxLevel) return;
        if (parentIds && parentIds.length > 0 && !parentIds.includes(node.parentId)) return;
        
        // Check query match
        const score = calculateSearchScore(node, lowerQuery, ['label']);
        if (score > 0) {
            results.push({
                id: node.id,
                label: node.label,
                parentId: node.parentId,
                structureId: node.structureId,
                score,
                matchedFilters: getMatchedFilters(node, filters)
            });
        }
    });
    
    // Sort and limit
    results.sort((a, b) => b.score - a.score);
    
    self.postMessage({
        type: 'FILTERED_SEARCH_COMPLETE',
        payload: {
            results: results.slice(0, MAX_RESULTS),
            totalFound: results.length,
            query,
            filters
        },
        requestId
    });
}

function calculateSearchScore(node, lowerQuery, searchableAttributes) {
    let maxScore = 0;
    
    searchableAttributes.forEach(attr => {
        const value = node[attr];
        if (!value || typeof value !== 'string') return;
        
        const lowerValue = value.toLowerCase();
        let score = 0;
        
        // Exact match
        if (lowerValue === lowerQuery) {
            score = 100;
        }
        // Starts with query
        else if (lowerValue.startsWith(lowerQuery)) {
            score = 80;
        }
        // Word boundary match
        else if (new RegExp('\\\\b' + escapeRegex(lowerQuery), 'i').test(value)) {
            score = 60;
        }
        // Contains query
        else if (lowerValue.includes(lowerQuery)) {
            score = 40;
        }
        
        maxScore = Math.max(maxScore, score);
    });
    
    return maxScore;
}

function calculateFuzzySimilarity(str1, str2) {
    // Levenshtein distance implementation
    const m = str1.length;
    const n = str2.length;
    
    if (m === 0) return n === 0 ? 1 : 0;
    if (n === 0) return 0;
    
    const matrix = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) matrix[i][0] = i;
    for (let j = 0; j <= n; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    
    const distance = matrix[m][n];
    return 1 - (distance / Math.max(m, n));
}

function getHighlights(node, lowerQuery, searchableAttributes) {
    const highlights = {};
    
    searchableAttributes.forEach(attr => {
        const value = node[attr];
        if (!value || typeof value !== 'string') return;
        
        const lowerValue = value.toLowerCase();
        const index = lowerValue.indexOf(lowerQuery);
        
        if (index !== -1) {
            highlights[attr] = {
                start: index,
                end: index + lowerQuery.length,
                text: value.substring(index, index + lowerQuery.length)
            };
        }
    });
    
    return highlights;
}

function getMatchedFilters(node, filters) {
    const matched = [];
    
    if (filters.hasChildren !== undefined && node.hasChildren === filters.hasChildren) {
        matched.push('hasChildren');
    }
    
    if (filters.minLevel !== undefined && (node.level || 0) >= filters.minLevel) {
        matched.push('minLevel');
    }
    
    if (filters.maxLevel !== undefined && (node.level || 0) <= filters.maxLevel) {
        matched.push('maxLevel');
    }
    
    if (filters.parentIds && filters.parentIds.includes(node.parentId)) {
        matched.push('parentId');
    }
    
    return matched;
}

function escapeRegex(str) {
    // Escape special regex characters
    const specialChars = ['[', ']', '(', ')', '{', '}', '.', '*', '+', '?', '^', '$', '|', '\\\\'];
    let escaped = str;
    specialChars.forEach(char => {
        escaped = escaped.split(char).join('\\\\' + char);
    });
    return escaped;
}
`;
