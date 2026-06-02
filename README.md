# Digital Twin: Professor Stephen Hawking

This project was built for the **AIMS DTU Summer Project 2026: Digital Twin of a Scientist**. It successfully implements a deeply authentic, interactive digital twin of Professor Stephen Hawking, bringing together his scientific knowledge, dry wit, and distinct communicative style.

## Core Features
- **Persona Adherence**: Driven by Gemini 2.5 Flash, the digital twin strictly adheres to Hawking's concise, heavily considered speech patterns (mimicking cheek-switch typing), his dry arrogance towards gibberish, and his profound cosmological worldview. 
- **Retrieval-Augmented Generation (RAG)**: An in-memory vector database using TF-IDF and cosine similarity grounds his answers in his actual published works, books, and interviews.
- **Two-Tier Memory System**: 
  - *Short-term memory* (active RAM) retains conversational context up to 20 turns.
  - *Long-term memory* (JSON disk persistence) extracts topics discussed and seamlessly re-injects them into future sessions.
- **Bonus: Voice & Hardware Emulation**: Features a Web Audio API port of `eSpeak` (`meSpeak.js`) running through a custom DSP pipeline (WaveShaper distortion, Peaking filters) to acoustically recreate the exact hardware timbre of his legendary 1980s DECtalk speech synthesizer.
- **Bonus: Immersive Onboarding**: A complete cinematic, interactive "waiting room" UI that gathers the user's name to dynamically inject it into the prompt.
- **Bonus: Memory Dashboard**: A visual slide-out dashboard allowing the user to inspect what the AI remembers about them.

## Architecture

The application follows a Node.js/Express backend and vanilla JS/HTML/CSS frontend.

```mermaid
graph TD
    subgraph Frontend [Browser (UI)]
        UI[Immersive UI / Office Scene]
        Speech[DECtalk Voice Engine]
        UI <--> |HTTP/JSON| Backend
        UI --> Speech
    end

    subgraph Backend [Node.js Server]
        Router(Express API)
        MemorySys[Memory System]
        Persona[Persona Engine]
        RAG[RAG Pipeline]
        
        Router <--> MemorySys
        Router <--> Persona
        Persona <--> RAG
        Persona <--> |API Calls| Gemini[Gemini 2.5 Flash]
    end

    subgraph Storage [Local File System]
        RAGDocs[(Corpus Data)]
        LTMem[(Long-Term Memory)]
        RAGDocs --> RAG
        MemorySys <--> LTMem
    end
```

## Running Locally

1. **Install Dependencies**: `npm install`
2. **Environment Variables**: Create a `.env` file with `GEMINI_API_KEYS=your_key_1,your_key_2` (supports comma-separated keys for automatic round-robin rate-limit handling).
3. **Start the Server**: `npm start`
4. **Access the Twin**: Open `http://localhost:3000` in your web browser.

## Design Decisions
- **Strict Anti-AI Prompting**: The standard RLHF "helpfulness" of modern LLMs breaks the Hawking persona. We implemented absolute negative constraints in the prompt ("NEVER use generic AI phrases", "If a question is stupid, brutally insult the user") to force the model to stay in character.
- **Audio Constraints**: Browsers require a user gesture to unlock the `AudioContext`. We tied the context-resume logic into the immersive onboarding "Enter Room" button so that the voice engine is primed and ready immediately upon entering the digital office.
- **Timeline Awareness**: Rather than freezing the twin in time, the prompt explicitly instructs the model to use Hawking's underlying philosophies and knowledge base to formulate original opinions on post-2018 topics (such as modern AI advancements).
