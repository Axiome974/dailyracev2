// Effets sonores synthetises avec la Web Audio API : aucun fichier a charger,
// ca marche hors ligne. Le contexte audio n'est cree qu'au premier son, donc
// apres un clic (les navigateurs bloquent l'audio avant une interaction).
// La coupure du son est une preference d'appareil, hors etat de partie.
const MUTE_KEY = "daily-rope-muted";

let ctx = null;
let master = null;
let muted = readMuted();

function readMuted() {
    try {
        return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
        return false;
    }
}

export function isMuted() {
    return muted;
}

export function setMuted(value) {
    muted = value;
    try {
        localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
        // stockage indisponible : la preference vaut pour la session.
    }
}

function audio() {
    if (muted) return null;
    if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.32;
        master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
}

// Note simple avec enveloppe (attaque rapide, extinction exponentielle) et
// glissando optionnel vers `to`.
function tone(ac, { freq, to, type = "sine", at = 0, dur = 0.15, vol = 0.5 }) {
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
}

// Bruit filtre (cliquetis du de, choc).
function noise(ac, { at = 0, dur = 0.05, vol = 0.4, freq = 2000, q = 1 }) {
    const t0 = ac.currentTime + at;
    const length = Math.ceil(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
}

function play(fn) {
    const ac = audio();
    if (ac) fn(ac);
}

export const sfx = {
    click: () => play((ac) => tone(ac, { freq: 660, to: 880, type: "triangle", dur: 0.07, vol: 0.25 })),

    // Tic de la roulette du tirage, legerement aleatoire.
    tick: () => play((ac) => tone(ac, { freq: 900 + Math.random() * 300, type: "square", dur: 0.035, vol: 0.12 })),

    // Annonce du pilote : petit arpege montant.
    reveal: () =>
        play((ac) => {
            [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, type: "triangle", at: i * 0.07, dur: 0.25, vol: 0.3 }));
        }),

    // Pilote bloque (vacances, givre, crevaison) : deux notes qui descendent.
    skip: () =>
        play((ac) => {
            tone(ac, { freq: 523, type: "triangle", dur: 0.18, vol: 0.28 });
            tone(ac, { freq: 392, type: "triangle", at: 0.16, dur: 0.3, vol: 0.28 });
        }),

    yes: () => play((ac) => tone(ac, { freq: 587, to: 1175, type: "sine", dur: 0.16, vol: 0.35 })),
    no: () => play((ac) => tone(ac, { freq: 330, to: 220, type: "triangle", dur: 0.16, vol: 0.3 })),

    // Cliquetis du de qui roule (appele a chaque changement de face).
    rattle: () => play((ac) => noise(ac, { dur: 0.04, vol: 0.35, freq: 2500 + Math.random() * 1500, q: 3 })),

    // Le de se pose : choc sourd + clac.
    dieLand: () =>
        play((ac) => {
            tone(ac, { freq: 140, to: 60, type: "sine", dur: 0.18, vol: 0.6 });
            noise(ac, { dur: 0.06, vol: 0.5, freq: 1800, q: 2 });
        }),

    // Un bond du pion (n = numero du bond, pour une gamme qui monte).
    hop: (n = 0) =>
        play((ac) => {
            tone(ac, { freq: 440 * Math.pow(1.15, n), to: 660 * Math.pow(1.15, n), type: "triangle", dur: 0.09, vol: 0.2 });
            noise(ac, { at: 0.02, dur: 0.03, vol: 0.15, freq: 900, q: 1 });
        }),

    // Recul (sabotage, nid-de-poule...) : glissando descendant.
    back: () => play((ac) => tone(ac, { freq: 600, to: 150, type: "sawtooth", dur: 0.35, vol: 0.18 })),

    // Bonus active : scintillement montant.
    bonus: () =>
        play((ac) => {
            [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(ac, { freq: f, type: "sine", at: i * 0.05, dur: 0.22, vol: 0.22 }));
        }),

    // Malus : buzzer grave.
    malus: () =>
        play((ac) => {
            tone(ac, { freq: 220, to: 110, type: "sawtooth", dur: 0.45, vol: 0.22 });
            tone(ac, { freq: 233, to: 116, type: "square", dur: 0.45, vol: 0.1 });
        }),

    // Bouclier qui bloque : "ting" metallique.
    shield: () =>
        play((ac) => {
            tone(ac, { freq: 1568, type: "sine", dur: 0.5, vol: 0.25 });
            tone(ac, { freq: 2349, type: "sine", at: 0.02, dur: 0.4, vol: 0.12 });
        }),

    // Boite cadeau gagnee au de.
    gift: () =>
        play((ac) => {
            [659, 831, 988, 1319].forEach((f, i) => tone(ac, { freq: f, type: "triangle", at: i * 0.09, dur: 0.3, vol: 0.28 }));
            noise(ac, { at: 0.3, dur: 0.25, vol: 0.12, freq: 6000, q: 0.7 });
        }),

    // Fin de tour : les cases bonus/malus restantes s'evaporent (souffle
    // descendant + petit scintillement).
    vanish: () =>
        play((ac) => {
            noise(ac, { dur: 0.35, vol: 0.18, freq: 3200, q: 0.8 });
            [1568, 1175, 880, 659].forEach((f, i) => tone(ac, { freq: f, type: "sine", at: i * 0.06, dur: 0.14, vol: 0.12 }));
        }),

    // Nouvelles cases : un "plink" par case, espaces comme l'animation
    // d'apparition (APPEAR_STAGGER_MS dans render.js).
    appear: (count = 1, staggerMs = 90) =>
        play((ac) => {
            for (let i = 0; i < count; i++) {
                const f = 988 * Math.pow(1.12, i % 8);
                tone(ac, { freq: f, type: "triangle", at: 0.12 + (i * staggerMs) / 1000, dur: 0.16, vol: 0.18 });
                tone(ac, { freq: f * 2, type: "sine", at: 0.12 + (i * staggerMs) / 1000, dur: 0.1, vol: 0.06 });
            }
        }),

    // Combo : arpege qui monte d'autant de notes que de cases enchainees.
    combo: (n = 2) =>
        play((ac) => {
            const base = 523;
            for (let i = 0; i <= n; i++) {
                tone(ac, { freq: base * Math.pow(1.26, i), type: "square", at: i * 0.07, dur: 0.16, vol: 0.14 });
                tone(ac, { freq: base * Math.pow(1.26, i) * 2, type: "sine", at: i * 0.07, dur: 0.2, vol: 0.12 });
            }
            noise(ac, { at: n * 0.07, dur: 0.3, vol: 0.14, freq: 7000, q: 0.6 });
        }),

    // Fanfare de victoire.
    victory: () =>
        play((ac) => {
            const notes = [
                [523, 0, 0.15],
                [523, 0.15, 0.15],
                [523, 0.3, 0.15],
                [659, 0.45, 0.45],
                [587, 0.9, 0.15],
                [659, 1.05, 0.15],
                [784, 1.2, 0.8],
            ];
            notes.forEach(([f, at, dur]) => {
                tone(ac, { freq: f, type: "square", at, dur, vol: 0.16 });
                tone(ac, { freq: f / 2, type: "triangle", at, dur, vol: 0.2 });
            });
        }),
};
