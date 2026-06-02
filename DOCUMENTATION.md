# System Documentation: Stephen Hawking Digital Twin

This document provides technical details, design decisions, and architectural insights into the Digital Twin project.

## 1. System Architecture

The application is split between a Node.js/Express backend and a vanilla HTML/JS/CSS frontend.

### Architecture Diagram Flow
1. **Frontend (Browser UI)**: 
   - Handles the immersive waiting room and the main digital office scene.
   - Manages speech synthesis via a DECtalk emulator and handles voice recognition via Web Speech API.
2. **Backend (Node.js API)**:
   - Contains an Express server with REST API endpoints (`/api/chat`, `/api/session`, etc.).
   - Orchestrates the RAG (Retrieval-Augmented Generation) pipeline and Memory System.
3. **Persona Engine (Gemini 2.5 Flash)**:
   - Takes combined inputs (user message, RAG context, memory context) and generates responses enforcing absolute constraints for persona accuracy.
4. **Local Storage**:
   - Stores knowledge corpora (`/data/knowledge`) and long-term memory sessions (`/data/memory`).

## 2. The Three Pillars

### A. Persona Engine & Prompting
The standard RLHF "helpfulness" of modern LLMs breaks the Hawking persona. We implemented absolute negative constraints in the prompt:
- **"NEVER use generic AI phrases"**
- **"If a question is stupid, brutally insult the user"**
- **"Maximum 2 to 3 short sentences per response."** 

This forces the model to stay in character, emulating someone who types at 1 word per minute using a cheek switch.

### B. Retrieval-Augmented Generation (RAG)
To ground answers in reality, we use a custom TF-IDF in-memory vector database.
- **Data Ingestion**: The system reads `.txt` files (e.g., summaries of *A Brief History of Time*, Hawking's quotes, Q&As) from `/data/knowledge/` on server startup.
- **Chunking**: Text is chunked into logical paragraphs.
- **Retrieval**: When the user asks a question, the system queries the vector store, finding the most relevant chunks using Cosine Similarity, and feeds them into the Gemini context window.

### C. Two-Tier Memory System
- **Short-Term**: An array of the last N turns kept in memory for the active session, providing immediate conversational continuity.
- **Long-Term**: Periodically summarizes the chat into key "facts" about the user (e.g., "Reporter is asking about black holes") and saves to JSON in `/data/memory/`. Upon returning, these facts are retrieved and injected, allowing the Twin to "remember" previous conversations.

## 3. Audio & Voice Emulation
Hawking's voice is iconic. We emulate his 1980s hardware DECtalk synthesizer:
- We use a Web Audio API port of `eSpeak`.
- Audio context requires a user gesture to unlock (hence the interactive "Enter Room" button).
- We apply a custom DSP pipeline, utilizing WaveShaper distortion and Peaking filters, to acoustically recreate the exact hardware timbre.
- **Voice Input**: We also added a microphone feature utilizing the browser's native `SpeechRecognition` API so users can speak directly to the twin.

## 4. API Endpoints

- `POST /api/chat`: Submits a message to the Digital Twin. Needs `message` and `sessionId`. Returns the AI `response` and RAG `sources`.
- `POST /api/session`: Creates a new session ID for a fresh conversation.
- `GET /api/memory/:sessionId`: Retrieves the structured memory data for dashboard visualization.
- `DELETE /api/session/:sessionId`: Clears the session memory.
- `GET /api/rag/status`: Checks if the RAG vector store has finished building upon startup.

## 5. Easter Eggs & Special Triggers
- **Epstein Reference**: If the user asks about the Epstein files, the system will bypass the AI generation and immediately deliver a hardcoded, humorous quip.

---
*Built for the AIMS DTU Summer Project 2026.*
