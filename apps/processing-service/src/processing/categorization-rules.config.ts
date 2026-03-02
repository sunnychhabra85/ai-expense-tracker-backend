// =============================================================
// apps/processing-service/src/processing/categorization-rules.config.ts
// Configurable categorization rules - easily extensible
// =============================================================

export type Category = 
  | 'Food & Dining'
  | 'Transportation'
  | 'Shopping'
  | 'Bills & Utilities'
  | 'Entertainment'
  | 'Healthcare'
  | 'Education'
  | 'Investment'
  | 'Transfer'
  | 'Salary'
  | 'Cash Withdrawal'
  | 'Others';

export interface CategoryRule {
  category: Category;
  priority: number; // Higher = checked first (1-10)
  
  // Keyword matching (case-insensitive, partial match)
  keywords?: string[];
  
  // Exact phrase matching (case-insensitive)
  exactPhrases?: string[];
  
  // Regex patterns for advanced matching
  patterns?: RegExp[];
  
  // Merchant codes or identifiers
  merchantCodes?: string[];
  
  // Confidence threshold (0-1) - if rule matches with confidence below this, use AI
  confidenceThreshold?: number;
}

// ── Rule Set Configuration ────────────────────────────────────
export const CATEGORIZATION_RULES: CategoryRule[] = [
  // ── High Priority: Financial Transactions ─────────────────
  {
    category: 'Salary',
    priority: 10,
    keywords: ['salary', 'wages', 'payroll', 'income'],
    patterns: [/SAL-\w+/, /PAYROLL/i],
    confidenceThreshold: 0.95,
  },
  {
    category: 'Investment',
    priority: 9,
    keywords: ['mutual fund', 'sip', 'stocks', 'equity', 'nifty', 'sensex', 'zerodha', 'groww', 'upstox'],
    exactPhrases: ['systematic investment plan', 'national pension scheme'],
    patterns: [/MF-\w+/, /ELSS/i, /NPS/i],
    confidenceThreshold: 0.9,
  },
  {
    category: 'Transfer',
    priority: 9,
    keywords: ['upi', 'imps', 'neft', 'rtgs', 'transfer to', 'transfer from'],
    patterns: [/UPI\/P2[AP]\/\d+/, /IMPS-\w+/, /NEFT-\w+/],
    exactPhrases: ['fund transfer', 'bank transfer'],
    confidenceThreshold: 0.85,
  },
  {
    category: 'Cash Withdrawal',
    priority: 9,
    keywords: ['atm', 'cash withdrawal', 'atm-wd', 'atm cash'],
    patterns: [/ATM-?(?:WD|CASH)[\/ ]/i],
    confidenceThreshold: 0.95,
  },

  // ── High Priority: Regular Expenses ───────────────────────
  {
    category: 'Food & Dining',
    priority: 8,
    keywords: [
      'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger',
      'mcdonald', 'kfc', 'subway', 'dominos', 'starbucks', 'dunkin', 'food',
      'dining', 'bistro', 'bakery', 'grocery', 'supermarket', 'dmart',
      'bigbasket', 'dunzo', 'blinkit', 'zepto', 'instamart', 'grofers',
      'fresh', 'market', 'kirana', 'provisions',
    ],
    exactPhrases: ['food delivery', 'grocery store'],
    merchantCodes: ['SWIGGY', 'ZOMATO', 'BIGBASKET'],
    confidenceThreshold: 0.8,
  },
  {
    category: 'Transportation',
    priority: 8,
    keywords: [
      'uber', 'ola', 'rapido', 'irctc', 'railway', 'flight', 'airlines',
      'makemytrip', 'goibibo', 'yatra', 'redbus', 'metro', 'bus', 'cab',
      'taxi', 'petrol', 'fuel', 'parking', 'toll', 'indigo', 'spicejet',
      'air india', 'vistara', 'auto', 'rickshaw', 'gas station',
    ],
    exactPhrases: ['public transport', 'vehicle fuel'],
    patterns: [/TOLL-\w+/, /PETROL\s?PUMP/i],
    confidenceThreshold: 0.8,
  },
  {
    category: 'Bills & Utilities',
    priority: 8,
    keywords: [
      'electricity', 'water', 'gas', 'broadband', 'internet', 'wifi',
      'airtel', 'jio', 'vi', 'vodafone', 'bsnl', 'dth', 'tata sky', 'dish tv',
      'emi', 'loan', 'insurance', 'premium', 'recharge', 'mobile', 'bill',
      'utility', 'maintenance', 'society', 'rent', 'lease', 'postpaid',
    ],
    exactPhrases: ['monthly bill', 'utility payment', 'loan repayment'],
    patterns: [/BILL-\w+/, /EMI-\w+/, /LOAN/i],
    confidenceThreshold: 0.85,
  },

  // ── Medium Priority: Lifestyle ────────────────────────────
  {
    category: 'Shopping',
    priority: 7,
    keywords: [
      'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal',
      'shopify', 'retail', 'mall', 'store', 'purchase', 'market', 'shop',
      'fashion', 'clothing', 'apparel', 'shoes', 'electronics', 'gadget',
      'croma', 'reliance digital', 'vijay sales', 'lifestyle', 'max',
    ],
    exactPhrases: ['online shopping', 'retail store'],
    confidenceThreshold: 0.75,
  },
  {
    category: 'Entertainment',
    priority: 7,
    keywords: [
      'netflix', 'amazon prime', 'hotstar', 'disney', 'spotify', 'youtube',
      'prime video', 'zee5', 'sonyliv', 'movie', 'cinema', 'pvr', 'inox',
      'gaming', 'steam', 'playstation', 'xbox', 'concert', 'event', 'show',
      'theatre', 'book', 'kindle', 'audible', 'subscription',
    ],
    exactPhrases: ['movie ticket', 'gaming subscription'],
    confidenceThreshold: 0.8,
  },
  {
    category: 'Healthcare',
    priority: 7,
    keywords: [
      'hospital', 'clinic', 'doctor', 'pharmacy', 'medical', 'medicine',
      'apollo', 'fortis', 'max healthcare', 'medanta', '1mg', 'netmeds',
      'pharmeasy', 'health', '診療', 'lab', 'diagnostic', 'test',
    ],
    exactPhrases: ['medical bill', 'hospital payment', 'pharmacy purchase'],
    patterns: [/DR\.?\s+[A-Z]/i],
    confidenceThreshold: 0.85,
  },
  {
    category: 'Education',
    priority: 7,
    keywords: [
      'school', 'college', 'university', 'course', 'tuition', 'fees',
      'udemy', 'coursera', 'upgrad', 'byju', 'unacademy', 'books',
      'exam', 'coaching', 'training', 'certification',
    ],
    exactPhrases: ['school fees', 'course enrollment', 'education loan'],
    confidenceThreshold: 0.85,
  },
];

// ── Helper: Get all unique categories ─────────────────────────
export function getAllCategories(): Category[] {
  return Array.from(
    new Set(CATEGORIZATION_RULES.map((r) => r.category))
  ).concat(['Others']);
}

// ── Helper: Get rules by priority ─────────────────────────────
export function getRulesByPriority(): CategoryRule[] {
  return [...CATEGORIZATION_RULES].sort((a, b) => b.priority - a.priority);
}
