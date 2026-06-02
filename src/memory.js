/**
 * Memory System
 * =============
 * Two-tier memory architecture:
 *
 *   • Short-term — In-memory Map keyed by sessionId. Stores the last N
 *     conversation turns for immediate context.
 *
 *   • Long-term  — Persisted to disk as JSON files in data/memory/.
 *     After each turn, key topics are extracted and stored with timestamps.
 *     On retrieval the most relevant long-term entries are surfaced alongside
 *     the short-term history.
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────
const __filename   = fileURLToPath(import.meta.url);
const __dirname    = dirname(__filename);
const MEMORY_DIR   = join(__dirname, '..', 'data', 'memory');

// ── Config ───────────────────────────────────────────────────────────────────
const MAX_SHORT_TERM = 20;       // conversation turns to keep in RAM
const MAX_LONG_TERM_DISPLAY = 10; // long-term entries shown on dashboard

// ── In-memory stores ─────────────────────────────────────────────────────────
// sessionId → { messages: Array<{ role, content, timestamp }> }
const sessions = new Map();

// ── Topic extraction keywords ────────────────────────────────────────────────
// Simple keyword-based topic extraction. Intentionally lightweight — no NLP
// dependency required.

const TOPIC_KEYWORDS = {
  'black holes':        ['black hole', 'event horizon', 'singularity', 'schwarzschild'],
  'hawking radiation':  ['hawking radiation', 'black hole evaporation', 'virtual particles'],
  'cosmology':          ['big bang', 'cosmic', 'universe', 'cosmolog', 'expansion', 'inflation'],
  'quantum mechanics':  ['quantum', 'wave function', 'superposition', 'entanglement', 'uncertainty'],
  'general relativity': ['relativity', 'spacetime', 'einstein', 'gravity', 'gravitational'],
  'time':               ['time travel', 'arrow of time', 'chronology', 'time dilation'],
  'information paradox':['information paradox', 'information loss', 'unitarity'],
  'artificial intelligence': ['artificial intelligence', ' ai ', 'machine learning', 'robot'],
  'extraterrestrial life':   ['alien', 'extraterrestrial', 'drake equation', 'fermi paradox'],
  'philosophy':         ['god', 'meaning of life', 'free will', 'consciousness', 'philosophy'],
  'books':              ['brief history of time', 'universe in a nutshell', 'grand design', 'brief answers'],
  'disability':         ['disability', 'als', 'motor neuron', 'wheelchair', 'speech synthesiser'],
  'space exploration':  ['mars', 'space travel', 'colonisation', 'colonization', 'starshot', 'nasa'],
  'mathematics':        ['equation', 'theorem', 'calculus', 'topology', 'geometry'],
  'string theory':      ['string theory', 'm-theory', 'extra dimensions', 'superstring'],
  'entropy':            ['entropy', 'thermodynamics', 'heat death', 'second law'],
};

/**
 * Extract topics from a text by simple keyword matching.
 * Returns an array of matched topic labels.
 */
function extractTopics(text) {
  const lower = text.toLowerCase();
  const matched = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.push(topic);
        break; // one match per topic is enough
      }
    }
  }

  return matched;
}

/**
 * Create a brief summary of the exchange (first ~120 chars of the response).
 */
function summarise(responseText) {
  const clean = responseText.replace(/\n+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 117) + '…' : clean;
}

// ── Long-term memory persistence ─────────────────────────────────────────────

/**
 * Path to the long-term memory JSON file for a given session.
 */
function longTermPath(sessionId) {
  return join(MEMORY_DIR, `${sessionId}.json`);
}

/**
 * Load long-term memories from disk. Returns [] if the file doesn't exist.
 */
async function loadLongTermMemory(sessionId) {
  const filePath = longTermPath(sessionId);
  if (!existsSync(filePath)) return [];

  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Persist long-term memories to disk.
 */
async function saveLongTermMemory(sessionId, entries) {
  // Ensure directory exists
  if (!existsSync(MEMORY_DIR)) {
    await mkdir(MEMORY_DIR, { recursive: true });
  }
  await writeFile(longTermPath(sessionId), JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Append a new long-term memory entry derived from the latest exchange.
 */
async function appendLongTermMemory(sessionId, userMessage, assistantResponse) {
  const topics = extractTopics(`${userMessage} ${assistantResponse}`);

  // Only store if we identified at least one topic
  if (topics.length === 0) return;

  const entry = {
    topics,
    summary: summarise(assistantResponse),
    userQuery: userMessage.slice(0, 200),
    timestamp: new Date().toISOString(),
  };

  const existing = await loadLongTermMemory(sessionId);
  existing.push(entry);
  await saveLongTermMemory(sessionId, existing);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise (or reset) a session's short-term memory.
 */
export function createSession(sessionId) {
  sessions.set(sessionId, { messages: [] });
}

/**
 * Retrieve a formatted memory-context string suitable for injection into the
 * persona prompt.  Combines recent conversation turns with relevant long-term
 * memories.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export function getMemory(sessionId) {
  const parts = [];

  // ── Short-term: recent conversation ────────────────────────────────────────
  const session = sessions.get(sessionId);
  if (session && session.messages.length > 0) {
    const recent = session.messages.slice(-MAX_SHORT_TERM);
    const formatted = recent
      .map(
        (m) =>
          `${m.role === 'user' ? 'User' : 'Hawking'}: ${m.content}`
      )
      .join('\n');
    parts.push(`Recent conversation:\n${formatted}`);
  }

  // ── Long-term: load synchronously from cache if available ──────────────────
  // Note: we read the file synchronously here for simplicity.  In a production
  // system you'd want an async path or a cache layer.
  const ltPath = longTermPath(sessionId);
  if (existsSync(ltPath)) {
    try {
      const raw = readFileSync(ltPath, 'utf-8');
      const entries = JSON.parse(raw);

      if (entries.length > 0) {
        const relevant = entries.slice(-MAX_LONG_TERM_DISPLAY);
        const formatted = relevant
          .map(
            (e) =>
              `[${e.topics.join(', ')}] ${e.summary}`
          )
          .join('\n');
        parts.push(`Previously discussed topics:\n${formatted}`);
      }
    } catch {
      // Silently ignore read errors
    }
  }

  return parts.join('\n\n');
}

/**
 * Add an exchange (user message + assistant response) to both short-term
 * and long-term memory.
 *
 * @param {string} sessionId
 * @param {string} userMessage
 * @param {string} assistantResponse
 */
export function addToMemory(sessionId, userMessage, assistantResponse) {
  // Ensure session exists
  if (!sessions.has(sessionId)) {
    createSession(sessionId);
  }

  const session = sessions.get(sessionId);
  const now = new Date().toISOString();

  session.messages.push(
    { role: 'user',      content: userMessage,       timestamp: now },
    { role: 'assistant', content: assistantResponse,  timestamp: now }
  );

  // Trim to the last MAX_SHORT_TERM messages
  if (session.messages.length > MAX_SHORT_TERM) {
    session.messages = session.messages.slice(-MAX_SHORT_TERM);
  }

  // Persist long-term asynchronously (fire-and-forget; errors are logged)
  appendLongTermMemory(sessionId, userMessage, assistantResponse).catch(
    (err) => console.error('Long-term memory write error:', err)
  );
}

/**
 * Return structured dashboard data for a session's memory state.
 *
 * @param {string} sessionId
 * @returns {{ conversationHistory, longTermMemories, sessionCount, topicsDiscussed }}
 */
export function getMemoryDashboard(sessionId) {
  // ── Conversation history ───────────────────────────────────────────────────
  const session = sessions.get(sessionId);
  const conversationHistory = session ? [...session.messages] : [];

  // ── Long-term memories ─────────────────────────────────────────────────────
  let longTermMemories = [];
  const ltPath = longTermPath(sessionId);

  if (existsSync(ltPath)) {
    try {
      const raw = readFileSync(ltPath, 'utf-8');
      longTermMemories = JSON.parse(raw).map((e) => ({
        topic: e.topics.join(', '),
        summary: e.summary,
        timestamp: e.timestamp,
      }));
    } catch {
      // ignore
    }
  }

  // ── Session count (number of persisted memory files) ───────────────────────
  let sessionCount = 0;
  if (existsSync(MEMORY_DIR)) {
    try {
      const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith('.json'));
      sessionCount = files.length;
    } catch {
      // ignore
    }
  }

  // ── Topics discussed (aggregate from long-term) ────────────────────────────
  const topicSet = new Set();
  longTermMemories.forEach((m) => {
    m.topic.split(', ').forEach((t) => topicSet.add(t));
  });
  const topicsDiscussed = [...topicSet];

  return {
    conversationHistory,
    longTermMemories,
    sessionCount,
    topicsDiscussed,
  };
}
