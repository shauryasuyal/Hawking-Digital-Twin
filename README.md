# Digital Twin: Professor Stephen Hawking

Welcome to the **AIMS DTU Summer Project 2026: Digital Twin of a Scientist**. 
This project successfully implements a deeply authentic, interactive digital twin of Professor Stephen Hawking, bringing together his scientific knowledge, dry wit, and distinct communicative style.

## Overview

Most chatbots answer in a generic voice. A Digital Twin is different: it feels like a specific person. 
Our goal was to accurately emulate Stephen Hawking's knowledge, reasoning style, communication style, and research expertise, so that conversing with it feels like conversing with him. 

The system gets the facts right, frames problems the way he would, and stays in character across a long conversation.

## Core Features

- **Persona Adherence**: Driven by Gemini (with user-provided API keys), the digital twin strictly adheres to Hawking's concise, heavily considered speech patterns, his dry arrogance towards gibberish, and his profound cosmological worldview. It includes a dynamic **Off-Topic Streak Tracker** that escalates his annoyance if you repeatedly ask non-physics questions.
- **RAG Pipeline (Retrieval-Augmented Generation)**: Uses a local AI embedding model (`Xenova/all-MiniLM-L6-v2`) to perform semantic search over a massive offline knowledge base. The system includes full context on every book he authored and a comprehensive breakdown of all his major research papers (1965–2018).
- **ChatGPT-Style Multi-Session Memory**: 
  - *Browser Persistence*: Sessions are saved to `localStorage`, surviving browser refreshes without requiring user accounts.
  - *Sidebar UI*: A slide-out panel allows you to view past chat sessions, seamlessly switch between them, or start a new conversation.
  - *Long-Term Memory*: Summarizes the chat into key topics and seamlessly re-injects them into the backend context window.
- **Voice Emulation**: Features a custom DSP pipeline (WaveShaper distortion, Peaking filters) over a Web Audio API port of `eSpeak` to acoustically recreate the exact hardware timbre of his legendary DECtalk speech synthesizer.
- **Voice Input**: Talk to Hawking using your microphone instead of just typing.
- **Immersive UI**: A cinematic interactive "waiting room" that gathers your name to dynamically inject it into the prompt.
- **Settings Dashboard**: Allows on-the-fly updating of Gemini API keys, clearing of conversation history, and voice/fluid-mode toggling.

## Running Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEYS=your_key_1,your_key_2
   ```
   *(Supports comma-separated keys for automatic round-robin rate-limit handling)*
3. **Start the Server**
   ```bash
   npm start
   ```
4. **Access the Twin**
   Open `http://localhost:3000` in your web browser.

## Documentation

For an in-depth look at the architecture, design decisions, and system capabilities, please refer to the [DOCUMENTATION.md](./DOCUMENTATION.md).

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Web Audio API, Web Speech API.
- **Backend**: Node.js, Express.js.
- **AI / NLP**: Google Gemini 2.5 Flash, custom TF-IDF Vector Store.

## Links
Screenshots - https://drive.google.com/drive/folders/1Y2VZlVW94gs0-Rv-YZavSP-dutSm4K76?usp=sharing

Video Demo - https://drive.google.com/file/d/1VDr8dQMIlFCUViRfuAa55IfgNSFzBfWe/view?usp=sharing

