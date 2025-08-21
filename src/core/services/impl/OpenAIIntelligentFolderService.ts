/**
 * OpenAIIntelligentFolderService - GPT-4 Powered Academic Intelligence
 * 
 * Production implementation of intelligent folder routing using OpenAI's GPT-4.
 * Provides academic domain intelligence, bootstrap mode, and adaptive routing.
 */

import OpenAI from 'openai';
import {
  IIntelligentFolderService,
  AcademicRoutingDecision,
  BootstrapAnalysis,
  DiscoveryContext,
  SystemState,
  RoutingContext,
  ReorganizationPlan,
  AcademicMetadata,
  ValidationResult,
  TokenUsageStats,
  IntelligentFolderConfig,
  AcademicDomain,
  AcademicLevel,
  NewFolderSpecification,
  AcademicReasoning,
  ConceptAssignment,
  ValidationViolation,
  IntelligentFolderError,
  TokenBudgetExceededError,
  AcademicValidationError,
  IntelligentFolderServiceUnavailableError
} from '../IIntelligentFolderService';
import { DistilledContent, VectorEmbeddings } from '../../contracts/schemas';
import { IFolderCentroidManager } from '../IFolderCentroidManager';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: IntelligentFolderConfig = {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY || '',
  model: 'gpt-4-turbo-preview',
  dailyTokenBudget: 100000,
  maxTokensPerDecision: 1500,
  enableAcademicDomainDetection: true,
  enableHierarchyValidation: true,
  maxHierarchyDepth: 4,
  bootstrapThreshold: 20,
  matureThreshold: 500,
  discoveryEnabled: true,
  maxDiscoveredConcepts: 20,
  discoveryThreshold: 0.75,
  maxContextFolders: 10,
  maxConceptSamplesPerFolder: 3,
  highConfidenceThreshold: 0.85,
  minimumConfidenceThreshold: 0.5,
  enableReorganization: true,
  reorganizationCooldown: 60,
  enableCaching: true,
  cacheTimeout: 30,
  requestTimeout: 30000
};

/**
 * Token usage tracking
 */
interface TokenTracker {
  daily: number;
  total: number;
  operations: Map<string, number>;
  lastReset: Date;
}

/**
 * OpenAI GPT-4 implementation of intelligent folder service
 */
export class OpenAIIntelligentFolderService implements IIntelligentFolderService {
  private readonly config: IntelligentFolderConfig;
  private readonly openai: OpenAI;
  private readonly tokenTracker: TokenTracker;
  private readonly decisionCache = new Map<string, AcademicRoutingDecision>();
  private lastReorganization = new Date(0);

  constructor(
    private readonly centroidManager: IFolderCentroidManager,
    config?: Partial<IntelligentFolderConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (!this.config.apiKey) {
      throw new IntelligentFolderServiceUnavailableError(
        'initialization',
        'OpenAI API key not configured'
      );
    }

    this.openai = new OpenAI({
      apiKey: this.config.apiKey
    });

    this.tokenTracker = {
      daily: 0,
      total: 0,
      operations: new Map(),
      lastReset: new Date()
    };
  }

  async makeRoutingDecision(
    concept: DistilledContent,
    embeddings: VectorEmbeddings,
    context: RoutingContext
  ): Promise<AcademicRoutingDecision> {
    try {
      // Check token budget
      if (!await this.checkTokenBudget(this.config.maxTokensPerDecision)) {
        throw new TokenBudgetExceededError(
          'makeRoutingDecision',
          this.tokenTracker.daily,
          this.config.dailyTokenBudget
        );
      }

      // Check cache
      const cacheKey = this.getCacheKey(concept, context);
      if (this.config.enableCaching && this.decisionCache.has(cacheKey)) {
        const cached = this.decisionCache.get(cacheKey)!;
        if (this.isCacheValid(cached)) {
          return cached;
        }
      }

      // Build prompt based on system state
      const prompt = await this.buildRoutingPrompt(concept, embeddings, context);
      
      // Call OpenAI
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(context.systemState)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: this.config.maxTokensPerDecision,
        response_format: { type: 'json_object' }
      });

      // Parse response
      const decision = this.parseRoutingResponse(
        response.choices[0].message.content!,
        context
      );

      // Update token tracking
      const tokensUsed = response.usage?.total_tokens || 0;
      this.updateTokenUsage('routing', tokensUsed);
      decision.tokensUsed = tokensUsed;

      // Cache decision
      if (this.config.enableCaching) {
        this.decisionCache.set(cacheKey, decision);
      }

      return decision;
    } catch (error) {
      if (error instanceof IntelligentFolderError) {
        throw error;
      }
      throw new IntelligentFolderError(
        'Failed to make routing decision',
        'makeRoutingDecision',
        error instanceof Error ? error : undefined
      );
    }
  }

  async bootstrapSystem(
    concepts: { concept: DistilledContent; embeddings: VectorEmbeddings }[],
    existingFolders?: import('../IIntelligentFolderService').FolderContext[]
  ): Promise<BootstrapAnalysis> {
    try {
      // Check token budget
      const estimatedTokens = concepts.length * 100;
      if (!await this.checkTokenBudget(estimatedTokens)) {
        throw new TokenBudgetExceededError(
          'bootstrapSystem',
          this.tokenTracker.daily,
          this.config.dailyTokenBudget
        );
      }

      // Build bootstrap prompt
      const prompt = this.buildBootstrapPrompt(concepts, existingFolders);

      // Call OpenAI for bootstrap analysis
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getBootstrapSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      // Parse bootstrap response
      const analysis = this.parseBootstrapResponse(
        response.choices[0].message.content!,
        concepts
      );

      // Update token tracking
      const tokensUsed = response.usage?.total_tokens || 0;
      this.updateTokenUsage('bootstrap', tokensUsed);
      analysis.tokensUsed = tokensUsed;

      return analysis;
    } catch (error) {
      if (error instanceof IntelligentFolderError) {
        throw error;
      }
      throw new IntelligentFolderError(
        'Failed to bootstrap system',
        'bootstrapSystem',
        error instanceof Error ? error : undefined
      );
    }
  }

  async discoverRelatedConcepts(
    sourceFolderId: string,
    contextConcepts: import('../IIntelligentFolderService').SimilarConcept[],
    allFolderConcepts: import('../IIntelligentFolderService').SimilarConcept[]
  ): Promise<DiscoveryContext> {
    // Filter concepts by similarity threshold
    const discoveredConcepts = allFolderConcepts
      .filter(c => c.folderId !== sourceFolderId)
      .filter(c => {
        // Find max similarity to any context concept
        const maxSim = Math.max(...contextConcepts.map(cc => 
          this.calculateConceptSimilarity(c, cc)
        ));
        return maxSim >= this.config.discoveryThreshold;
      })
      .slice(0, this.config.maxDiscoveredConcepts)
      .map(c => ({
        conceptId: c.conceptId,
        sourceFolderId: c.folderId || 'unsorted',
        targetFolderId: sourceFolderId,
        similarity: c.similarity,
        relationshipType: this.determineRelationshipType(c.similarity),
        academicConnection: this.describeAcademicConnection(c, contextConcepts[0])
      }));

    return {
      sourceFolderId,
      discoveredConcepts,
      discoveryMethod: 'vector_similarity',
      relevanceThreshold: this.config.discoveryThreshold
    };
  }

  determineSystemState(totalConcepts: number, folderCount: number): SystemState {
    if (totalConcepts < this.config.bootstrapThreshold) {
      return 'bootstrap';
    } else if (totalConcepts < this.config.matureThreshold) {
      return 'growing';
    } else {
      return 'mature';
    }
  }

  async analyzeReorganizationOpportunity(
    recentDecisions: import('../IIntelligentFolderService').RecentDecision[],
    folderStructure: import('../IIntelligentFolderService').FolderContext[]
  ): Promise<ReorganizationPlan | null> {
    // Check cooldown
    const timeSinceLastReorg = Date.now() - this.lastReorganization.getTime();
    if (timeSinceLastReorg < this.config.reorganizationCooldown * 60 * 1000) {
      return null;
    }

    // Analyze patterns in recent decisions
    const patterns = this.analyzeDecisionPatterns(recentDecisions);
    
    // Check if reorganization is warranted
    if (!this.shouldReorganize(patterns, folderStructure)) {
      return null;
    }

    // Build reorganization prompt
    const prompt = this.buildReorganizationPrompt(patterns, folderStructure);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getReorganizationSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const plan = this.parseReorganizationResponse(response.choices[0].message.content!);
      
      if (plan) {
        this.lastReorganization = new Date();
      }

      return plan;
    } catch (error) {
      console.error('Reorganization analysis failed:', error);
      return null;
    }
  }

  async getAcademicMetadata(
    folderId: string,
    conceptSamples: import('../IIntelligentFolderService').ConceptSample[]
  ): Promise<AcademicMetadata> {
    const prompt = `Analyze these concepts and determine the academic domain and level:
    
Concepts:
${conceptSamples.map(c => `- ${c.title}: ${c.summary}`).join('\n')}

Provide academic classification in JSON format with:
- domain: primary academic domain
- level: abstraction level (domain/field/subfield/topic/concept)
- confidence: 0-1 confidence score
- academicPath: full hierarchical path
- relatedDomains: array of related domains
- conceptualThemes: key themes across concepts`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an academic librarian expert in knowledge organization.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content!);
    } catch (error) {
      // Return default metadata on error
      return {
        domain: 'other' as AcademicDomain,
        level: 'topic' as AcademicLevel,
        confidence: 0.5,
        academicPath: `/folder/${folderId}`,
        relatedDomains: [],
        conceptualThemes: []
      };
    }
  }

  async validateAcademicHierarchy(
    proposedStructure: import('../IIntelligentFolderService').FolderStructureChange[]
  ): Promise<ValidationResult> {
    const violations: ValidationViolation[] = [];
    
    // Check hierarchy depth
    for (const change of proposedStructure) {
      if (change.action === 'create' && change.newPath) {
        const depth = change.newPath.split('/').length - 1;
        if (depth > this.config.maxHierarchyDepth) {
          violations.push({
            type: 'hierarchy_depth',
            severity: 'error',
            description: `Path exceeds maximum depth: ${change.newPath}`,
            affectedFolders: [change.folderId || 'new']
          });
        }
      }
    }

    // Additional validation would go here
    
    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      suggestions: this.generateHierarchySuggestions(violations),
      confidence: violations.length === 0 ? 1.0 : 0.5
    };
  }

  getProvider(): string {
    return `openai-${this.config.model}`;
  }

  async getUsageStats(): Promise<TokenUsageStats> {
    this.resetDailyTokensIfNeeded();
    
    const operationBreakdown: Record<string, number> = {};
    for (const [op, tokens] of this.tokenTracker.operations) {
      operationBreakdown[op] = tokens;
    }

    return {
      totalTokensUsed: this.tokenTracker.total,
      dailyTokensUsed: this.tokenTracker.daily,
      averageTokensPerDecision: this.tokenTracker.operations.get('routing') || 0,
      remainingDailyBudget: this.config.dailyTokenBudget - this.tokenTracker.daily,
      operationBreakdown
    };
  }

  async isAvailable(): Promise<boolean> {
    // Check token budget
    if (this.tokenTracker.daily >= this.config.dailyTokenBudget) {
      return false;
    }

    // Check OpenAI API availability
    try {
      await this.openai.models.list();
      return true;
    } catch {
      return false;
    }
  }

  // Private helper methods

  private getSystemPrompt(systemState: SystemState): string {
    const basePrompt = `You are an expert academic librarian and knowledge organization specialist. 
Your task is to intelligently route educational concepts to appropriate folders using academic domain knowledge.

Key principles:
1. Single source of truth - each concept goes to exactly ONE folder
2. Academic hierarchy - respect Domain → Field → Subfield → Topic conventions
3. Appropriate abstraction - place concepts at the right level of specificity
4. Cross-disciplinary awareness - recognize interdisciplinary connections`;

    const stateSpecific = {
      bootstrap: `
System is in BOOTSTRAP mode with few concepts. Focus on:
- Creating initial folder structure based on detected domains
- Grouping related concepts to establish organization
- Being more inclusive with folder assignments`,
      
      growing: `
System is in GROWING mode. Focus on:
- Maintaining consistency with established patterns
- Creating subfolders when topics become dense
- Balancing specificity with practicality`,
      
      mature: `
System is in MATURE mode with established structure. Focus on:
- Precise placement within existing hierarchy
- Detecting reorganization opportunities
- Maintaining high-quality organization`
    };

    return basePrompt + stateSpecific[systemState];
  }

  private getBootstrapSystemPrompt(): string {
    return `You are an expert academic librarian specializing in knowledge organization.
You are bootstrapping a new knowledge management system with initial concepts.

Your task is to:
1. Analyze the provided concepts to identify academic domains
2. Create an intelligent initial folder structure
3. Assign each concept to the most appropriate folder
4. Follow academic conventions for hierarchy (Domain → Field → Subfield → Topic)

Principles:
- Start with broader categories that can be refined later
- Group related concepts even if slightly different
- Create a balanced structure (not too flat, not too deep)
- Consider future growth and expansion`;
  }

  private getReorganizationSystemPrompt(): string {
    return `You are an expert in knowledge organization and folder structure optimization.
Analyze patterns in recent routing decisions to identify reorganization opportunities.

Focus on:
1. Detecting clusters of related concepts that warrant new folders
2. Identifying overly broad folders that need subdivision
3. Finding redundant or overlapping folders that could be merged
4. Suggesting hierarchy improvements for better organization

Provide actionable reorganization plans that improve the overall structure.`;
  }

  private async buildRoutingPrompt(
    concept: DistilledContent,
    embeddings: VectorEmbeddings,
    context: RoutingContext
  ): Promise<string> {
    // Get filtered folder context
    const filteredContext = await this.centroidManager.filterFolderContext(
      embeddings.vector,
      context.tokenBudget,
      context.systemState
    );

    return `Route this educational concept to the most appropriate folder.

CONCEPT:
Title: ${concept.title}
Summary: ${concept.summary}

SIMILAR EXISTING CONCEPTS:
${context.similarConcepts.slice(0, 5).map(c => 
  `- [${c.similarity.toFixed(2)}] ${c.title} (Folder: ${c.folderId || 'unsorted'})`
).join('\n')}

RELEVANT FOLDERS:
${filteredContext.relevantFolders.map(f => 
  `- ${f.path} (${f.conceptCount} concepts, similarity: ${f.similarity.toFixed(2)})
  Sample concepts: ${f.sampleConcepts.map(s => s.title).join(', ')}`
).join('\n')}

SYSTEM STATE: ${context.systemState}
Total concepts: ${context.totalConcepts}

Provide a JSON response with:
{
  "action": "route" | "create_folder" | "unsorted" | "duplicate",
  "folderId": "folder-id if routing",
  "newFolder": { // if creating folder
    "name": "folder name",
    "academicPath": "full path",
    "level": "domain|field|subfield|topic",
    "domain": "academic domain",
    "justification": "why this folder is needed"
  },
  "duplicateId": "concept-id if duplicate",
  "confidence": 0.0-1.0,
  "reasoning": {
    "primarySignal": "main factor in decision",
    "domainAnalysis": "academic domain considerations",
    "hierarchyRationale": "placement in hierarchy",
    "decisionFactors": ["factor1", "factor2"],
    "alternativesConsidered": [
      {"folderId": "alt-folder", "confidence": 0.x, "reasoning": "why not"}
    ]
  }
}`;
  }

  private buildBootstrapPrompt(
    concepts: { concept: DistilledContent; embeddings: VectorEmbeddings }[],
    existingFolders?: import('../IIntelligentFolderService').FolderContext[]
  ): string {
    const conceptList = concepts.map((c, i) => 
      `${i + 1}. ${c.concept.title}: ${c.concept.summary}`
    ).join('\n');

    const existingStructure = existingFolders && existingFolders.length > 0
      ? `\nEXISTING FOLDERS:\n${existingFolders.map(f => `- ${f.path}`).join('\n')}`
      : '';

    return `Bootstrap a knowledge organization system with these initial concepts:

CONCEPTS:
${conceptList}
${existingStructure}

Create an intelligent folder structure and assign each concept.

Provide a JSON response with:
{
  "recommendedFolders": [
    {
      "name": "folder name",
      "academicPath": "full hierarchical path",
      "level": "domain|field|subfield|topic",
      "domain": "academic domain",
      "justification": "why this folder is needed"
    }
  ],
  "conceptAssignments": [
    {
      "conceptIndex": 0,
      "folderId": "folder-name",
      "confidence": 0.0-1.0,
      "reasoning": "assignment rationale"
    }
  ],
  "detectedDomains": ["domain1", "domain2"],
  "confidence": 0.0-1.0,
  "justification": "overall structure rationale"
}`;
  }

  private buildReorganizationPrompt(
    patterns: any,
    folderStructure: import('../IIntelligentFolderService').FolderContext[]
  ): string {
    return `Analyze these patterns and suggest reorganization:

PATTERNS:
${JSON.stringify(patterns, null, 2)}

CURRENT STRUCTURE:
${folderStructure.map(f => `- ${f.path} (${f.conceptCount} concepts)`).join('\n')}

Suggest reorganization if beneficial. Return null if no changes needed.

JSON format:
{
  "type": "subfolder_creation|hierarchy_improvement|domain_consolidation",
  "affectedConcepts": ["concept-id1", "concept-id2"],
  "targetStructure": [
    {
      "action": "create|move|rename|merge",
      "folderId": "folder-id",
      "newName": "if renaming",
      "newPath": "if moving",
      "conceptIds": ["if moving concepts"]
    }
  ],
  "academicJustification": "why this improves organization",
  "improvementScore": 0.0-1.0
}`;
  }

  private parseRoutingResponse(
    response: string,
    context: RoutingContext
  ): AcademicRoutingDecision {
    try {
      const parsed = JSON.parse(response);
      
      // Map response to internal format
      const decision: AcademicRoutingDecision = {
        action: parsed.action,
        folderId: parsed.folderId,
        duplicateId: parsed.duplicateId,
        confidence: parsed.confidence,
        systemState: context.systemState,
        tokensUsed: 0, // Will be set by caller
        academicReasoning: {
          primarySignal: parsed.reasoning?.primarySignal || 'Unknown',
          domainAnalysis: parsed.reasoning?.domainAnalysis || '',
          hierarchyRationale: parsed.reasoning?.hierarchyRationale || '',
          decisionFactors: parsed.reasoning?.decisionFactors || [],
          alternativesConsidered: parsed.reasoning?.alternativesConsidered || [],
          relatedConcepts: []
        }
      };

      if (parsed.newFolder) {
        decision.newFolder = {
          name: parsed.newFolder.name,
          academicPath: parsed.newFolder.academicPath,
          level: parsed.newFolder.level,
          domain: parsed.newFolder.domain,
          justification: parsed.newFolder.justification,
          requiredParents: []
        };
      }

      return decision;
    } catch (error) {
      throw new IntelligentFolderError(
        'Failed to parse routing response',
        'parseRoutingResponse',
        error instanceof Error ? error : undefined
      );
    }
  }

  private parseBootstrapResponse(
    response: string,
    concepts: { concept: DistilledContent; embeddings: VectorEmbeddings }[]
  ): BootstrapAnalysis {
    try {
      const parsed = JSON.parse(response);
      
      // Generate folder IDs
      const folderMap = new Map<string, string>();
      const recommendedFolders = parsed.recommendedFolders.map((f: any, i: number) => {
        const folderId = `folder-${Date.now()}-${i}`;
        folderMap.set(f.name, folderId);
        
        return {
          name: f.name,
          academicPath: f.academicPath,
          level: f.level,
          domain: f.domain,
          justification: f.justification,
          requiredParents: []
        } as NewFolderSpecification;
      });

      // Map concept assignments
      const conceptAssignments = parsed.conceptAssignments.map((a: any) => ({
        conceptId: concepts[a.conceptIndex].concept.contentHash,
        folderId: folderMap.get(a.folderId) || a.folderId,
        confidence: a.confidence,
        reasoning: a.reasoning
      })) as ConceptAssignment[];

      return {
        recommendedFolders,
        conceptAssignments,
        detectedDomains: parsed.detectedDomains,
        confidence: parsed.confidence,
        justification: parsed.justification,
        tokensUsed: 0 // Will be set by caller
      };
    } catch (error) {
      throw new IntelligentFolderError(
        'Failed to parse bootstrap response',
        'parseBootstrapResponse',
        error instanceof Error ? error : undefined
      );
    }
  }

  private parseReorganizationResponse(response: string): ReorganizationPlan | null {
    try {
      const parsed = JSON.parse(response);
      if (!parsed || parsed === null) {
        return null;
      }

      return {
        type: parsed.type,
        affectedConcepts: parsed.affectedConcepts,
        targetStructure: parsed.targetStructure,
        academicJustification: parsed.academicJustification,
        improvementScore: parsed.improvementScore
      };
    } catch {
      return null;
    }
  }

  private getCacheKey(concept: DistilledContent, context: RoutingContext): string {
    return `${concept.contentHash}-${context.systemState}-${context.totalConcepts}`;
  }

  private isCacheValid(decision: AcademicRoutingDecision): boolean {
    // Cache is valid for configured timeout
    // This is simplified - in production would check timestamp
    return true;
  }

  private async checkTokenBudget(required: number): Promise<boolean> {
    this.resetDailyTokensIfNeeded();
    return (this.tokenTracker.daily + required) <= this.config.dailyTokenBudget;
  }

  private updateTokenUsage(operation: string, tokens: number): void {
    this.tokenTracker.daily += tokens;
    this.tokenTracker.total += tokens;
    
    const current = this.tokenTracker.operations.get(operation) || 0;
    this.tokenTracker.operations.set(operation, current + tokens);
  }

  private resetDailyTokensIfNeeded(): void {
    const now = new Date();
    const lastReset = this.tokenTracker.lastReset;
    
    // Reset if it's a new day
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear()) {
      this.tokenTracker.daily = 0;
      this.tokenTracker.lastReset = now;
    }
  }

  private calculateConceptSimilarity(
    c1: import('../IIntelligentFolderService').SimilarConcept,
    c2: import('../IIntelligentFolderService').SimilarConcept
  ): number {
    // Simplified - would use actual vector similarity in production
    return c1.similarity * c2.similarity;
  }

  private determineRelationshipType(similarity: number): string {
    if (similarity > 0.9) return 'highly_related';
    if (similarity > 0.8) return 'related';
    if (similarity > 0.7) return 'somewhat_related';
    return 'tangentially_related';
  }

  private describeAcademicConnection(
    concept: import('../IIntelligentFolderService').SimilarConcept,
    reference: import('../IIntelligentFolderService').SimilarConcept
  ): string {
    // Simplified - would use LLM for better descriptions in production
    return `Related through similarity score ${concept.similarity.toFixed(2)}`;
  }

  private analyzeDecisionPatterns(
    decisions: import('../IIntelligentFolderService').RecentDecision[]
  ): any {
    // Analyze patterns in recent decisions
    const domainCounts = new Map<AcademicDomain, number>();
    const actionCounts = new Map<string, number>();
    
    for (const decision of decisions) {
      const domain = decision.domain;
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      
      const action = decision.action;
      actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
    }

    return {
      domainCounts: Object.fromEntries(domainCounts),
      actionCounts: Object.fromEntries(actionCounts),
      averageConfidence: decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length,
      recentTrend: this.detectTrend(decisions)
    };
  }

  private detectTrend(decisions: import('../IIntelligentFolderService').RecentDecision[]): string {
    // Simplified trend detection
    const recentUnsorted = decisions.slice(-10).filter(d => d.action === 'unsorted').length;
    if (recentUnsorted > 5) return 'many_unsorted';
    
    const recentLowConfidence = decisions.slice(-10).filter(d => d.confidence < 0.6).length;
    if (recentLowConfidence > 5) return 'low_confidence';
    
    return 'normal';
  }

  private shouldReorganize(patterns: any, folderStructure: any[]): boolean {
    // Check if reorganization is warranted
    if (patterns.recentTrend === 'many_unsorted') return true;
    if (patterns.recentTrend === 'low_confidence') return true;
    if (patterns.averageConfidence < 0.6) return true;
    
    // Check for overly large folders
    const hasLargeFolders = folderStructure.some(f => f.conceptCount > 50);
    if (hasLargeFolders) return true;
    
    return false;
  }

  private generateHierarchySuggestions(violations: ValidationViolation[]): string[] {
    const suggestions: string[] = [];
    
    for (const violation of violations) {
      switch (violation.type) {
        case 'hierarchy_depth':
          suggestions.push('Consider flattening the hierarchy or merging intermediate levels');
          break;
        case 'domain_mixing':
          suggestions.push('Separate different academic domains into distinct branches');
          break;
        case 'abstraction_jump':
          suggestions.push('Add intermediate levels to smooth abstraction transitions');
          break;
        case 'redundancy':
          suggestions.push('Merge redundant folders or differentiate their purposes');
          break;
      }
    }
    
    return [...new Set(suggestions)]; // Remove duplicates
  }
}