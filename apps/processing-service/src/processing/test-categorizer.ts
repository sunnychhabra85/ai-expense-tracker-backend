// =============================================================
// Test Script: Run categorization on sample transactions
// Usage: ts-node apps/processing-service/src/processing/test-categorizer.ts
// =============================================================

import { CategorizerService } from './categorizer.service';
import { ConfigService } from '@nestjs/config';
import { SAMPLE_TRANSACTIONS } from './CATEGORIZATION_GUIDE';

// Mock ConfigService for standalone testing
class MockConfigService {
  get(key: string) {
    if (key === 'processing.openaiApiKey') {
      return process.env.OPENAI_API_KEY || '';
    }
    return undefined;
  }
}

async function testCategorization() {
  console.log('🧪 Testing Transaction Categorization System\n');
  console.log('='.repeat(70));

  const configService = new MockConfigService() as any;
  const categorizer = new CategorizerService(configService);

  let passed = 0;
  let failed = 0;

  for (const testCase of SAMPLE_TRANSACTIONS) {
    const result = await categorizer['categorizeWithDetails'](testCase.description);
    const isCorrect = result.category === testCase.expected;
    
    if (isCorrect) {
      passed++;
      console.log(`✅ PASS`);
    } else {
      failed++;
      console.log(`❌ FAIL`);
    }
    
    console.log(`   Description: "${testCase.description}"`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Got: ${result.category}`);
    console.log(`   Method: ${result.method} (${(result.confidence * 100).toFixed(0)}% confidence)`);
    if (result.matchedRule) {
      console.log(`   Matched: ${result.matchedRule}`);
    }
    console.log('-'.repeat(70));
  }

  console.log('\n📊 RESULTS');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${SAMPLE_TRANSACTIONS.length}`);
  console.log(`Passed: ${passed} (${((passed / SAMPLE_TRANSACTIONS.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed / SAMPLE_TRANSACTIONS.length) * 100).toFixed(1)}%)`);
  
  console.log('\n(Run with individual categorizeWithDetails calls to see per-method breakdown)');
  
  console.log('\n✨ Test complete!');
}

// Run if executed directly
if (require.main === module) {
  testCategorization()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test failed:', err);
      process.exit(1);
    });
}

export { testCategorization };
