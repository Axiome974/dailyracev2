const STORAGE_KEY = "daily-rope-state-v1";
const TRACK_LENGTH = 10;

function defaultState() {
    return {
        players: [],
        track: { length: TRACK_LENGTH },
        turn: { date: null, playerId: null, phase: "idle", lastResult: null },
        winnerId: null,
        log: [],
    };
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch (err) {
        console.warn("Etat local illisible, reinitialisation.", err);
    }
    return defaultState();
}

let state = load();
const listeners = new Set();

export function getState() {
    return state;
}

export function setState(updater) {
    state = typeof updater === "function" ? updater(state) : updater;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn("Impossible de sauvegarder l'etat.", err);
    }
    listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function resetAll() {
    setState(defaultState());
}

export function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

// Encodage base64 sur des octets UTF-8 (les avatars/icones sont des emojis,
// donc btoa/atob seuls plantent sur les caracteres multi-octets).
function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

const EXPORT_PREFIX = "DR1:";

export function exportStateString() {
    return EXPORT_PREFIX + toBase64(JSON.stringify(state));
}

export function importStateString(code) {
    const trimmed = (code ?? "").trim();
    if (!trimmed) throw new Error("Code vide");

    const payload = trimmed.startsWith(EXPORT_PREFIX) ? trimmed.slice(EXPORT_PREFIX.length) : trimmed;
    const parsed = JSON.parse(fromBase64(payload));
    if (!parsed || !Array.isArray(parsed.players)) {
        throw new Error("Format de session invalide");
    }

    setState({ ...defaultState(), ...parsed });
}
