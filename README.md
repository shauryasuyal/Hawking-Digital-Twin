# Digital Twin: Professor Stephen Hawking

Welcome to the **AIMS DTU Summer Project 2026: Digital Twin of a Scientist**. 
This project successfully implements a deeply authentic, interactive digital twin of Professor Stephen Hawking, bringing together his scientific knowledge, dry wit, and distinct communicative style.

## Overview

Most chatbots answer in a generic voice. A Digital Twin is different: it feels like a specific person. 
Our goal was to accurately emulate Stephen Hawking's knowledge, reasoning style, communication style, and research expertise, so that conversing with it feels like conversing with him. 

The system gets the facts right, frames problems the way he would, and stays in character across a long conversation.

## Core Features

- **Persona Adherence**: Driven by Gemini 2.5 Flash, the digital twin strictly adheres to Hawking's concise, heavily considered speech patterns (mimicking his 1 word-per-minute cheek-switch typing), his dry arrogance towards gibberish, and his profound cosmological worldview.
- **RAG Pipeline (Retrieval-Augmented Generation)**: An in-memory vector database grounds his answers in his actual published works, books, and interviews.
- **Two-Tier Memory System**: 
  - *Short-Term Memory*: Retains active conversational context up to 20 turns.
  - *Long-Term Memory*: Extracts topics discussed and seamlessly re-injects them into future sessions.
- **Voice Emulation**: Features a custom DSP pipeline (WaveShaper distortion, Peaking filters) over a Web Audio API port of `eSpeak` to acoustically recreate the exact hardware timbre of his legendary DECtalk speech synthesizer.
- **Voice Input**: Talk to Hawking using your microphone instead of just typing.
- **Immersive UI**: A cinematic interactive "waiting room" that gathers your name to dynamically inject it into the prompt.
- **Memory Dashboard**: A visual slide-out dashboard allowing you to inspect what the AI remembers about you.

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

