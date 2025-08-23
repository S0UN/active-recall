/**
 * Simple test script to run prompt comparison
 * Run with: node test-prompts.js
 */

const { runPromptComparison } = require('./dist/core/services/impl/PromptComparisonTest.js');

async function main() {
  // You need to set your OpenAI API key here or in environment variable
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Please set OPENAI_API_KEY environment variable');
    console.error('   Example: export OPENAI_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  console.log('🔑 Using OpenAI API key:', apiKey.substring(0, 10) + '...');
  
  try {
    await runPromptComparison(apiKey);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);