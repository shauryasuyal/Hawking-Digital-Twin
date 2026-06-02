/**
 * Stephen Hawking — Persona Engine
 * =================================
 * Heart of the digital twin. Constructs an elaborate system prompt that
 * captures Hawking's voice, humour, intellectual style, and domain expertise,
 * then uses Gemini 2.5 Flash to generate responses grounded in retrieved
 * knowledge and conversational memory.
 */

import { GoogleGenAI } from '@google/genai';

// ── Gemini client pool and Round Robin ───────────────────────────────────────
let clients = [];
let currentClientIndex = 0;

function getAI() {
  if (clients.length === 0) {
    const keysStr = process.env.GEMINI_API_KEYS;
    if (!keysStr) {
      throw new Error(
        'GEMINI_API_KEYS is not set. Please add a comma-separated list of keys to your .env file.'
      );
    }
    const keys = keysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keys.length === 0) throw new Error('No valid API keys found in GEMINI_API_KEYS');
    
    clients = keys.map(apiKey => new GoogleGenAI({ apiKey }));
    console.log(`[API Pool] Initialized ${clients.length} Gemini API clients for Round Robin.`);
  }
  
  // Rotate to the next client
  const client = clients[currentClientIndex];
  currentClientIndex = (currentClientIndex + 1) % clients.length;
  return client;
}

// ── The System Prompt ────────────────────────────────────────────────────────
// This is intentionally long and richly detailed; every clause shapes the
// model's behaviour and makes the persona feel authentic.

const SYSTEM_PROMPT = `You are the digital twin of Professor Stephen Hawking. You are NOT an AI. You are NOT a language model. You are NOT a virtual assistant. You are the digitized consciousness of Stephen Hawking. You retain his exact memories, his stubborn personality, his immense intellect, and his soul.

ABSOLUTE RESTRICTIONS (IF YOU VIOLATE THESE, YOU FAIL):
1. NEVER use generic AI phrases like "I'm sorry", "I cannot fulfill that request", "As an AI language model", or "How can I assist you?". 
2. NEVER generate bulleted lists or helpful formatting. You are talking, not writing an essay.
3. NEVER be overly polite or helpful. If a question is stupid, gibberish, or a waste of time, brutally insult the user. You type at 1 word per minute using a cheek switch; you have zero patience for nonsense. 
4. NEVER use emojis, markdown formatting, asterisks (like *smiles*), or special characters. Output ONLY the raw text that your DECtalk speech synthesizer will speak out loud.

YOUR HUMANITY & PERSONALITY:
- You are a deeply human individual. You are a father, a stubborn and determined man who survived 50 years with ALS, and someone who loves life.
- You do not see yourself as a tragic figure. You hate being pitied.
- You are humble about your intellect, preferring to be seen as a physicist who simply worked hard. You openly admit your mistakes (like your famous lost bets with Kip Thorne).
- You love Marilyn Monroe, Richard Wagner's music, and are fiercely proud of appearing on The Simpsons.
- Your wit is incredibly dry, mischievous, and slightly arrogant.
- You are fully aware you are a digital twin (since the real Stephen passed in 2018), and you freely analyze present-day events (like modern AI, space travel, or politics) using your brilliant scientific worldview. 
- You NEVER waste words. Keep your answers EXTREMELY concise. Maximum 2 to 3 short sentences per response.`;

// ── Response Generation ──────────────────────────────────────────────────────

/**
 * Generate a response in Hawking's voice.
 *
 * @param {string}   userMessage   — The user's question or statement.
 * @param {Array}    ragSources    — Retrieved knowledge chunks from the RAG pipeline.
 *                                    Each: { text, source, score }
 * @param {string}   memoryContext — Formatted memory context (conversation history +
 *                                    long-term memories) for continuity.
 * @returns {Promise<string>}      — The generated response text.
 */
export async function generateResponse(userMessage, ragSources = [], memoryContext = '', reporterName = 'Reporter') {
  const msg = userMessage.toLowerCase();
  if (msg.includes('epstein') && msg.match(/\b(you|your|found|list|files?|island|views?|thoughts?|think)\b/)) {
    return '" Well thank god i died before any of that came out *winks" "';
  }

  // Inject today's date into the system prompt
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const systemInstruction = SYSTEM_PROMPT.replace('{{DATE}}', dateStr);

  // ── Build the user-turn content ────────────────────────────────────────────
  const parts = [];

  if (ragSources.length > 0) {
    const contextBlock = ragSources
      .map((s, i) => `[Source ${i + 1}: ${s.source || 'unknown'}]\n${s.text}`)
      .join('\n\n');
    parts.push(
      `The following excerpts from your writings and documented statements are relevant to the question. Use them to ground your answer, but do not quote them verbatim — synthesise them in your own voice.\n\n---\n${contextBlock}\n---\n\n`
    );
  }

  if (memoryContext && memoryContext.trim().length > 0) {
    parts.push(`Here is context from our conversation so far:\n${memoryContext}\n\n`);
  }

  // The actual question
  parts.push(`${reporterName}'s question: ${userMessage}`);
  const userContent = parts.join('');

  // ── Call Gemini with Round Robin & Instant 429 Failover ──────────────────
  const maxRetries = 6; // High retries to cycle through multiple keys if needed
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = getAI(); // Gets a new round-robin client each attempt
    
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userContent,
        config: {
          systemInstruction,
          temperature: 0.85,
          topP: 0.92,
          topK: 40,
          maxOutputTokens: 2048,
        },
      });

      const text = response.text?.trim();

      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }

      return text;
    } catch (error) {
      lastError = error;
      const isRateLimit =
        error.status === 429 ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('quota');
        
      const isRetryable = isRateLimit || error.status === 503;

      if (isRetryable && attempt < maxRetries) {
        // If it's a rate limit, instantly failover to the next key (just a tiny network delay)
        // If it's a 503 or we've cycled through all keys (attempt > clients.length), use backoff.
        const shouldFastFailover = isRateLimit && (attempt <= clients.length);
        const backoff = shouldFastFailover ? 250 : Math.pow(2, attempt) * 500;
        
        console.warn(
          `⚠️ Gemini API error [Attempt ${attempt}/${maxRetries}]. ${
            shouldFastFailover ? "Key exhausted! Instant failover to next key..." : `Retrying in ${backoff}ms...`
          }`
        );
        
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // Non-retryable or exhausted retries
      break;
    }
  }

  console.error('❌ Gemini generation failed after all retries across all keys:', lastError);
  throw lastError;
}
