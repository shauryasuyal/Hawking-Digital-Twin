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

## Running Locally

1. **Install Dependencies**: `npm install`
2. **Environment Variables**: Create a `.env` file with `GEMINI_API_KEYS=your_key_1,your_key_2` (supports comma-separated keys for automatic round-robin rate-limit handling).
3. **Start the Server**: `npm start`
4. **Access the Twin**: Open `http://localhost:3000` in your web browser.


