/**
 * RAG Pipeline — Retrieval-Augmented Generation
 * ==============================================
 * Reads plain-text knowledge files, chunks them with overlap, embeds them
 * via Google's embedding model, and stores everything in a simple in-memory
 * vector store.  At query time, the user's question is embedded and compared
 * against the store using cosine similarity.
 */

import { pipeline } from '@xenova/transformers';
import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ── Paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const KNOWLEDGE_DIR = join(__dirname, '..', 'data', 'knowledge');
const CACHE_FILE = join(__dirname, '..', 'data', 'vectorStore.json');

// ── Config ───────────────────────────────────────────────────────────────────
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const CHUNK_SIZE      = 1000;  // characters
const CHUNK_OVERLAP   = 200;   // characters
const TOP_K           = 5;     // results to return

// ── In-memory vector store ───────────────────────────────────────────────────
// Each entry: { text: string, embedding: number[], source: string }
let vectorStore = [];

// ── Progress Tracking ────────────────────────────────────────────────────────
export const ragProgress = { total: 0, completed: 0, status: 'idle' };

// ── Local AI Model (lazy load) ───────────────────────────────────────────────
let extractor = null;

async function getExtractor() {
  if (!extractor) {
    console.log('⏳ Loading local AI embedding model (this may take a minute on first run)...');
    extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
  }
  return extractor;
}

// ── Text Chunking ────────────────────────────────────────────────────────────

/**
 * Split a long text into overlapping chunks of roughly `size` characters,
 * preferring to break at sentence boundaries when possible.
 *
 * @param {string} text   — The source text.
 * @param {number} size   — Target chunk size in characters.
 * @param {number} overlap — Number of overlapping characters between chunks.
 * @returns {string[]}
 */
function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || text.length === 0) return [];
  if (text.length <= size) return [text.trim()];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Try to break at the last sentence boundary within the chunk
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastPeriod = slice.lastIndexOf('. ');
      const lastNewline = slice.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > size * 0.3) {
        // Only use it if it's not too early in the chunk
        end = start + breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    let nextStart = end - overlap;
    if (nextStart <= start) {
      nextStart = end;
    }
    start = nextStart;
  }

  return chunks;
}

// ── Embedding helpers ────────────────────────────────────────────────────────

/**
 * Embed a single text string using the local AI model.
 */
async function embedText(text) {
  try {
    const ex = await getExtractor();
    const output = await ex(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('❌ Embedding failed:', error.message);
    return null;
  }
}

/**
 * Embed an array of texts locally as fast as the CPU allows.
 */
async function embedBatch(texts) {
  const results = new Array(texts.length).fill(null);
  
  ragProgress.total = texts.length;
  ragProgress.completed = 0;
  ragProgress.status = 'embedding';

  for (let i = 0; i < texts.length; i++) {
    results[i] = await embedText(texts[i]);
    ragProgress.completed++;
  }

  ragProgress.status = 'idle';
  return results;
}

// ── Cosine Similarity ────────────────────────────────────────────────────────

/**
 * Compute the cosine similarity between two vectors.
 * Returns a value in [-1, 1], where 1 = identical direction.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the RAG pipeline:
 *   1. Read all .txt files from data/knowledge/
 *   2. Chunk each file with overlap
 *   3. Embed every chunk
 *   4. Store in the in-memory vector store
 */
export async function initRAG() {
  vectorStore = [];
  
  // Load cache if it exists
  if (existsSync(CACHE_FILE)) {
    try {
      const cacheData = await readFile(CACHE_FILE, 'utf-8');
      vectorStore = JSON.parse(cacheData);
      console.log(`🧠 Loaded ${vectorStore.length} embedded chunks from local cache.`);
    } catch (err) {
      console.warn('⚠️  Could not read local cache, starting fresh.', err);
    }
  }

  // Ensure the knowledge directory exists
  if (!existsSync(KNOWLEDGE_DIR)) {
    await mkdir(KNOWLEDGE_DIR, { recursive: true });
    console.log(`📁 Created knowledge directory: ${KNOWLEDGE_DIR}`);
    console.log('   Add files there and restart to populate the knowledge base.');
    return;
  }

  // Read all .txt and .pdf files
  const files = (await readdir(KNOWLEDGE_DIR)).filter((f) =>
    f.endsWith('.txt') || f.endsWith('.pdf')
  );

  if (files.length === 0) {
    console.log('📂 No .txt or .pdf files found in the knowledge directory.');
    console.log(`   Add files to ${KNOWLEDGE_DIR} and restart.`);
    return;
  }

  console.log(`📖 Found ${files.length} knowledge file(s). Chunking…`);

  // Filter out files that have already been processed
  const processedSources = new Set(vectorStore.map(v => v.source));
  
  const allChunks = []; // { text, source }

  for (const file of files) {
    let sourceName = '';
    if (file.endsWith('.pdf')) {
      sourceName = basename(file, '.pdf');
    } else {
      sourceName = basename(file, '.txt');
    }
    
    // Skip if already in vectorStore
    if (processedSources.has(sourceName)) {
      continue;
    }
    
    const filePath = join(KNOWLEDGE_DIR, file);
    let content = '';
    
    if (file.endsWith('.pdf')) {
      const dataBuffer = await readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      content = pdfData.text;
    } else {
      content = await readFile(filePath, 'utf-8');
    }
    
    const chunks = chunkText(content);

    for (const chunk of chunks) {
      allChunks.push({ text: chunk, source: sourceName });
    }
  }

  if (allChunks.length === 0) {
    console.log(`📖 All knowledge files are already embedded and cached!`);
    return;
  }

  console.log(`🔪 Found ${allChunks.length} NEW chunk(s). Generating embeddings…`);

  // Embed all chunks
  const texts = allChunks.map((c) => c.text);
  const embeddings = await embedBatch(texts);

  // Build the vector store (skip chunks that failed to embed)
  let stored = 0;
  for (let i = 0; i < allChunks.length; i++) {
    if (embeddings[i]) {
      vectorStore.push({
        text: allChunks[i].text,
        source: allChunks[i].source,
        embedding: embeddings[i],
      });
      stored++;
    }
  }
  
  // Save to cache
  await writeFile(CACHE_FILE, JSON.stringify(vectorStore));

  console.log(
    `🧠 Vector store updated: ${stored}/${allChunks.length} new chunks embedded successfully and cached.`
  );
}

/**
 * Search the knowledge base for chunks most relevant to the query.
 *
 * @param {string} query — The user's question.
 * @returns {Promise<Array<{ text: string, source: string, score: number }>>}
 */
export async function searchKnowledge(query) {
  if (vectorStore.length === 0) {
    return [];
  }

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) {
    console.warn('⚠️  Could not embed query — returning empty results.');
    return [];
  }

  // Score every chunk
  const scored = vectorStore.map((entry) => ({
    text: entry.text,
    source: entry.source,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Sort descending by score and return top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_K);
}
