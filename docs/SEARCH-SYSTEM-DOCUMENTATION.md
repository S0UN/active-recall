# RAG-Based Semantic Search System Documentation

## Overview

The **Semantic Search System** provides RAG (Retrieval-Augmented Generation) based search capabilities for the Active Recall folder system. Users can search for concepts without knowing the exact folder structure, using natural language queries that are semantically matched against the knowledge base.

## Architecture

### Microservice Architecture

The search system follows a clean microservice architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SearchInterface.tsx - React Component               │   │
│  │  ├── SearchBar       - Query input & suggestions     │   │
│  │  ├── SearchResults   - Result display & explanations │   │
│  │  ├── SearchFilters   - Filtering controls            │   │
│  │  └── SearchStats     - Statistics display            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  search.routes.ts - RESTful API Endpoints            │   │
│  │  ├── POST /api/search         - Semantic search      │   │
│  │  ├── GET  /api/search/similar - Find similar         │   │
│  │  ├── GET  /api/search/suggest - Query suggestions    │   │
│  │  └── GET  /api/search/stats   - System statistics    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SemanticSearchService - Core Search Logic           │   │
│  │  ├── Query Processing    - Clean, expand, correct    │   │
│  │  ├── Vector Search       - Semantic similarity       │   │
│  │  ├── Result Ranking      - Score and filter          │   │
│  │  ├── Explanation Builder - Match explanations        │   │
│  │  └── Context Provider    - Folder & related info     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  VectorIndexManager - Qdrant Vector Database         │   │
│  │  EmbeddingService   - OpenAI Embeddings              │   │
│  │  ConceptRepository  - Concept Storage                │   │
│  │  FolderRepository   - Folder Structure               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Semantic Search
- **Vector Embeddings**: Uses OpenAI's text-embedding-3-small model (1536 dimensions)
- **Similarity Matching**: Cosine similarity for finding related concepts
- **Query Understanding**: Natural language processing for user queries

### 2. Result Explanations
- **Match Types**: Identifies exact, semantic, keyword, or related matches
- **Text Highlights**: Shows matched fragments with context
- **Score Breakdown**: Semantic, keyword, and context scores

### 3. Folder Context
- **Breadcrumb Navigation**: Full path from root to concept
- **Sibling Discovery**: Count of related concepts in same folder
- **Folder Descriptions**: Additional context about the folder

### 4. Related Concepts
- **Similarity Detection**: Finds concepts with high semantic similarity
- **Relationship Types**: Similar, prerequisite, follow-up, cross-reference
- **Strength Scoring**: Quantifies relationship strength (0-1)

### 5. Smart Features
- **Query Expansion**: Automatically expands abbreviations (ML → Machine Learning)
- **Spell Correction**: Fixes common misspellings
- **Suggestions**: Provides query completions and alternatives
- **Caching**: Improves performance for repeated queries

## API Documentation

### Search Endpoint

**POST** `/api/search`

Performs semantic search across all concepts.

**Request Body:**
```json
{
  "query": "neural network backpropagation",
  "limit": 10,
  "threshold": 0.75,
  "folderFilter": ["/ai/deep-learning"],
  "includeRelated": true,
  "mode": "semantic"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "artifact": { /* ConceptArtifact */ },
        "score": 0.92,
        "explanation": {
          "matchType": "semantic",
          "highlights": [
            {
              "field": "title",
              "fragment": "Backpropagation Algorithm",
              "startPos": 0,
              "endPos": 15
            }
          ],
          "semanticScore": 0.92,
          "keywordScore": 0.85,
          "contextScore": 0.78
        },
        "folderContext": {
          "folder": { /* FolderManifest */ },
          "breadcrumb": ["ai", "deep-learning", "training"],
          "siblingCount": 12,
          "description": "Training algorithms for neural networks"
        },
        "relatedConcepts": [
          {
            "conceptId": "concept-123",
            "title": "Gradient Descent",
            "relationshipType": "prerequisite",
            "strength": 0.88,
            "folderPath": "/ai/deep-learning/optimization"
          }
        ]
      }
    ],
    "totalMatches": 42,
    "executionTime": 125,
    "suggestions": [
      "neural network backpropagation algorithm",
      "neural network backpropagation mathematics"
    ],
    "metadata": {
      "processedQuery": "neural network backpropagation",
      "foldersSearched": 8,
      "conceptsEvaluated": 42,
      "strategy": "vector"
    }
  }
}
```

### Similar Concepts Endpoint

**GET** `/api/search/similar/:conceptId`

Finds concepts similar to a given concept.

**Parameters:**
- `conceptId` (path): The concept identifier
- `limit` (query, optional): Maximum results (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "conceptId": "concept-456",
    "similar": [
      {
        "conceptId": "concept-789",
        "title": "Convolutional Networks",
        "relationshipType": "similar",
        "strength": 0.95,
        "folderPath": "/ai/deep-learning/cnn"
      }
    ]
  }
}
```

### Suggestions Endpoint

**GET** `/api/search/suggest`

Gets query suggestions for partial input.

**Parameters:**
- `q` (query): Partial query string
- `limit` (query, optional): Maximum suggestions

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "neur",
    "suggestions": [
      "neural networks",
      "neural network architectures",
      "neural network training"
    ]
  }
}
```

### Statistics Endpoint

**GET** `/api/search/stats`

Returns search system statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalConcepts": 1500,
    "totalFolders": 125,
    "avgConceptsPerFolder": 12,
    "indexHealth": "healthy",
    "lastIndexUpdate": "2024-01-15T10:30:00Z"
  }
}
```

## Usage Examples

### Basic Search
```typescript
const api = new SearchAPI('http://localhost:3000');

const response = await api.search({
  query: 'gradient descent optimization',
  limit: 10,
  threshold: 0.7
});

console.log(`Found ${response.totalMatches} matches`);
response.results.forEach(result => {
  console.log(`${result.artifact.title} - Score: ${result.score}`);
  console.log(`  Location: ${result.folderContext.breadcrumb.join('/')}`);
  console.log(`  Match Type: ${result.explanation.matchType}`);
});
```

### Filtered Search
```typescript
// Search only in specific folders
const response = await api.search({
  query: 'algorithms',
  folderFilter: ['/ai/deep-learning', '/ml/optimization'],
  includeRelated: true
});
```

### Finding Similar Concepts
```typescript
const similar = await api.findSimilar('concept-123', 5);

similar.forEach(concept => {
  console.log(`${concept.title} - ${concept.relationshipType}`);
  console.log(`  Strength: ${concept.strength}`);
  console.log(`  Location: ${concept.folderPath}`);
});
```

## Configuration

### Service Configuration
```typescript
const config: SearchServiceConfig = {
  embeddingModel: 'text-embedding-3-small',
  defaultLimit: 10,
  defaultThreshold: 0.7,
  enableQueryExpansion: true,
  enableSpellCorrection: true,
  cacheConfig: {
    enabled: true,
    ttl: 300,      // 5 minutes
    maxSize: 100   // Maximum cached queries
  }
};
```

### Environment Variables
```env
# Vector Database
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key

# OpenAI
OPENAI_API_KEY=your-openai-key
EMBEDDING_MODEL=text-embedding-3-small

# Search Service
SEARCH_DEFAULT_LIMIT=10
SEARCH_DEFAULT_THRESHOLD=0.7
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL=300
```

## Clean Code Principles

### 1. Single Responsibility
Each class has one clear purpose:
- `SemanticSearchService`: Core search logic
- `SearchAPI`: HTTP client
- `SearchInterface`: UI component

### 2. Dependency Injection
All dependencies are injected through constructors:
```typescript
constructor(
  private readonly vectorIndex: IVectorIndexManager,
  private readonly embeddingService: IEmbeddingService,
  private readonly conceptRepo: IConceptArtifactRepository,
  private readonly folderRepo: IFolderRepository,
  private readonly config: SearchServiceConfig
)
```

### 3. Interface Segregation
Clean, focused interfaces:
- `ISearchService`: Search operations
- `IVectorIndexManager`: Vector operations
- `IEmbeddingService`: Embedding generation

### 4. Test-Driven Development
Comprehensive test coverage:
- Unit tests for all services
- Integration tests for API endpoints
- Component tests for UI

### 5. Documentation
Self-documenting code with:
- JSDoc comments
- Type definitions
- Clear naming conventions

## Performance Optimization

### Caching Strategy
- **Query Cache**: Caches full search responses
- **TTL Management**: Automatic expiration
- **Size Limits**: Prevents memory bloat

### Vector Search Optimization
- **Pre-filtering**: Reduces search space
- **Batch Processing**: Efficient embedding generation
- **Index Optimization**: Qdrant configuration tuning

### Response Time Targets
- Search: < 200ms for cached, < 500ms for new
- Suggestions: < 100ms
- Similar concepts: < 300ms

## Error Handling

### Error Types
- `QueryProcessingError`: Invalid or malformed queries
- `IndexNotReadyError`: Vector index unavailable
- `SearchServiceError`: General search failures

### Recovery Strategies
- Graceful degradation to keyword search
- Fallback to cached results
- Clear error messages for users

## Testing

### Run Tests
```bash
# Unit tests
npm test -- --run src/core/services/impl/SemanticSearchService.test.ts

# Integration tests
npm test -- --run src/api/routes/search.routes.test.ts

# All search tests
npm test -- --grep "search"
```

### Test Coverage
- Service Logic: 95%+ coverage
- API Endpoints: 90%+ coverage
- Error Paths: 100% coverage

## Future Enhancements

### Planned Features
1. **Multi-language Support**: Search in different languages
2. **Advanced Filtering**: Date ranges, confidence levels
3. **Search Analytics**: Track popular queries and improve results
4. **Personalization**: User-specific result ranking
5. **Federated Search**: Search across multiple knowledge bases

### Performance Improvements
1. **Distributed Caching**: Redis for shared cache
2. **Async Processing**: Background index updates
3. **Query Optimization**: Smarter query planning
4. **Result Streaming**: Progressive result loading

## Troubleshooting

### Common Issues

**Issue**: Search returns no results
- Check vector index is initialized
- Verify embeddings are generated
- Confirm threshold isn't too high

**Issue**: Slow search performance
- Enable caching
- Reduce result limit
- Check vector index health

**Issue**: Irrelevant results
- Adjust similarity threshold
- Enable query expansion
- Check embedding model consistency

## Support

For issues or questions:
- Check the test files for usage examples
- Review API documentation above
- Examine service implementation for details