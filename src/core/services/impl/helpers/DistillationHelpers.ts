/**
 * Distillation Helper Functions
 * 
 * Utility functions for content distillation operations including
 * validation, sanitization, and error handling.
 */

import { ConceptCandidate, DistilledContent, ExtractedConcept } from '../../../contracts/schemas';
import { DistillationError } from '../../IDistillationService';

/**
 * Input validation constraints
 */
export const VALIDATION_CONSTRAINTS = {
  minTextLength: 10,
  maxTextLength: 50000,
  minSummaryLength: 50,
  maxSummaryLength: 500,
  minTitleLength: 1,
  maxTitleLength: 100,
} as const;

/**
 * Suspicious patterns that might indicate malicious content
 */
const SUSPICIOUS_PATTERNS = [
  /\b(DROP|DELETE|INSERT|UPDATE|UNION|SELECT)\s+/i,  // SQL injection
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,             // Script tags
  /javascript:/i,                                     // JavaScript protocol
  /on\w+\s*=/i,                                      // Event handlers
] as const;

/**
 * Validate input candidate for distillation
 * @throws {DistillationError} if validation fails
 */
export function validateCandidate(candidate: ConceptCandidate): void {
  // Check candidate exists
  if (!candidate) {
    throw new DistillationError('ConceptCandidate is required');
  }

  // Check normalized text exists and is valid
  if (!candidate.normalizedText || typeof candidate.normalizedText !== 'string') {
    throw new DistillationError('ConceptCandidate must have valid normalizedText');
  }

  const trimmedText = candidate.normalizedText.trim();

  // Check text length constraints
  if (trimmedText.length === 0) {
    throw new DistillationError('ConceptCandidate normalizedText cannot be empty');
  }

  if (trimmedText.length < VALIDATION_CONSTRAINTS.minTextLength) {
    throw new DistillationError(
      `ConceptCandidate normalizedText is too short (minimum ${VALIDATION_CONSTRAINTS.minTextLength} characters)`
    );
  }

  if (trimmedText.length > VALIDATION_CONSTRAINTS.maxTextLength) {
    throw new DistillationError(
      `ConceptCandidate normalizedText is too long (maximum ${VALIDATION_CONSTRAINTS.maxTextLength.toLocaleString()} characters)`
    );
  }

  // Check content hash exists
  if (!candidate.contentHash || typeof candidate.contentHash !== 'string') {
    throw new DistillationError('ConceptCandidate must have valid contentHash');
  }

  // Check for suspicious patterns
  checkForSuspiciousContent(trimmedText);
}

/**
 * Check text for potentially malicious patterns
 * @throws {DistillationError} if suspicious content is found
 */
export function checkForSuspiciousContent(text: string): void {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      throw new DistillationError('ConceptCandidate contains potentially malicious content');
    }
  }
}

/**
 * Sanitize a title string for safe storage and display
 */
export function sanitizeTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    return 'Concept';
  }
  
  let cleaned = title
    .trim()
    // Remove potentially dangerous characters
    .replace(/[<>{}[\]\\]/g, '')
    // Keep only safe characters
    .replace(/[^\w\s\-.,!?()\/:+=&%$#@*]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Clean up leading/trailing non-word characters
  cleaned = cleaned.replace(/^[^\w(]+|[^\w)]+$/g, '');
  
  // Handle empty result
  if (cleaned.length === 0) {
    return 'Concept';
  }
  
  // Enforce length constraint
  if (cleaned.length > VALIDATION_CONSTRAINTS.maxTitleLength) {
    const truncated = cleaned.substring(0, VALIDATION_CONSTRAINTS.maxTitleLength - 3);
    // Try to break at a word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > VALIDATION_CONSTRAINTS.maxTitleLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }
  
  return cleaned;
}

/**
 * Sanitize a summary string for safe storage and display
 */
export function sanitizeSummary(summary: string): string {
  const defaultSummary = 'This concept provides important educational content for studying and learning.';
  
  if (!summary || typeof summary !== 'string') {
    return defaultSummary;
  }
  
  let cleaned = summary
    .trim()
    // Remove script tags completely
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    // Remove all HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Handle too short summaries
  if (cleaned.length < VALIDATION_CONSTRAINTS.minSummaryLength) {
    const padding = '. This concept provides important information for studying and learning purposes.';
    const remainingSpace = VALIDATION_CONSTRAINTS.maxSummaryLength - cleaned.length;
    if (remainingSpace > padding.length) {
      cleaned = cleaned + padding;
    } else {
      cleaned = cleaned + padding.substring(0, remainingSpace);
    }
  }
  
  // Handle too long summaries
  if (cleaned.length > VALIDATION_CONSTRAINTS.maxSummaryLength) {
    const truncateAt = VALIDATION_CONSTRAINTS.maxSummaryLength - 3;
    
    // Try to break at sentence boundary
    const lastSentence = cleaned.lastIndexOf('.', truncateAt);
    if (lastSentence > VALIDATION_CONSTRAINTS.maxSummaryLength * 0.8) {
      return cleaned.substring(0, lastSentence + 1);
    }
    
    // Try to break at word boundary
    const lastSpace = cleaned.lastIndexOf(' ', truncateAt);
    if (lastSpace > VALIDATION_CONSTRAINTS.maxSummaryLength * 0.8) {
      return cleaned.substring(0, lastSpace) + '...';
    }
    
    // Fallback to hard truncation
    return cleaned.substring(0, truncateAt) + '...';
  }
  
  return cleaned;
}

/**
 * Create a fallback distilled content when parsing fails
 */
export function createFallbackContent(candidate: ConceptCandidate): DistilledContent {
  // Try to extract first sentence as title
  const sentences = candidate.normalizedText
    .split(/[.!?]+/)
    .filter(s => s.trim().length > 0);
  
  const rawTitle = sentences[0]?.trim() || 'Concept';
  const title = sanitizeTitle(rawTitle.substring(0, VALIDATION_CONSTRAINTS.maxTitleLength));
  
  // Use portion of text as summary
  const rawSummary = candidate.normalizedText.substring(0, VALIDATION_CONSTRAINTS.maxSummaryLength);
  const summary = sanitizeSummary(rawSummary);

  return {
    title,
    summary,
    contentHash: candidate.contentHash,
    cached: false,
    distilledAt: new Date(),
  };
}

/**
 * Create fallback multi-concept extraction when parsing fails
 */
export function createFallbackMultiConcepts(
  candidate: ConceptCandidate
): ExtractedConcept[] {
  // Try to split into paragraphs
  const paragraphs = candidate.normalizedText
    .split(/\n\n+/)
    .filter(p => p.trim().length > VALIDATION_CONSTRAINTS.minSummaryLength);
  
  // If no good paragraphs, create single concept
  if (paragraphs.length === 0) {
    const fallback = createFallbackContent(candidate);
    return [{
      title: fallback.title,
      summary: fallback.summary,
      relevanceScore: 0.5,
    }];
  }

  // Create concepts from paragraphs (max 3)
  return paragraphs.slice(0, 3).map((para, index) => {
    const sentences = para.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const rawTitle = sentences[0]?.trim() || `Concept ${index + 1}`;
    const title = sanitizeTitle(rawTitle.substring(0, VALIDATION_CONSTRAINTS.maxTitleLength));
    const summary = sanitizeSummary(para.substring(0, VALIDATION_CONSTRAINTS.maxSummaryLength));
    
    return {
      title,
      summary,
      relevanceScore: 0.5,
    };
  });
}

/**
 * Check if content is study-related
 */
export function isStudyContent(parsed: any): boolean {
  if (!parsed) return false;
  
  // Check for explicit non-study markers
  if (parsed.title === 'NOT_STUDY_CONTENT' || parsed.summary === 'NOT_STUDY_CONTENT') {
    return false;
  }
  
  // For multi-concept, check if all concepts are non-study
  if (parsed.concepts && Array.isArray(parsed.concepts)) {
    const validConcepts = parsed.concepts.filter((c: any) => 
      c.title !== 'NOT_STUDY_CONTENT' && c.summary !== 'NOT_STUDY_CONTENT'
    );
    return validConcepts.length > 0;
  }
  
  return true;
}

/**
 * Parse API response content safely
 */
export function parseAPIResponse(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Fall through to error
      }
    }
    
    throw new SyntaxError(`Failed to parse API response: ${error}`);
  }
}

/**
 * Calculate relevance score for a concept
 */
export function calculateRelevanceScore(
  title: string,
  summary: string,
  sourceText: string
): number {
  let score = 0.5; // Base score
  
  const lowerTitle = title.toLowerCase();
  const lowerSummary = summary.toLowerCase();
  const lowerSource = sourceText.toLowerCase();
  
  // Check title specificity
  if (title.length > 30) score += 0.1;
  if (title.includes(':') || title.includes('-')) score += 0.05;
  
  // Check summary quality
  if (summary.length > 100) score += 0.1;
  if (summary.length > 200) score += 0.05;
  
  // Check for technical terms
  const technicalTerms = [
    'algorithm', 'function', 'process', 'mechanism', 'structure',
    'method', 'technique', 'system', 'protocol', 'theorem'
  ];
  
  technicalTerms.forEach(term => {
    if (lowerTitle.includes(term) || lowerSummary.includes(term)) {
      score += 0.05;
    }
  });
  
  // Check concept presence in source
  const titleWords = lowerTitle.split(/\s+/);
  const matchingWords = titleWords.filter(word => 
    word.length > 3 && lowerSource.includes(word)
  );
  
  score += (matchingWords.length / titleWords.length) * 0.2;
  
  // Normalize score
  return Math.min(1.0, Math.max(0.1, score));
}