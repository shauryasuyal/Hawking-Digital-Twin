/**
 * Stephen Hawking Digital Twin — Express 5 Server
 * ================================================
 * Main entry point. Serves the static frontend, exposes REST API
 * endpoints for chat, memory dashboard, and session management,
 * and bootstraps the RAG knowledge pipeline on startup.
 */

import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

import { generateResponse } from './src/persona.js';
import { initRAG, searchKnowledge } from './src/rag.js';
import {
  getMemory,
  addToMemory,
  getMemoryDashboard,
  createSession,
} from './src/memory.js';

// ── Off-topic streak tracker ──────────────────────────────────────────────────
// Counts consecutive non-physics questions per session so persona.js
// can calibrate Hawking's patience without relying on the LLM to count.
const offTopicStreaks = new Map(); // sessionId → number

// Physics / science keywords — if a message matches, it is "on-topic"
const PHYSICS_KEYWORDS = [
  'black hole', 'event horizon', 'singularity', 'hawking radiation',
  'quantum', 'relativity', 'spacetime', 'gravity', 'gravitational',
  'cosmolog', 'universe', 'big bang', 'inflation', 'dark matter',
  'dark energy', 'entropy', 'thermodynamic', 'string theory', 'm-theory',
  'wave function', 'superposition', 'entanglement', 'uncertainty principle',
  'time dilation', 'arrow of time', 'time travel', 'information paradox',
  'equation', 'theorem', 'calculus', 'topology', 'geometry', 'physics',
  'mathematics', 'math', 'science', 'scientific', 'particle', 'photon',
  'electron', 'proton', 'neutron', 'quark', 'boson', 'higgs', 'neutrino',
  'nuclear', 'electromagnetic', 'light', 'speed of light', 'energy',
  'mass', 'force', 'dimension', 'multiverse', 'space', 'planet', 'star',
  'galaxy', 'cosmos', 'telescope', 'nasa', 'mars', 'moon', 'solar',
  'radiation', 'atom', 'molecule', 'chemistry', 'biology', 'evolution',
  'brief history', 'brief answers', 'universe in a nutshell', 'grand design',
  'als', 'motor neuron', 'disability', 'wheelchair', 'speech synthesizer',
  'cambridge', 'oxford', 'research', 'theory', 'hypothesis', 'experiment',
  'extraterrestrial', 'alien', 'fermi', 'drake', 'ai', 'artificial intelligence',
];

function isOnTopic(message) {
  const lower = message.toLowerCase();
  return PHYSICS_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

// Request logging — lightweight, stdout-friendly
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// ── Health flag — true once the RAG index is built ───────────────────────────
let ragReady = false;

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Body: { message: string, sessionId: string }
 * Returns: { response: string, sources: string[] }
 *
 * Pipeline:
 *   1. Retrieve relevant knowledge chunks (RAG)
 *   2. Load conversational memory for the session
 *   3. Generate a Hawking-persona response via Gemini
 *   4. Persist the exchange in memory
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, reporterName, apiKeys } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "message" field.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "sessionId" field.' });
    }

    if (!ragReady) {
      return res.status(503).json({
        error: 'The knowledge base is still initialising. Please try again shortly.',
      });
    }

    // ── Off-topic streak tracking ─────────────────────────────────────────────
    const onTopic = isOnTopic(message);
    const currentStreak = offTopicStreaks.get(sessionId) || 0;
    const newStreak = onTopic ? 0 : currentStreak + 1;
    offTopicStreaks.set(sessionId, newStreak);
    console.log(`[streak] session=${sessionId} onTopic=${onTopic} streak=${newStreak}`);

    // 1. Search the knowledge base for relevant context
    const sources = await searchKnowledge(message);

    // 2. Retrieve memory context (short-term + long-term)
    const memoryContext = getMemory(sessionId);

    // 3. Generate the persona-driven response (pass streak so persona can calibrate tone)
    const response = await generateResponse(message, sources, memoryContext, reporterName, apiKeys, newStreak);

    // 4. Persist the exchange
    addToMemory(sessionId, message, response);

    // Return unique source labels
    const sourceLabels = [
      ...new Set(sources.map((s) => s.source).filter(Boolean)),
    ];

    res.json({ response, sources: sourceLabels });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'An error occurred while processing your question.',
    });
  }
});

/**
 * GET /api/memory/:sessionId
 * Returns structured memory data for the dashboard visualisation.
 */
app.get('/api/memory/:sessionId', (req, res) => {
  try {
    const dashboard = getMemoryDashboard(req.params.sessionId);
    res.json(dashboard);
  } catch (error) {
    console.error('Memory dashboard error:', error);
    res.status(500).json({ error: 'Failed to retrieve memory data.' });
  }
});

/**
 * POST /api/session
 * Creates a brand-new conversation session.
 * Returns: { sessionId: string }
 */
app.post('/api/session', (_req, res) => {
  try {
    const sessionId = uuidv4();
    createSession(sessionId);
    console.log(`✨ New session created: ${sessionId}`);
    res.json({ sessionId });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: 'Failed to create session.' });
  }
});

/**
 * DELETE /api/session/:sessionId
 * Clears all in-memory state for the given session.
 */
app.delete('/api/session/:sessionId', (_req, res) => {
  try {
    // createSession effectively resets the slot
    createSession(_req.params.sessionId);
    // Reset the off-topic streak for this session too
    offTopicStreaks.delete(_req.params.sessionId);
    console.log(`🗑️  Session cleared: ${_req.params.sessionId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Session deletion error:', error);
    res.status(500).json({ error: 'Failed to clear session.' });
  }
});

import { ragProgress } from './src/rag.js';

/**
 * GET /api/rag/status
 * Returns the current embedding progress.
 */
app.get('/api/rag/status', (_req, res) => {
  res.json({
    ready: ragReady,
    progress: ragProgress
  });
});

// ── Catch-all: serve the SPA for any non-API path ───────────────────────────
app.use((_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
  });
});

// ── Startup ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  app.listen(PORT, () => {
    console.log(`\n🌌 Stephen Hawking Digital Twin is live!`);
    console.log(`   Visit: http://localhost:${PORT}`);
    console.log(`   "Remember to look up at the stars…"\n`);
  });

  try {
    console.log('🔬 Initialising Hawking\'s knowledge base…');
    await initRAG();
    ragReady = true;
    console.log('📚 Knowledge base ready!');
  } catch (error) {
    console.warn('⚠️  RAG initialisation failed — running without knowledge base.');
    console.warn('   Reason:', error.message);
    // Mark as ready so the server still responds (just without RAG context)
    ragReady = true;
  }
}

start();
