/**
 * OCR Pattern Recognition and Correction Library
 * 
 * Centralizes all OCR artifact patterns and correction strategies
 * for consistent handling across the application.
 */

/**
 * Common OCR character substitution patterns
 */
export const OCR_CHARACTER_SUBSTITUTIONS = {
  // Common multi-character confusions
  'rn': 'm',  // "learning" → "leaming"
  'cl': 'd',  // "class" → "dass"
  'li': 'h',  // "like" → "hke"
  
  // Single character confusions
  'i': ['l', '1'],  // "information" → "lnformation" or "1nformation"
  'l': ['i', '1'],
  '0': 'O',
  'O': '0',
} as const;

/**
 * Common OCR word-level errors with corrections
 */
export const OCR_COMMON_WORD_ERRORS = new Map<string, string>([
  // Common academic terms
  ['leaming', 'learning'],
  ['algonthm', 'algorithm'],
  ['optim ization', 'optimization'],
  ['Com mon', 'Common'],
  ['emor', 'error'],
  ['thyiakoid', 'thylakoid'],
  ['chan', 'chain'],
  ['Cel', 'Cell'],
  ['fxation', 'fixation'],
  ['fx', 'fix'],
]);

/**
 * OCR formatting artifacts to recognize and handle
 */
export const OCR_FORMATTING_ARTIFACTS = {
  tableElements: ['|', '-', '---', '==='],
  figureReferences: ['[Below image]', 'Figure', 'Table', 'Chart', 'Graph'],
  slideMarkers: ['•', '○', '▪', '▫', '→', '⇒'],
  codeBlockMarkers: ['```', '~~~', '    '], // 4 spaces for indented code
  mathNotation: ['∑', '∫', '∂', '∇', '∈', '∀', '∃'],
} as const;

/**
 * Domain-specific terminology patterns for context reconstruction
 */
export const DOMAIN_PATTERNS = {
  computerScience: {
    keywords: ['algorithm', 'complexity', 'data structure', 'function', 'method', 'class', 'interface'],
    patterns: [/O\([n^2]+\)/, /\bAPI\b/, /\bHTTP[S]?\b/, /\bSQL\b/],
  },
  biology: {
    keywords: ['cell', 'membrane', 'protein', 'enzyme', 'DNA', 'RNA', 'ATP', 'NADPH'],
    patterns: [/\b[A-Z]{2,4}[a-z]?\b/], // Enzyme names like RuBisCO
  },
  mathematics: {
    keywords: ['theorem', 'proof', 'equation', 'derivative', 'integral', 'matrix', 'vector'],
    patterns: [/\d+\s*[+\-*/]\s*\d+/, /[a-z]\s*=\s*/],
  },
  physics: {
    keywords: ['force', 'energy', 'momentum', 'velocity', 'acceleration', 'wave', 'particle'],
    patterns: [/\d+\s*[A-Za-z]+/, /E\s*=\s*mc/, /F\s*=\s*ma/],
  },
} as const;

/**
 * Clean OCR text by applying common corrections
 */
export function cleanOCRText(text: string): string {
  let cleaned = text;
  
  // Apply word-level corrections
  OCR_COMMON_WORD_ERRORS.forEach((correct, error) => {
    const regex = new RegExp(`\\b${error}\\b`, 'gi');
    cleaned = cleaned.replace(regex, correct);
  });
  
  // Fix spacing issues
  cleaned = cleaned
    .replace(/\s+/g, ' ')  // Multiple spaces to single
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between camelCase
    .trim();
  
  return cleaned;
}

/**
 * Detect the academic domain of the text
 */
export function detectDomain(text: string): keyof typeof DOMAIN_PATTERNS | 'general' {
  const lowerText = text.toLowerCase();
  let maxScore = 0;
  let detectedDomain: keyof typeof DOMAIN_PATTERNS | 'general' = 'general';
  
  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    let score = 0;
    
    // Check keywords
    patterns.keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) score++;
    });
    
    // Check patterns
    patterns.patterns.forEach(pattern => {
      if (pattern.test(text)) score += 2; // Patterns are weighted higher
    });
    
    if (score > maxScore) {
      maxScore = score;
      detectedDomain = domain as keyof typeof DOMAIN_PATTERNS;
    }
  }
  
  return maxScore > 2 ? detectedDomain : 'general';
}

/**
 * Remove formatting artifacts from text
 */
export function removeFormattingArtifacts(text: string): string {
  let cleaned = text;
  
  // Remove table formatting
  OCR_FORMATTING_ARTIFACTS.tableElements.forEach(element => {
    cleaned = cleaned.replace(new RegExp(`\\${element}+`, 'g'), ' ');
  });
  
  // Clean figure references but keep the context
  OCR_FORMATTING_ARTIFACTS.figureReferences.forEach(ref => {
    cleaned = cleaned.replace(new RegExp(`\\[?${ref}[^\\]]*\\]?:?`, 'gi'), '');
  });
  
  // Remove slide markers at line start
  OCR_FORMATTING_ARTIFACTS.slideMarkers.forEach(marker => {
    cleaned = cleaned.replace(new RegExp(`^\\s*\\${marker}\\s*`, 'gm'), '');
  });
  
  return cleaned.trim();
}