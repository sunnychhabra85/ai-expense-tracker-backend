// =============================================================
// apps/processing-service/src/processing/categorizer.service.ts
// Hybrid categorization: Rule-based → AI fallback
// Multi-strategy matching for robustness and scalability
// =============================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  Category,
  CategoryRule,
  getRulesByPriority,
  getAllCategories,
} from './categorization-rules.config';

interface CategorizationResult {
  category: Category;
  confidence: number; // 0-1
  method: 'exact-phrase' | 'pattern' | 'keyword' | 'merchant-code' | 'ai' | 'default';
  matchedRule?: string;
}

@Injectable()
export class CategorizerService {
  private readonly logger = new Logger(CategorizerService.name);
  private readonly aiEnabled: boolean;
  private readonly rules: CategoryRule[];
  
  // Metrics tracking
  private stats = {
    total: 0,
    byMethod: {
      'exact-phrase': 0,
      'pattern': 0,
      'keyword': 0,
      'merchant-code': 0,
      'ai': 0,
      'default': 0,
    },
  };

  constructor(private readonly config: ConfigService) {
    this.aiEnabled = !!config.get<string>('processing.openaiApiKey');
    this.rules = getRulesByPriority();
    this.logger.log(`Categorizer initialized. AI ${this.aiEnabled ? 'enabled' : 'disabled'}. Rules loaded: ${this.rules.length}`);
  }

  // ── Main categorization entry point ──────────────────────────
  async categorize(description: string): Promise<Category> {
    const result = await this.categorizeWithDetails(description);
    return result.category;
  }

  // ── Detailed categorization with confidence & method ──────────
  async categorizeWithDetails(description: string): Promise<CategorizationResult> {
    this.stats.total++;
    const normalized = this.normalize(description);

    // ── Strategy 1: Exact phrase matching (highest confidence) ───
    const exactMatch = this.matchExactPhrase(normalized);
    if (exactMatch) {
      this.stats.byMethod['exact-phrase']++;
      return exactMatch;
    }

    // ── Strategy 2: Regex pattern matching (high confidence) ─────
    const patternMatch = this.matchPattern(normalized, description);
    if (patternMatch) {
      this.stats.byMethod['pattern']++;
      return patternMatch;
    }

    // ── Strategy 3: Merchant code matching (high confidence) ─────
    const merchantMatch = this.matchMerchantCode(normalized);
    if (merchantMatch) {
      this.stats.byMethod['merchant-code']++;
      return merchantMatch;
    }

    // ── Strategy 4: Keyword matching (medium confidence) ─────────
    const keywordMatch = this.matchKeyword(normalized);
    if (keywordMatch) {
      this.stats.byMethod['keyword']++;
      
      // If confidence is below threshold for this rule, use AI
      const rule = this.rules.find((r) => r.category === keywordMatch.category);
      if (rule && rule.confidenceThreshold && keywordMatch.confidence < rule.confidenceThreshold) {
        // Low confidence keyword match → escalate to AI
        return await this.fallbackToAI(description);
      }
      
      return keywordMatch;
    }

    // ── Strategy 5: AI fallback (only for unknown patterns) ──────
    return await this.fallbackToAI(description);
  }

  // ── Bulk categorize (optimized for batch processing) ──────────
  async categorizeBatch(descriptions: string[]): Promise<Category[]> {
    const results = await Promise.all(
      descriptions.map((d) => this.categorizeWithDetails(d))
    );
    
    // Log batch statistics every 50 transactions
    if (this.stats.total % 50 === 0) {
      this.logStatistics();
    }
    
    return results.map((r) => r.category);
  }

  // ══════════════════════════════════════════════════════════════
  // Matching Strategies
  // ══════════════════════════════════════════════════════════════

  private matchExactPhrase(normalized: string): CategorizationResult | null {
    for (const rule of this.rules) {
      if (!rule.exactPhrases) continue;
      
      for (const phrase of rule.exactPhrases) {
        if (normalized.includes(phrase.toLowerCase())) {
          return {
            category: rule.category,
            confidence: 0.98,
            method: 'exact-phrase',
            matchedRule: phrase,
          };
        }
      }
    }
    return null;
  }

  private matchPattern(normalized: string, original: string): CategorizationResult | null {
    for (const rule of this.rules) {
      if (!rule.patterns) continue;
      
      for (const pattern of rule.patterns) {
        if (pattern.test(original) || pattern.test(normalized)) {
          return {
            category: rule.category,
            confidence: 0.95,
            method: 'pattern',
            matchedRule: pattern.toString(),
          };
        }
      }
    }
    return null;
  }

  private matchMerchantCode(normalized: string): CategorizationResult | null {
    for (const rule of this.rules) {
      if (!rule.merchantCodes) continue;
      
      for (const code of rule.merchantCodes) {
        if (normalized.includes(code.toLowerCase())) {
          return {
            category: rule.category,
            confidence: 0.92,
            method: 'merchant-code',
            matchedRule: code,
          };
        }
      }
    }
    return null;
  }

  private matchKeyword(normalized: string): CategorizationResult | null {
    let bestMatch: CategorizationResult | null = null;
    let maxMatches = 0;

    for (const rule of this.rules) {
      if (!rule.keywords) continue;
      
      // Count how many keywords match
      const matchCount = rule.keywords.filter((kw) =>
        normalized.includes(kw.toLowerCase())
      ).length;

      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        bestMatch = {
          category: rule.category,
          confidence: Math.min(0.6 + (matchCount * 0.1), 0.9), // More keywords = higher confidence
          method: 'keyword',
          matchedRule: `${matchCount} keywords`,
        };
      }
    }

    return bestMatch;
  }

  private async fallbackToAI(description: string): Promise<CategorizationResult> {
    if (!this.aiEnabled) {
      this.stats.byMethod['default']++;
      return {
        category: 'Others',
        confidence: 0.5,
        method: 'default',
      };
    }

    try {
      const category = await this.categorizeWithAI(description);
      this.stats.byMethod['ai']++;
      return {
        category,
        confidence: 0.85, // AI is generally reliable
        method: 'ai',
      };
    } catch (err) {
      this.logger.warn(`AI categorization failed: ${err.message}`);
      this.stats.byMethod['default']++;
      return {
        category: 'Others',
        confidence: 0.5,
        method: 'default',
      };
    }
  }

  // ── AI categorization using OpenAI ────────────────────────────
  private async categorizeWithAI(description: string): Promise<Category> {
    const client = new OpenAI({
      apiKey: this.config.get<string>('processing.openaiApiKey'),
    });

    const categories = getAllCategories();
    const categoryList = categories.join(', ');

    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',//'gpt-4o-mini', // Cost-effective model for categorization
      max_tokens: 20,
      temperature: 0.1, // Low temperature for consistent categorization
      messages: [
        {
          role: 'system',
          content: 'You are a financial transaction categorization expert. Respond with ONLY the category name, nothing else.',
        },
        {
          role: 'user',
          content: `Analyze this bank transaction and assign it to EXACTLY ONE category.

Available Categories: ${categoryList}

Transaction Description: "${description}"

Rules:
- Choose the MOST SPECIFIC category that fits
- If it's a UPI/IMPS/NEFT transfer with no context, use "Transfer"
- If it's ATM withdrawal, use "Cash Withdrawal"
- If unclear, use "Others"

Category:`,
        },
      ],
    });

    const rawCategory = response.choices[0]?.message?.content?.trim() || 'Others';
    
    // Validate and normalize AI response
    const validCategory = categories.find(
      (c) => c.toLowerCase() === rawCategory.toLowerCase()
    );
    
    return validCategory || 'Others';
  }

  // ══════════════════════════════════════════════════════════════
  // Utilities
  // ══════════════════════════════════════════════════════════════

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s/-]/g, ' ') // Remove special chars except dash/slash
      .replace(/\s+/g, ' ')
      .trim();
  }

  private logStatistics() {
    const percentage = (count: number) => 
      this.stats.total > 0 ? ((count / this.stats.total) * 100).toFixed(1) : '0.0';

    this.logger.log(
      `Categorization Stats (Total: ${this.stats.total}): ` +
      `Exact=${this.stats.byMethod['exact-phrase']} (${percentage(this.stats.byMethod['exact-phrase'])}%), ` +
      `Pattern=${this.stats.byMethod['pattern']} (${percentage(this.stats.byMethod['pattern'])}%), ` +
      `Merchant=${this.stats.byMethod['merchant-code']} (${percentage(this.stats.byMethod['merchant-code'])}%), ` +
      `Keyword=${this.stats.byMethod['keyword']} (${percentage(this.stats.byMethod['keyword'])}%), ` +
      `AI=${this.stats.byMethod['ai']} (${percentage(this.stats.byMethod['ai'])}%), ` +
      `Default=${this.stats.byMethod['default']} (${percentage(this.stats.byMethod['default'])}%)`
    );
  }

  // ── Get current statistics ────────────────────────────────────
  getStatistics() {
    return { ...this.stats };
  }
}
