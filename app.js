/**
 * Voicabulary Core App Logic
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
    aiSpeaking: false
};

// Speech Synthesis & Recognition
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US'; // We expect English answers for most exercises
}

// Elements
const el = {
    screens: {
        setup: document.getElementById('setup-screen'),
        learning: document.getElementById('learning-screen'),
        summary: document.getElementById('summary-screen')
    },
    duration: document.getElementById('duration'),
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
}

function showScreen(screenKey) {
    Object.values(el.screens).forEach(s => s.classList.remove('active'));
    el.screens[screenKey].classList.add('active');
}

function startLesson() {
    const mins = parseInt(el.duration.value);
    state.totalTimeMs = mins * 60 * 1000;
    state.timeRemainingMs = state.totalTimeMs;
    state.practicedWords = [];
    state.isPlaying = true;

    updateTimerDisplay();
    state.timerInterval = setInterval(timerTick, 1000);

    showScreen('learning');

    // Force initialization of speech synth on user interaction
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
    const unpracticed = state.words.filter(w => !state.practicedWords.includes(w));
    if (unpracticed.length > 0) {
        return unpracticed[Math.floor(Math.random() * unpracticed.length)];
    }
    return state.words[Math.floor(Math.random() * state.words.length)];
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
        speak(`Excellent! ${state.currentWord.context}`, 'en-US', () => handleWordCompletion(false));
    } else {
        setUIStatus("Not quite...", "app");
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
        // If it ended automatically (e.g. timeout), set back to waiting mode
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
