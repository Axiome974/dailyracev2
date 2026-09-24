// Etat de la partie, en memoire. La persistance (localStorage en demo,
// serveur en mode connecte) est branchee au demarrage par initState() :
// voir js/storage.js. Ce module n'en connait pas les details.
const TRACK_LENGTH = 10;

// Version du format de l'etat, stockee avec lui : permettra de migrer les
// anciennes parties au chargement le jour ou le format change.
export const SCHEMA_VERSION = 1;

export function defaultState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        players: [],
        track: { length: TRACK_LENGTH },
        turn: { date: null, playerId: null, phase: "idle", lastResult: null },
        winnerId: null,
        log: [],
        // poids relatifs par id de bonus ; cle absente = poids par defaut (1).
        bonusWeights: {},
    };
}

// Complete un etat charge (ou vide/illisible) avec les valeurs par defaut.
export function normalizeState(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultState();
    return { ...defaultState(), ...raw, schemaVersion: SCHEMA_VERSION };
}

let state = defaultState();
let persist = () => {};
const listeners = new Set();

// initial : etat charge par le stockage (null = nouvelle partie) ;
// persistFn(state) : appelee a chaque modification.
export function initState(initial, persistFn) {
    state = normalizeState(initial);
    persist = persistFn;
}

export function getState() {
    return state;
}

export function setState(updater) {
    state = typeof updater === "function" ? updater(state) : updater;
    persist(state);
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

    setState(normalizeState(parsed));
}
