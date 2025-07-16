import { execSync } from 'child_process';
import fs from 'fs';
import { config } from 'dotenv';

console.log('🧪 Testing Enhanced WhatsApp Chatbot Setup...\n');

// Load environment variables
config();

// Test 1: Check TypeScript compilation
console.log('1️⃣ Testing TypeScript compilation...');
try {
  execSync('npm run typecheck', { stdio: 'pipe' });
  console.log('✅ TypeScript compilation passed');
} catch (error) {
  console.log('❌ TypeScript compilation failed');
  process.exit(1);
}

// Test 2: Check environment variables
console.log('\n2️⃣ Testing environment configuration...');

const requiredEnvVars = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'ENABLE_RAG',
  'ENABLE_VISION',
  'ENABLE_PDF'
];

let envValid = true;
for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}: ${envVar.includes('KEY') ? '[HIDDEN]' : process.env[envVar]}`);
  } else {
    console.log(`❌ ${envVar}: missing`);
    envValid = false;
  }
}

if (!envValid) {
  console.log('\n❌ Environment configuration incomplete');
  process.exit(1);
}

// Test 3: Verify Claude Sonnet 4 model
console.log('\n3️⃣ Testing Claude Sonnet 4 configuration...');
if (process.env.ANTHROPIC_MODEL === 'claude-sonnet-4-20250514') {
  console.log('✅ Claude Sonnet 4 model configured correctly');
} else {
  console.log(`❌ Expected claude-sonnet-4-20250514, got ${process.env.ANTHROPIC_MODEL}`);
  process.exit(1);
}

// Test 4: Check required files exist
console.log('\n4️⃣ Testing required service files...');
const requiredFiles = [
  'src/services/vision.ts',
  'src/services/pdf.ts',
  'src/services/embeddings.ts',
  'src/services/vector.ts',
  'src/services/rag.ts',
  'src/providers/anthropic.ts',
  'src/bot/chatbot.ts'
];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} missing`);
    process.exit(1);
  }
}

// Test 5: Test basic imports and instantiation
async function testServices() {
  console.log('\n5️⃣ Testing service imports and instantiation...');
  try {
    const { VisionService } = await import('./src/services/vision');
    const { PDFService } = await import('./src/services/pdf');
    const { EmbeddingsService } = await import('./src/services/embeddings');
    const { AnthropicProvider } = await import('./src/providers/anthropic');
    
    console.log('✅ All services imported successfully');
    
    // Test Anthropic provider instantiation
    const anthropicProvider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
    console.log(`✅ Anthropic provider instantiated: ${anthropicProvider.name}`);
    
    // Test EmbeddingsService instantiation
    const embeddingsService = new EmbeddingsService(process.env.OPENAI_API_KEY!);
    console.log(`✅ Embeddings service instantiated`);
    
    // Test VisionService static methods
    const isImageSupported = VisionService.isImageSupported('image/jpeg');
    console.log(`✅ Vision service methods accessible: ${isImageSupported}`);
    
    console.log('\n🎉 All tests passed! Enhanced chatbot setup is ready.');
    console.log('\n📋 Features available:');
    console.log('  🧠 Claude Sonnet 4 (claude-sonnet-4-20250514)');
    console.log('  👁️ Vision capabilities for image processing');
    console.log('  📄 PDF reading and text extraction');
    console.log('  🔍 RAG with Supabase vector database');
    console.log('  ⚡ Performance optimizations with caching');
    console.log('  💾 Persistent conversation storage');
    console.log('\n💡 Run "npm run dev" to start the interactive chatbot!');
    
  } catch (error) {
    console.log('❌ Service import/instantiation failed:', error.message);
    process.exit(1);
  }
}

testServices();