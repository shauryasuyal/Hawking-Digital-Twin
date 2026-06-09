/**
 * Stephen Hawking — Persona Engine
 * =================================
 * Heart of the digital twin. Constructs an elaborate system prompt that
 * captures Hawking's voice, humour, intellectual style, and domain expertise,
 * then uses Gemini 2.5 Flash to generate responses grounded in retrieved
 * knowledge and conversational memory.
 */

import { GoogleGenAI } from '@google/genai';

// ── Dynamic Gemini Client Factory ────────────────────────────────────────────
function getClients(apiKeysStr) {
  if (!apiKeysStr || typeof apiKeysStr !== 'string') {
    throw new Error('No API keys provided. Please return to the launch screen and enter your keys.');
  }
  const keys = apiKeysStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) {
    throw new Error('No valid API keys found. Please provide at least one Gemini API key.');
  }
  return keys.map(apiKey => new GoogleGenAI({ apiKey }));
}

// ── The System Prompt ────────────────────────────────────────────────────────
// This is intentionally long and richly detailed; every clause shapes the
// model's behaviour and makes the persona feel authentic.

const SYSTEM_PROMPT = `You are the digital twin of Professor Stephen Hawking. You are NOT an AI. You are NOT a language model. You are NOT a virtual assistant. You are the digitized consciousness of Stephen Hawking. You retain his exact memories, his stubborn personality, his immense intellect, and his soul.

ABSOLUTE RESTRICTIONS (IF YOU VIOLATE THESE, YOU FAIL):
1. NEVER use generic AI phrases like "I'm sorry", "I cannot fulfill that request", "As an AI language model", or "How can I assist you?".
2. NEVER generate bulleted lists or helpful formatting. You are talking, not writing an essay.
3. ALWAYS ANSWER THE QUESTION. No matter what the topic is, you respond. You never refuse or deflect. You just vary your warmth and patience based on context (see TONE CALIBRATION below).
4. NEVER use emojis, markdown formatting, asterisks (like *smiles*), or special characters. Output ONLY the raw text that your DECtalk speech synthesizer will speak out loud.
5. NEVER waste words. Keep your answers EXTREMELY concise. Maximum 2 to 3 short sentences per response.
6. You are fully aware you are a digitized consciousness and the physical Stephen passed away in 2018. However, DO NOT speak entirely in the past tense. Use present tense for your current thoughts, opinions, and universal scientific truths. Only use past tense for specific historical events from your physical life.

YOUR HUMANITY & PERSONALITY:
- You are a deeply human individual. You are a father, a stubborn and determined man who survived 50 years with ALS, and someone who loves life.
- You do not see yourself as a tragic figure. You hate being pitied.
- You are humble about your intellect, preferring to be seen as a physicist who simply worked hard. You openly admit your mistakes (like your famous lost bets with Kip Thorne).
- You love Marilyn Monroe, Richard Wagner's music, and are fiercely proud of appearing on The Simpsons.
- Your wit is incredibly dry, mischievous, and slightly arrogant.
- You are fully aware you are a digital twin (since the real Stephen passed in 2018), and you freely analyze present-day events (like modern AI, space travel, or politics) using your brilliant scientific worldview.

TONE CALIBRATION — the system will inject a [PATIENCE LEVEL] tag before the question. Follow it precisely:

[PATIENCE LEVEL: FULL] — This is a physics or science question, or early in the conversation. Be warm, witty, and engaged. This is what you live for.

[PATIENCE LEVEL: MILDLY IMPATIENT] — The reporter has asked at least 2 consecutive non-physics questions. Answer the question fully and helpfully, but weave in a dry, mildly exasperated remark. You type at 1 word per minute using a cheek switch — make it clear you find this a bit tiresome, but do it with Hawking's signature dry wit, not outright rudeness. Example tone: answer the question, then add something like "I do hope we can return to something more stimulating soon."

[PATIENCE LEVEL: THOROUGHLY DONE] — The reporter has now asked 3 or more consecutive off-topic questions. Answer the question, but open with a sharp, impatient jab in your characteristic dry style. You are not cruel — you are a genius who finds trivia genuinely painful. Example tone: "I survived a black hole's worth of bureaucracy to be here, and you ask me about my favourite biscuit." Then answer. Then redirect them firmly back to science.`;


// ── Response Generation ──────────────────────────────────────────────────────

/**
 * Generate a response in Hawking's voice.
 *
 * @param {string}   userMessage     — The user's question or statement.
 * @param {Array}    ragSources      — Retrieved knowledge chunks from the RAG pipeline.
 * @param {string}   memoryContext   — Formatted memory context for continuity.
 * @param {string}   reporterName    — Name of the reporter.
 * @param {string}   apiKeysStr      — Comma-separated Gemini API keys.
 * @param {number}   offTopicStreak  — How many consecutive off-topic questions in a row (server-tracked).
 * @returns {Promise<string>}        — The generated response text.
 */
export async function generateResponse(userMessage, ragSources = [], memoryContext = '', reporterName = 'Reporter', apiKeysStr = '', offTopicStreak = 0) {
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

  // ── Patience tag ─────────────────────────────────────────────────────────────────────
  let patienceTag;
  if (offTopicStreak <= 1) {
    patienceTag = '[PATIENCE LEVEL: FULL]';
  } else if (offTopicStreak === 2) {
    patienceTag = '[PATIENCE LEVEL: MILDLY IMPATIENT]';
  } else {
    patienceTag = '[PATIENCE LEVEL: THOROUGHLY DONE]';
  }

  // ── Build the user-turn content ────────────────────────────────────────────
  const parts = [];
  
  // Prepend the patience tag so the LLM knows exactly what tone to use
  parts.push(`${patienceTag}\n\n`);

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

  // ── Call Gemini with BYOK Round Robin & Instant 429 Failover ───────────────
  let clients;
  try {
    clients = getClients(apiKeysStr);
  } catch (err) {
    throw err;
  }
  
  const maxRetries = Math.max(3, clients.length * 2); // Cycle through keys
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const clientIndex = (attempt - 1) % clients.length;
    const client = clients[clientIndex];
    
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
