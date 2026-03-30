/**
 * Voicabulary Core App Logic - Upgraded with SRS and Car Mode
 */

const state = {
    words: typeof wordDatabase !== 'undefined' ? wordDatabase : [],
    practicedWords: [],
    currentWord: null,
    totalTimeMs: 15 * 60 * 1000,
    timeRemainingMs: 0,
    isPlaying: false,
    timerInterval: null,
    lessonType: 0,
    aiSpeaking: false,
    
    // Spaced Repetition & Progress
    masteryData: JSON.parse(localStorage.getItem('voicabulary_mastery') || '{}'),
    MASTERY_THRESHOLD: 3,

    // CarPlay / Car Mode
    carModeActive: false,
    dummyMediaStream: null
};

// Speech Synthesis & Recognition
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US'; 
}

// Elements
const el = {
    screens: {
        setup: document.getElementById('setup-screen'),
        learning: document.getElementById('learning-screen'),
        summary: document.getElementById('summary-screen')
    },
    duration: document.getElementById('duration'),
    carModeSwitch: document.getElementById('car-mode-switch'),
    startBtn: document.getElementById('start-btn'),
    timer: document.getElementById('timer'),
    progressBar: document.getElementById('progress-bar'),
    aiStatus: document.getElementById('ai-status'),
    visualizer: document.getElementById('visualizer'),
    targetWord: document.getElementById('target-word'),
    wordTranslation: document.getElementById('word-translation'),
    wordContext: document.getElementById('word-context'),
    micBtn: document.getElementById('mic-btn'),
    micHint: document.getElementById('mic-hint'),
    skipBtn: document.getElementById('skip-btn'),
    endEarlyBtn: document.getElementById('end-early-btn'),
    wordsManaged: document.getElementById('words-managed'),
    wordListPreview: document.getElementById('word-list-preview'),
    exportKeepBtn: document.getElementById('export-keep-btn'),
    homeBtn: document.getElementById('home-btn')
};

function init() {
    setupCalendarButtons();

    el.startBtn.addEventListener('click', startLesson);
    el.endEarlyBtn.addEventListener('click', endLesson);
    el.skipBtn.addEventListener('click', () => handleWordCompletion(true));
    el.exportKeepBtn.addEventListener('click', () => shareToKeep(state.practicedWords));
    el.homeBtn.addEventListener('click', resetApp);

    el.micBtn.addEventListener('click', () => {
        if (!state.isPlaying || el.micBtn.classList.contains('disabled')) return;
        startListening();
    });

    if (recognition) {
        recognition.onresult = handleSpeechResult;
        recognition.onerror = handleSpeechError;
        recognition.onend = handleSpeechEnd;
    } else {
        alert("Let op: Spraakherkenning wordt niet ondersteund in deze browser. Gebruik Chrome of Safari op mobiel voor de beste ervaring.");
    }

    // Initialize UI count for user info
    console.log(`Loaded ${state.words.length} words. Mastered: ${Object.values(state.masteryData).filter(s => s >= state.MASTERY_THRESHOLD).length}`);
}

function showScreen(screenKey) {
    Object.values(el.screens).forEach(s => s.classList.remove('active'));
    el.screens[screenKey].classList.add('active');
}

async function startLesson() {
    state.carModeActive = el.carModeSwitch ? el.carModeSwitch.checked : false;
    
    if (state.carModeActive) {
        document.body.classList.add('car-mode-active');
        try {
            // CarPlay Hack: Acquire microphone explicitly and keep it warm
            // This prevents Android Auto / CarPlay from dropping Bluetooth HFP connection
            state.dummyMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Try to keep screen awake via WakeLock if available
            if ('wakeLock' in navigator) {
                try {
                    await navigator.wakeLock.request('screen');
                } catch (err) {
                    console.log("WakeLock not available", err);
                }
            }
        } catch (e) {
            console.error("Kon microfoon niet permanent openzetten voor Car Mode:", e);
        }
    } else {
        document.body.classList.remove('car-mode-active');
    }

    const mins = parseInt(el.duration.value);
    state.totalTimeMs = mins * 60 * 1000;
    state.timeRemainingMs = state.totalTimeMs;
    state.practicedWords = [];
    state.isPlaying = true;

    updateTimerDisplay();
    state.timerInterval = setInterval(timerTick, 1000);

    showScreen('learning');

    if (synth.getVoices().length === 0) {
        synth.onvoiceschanged = () => {};
    }

    setUIStatus("Getting ready...", "app");
    speak("Welcome to your daily English session. Let's begin.", 'en-US', () => {
        setTimeout(nextWord, 500);
    });
}

function timerTick() {
    state.timeRemainingMs -= 1000;
    updateTimerDisplay();

    if (state.timeRemainingMs <= 0) {
        endLesson();
    }
}

function updateTimerDisplay() {
    const totalSecs = Math.max(0, Math.floor(state.timeRemainingMs / 1000));
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    el.timer.innerText = `${m}:${s.toString().padStart(2, '0')}`;
    
    const progressPercent = 100 - ((state.timeRemainingMs / state.totalTimeMs) * 100);
    el.progressBar.style.width = `${progressPercent}%`;
}

function getNextWord() {
    // Exclude currently practiced words during this session
    const validPool = state.words.filter(w => !state.practicedWords.includes(w));
    
    if (validPool.length === 0) {
        // Fallback if they exhausted literally all 100 words in one session
        return state.words[Math.floor(Math.random() * state.words.length)];
    }

    // Filter out mastered words specifically
    let unmastered = validPool.filter(w => (state.masteryData[w.id] || 0) < state.MASTERY_THRESHOLD);
    
    if (unmastered.length > 0) {
        // Weigh heavily towards lowest score words (Score 0 vs Score 2)
        // Sort by score ascending, pick from the bottom half 
        unmastered.sort((a,b) => (state.masteryData[a.id] || 0) - (state.masteryData[b.id] || 0));
        
        // Take a slice of the lowest scored words to pick from randomly (avoids completely predictable order)
        let focusSlice = unmastered.slice(0, Math.max(5, Math.floor(unmastered.length / 3)));
        return focusSlice[Math.floor(Math.random() * focusSlice.length)];
    } else {
        // Wow, they mastered everything, just pick randomly from the pool
        return validPool[Math.floor(Math.random() * validPool.length)];
    }
}

function nextWord() {
    if (!state.isPlaying) return;

    state.currentWord = getNextWord();
    
    // Type 1: App says NL, User says EN
    // Type 2: App spells/says EN, User repeats
    state.lessonType = Math.random() > 0.5 ? 1 : 2;

    el.targetWord.innerText = "?";
    el.wordTranslation.innerText = state.currentWord.nl;
    
    el.targetWord.classList.remove('hidden');
    el.wordTranslation.classList.remove('hidden');
    el.wordContext.classList.add('hidden');

    if (state.lessonType === 1) {
        setUIStatus("Translate to English", "app");
        speak(`Hoe zeg je: ${state.currentWord.nl}?`, 'nl-NL', promptForUserSpeech);
    } else {
        setUIStatus("Listen and Repeat", "app");
        speak(`The word is: ${state.currentWord.eng}. Repeat after me: ${state.currentWord.eng}`, 'en-US', promptForUserSpeech);
    }
}

function setUIStatus(text, mode) {
    el.aiStatus.innerText = text;
    if (mode === "app") {
        el.micBtn.classList.add('disabled');
        el.micBtn.classList.remove('active');
        el.visualizer.classList.remove('listening');
        el.micHint.innerText = "App is speaking...";
    } else if (mode === "listening") {
        el.micBtn.classList.remove('disabled');
        el.micBtn.classList.add('active');
        el.visualizer.classList.add('listening');
        el.micHint.innerText = "Listening...";
    } else if (mode === "waiting") {
        el.micBtn.classList.remove('disabled');
        el.micBtn.classList.remove('active');
        el.visualizer.classList.remove('listening');
        el.micHint.innerText = "Tap mic to speak";
    }
}

function speak(text, lang, onEndCallback) {
    if (!synth) return;
    state.aiSpeaking = true;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;

    el.visualizer.classList.add('speaking');
    
    utterance.onend = () => {
        state.aiSpeaking = false;
        el.visualizer.classList.remove('speaking');
        if (onEndCallback) onEndCallback();
    };
    
    synth.speak(utterance);
}

function promptForUserSpeech() {
    if (!state.isPlaying) return;
    setUIStatus("Your turn", "waiting");
    
    // Slight delay before throwing mic open so it doesn't catch its own echo
    setTimeout(() => {
        startListening();
    }, 300);
}

function startListening() {
    if (!recognition || state.aiSpeaking) return;
    try {
        recognition.start();
        setUIStatus("Listening...", "listening");
    } catch(e) {
        console.log("Recognition already started", e);
    }
}

function handleSpeechResult(event) {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    console.log("User said:", transcript);

    const targetClean = state.currentWord.eng.toLowerCase().replace(/[.,!?]/g, '');
    
    // Reveal word
    el.targetWord.innerText = state.currentWord.eng;
    el.wordContext.innerText = state.currentWord.context;
    el.wordContext.classList.remove('hidden');

    if (transcript.includes(targetClean)) {
        setUIStatus("Correct!", "app");
        
        // Progress System: Increase score and save
        const wId = state.currentWord.id;
        state.masteryData[wId] = (state.masteryData[wId] || 0) + 1;
        localStorage.setItem('voicabulary_mastery', JSON.stringify(state.masteryData));
        
        if (state.masteryData[wId] >= state.MASTERY_THRESHOLD) {
             console.log(`Word mastered! ${targetClean}`);
        }

        speak(`Excellent! ${state.currentWord.context}`, 'en-US', () => handleWordCompletion(false));
    } else {
        setUIStatus("Not quite...", "app");
        // We do not decrease score on failure so it stays encouraging.
        speak(`Almost. The correct word is ${state.currentWord.eng}. ${state.currentWord.context}`, 'en-US', () => handleWordCompletion(false));
    }
}

function handleSpeechError(event) {
    console.error("Speech error:", event.error);
    if (event.error === 'no-speech') {
        setUIStatus("Didn't catch that", "waiting");
    } else {
        setUIStatus("Tap mic to try again", "waiting");
    }
}

function handleSpeechEnd() {
    if (state.isPlaying && !state.aiSpeaking) {
        setUIStatus("Tap mic to speak", "waiting");
    }
}

function handleWordCompletion(skipped = false) {
    if (!state.isPlaying) return;
    
    if (!skipped && state.currentWord && !state.practicedWords.includes(state.currentWord)) {
        state.practicedWords.push(state.currentWord);
    }
    
    setTimeout(() => {
        nextWord();
    }, skipped ? 0 : 1000);
}

function endLesson() {
    state.isPlaying = false;
    clearInterval(state.timerInterval);
    synth.cancel();
    if(recognition) recognition.stop();

    // Release Dummy Media Stream for Car Mode
    if (state.dummyMediaStream) {
        state.dummyMediaStream.getTracks().forEach(track => track.stop());
        state.dummyMediaStream = null;
    }

    // Populate summary
    el.wordsManaged.innerText = state.practicedWords.length;
    el.wordListPreview.innerHTML = '';
    
    state.practicedWords.forEach(w => {
        const div = document.createElement('div');
        div.className = 'word-item';
        div.innerHTML = `<span>${w.eng}</span> <span>${w.nl}</span>`;
        el.wordListPreview.appendChild(div);
    });

    showScreen('summary');
}

function resetApp() {
    showScreen('setup');
}

document.addEventListener('DOMContentLoaded', init);
