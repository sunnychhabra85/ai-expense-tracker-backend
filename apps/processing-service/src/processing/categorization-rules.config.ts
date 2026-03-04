// =============================================================
// apps/processing-service/src/processing/categorization-rules.config.ts
// Expense categorization rules - focused on expenses only
// Primary categories: Food, Travel, Shopping, Bills, Entertainment, Others
// =============================================================

export type Category =
  // Food-related expenses
  | 'Food & Dining'
  | 'Groceries'
  // Travel-related expenses
  | 'Transportation'
  | 'Fuel'
  // Shopping
  | 'Shopping'
  // Bills & utilities
  | 'Bills & Utilities'
  | 'Mobile & Internet'
  | 'Subscriptions'
  // Entertainment
  | 'Entertainment'
  // Additional essential expense categories
  | 'Healthcare'
  | 'Education'
  | 'Insurance'
  // Catch-all
  | 'Others';

export interface CategoryRule {
  category: Category;
  priority: number; // Higher = checked first (1–10); ties broken by array order

  // Exact phrase matching (case-insensitive, checked first)
  exactPhrases?: string[];

  // Regex patterns (checked second)
  patterns?: RegExp[];

  // Merchant / payment-system codes
  merchantCodes?: string[];

  // Keyword substring matching (checked last among rule strategies)
  keywords?: string[];

  // Confidence threshold (0-1); below this threshold AI fallback is used
  confidenceThreshold?: number;
}

// ── Rule Set Configuration ────────────────────────────────────
// EXPENSES ONLY - Non-expense transactions (salary, investments, transfers, etc.) are skipped
// Priority determines matching order; higher priority = checked first (10 = highest)
// AI fallback is used when confidence is below threshold or no rule matches
export const CATEGORIZATION_RULES: CategoryRule[] = [

  // ── Priority 10: Highly specific vendor matches ───────────

  {
    category: 'Groceries',
    priority: 10,
    exactPhrases: ['grocery store', 'supermarket', 'daily essentials'],
    keywords: [
      'dmart', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'grofers',
      'dunzo', 'jiomart', 'supermarket', 'grocery', 'kirana', 'provisions',
      'reliance fresh', 'more', 'star bazaar', 'spencer', 'nilgiris',
      'metro cash', 'spar', 'hypercity', 'easyday',
    ],
    merchantCodes: ['BIGBASKET', 'DMART'],
    patterns: [
      /\bDMART\b/i,
      /\bBIGBASKET\b/i,
      /\bBLINKIT\b/i,
      /\bZEPTO\b/i,
      /\bGROCERY\b/i,
      /\bSUPERMARKET\b/i,
      /\bUPI.*(?:DMART|BIGBASKET|BLINKIT|ZEPTO)/i,
    ],
    confidenceThreshold: 0.88,
  },

  {
    category: 'Food & Dining',
    priority: 10,
    exactPhrases: ['food delivery', 'restaurant bill'],
    keywords: [
      'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee shop', 'hotel',
      'pizza hut', 'pizza', 'burger king', 'burger', 'mcdonalds', 'kfc',
      'subway', 'dominos', 'starbucks', 'dunkin', 'bistro', 'bakery',
      'food court', 'dining', 'eatery', 'food outlet', 'canteen', 'mess',
      'dhaba', 'biryani', 'tiffin', 'sweet shop', 'confectionery',
    ],
    merchantCodes: ['SWIGGY', 'ZOMATO'],
    patterns: [
      /\bSWIGGY\b/i,
      /\bZOMATO\b/i,
      /\bUPI.*SWIGGY/i,
      /\bUPI.*ZOMATO/i,
      /\bRESTAURANT\b/i,
      /\bHOTEL.*FOOD/i,
    ],
    confidenceThreshold: 0.88,
  },

  {
    category: 'Fuel',
    priority: 10,
    exactPhrases: ['petrol pump', 'fuel station', 'cng refill', 'lpg refill'],
    keywords: [
      'petrol', 'diesel', 'cng', 'fuel', 'hpcl', 'bpcl', 'iocl',
      'indian oil', 'bharat petroleum', 'hindustan petroleum',
      'gas station', 'petrol bunk', 'fuel pump', 'pump', 'hp petrol',
      'essar', 'shell', 'reliance petroleum',
    ],
    patterns: [
      /\bPETROL\s*PUMP\b/i, 
      /\bFUEL\s*STATION\b/i,
      /\bHPCL\b/i,
      /\bBPCL\b/i,
      /\bIOCL\b/i,
      /\bPETROL\b/i,
      /\bDIESEL\b/i,
    ],
    confidenceThreshold: 0.90,
  },

  {
    category: 'Transportation',
    priority: 10,
    exactPhrases: ['cab booking', 'train ticket', 'flight ticket', 'bus ticket', 'metro card'],
    keywords: [
      'uber', 'ola', 'rapido', 'irctc', 'railway', 'flight',
      'makemytrip', 'goibibo', 'yatra', 'redbus', 'metro', 'bus',
      'indigo', 'spicejet', 'air india', 'vistara', 'akasa',
      'parking', 'toll', 'taxi', 'cab', 'auto', 'rickshaw',
      'train', 'railway booking', 'ticket booking',
    ],
    patterns: [
      /\bUBER\b/i,
      /\bOLA\b/i,
      /\bRAPIDO\b/i,
      /\bTOLL[-\/]\w+/i,
      /\bIRCTC\b/i,
      /\bPARKING\b/i,
      /\bMETRO\b/i,
      /\bUPI.*(?:UBER|OLA|RAPIDO)/i,
    ],
    confidenceThreshold: 0.88,
  },

  // ── Priority 9: Clear service categories ──────────────────

  {
    category: 'Subscriptions',
    priority: 9,
    exactPhrases: ['monthly subscription', 'annual subscription', 'subscription renewal'],
    keywords: [
      'netflix', 'amazon prime', 'hotstar', 'disney', 'spotify',
      'youtube premium', 'prime video', 'zee5', 'sonyliv', 'apple music',
      'audible', 'kindle', 'adobe', 'microsoft 365', 'google one',
      'subscription', 'membership', 'annual plan', 'monthly plan',
      'ott', 'streaming',
    ],
    patterns: [
      /\bNETFLIX\b/i,
      /\bAMAZON\s+PRIME\b/i,
      /\bHOTSTAR\b/i,
      /\bSPOTIFY\b/i,
      /\bSUBSCRIPTION\b/i,
    ],
    confidenceThreshold: 0.85,
  },

  {
    category: 'Entertainment',
    priority: 9,
    exactPhrases: ['movie ticket', 'event ticket', 'cinema booking'],
    keywords: [
      'pvr', 'inox', 'cinepolis', 'book my show', 'bookmyshow',
      'concert', 'event', 'gaming', 'steam', 'playstation',
      'xbox', 'theatre', 'amusement park', 'cinema', 'movie',
      'carnival', 'fun city', 'smaaash', 'timezone',
    ],
    patterns: [
      /\bPVR\b/i,
      /\bINOX\b/i,
      /\bCINEMA\b/i,
      /\bMOVIE\b/i,
      /\bBOOKMYSHOW\b/i,
    ],
    confidenceThreshold: 0.82,
  },

  {
    category: 'Healthcare',
    priority: 9,
    exactPhrases: ['medical bill', 'hospital payment', 'pharmacy', 'doctor consultation', 'lab test'],
    keywords: [
      'hospital', 'clinic', 'doctor', 'pharmacy', 'medical', 'apollo',
      'fortis', 'max hospital', 'medanta', '1mg', 'netmeds', 'pharmeasy',
      'lab test', 'diagnostic', 'pathology', 'health checkup', 'medicine',
      'chemist', 'medplus', 'dr ', 'hospital bill', 'consultation',
    ],
    patterns: [
      /\bDR\.?\s+[A-Z][a-z]+/i,
      /\bHOSPITAL\b/i,
      /\bCLINIC\b/i,
      /\bPHARMACY\b/i,
      /\bMEDICAL\b/i,
      /\bAPOLLO\b/i,
    ],
    confidenceThreshold: 0.88,
  },

  {
    category: 'Education',
    priority: 9,
    exactPhrases: ['school fees', 'college fees', 'tuition fees', 'course fee'],
    keywords: [
      'school', 'college', 'university', 'tuition', 'udemy',
      'coursera', 'upgrad', 'byjus', 'unacademy', 'coaching',
      'training', 'certification', 'exam fee', 'educational',
      'education', 'institute', 'academy',
    ],
    patterns: [
      /\bSCHOOL\s+FEE/i,
      /\bCOLLEGE\s+FEE/i,
      /\bTUITION\b/i,
      /\bEDUCATION\b/i,
    ],
    confidenceThreshold: 0.88,
  },

  {
    category: 'Insurance',
    priority: 9,
    exactPhrases: [
      'insurance premium', 'life insurance', 'health insurance', 'vehicle insurance',
      'term insurance', 'lic premium', 'mediclaim', 'insurance payment',
    ],
    keywords: [
      'lic', 'mediclaim', 'term insurance', 'life insurance',
      'health insurance', 'vehicle insurance', 'motor insurance', 'star health',
      'bajaj allianz', 'hdfc ergo', 'hdfc life', 'tata aig', 'policybazaar',
      'insurance premium', 'sbi life', 'icici pru', 'max life',
    ],
    patterns: [
      /\bLIC[-\/]\w+/i,
      /\bINSURANCE\s+PREMIUM\b/i,
      /\bLIC\b/i,
      /\bMEDICLAIM\b/i,
    ],
    confidenceThreshold: 0.90,
  },

  // ── Priority 8: Utility bills and services ────────────────

  {
    category: 'Mobile & Internet',
    priority: 8,
    exactPhrases: ['mobile recharge', 'broadband bill', 'prepaid recharge', 'postpaid bill'],
    keywords: [
      'airtel', 'jio', 'vi prepaid', 'vi postpaid', 'vodafone', 'bsnl',
      'mtnl', 'mobile recharge', 'broadband', 'postpaid', 'prepaid recharge',
      'internet bill', 'wifi bill', 'data pack', 'recharge', 'mobile bill',
      'paytm recharge', 'phonepe recharge', 'gpay recharge',
    ],
    patterns: [
      /\bAIRTEL\b/i, 
      /\bJIO\b/i,
      /\bRECHARGE\b/i,
      /\bMOBILE\s+(?:RECHARGE|BILL)/i,
      /\bBROADBAND\b/i,
    ],
    confidenceThreshold: 0.88,
  },

  {
    category: 'Bills & Utilities',
    priority: 8,
    exactPhrases: ['electricity bill', 'water bill', 'gas bill', 'utility payment', 'maintenance charges'],
    keywords: [
      'electricity bill', 'water bill', 'gas bill', 'water board', 
      'electricity board', 'power bill', 'bescom', 'msedcl', 'kseb',
      'dth', 'tata sky', 'dish tv', 'd2h', 'sun direct',
      'maintenance charges', 'society charges', 'society maintenance',
      'rent payment', 'lease payment', 'house rent',
    ],
    patterns: [
      /\bELECTRICITY\s+BILL\b/i,
      /\bWATER\s+BILL\b/i,
      /\bMAINTENANCE\s+CHARGES?\b/i,
      /\bRENT\s+PAYMENT\b/i,
    ],
    confidenceThreshold: 0.88,
  },

  // ── Priority 7: General shopping (lower to avoid false positives) ─

  {
    category: 'Shopping',
    priority: 7,
    exactPhrases: ['online shopping', 'retail purchase', 'pos purchase'],
    keywords: [
      'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho',
      'snapdeal', 'shopify', 'retail', 'croma', 'reliance digital',
      'vijay sales', 'lifestyle store', 'max fashion', 'pantaloons',
      'shopping', 'purchase', 'store', 'mall', 'pos', 'swipe',
      'shoppe', 'westside', 'central', 'brand factory', 'trends',
    ],
    patterns: [
      /\bAMAZON\b/i,
      /\bFLIPKART\b/i,
      /\bPOS\s+PURCHASE/i,
      /\bCARD\s+PURCHASE/i,
      /\bUPI.*AMAZON/i,
      /\bUPI.*FLIPKART/i,
    ],
    confidenceThreshold: 0.75,
  },
];

// ── Utility helpers ───────────────────────────────────────────

/** Returns rules sorted descending by priority (highest first). */
export function getRulesByPriority(): CategoryRule[] {
  return [...CATEGORIZATION_RULES].sort((a, b) => b.priority - a.priority);
}

/** Returns the full list of known category strings. */
export function getAllCategories(): Category[] {
  const seen = new Set<Category>();
  return CATEGORIZATION_RULES.reduce<Category[]>((acc, r) => {
    if (!seen.has(r.category)) {
      seen.add(r.category);
      acc.push(r.category);
    }
    return acc;
  }, []);
}


