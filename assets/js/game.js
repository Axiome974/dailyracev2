import { getState, setState, todayISO } from "./state.js";
import { drawRandomBonus } from "./bonuses.js";

const MAX_BONUSES = 2;

function clamp(pos, length) {
    return Math.max(0, Math.min(length, pos));
}

export function canDrawToday(state) {
    const eligible = state.players.filter((p) => p.id !== state.winnerId);
    return eligible.length > 0 && eligible.some((p) => !p.onVacation);
}

export function drawPlayerOfTheDay() {
    const s = getState();
    const eligible = s.players.filter((p) => p.id !== s.winnerId);
    if (eligible.length === 0 || eligible.every((p) => p.onVacation)) return null;

    const pick = eligible[Math.floor(Math.random() * eligible.length)];

    if (pick.onVacation) {
        const substitutes = eligible.filter((p) => p.id !== pick.id && !p.onVacation);
        const substitute = substitutes[Math.floor(Math.random() * substitutes.length)];
        applyVacationSkip(pick, substitute);
        return pick;
    }

    setState((s2) => ({
        ...s2,
        turn: { date: todayISO(), playerId: pick.id, phase: "drawn", lastResult: null },
        log: [
            { id: crypto.randomUUID(), type: "drawn", playerId: pick.id, playerName: pick.name },
            ...s2.log,
        ].slice(0, 30),
    }));
    return pick;
}

// Un joueur en vacances n'est jamais mis en lumiere : il avance automatiquement
// d'une case (comme s'il jouait en pilote automatique) et un suppleant pioche
// au hasard parmi les joueurs presents est designe pour parler en premier au
// daily, sans aucun impact sur la course.
function applyVacationSkip(pick, substitute) {
    setState((s) => {
        const length = s.track.length;
        const position = clamp(pick.position + 1, length);
        const players = s.players.map((p) => (p.id === pick.id ? { ...p, position } : p));
        const winner = players.find((p) => p.position >= length);

        return {
            ...s,
            players,
            winnerId: winner ? winner.id : s.winnerId,
            turn: {
                date: todayISO(),
                playerId: pick.id,
                phase: "resolved",
                lastResult: { type: "vacation-skip", substituteName: substitute.name },
            },
            log: [
                {
                    id: crypto.randomUUID(),
                    type: "vacation-skip",
                    playerId: pick.id,
                    playerName: pick.name,
                    substituteId: substitute.id,
                    substituteName: substitute.name,
                },
                ...s.log,
            ].slice(0, 30),
        };
    });
}

function applyTurn(compute) {
    setState((s) => {
        if (s.turn.phase !== "drawn") return s;
        const player = s.players.find((p) => p.id === s.turn.playerId);
        if (!player) return s;

        const { position, result, grantedBonus } = compute(s, player);

        let players = s.players.map((p) => (p.id === player.id ? { ...p, position } : p));
        if (grantedBonus) {
            players = players.map((p) =>
                p.id === player.id
                    ? { ...p, bonuses: [...p.bonuses, { ...grantedBonus, uid: crypto.randomUUID() }] }
                    : p
            );
        }

        const winner = players.find((p) => p.position >= s.track.length);

        return {
            ...s,
            players,
            winnerId: winner ? winner.id : s.winnerId,
            turn: { ...s.turn, phase: "resolved", lastResult: result },
            log: [
                {
                    id: crypto.randomUUID(),
                    type: "turn",
                    playerId: player.id,
                    playerName: player.name,
                    date: s.turn.date,
                    result,
                },
                ...s.log,
            ].slice(0, 30),
        };
    });
}

export function resolveAdvance() {
    applyTurn((s, player) => {
        const position = clamp(player.position + 1, s.track.length);
        return { position, result: { type: "advance", delta: position - player.position } };
    });
}

export function resolveMegaJump() {
    applyTurn((s, player) => {
        const success = Math.random() < 1 / 3;
        const raw = success ? 3 : -2;
        const position = clamp(player.position + raw, s.track.length);
        return { position, result: { type: "megajump", success, delta: position - player.position } };
    });
}

export function resolveBonusChest() {
    applyTurn((s, player) => {
        if (player.bonuses.length >= MAX_BONUSES) {
            return { position: player.position, result: { type: "bonus-full" } };
        }
        const bonus = drawRandomBonus();
        return { position: player.position, result: { type: "bonus", bonus }, grantedBonus: bonus };
    });
}

export function startNewRace() {
    setState((s) => ({
        ...s,
        players: s.players.map((p) => ({ ...p, position: 0, bonuses: [] })),
        winnerId: null,
        turn: { date: null, playerId: null, phase: "idle", lastResult: null },
    }));
}
