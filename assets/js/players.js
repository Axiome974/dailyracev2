import { setState } from "./state.js";

export const PALETTE = ["#ff5d8f", "#0984e3", "#00b894", "#fdcb6e", "#a29bfe", "#ff7675", "#00cec9", "#e17055"];
export const AVATARS = [
    "🦊", "🐼", "🐸", "🐵", "🦁", "🐯", "🐨", "🐙", "🦄", "🐲",
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦝", "🐻", "🐻‍❄️", "🐷", "🐮",
    "🐗", "🐴", "🦓", "🦒", "🐘", "🦏", "🦛", "🐔", "🐧", "🐦",
    "🦆", "🦅", "🦉", "🦇", "🐺", "🐢", "🐍", "🦎", "🦖", "🦕",
    "🐳", "🐬", "🦈", "🐠", "🐡", "🦞", "🦀", "🐝", "🦋", "🐞",
    "🐌", "🦂", "🕷️", "🦔", "🦘", "🦙", "🦥", "🦦", "🦡", "🐿️",
];

function pickUnused(pool, used) {
    return pool.find((item) => !used.includes(item)) ?? pool[used.length % pool.length];
}

export function addPlayer(name) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return false;

    let added = false;
    setState((s) => {
        const exists = s.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return s;

        const color = pickUnused(PALETTE, s.players.map((p) => p.color));
        const avatar = pickUnused(AVATARS, s.players.map((p) => p.avatar));
        const player = {
            id: crypto.randomUUID(),
            name: trimmed,
            color,
            avatar,
            position: 0,
            bonuses: [],
            onVacation: false,
        };

        added = true;
        return { ...s, players: [...s.players, player] };
    });
    return added;
}

export function removePlayer(id) {
    setState((s) => ({
        ...s,
        players: s.players.filter((p) => p.id !== id),
        turn: s.turn.playerId === id ? { ...s.turn, playerId: null, phase: "idle" } : s.turn,
        winnerId: s.winnerId === id ? null : s.winnerId,
    }));
}

export function toggleVacation(id) {
    setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === id ? { ...p, onVacation: !p.onVacation } : p)),
    }));
}

export function setAvatar(id, avatar) {
    setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === id ? { ...p, avatar } : p)),
    }));
}
