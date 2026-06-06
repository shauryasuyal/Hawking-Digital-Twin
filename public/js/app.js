document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loadingScreen = document.getElementById('loading-screen');
  const appContainer = document.getElementById('app');
  const screenContent = document.getElementById('screen-content');
  const thinkingIndicator = document.getElementById('thinking-indicator');
  const questionInput = document.getElementById('question-input');
  const sendBtn = document.getElementById('send-btn');
  const charCount = document.getElementById('char-count');
  const notebookDate = document.getElementById('notebook-date');
  const memoryPanel = document.getElementById('memory-panel');
  const btnMemory = document.getElementById('btn-memory');
  const btnCloseMemory = document.getElementById('btn-close-memory');
  const btnNewSession = document.getElementById('btn-new-session');
  const particlesContainer = document.getElementById('particles');
  const toggleVoice = document.getElementById('toggle-voice');
  const toggleFluidMode = document.getElementById('toggle-fluid-mode');
  const quickMuteBtn = document.getElementById('quick-mute-btn');
  const iconVolUp = document.getElementById('icon-vol-up');
  const iconVolMute = document.getElementById('icon-vol-mute');

  // meSpeak DECtalk Emulator Setup
  let mespeakReady = false;
  if (window.meSpeak) {
    Promise.all([
      fetch('/js/mespeak/mespeak_config.json').then(r => r.json()),
      fetch('/js/mespeak/voices/en/en-us.json').then(r => r.json())
    ]).then(([config, voice]) => {
      meSpeak.loadConfig(config);
      meSpeak.loadVoice(voice);
      mespeakReady = true;
      console.log("meSpeak DECtalk engine loaded and ready.");
    }).catch(e => {
      console.error("Failed to load meSpeak engine assets:", e);
    });
  }

  // Helper to paginate text so we don't break words
  function paginateText(text, limit = 180) {
    const words = text.split(' ');
    const pages = [];
    let currentPage = '';
    
    for (const word of words) {
      if (currentPage.length + word.length + 1 > limit) {
        pages.push(currentPage.trim());
        currentPage = word + ' ';
      } else {
        currentPage += word + ' ';
      }
    }
    if (currentPage.trim().length > 0) {
      pages.push(currentPage.trim());
    }
    return pages;
  }

  // ── Persistent identity ───────────────────────────────────────────────────
  // Each browser gets a stable userId so the same visitor always resumes their session.
  function getOrCreateUserId() {
    let uid = localStorage.getItem('hawkingUserId');
    if (!uid) {
      uid = 'user_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      localStorage.setItem('hawkingUserId', uid);
    }
    return uid;
  }
  const userId = getOrCreateUserId();

  // ── Conversation history ────────────────────────────────────────────────────
  // Stored in localStorage so it survives refreshes.
  const HISTORY_KEY = `hawkingHistory_${userId}`;
  const MAX_STORED_TURNS = 40; // keep last 40 exchanges in storage

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  }

  function saveHistory(turns) {
    // Trim to keep storage lean
    const trimmed = turns.slice(-MAX_STORED_TURNS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    conversationHistory = [];
  }

  // In-memory mirror of what's in localStorage
  let conversationHistory = loadHistory();

  // State
  let sessionId = null;
  let isTyping = false;
  let isWaiting = false;
  
  // Global AudioContext for hardware DSP emulation
  let hwAudioCtx = null;
  
  // AudioContext for procedural pencil scratch
  let pencilCtx = null;
  
  // Procedural pencil scratch synthesizer
  function playPencilScratch() {
    if (!pencilCtx) {
      pencilCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (pencilCtx.state === 'suspended') {
      pencilCtx.resume();
    }

    const duration = 0.08 + Math.random() * 0.04; // 80ms - 120ms
    const bufferSize = pencilCtx.sampleRate * duration;
    const buffer = pencilCtx.createBuffer(1, bufferSize, pencilCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.8; // White noise
    }

    const noise = pencilCtx.createBufferSource();
    noise.buffer = buffer;

    // Filter to isolate the high-mid "scratch" frequencies of graphite on paper
    const bandpass = pencilCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2500 + Math.random() * 1500; // Randomize stroke frequency
    bandpass.Q.value = 1.0;

    // Envelope for a sharp attack and quick decay (like a pencil stroke)
    const gain = pencilCtx.createGain();
    gain.gain.setValueAtTime(0, pencilCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, pencilCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, pencilCtx.currentTime + duration - 0.01);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(pencilCtx.destination);

    noise.start();
  }
  
  // Onboarding UI Elements
  const onboardingScreen = document.getElementById('onboarding-screen');
  const phase1 = document.getElementById('onboarding-phase-1');
  const phase2 = document.getElementById('onboarding-phase-2');
  const reporterNameInput = document.getElementById('reporter-name-input');
  const apiKeysInput = document.getElementById('api-keys-input');
  const btnNextPhase = document.getElementById('btn-next-phase');
  const btnEnterRoom = document.getElementById('btn-enter-room');
  const micBtn = document.getElementById('mic-btn');
  const onboardingLoadingBar = document.getElementById('onboarding-loading-bar');

  let reporterName = "Reporter";
  let userApiKeys = "";

  // Load saved keys
  const savedKeys = localStorage.getItem('hawkingApiKeys');
  if (savedKeys && apiKeysInput) {
    apiKeysInput.value = savedKeys;
  }

  const howToKeyBtn = document.getElementById('how-to-key-btn');
  const howToKeyModal = document.getElementById('how-to-key-modal');
  const closeHowToBtn = document.getElementById('close-how-to-btn');

  if (howToKeyBtn && howToKeyModal && closeHowToBtn) {
    howToKeyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      howToKeyModal.classList.remove('hidden');
    });
    closeHowToBtn.addEventListener('click', (e) => {
      e.preventDefault();
      howToKeyModal.classList.add('hidden');
    });
  }

  btnNextPhase.addEventListener('click', () => {
    if (reporterNameInput.value.trim() !== "") {
      reporterName = reporterNameInput.value.trim();
    }
    phase1.style.opacity = '0';
    setTimeout(() => {
      phase1.classList.add('hidden');
      phase2.classList.remove('hidden');
      phase2.style.opacity = '0';
      setTimeout(() => phase2.style.opacity = '1', 50);
    }, 500);
  });

  btnEnterRoom.addEventListener('click', () => {
    if (apiKeysInput && apiKeysInput.value.trim() !== "") {
      userApiKeys = apiKeysInput.value.trim();
      localStorage.setItem('hawkingApiKeys', userApiKeys);
    } else {
      alert("Please enter at least one Gemini API Key to enter the room.");
      return;
    }

    // Play door sound
    const audio = new Audio('https://actions.google.com/sounds/v1/doors/wood_door_open.ogg');
    audio.play().catch(e => console.log("Audio play blocked:", e));
    
    // Unlock WebAudio contexts
    if (window.meSpeak) meSpeak.speak('', { volume: 0 });
    if (!hwAudioCtx) hwAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (hwAudioCtx.state === 'suspended') hwAudioCtx.resume();
    
    onboardingScreen.classList.add('fade-out');
    
    setTimeout(() => {
      onboardingScreen.classList.add('hidden');
      appContainer.classList.remove('hidden');
      
      initParticles();
      fetchMemoryDashboard();
      
      // ── Restore previous conversation ────────────────────────────────────────
      const history = loadHistory();
      if (history.length > 0) {
        // Show the last Hawking response on the screen so it doesn't feel empty
        const lastHawking = [...history].reverse().find(t => t.role === 'hawking');
        if (lastHawking) {
          screenContent.innerHTML = '';
          const span = document.createElement('span');
          span.textContent = lastHawking.text;
          const cursor = document.createElement('span');
          cursor.className = 'cursor-blink';
          cursor.textContent = '_';
          screenContent.appendChild(span);
          screenContent.appendChild(cursor);
        }
        console.log(`[memory] Restored ${history.length} turns from localStorage`);
      } else {
        // Fresh visitor — play the greeting
        setTimeout(() => {
          questionInput.focus();
          speakAndTypePages(`Ah. So you are the reporter they sent to interview me, ${reporterName}?`);
        }, 500);
      }

      if (history.length > 0) {
        // Returning visitor — just focus the input, no greeting
        setTimeout(() => questionInput.focus(), 500);
      }
    }, 1500);
  });

  function pollRagStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/rag/status');
        const data = await res.json();
        
        if (data.progress) {
          const p = data.progress;
          const percentage = ((p.loaded / p.total) * 100).toFixed(0);
          if (onboardingLoadingBar) onboardingLoadingBar.style.width = `${percentage}%`;
        }
        
        if (data.ready) {
          clearInterval(interval);
          setTimeout(() => {
            if (onboardingLoadingBar) onboardingLoadingBar.style.width = '100%';
            btnEnterRoom.classList.remove('hidden');
          }, 500);
        }
      } catch (e) {
        console.error("Error polling RAG status:", e);
      }
    }, 1000);
  }

  function initSession() {
    isTyping = false;
    isWaiting = false;
    charCount.textContent = '0 / 2000';
    questionInput.value = '';
    
    // Create new backend session (server allocates a fresh in-memory slot)
    fetch('/api/session', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.sessionId) sessionId = data.sessionId;
      })
      .catch(e => console.error("Session creation failed", e));

    pollRagStatus();
  }
  
  // Set today's date in the notebook
  const today = new Date();
  notebookDate.textContent = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Initialize Session
  initSession();

  // Coordinated Typewriter and Speech effect
  async function speakAndTypePages(text) {
    if (isTyping) return;
    isTyping = true;
    
    // Cancel any old speech
    if (window.meSpeak) window.meSpeak.stop();
    
    const pages = paginateText(text, 140); // ~6 lines
    
    for (let pIndex = 0; pIndex < pages.length; pIndex++) {
      const page = pages[pIndex];
      
      // Clear the screen for this page
      screenContent.innerHTML = '';
      const currentSpan = document.createElement('span');
      const cursor = document.createElement('span');
      cursor.className = 'cursor-blink';
      cursor.textContent = '_';
      screenContent.appendChild(currentSpan);
      screenContent.appendChild(cursor);
      
      // 1. Start typing
      const typePromise = new Promise(resolve => {
        let i = 0;
        function typeChar() {
          if (i < page.length) {
            currentSpan.textContent += page.charAt(i);
            i++;
            screenContent.scrollTop = screenContent.scrollHeight;
            setTimeout(typeChar, 30);
          } else {
            resolve();
          }
        }
        typeChar();
      });
      
      // 2. Start speaking using meSpeak with Custom Hardware DSP Filter
      const speakPromise = new Promise(resolve => {
        if (!toggleVoice || !toggleVoice.checked || !window.meSpeak || !mespeakReady) {
          resolve();
          return;
        }
        
        // Generate the raw WAV ArrayBuffer
        const rawWav = meSpeak.speak(page, {
          pitch: 50,      // Middle ground pitch
          speed: 130,
          variant: 'm1',
          rawdata: 'arraybuffer' // Request raw bytes instead of direct playback
        });
        
        if (!rawWav || !hwAudioCtx) {
           resolve();
           return;
        }

        // Copy buffer to prevent detach issues in decodeAudioData
        const bufferCopy = rawWav.slice(0);

        hwAudioCtx.decodeAudioData(bufferCopy, (audioBuffer) => {
          const source = hwAudioCtx.createBufferSource();
          source.buffer = audioBuffer;
          
          // DSP 1: Hardware Resonance (Boxy Speaker sound)
          const peaking = hwAudioCtx.createBiquadFilter();
          peaking.type = 'peaking';
          peaking.frequency.value = 600; // Lower mid richness
          peaking.Q.value = 1.0;
          peaking.gain.value = 5; // Boost richness
          
          // DSP 2: Hardware Bass Boost (Warmth)
          const lowShelf = hwAudioCtx.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = 250;
          lowShelf.gain.value = 6; // Thicken without being too heavy
          
          // DSP 3: Subtle 80s DAC Distortion (Grit)
          const waveShaper = hwAudioCtx.createWaveShaper();
          function makeDistortionCurve(amount) {
            const k = amount;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            for (let i = 0; i < n_samples; ++i) {
              const x = (i * 2) / n_samples - 1;
              curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
            }
            return curve;
          }
          waveShaper.curve = makeDistortionCurve(8); // subtle grit
          waveShaper.oversample = '4x';
          
          // Connect the chain: Source -> Saturation -> Resonance -> Bass Boost -> Speakers
          source.connect(waveShaper);
          waveShaper.connect(peaking);
          peaking.connect(lowShelf);
          lowShelf.connect(hwAudioCtx.destination);
          
          source.onended = () => {
             resolve();
          };
          
          source.start();
        }, (err) => {
           console.error("DSP Decode Error:", err);
           resolve();
        });
      });
      
      // 3. Wait for BOTH typing and speaking to finish
      await Promise.all([typePromise, speakPromise]);
      
      // Pause slightly before clearing the screen for the next page
      if (pIndex < pages.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    isTyping = false;
  }

  // Send message
  async function sendMessage() {
    const text = questionInput.value.trim();
    if (!text || isTyping || isWaiting || !sessionId) return;
    
    // Unlock AudioContext immediately upon user gesture
    if (window.meSpeak && toggleVoice.checked) {
      meSpeak.speak('', { volume: 0 });
      if (!hwAudioCtx) {
        hwAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } else if (hwAudioCtx.state === 'suspended') {
        hwAudioCtx.resume();
      }
    }
    
    questionInput.value = '';
    updateCharCount();
    
    // UI states
    isWaiting = true;
    sendBtn.disabled = true;
    thinkingIndicator.classList.remove('hidden');
    screenContent.innerHTML = '<span class="cursor-blink">_</span>';
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, reporterName, apiKeys: userApiKeys })
      });
      
      const data = await res.json();
      
      thinkingIndicator.classList.add('hidden');
      
      if (res.ok) {
        // Save this exchange to localStorage for persistence
        conversationHistory.push({ role: 'reporter', text, ts: Date.now() });
        conversationHistory.push({ role: 'hawking', text: data.response, ts: Date.now() });
        saveHistory(conversationHistory);

        // Coordinated output: Wait for both typing and speaking to finish before moving on
        await speakAndTypePages(data.response);
        // Refresh memory dashboard after he finishes speaking
        fetchMemoryDashboard();
      } else {
        await speakAndTypePages("Error: " + (data.error || "System malfunction"));
      }
    } catch (err) {
      thinkingIndicator.classList.add('hidden');
      await speakAndTypePages("Connection error.");
      console.error(err);
    } finally {
      isWaiting = false;
      sendBtn.disabled = false;
    }
  }

  // Fetch and update Memory Dashboard
  async function fetchMemoryDashboard() {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/memory/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      
      // Update stats
      document.getElementById('stat-messages').textContent = data.conversationHistory?.length || 0;
      document.getElementById('stat-topics').textContent = data.topicsDiscussed?.length || 0;
      document.getElementById('stat-sessions').textContent = data.sessionCount || 1;
      
      // Update topics
      const topicsContainer = document.getElementById('memory-topics');
      topicsContainer.innerHTML = '';
      if (data.topicsDiscussed && data.topicsDiscussed.length > 0) {
        data.topicsDiscussed.forEach(topic => {
          const span = document.createElement('span');
          span.className = 'topic-tag';
          span.textContent = topic;
          topicsContainer.appendChild(span);
        });
      } else {
        topicsContainer.innerHTML = '<span class="topic-tag">No topics yet</span>';
      }
      
      // Update timeline
      const timelineContainer = document.getElementById('memory-timeline');
      timelineContainer.innerHTML = '';
      if (data.longTermMemories && data.longTermMemories.length > 0) {
        // Sort descending
        const sorted = [...data.longTermMemories].reverse();
        sorted.forEach(mem => {
          const entry = document.createElement('div');
          entry.className = 'memory-entry';
          
          const time = document.createElement('div');
          time.className = 'memory-time';
          time.textContent = new Date(mem.timestamp).toLocaleString();
          
          const text = document.createElement('div');
          text.className = 'memory-text';
          text.innerHTML = `<strong>${mem.topic}:</strong> ${mem.summary}`;
          
          entry.appendChild(time);
          entry.appendChild(text);
          timelineContainer.appendChild(entry);
        });
      } else {
        timelineContainer.innerHTML = '<p class="memory-empty">Memories will appear here as you converse...</p>';
      }

      // Update Conversation Log
      const chatLogContainer = document.getElementById('memory-chat-log');
      if (chatLogContainer) {
        chatLogContainer.innerHTML = '';
        if (data.conversationHistory && data.conversationHistory.length > 0) {
          data.conversationHistory.forEach(msg => {
            if (msg.role === 'system') return; // Hide system prompts from log
            
            const entry = document.createElement('div');
            entry.className = `chat-log-entry ${msg.role === 'user' ? 'user' : 'model'}`;
            
            const roleLabel = document.createElement('div');
            roleLabel.className = 'chat-log-role';
            roleLabel.textContent = msg.role === 'user' ? 'Reporter' : 'Hawking';
            
            const textContent = document.createElement('div');
            textContent.textContent = msg.content;
            
            entry.appendChild(roleLabel);
            entry.appendChild(textContent);
            chatLogContainer.appendChild(entry);
          });
        } else {
          chatLogContainer.innerHTML = '<p class="memory-empty">No messages yet...</p>';
        }
      }
    } catch (err) {
      console.error("Error fetching memory dashboard:", err);
    }
  }

  // ── Speech Recognition ───────────────────────────────────────────────────────
  
  let recognition = null;
  let isRecording = false;
  
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      // Update input but keep existing text if we appended
      if (finalTranscript) {
        questionInput.value = (questionInput.value + ' ' + finalTranscript).trim();
      } else {
        // Just previewing interim isn't great for UX because it overwrites, 
        // but we'll stick to a simple append approach.
      }
      updateCharCount();
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      stopRecording();
    };
    
    recognition.onend = () => {
      if (isRecording) {
        // It stopped automatically (e.g. timeout), so just update state.
        stopRecording();
      }
    };
  } else {
    if (micBtn) {
      micBtn.style.opacity = '0.5';
      micBtn.title = 'Voice Dictation Not Supported';
    }
  }

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
    if (recognition) recognition.stop();
  }

  micBtn.addEventListener('click', () => {
    if (!recognition) return alert("Your browser does not support voice dictation.");
    
    if (isRecording) {
      // Second click: Stop and SEND immediately
      stopRecording();
      if (questionInput.value.trim() !== '') {
        sendMessage();
      }
    } else {
      // First click: Start listening
      questionInput.value = ''; // clear input for fresh dictation
      recognition.start();
    }
  });

  // ── Events ───────────────────────────────────────────────────────────────────
  
  if (quickMuteBtn) {
    quickMuteBtn.addEventListener('click', () => {
      toggleVoice.checked = !toggleVoice.checked;
      if (toggleVoice.checked) {
        iconVolUp.style.display = 'block';
        iconVolMute.style.display = 'none';
        // Unlock audio context just in case
        if (window.meSpeak) {
          meSpeak.speak('', { volume: 0 });
          if (!hwAudioCtx) {
            hwAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          } else if (hwAudioCtx.state === 'suspended') {
            hwAudioCtx.resume();
          }
        }
      } else {
        iconVolUp.style.display = 'none';
        iconVolMute.style.display = 'block';
        if (window.meSpeak) meSpeak.stop();
      }
    });
  }
  
  toggleVoice.addEventListener('change', () => {
    if (toggleVoice.checked) {
      iconVolUp.style.display = 'block';
      iconVolMute.style.display = 'none';
    } else {
      iconVolUp.style.display = 'none';
      iconVolMute.style.display = 'block';
      if (window.meSpeak) meSpeak.stop();
    }
  });

  if (toggleFluidMode) {
    // Load preference
    const isFluid = localStorage.getItem('hawkingFluidMode') === 'true';
    toggleFluidMode.checked = isFluid;
    if (isFluid) {
      document.body.classList.add('fluid-mode');
    }
    
    // Toggle
    toggleFluidMode.addEventListener('change', () => {
      if (toggleFluidMode.checked) {
        document.body.classList.add('fluid-mode');
        localStorage.setItem('hawkingFluidMode', 'true');
      } else {
        document.body.classList.remove('fluid-mode');
        localStorage.setItem('hawkingFluidMode', 'false');
      }
    });
  }

  sendBtn.addEventListener('click', sendMessage);
  
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });



  function updateCharCount() {
    const len = questionInput.value.length;
    charCount.textContent = `${len} / 2000`;
  }

  questionInput.addEventListener('input', () => {
    updateCharCount();
    playPencilScratch();
  });

  btnMemory.addEventListener('click', () => {
    memoryPanel.classList.toggle('hidden');
    if (!memoryPanel.classList.contains('hidden')) {
      fetchMemoryDashboard();
    }
  });

  btnCloseMemory.addEventListener('click', () => {
    memoryPanel.classList.add('hidden');
  });
  
  if (btnNewSession) {
    btnNewSession.addEventListener('click', () => {
      if(confirm("Start a new interview session? Memory will be saved to long-term storage.")) {
        loadingScreen.classList.remove('hidden');
        loadingScreen.style.opacity = '1';
        appContainer.classList.add('hidden');
        initSession();
      }
    });
  }

  // ── Settings: Update API Key ───────────────────────────────────────────────
  const settingsApiKeyInput = document.getElementById('settings-api-key-input');
  const btnUpdateApiKey = document.getElementById('btn-update-api-key');
  const apiKeyUpdateMsg = document.getElementById('api-key-update-msg');

  if (btnUpdateApiKey && settingsApiKeyInput) {
    // Pre-fill with current key (masked)
    settingsApiKeyInput.placeholder = userApiKeys ? 'Current key set — paste to replace' : 'Paste new key(s) here...';

    btnUpdateApiKey.addEventListener('click', () => {
      const newKey = settingsApiKeyInput.value.trim();
      if (!newKey) return;
      userApiKeys = newKey;
      localStorage.setItem('hawkingApiKeys', userApiKeys);
      settingsApiKeyInput.value = '';
      settingsApiKeyInput.placeholder = 'Current key set — paste to replace';
      if (apiKeyUpdateMsg) {
        apiKeyUpdateMsg.style.display = 'block';
        setTimeout(() => { apiKeyUpdateMsg.style.display = 'none'; }, 3000);
      }
    });
  }

  // ── Settings: Clear Chat ───────────────────────────────────────────────────
  const btnClearChat = document.getElementById('btn-clear-chat');
  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      if (confirm('Clear your entire conversation history? This cannot be undone.')) {
        clearHistory();
        screenContent.innerHTML = '<span class="cursor-blink">_</span>';
        // Tell the server to reset this session too
        if (sessionId) {
          fetch(`/api/session/${sessionId}`, { method: 'DELETE' })
            .then(() => fetch('/api/session', { method: 'POST' }))
            .then(r => r.json())
            .then(d => { if (d.sessionId) sessionId = d.sessionId; })
            .catch(e => console.error('Session reset error:', e));
        }
        // Close the panel and show a fresh screen
        memoryPanel.classList.add('hidden');
        setTimeout(() => {
          speakAndTypePages('Memory cleared. A new interview begins.');
        }, 300);
      }
    });
  }

  // Background Particles (Dust/Stars effect)
  function initParticles() {
    for (let i = 0; i < 30; i++) {
      createParticle();
    }
  }

  function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Random properties
    const size = Math.random() * 3 + 1;
    const xPos = Math.random() * 100;
    const duration = Math.random() * 10 + 10;
    const delay = Math.random() * 10;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${xPos}vw`;
    particle.style.animationDuration = `${duration}s`;
    particle.style.animationDelay = `${delay}s`;
    
    particlesContainer.appendChild(particle);
    
    // Recreate when done
    setTimeout(() => {
      particle.remove();
      createParticle();
    }, (duration + delay) * 1000);
  }

  // Start initialization
  initSession();
});
