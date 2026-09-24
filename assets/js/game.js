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

    if (pick.frozen) {
        applyFrozenSkip(pick);
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

// Un joueur givre est toujours present (contrairement aux vacances) : il n'a
// pas besoin de suppleant, il garde juste la parole au daily mais ne joue pas
// son tour de course. Le gel se consomme automatiquement a ce tirage.
function applyFrozenSkip(pick) {
    setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === pick.id ? { ...p, frozen: false } : p)),
        turn: {
            date: todayISO(),
            playerId: pick.id,
            phase: "resolved",
            lastResult: { type: "frozen-skip" },
        },
        log: [
            { id: crypto.randomUUID(), type: "frozen-skip", playerId: pick.id, playerName: pick.name },
            ...s.log,
        ].slice(0, 30),
    }));
}

function turnLogEntry(s, player, result) {
    return {
        id: crypto.randomUUID(),
        type: "turn",
        playerId: player.id,
        playerName: player.name,
        date: s.turn.date,
        result,
    };
}

function applyTurn(compute) {
    setState((s) => {
        if (s.turn.phase !== "drawn") return s;
        const player = s.players.find((p) => p.id === s.turn.playerId);
        if (!player) return s;

        const { position, result, grantedBonus, pendingBonus } = compute(s, player);

        // Inventaire plein : le tour reste en suspens le temps que le joueur
        // choisisse de remplacer un de ses bonus ou de garder les siens.
        if (pendingBonus) {
            return { ...s, turn: { ...s.turn, phase: "bonus-full", pendingBonus } };
        }

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
            log: [turnLogEntry(s, player, result), ...s.log].slice(0, 30),
        };
    });
}

// De a 4 faces : 1 a 3 = nombre de cases a avancer, 4 = boite surprise (bonus).
export const DIE_BONUS_FACE = 4;

export function rollDie() {
    return 1 + Math.floor(Math.random() * DIE_BONUS_FACE);
}

export function resolveDiceRoll(roll) {
    applyTurn((s, player) => {
        if (roll !== DIE_BONUS_FACE) {
            const position = clamp(player.position + roll, s.track.length);
            return { position, result: { type: "dice", roll, delta: position - player.position } };
        }
        const bonus = drawRandomBonus();
        if (player.bonuses.length >= MAX_BONUSES) {
            return { position: player.position, pendingBonus: bonus };
        }
        return { position: player.position, result: { type: "dice-bonus", roll, bonus }, grantedBonus: bonus };
    });
}

// replaceUid = uid du bonus a remplacer par le bonus gagne, ou null pour
// garder l'inventaire actuel (le bonus gagne est alors perdu).
export function resolveBonusReplace(replaceUid) {
    setState((s) => {
        if (s.turn.phase !== "bonus-full" || !s.turn.pendingBonus) return s;
        const player = s.players.find((p) => p.id === s.turn.playerId);
        if (!player) return s;

        const bonus = s.turn.pendingBonus;
        const replaced = replaceUid ? player.bonuses.find((b) => b.uid === replaceUid) : null;
        const players = replaced
            ? s.players.map((p) =>
                  p.id === player.id
                      ? {
                            ...p,
                            bonuses: p.bonuses.map((b) =>
                                b.uid === replaceUid ? { ...bonus, uid: crypto.randomUUID() } : b
                            ),
                        }
                      : p
              )
            : s.players;

        const result = {
            type: "dice-bonus",
            roll: DIE_BONUS_FACE,
            bonus,
            replaced: replaced ? { id: replaced.id, label: replaced.label, icon: replaced.icon } : null,
            discarded: !replaced,
        };

        return {
            ...s,
            players,
            turn: { ...s.turn, phase: "resolved", lastResult: result, pendingBonus: null },
            log: [turnLogEntry(s, player, result), ...s.log].slice(0, 30),
        };
    });
}

export function startNewRace() {
    setState((s) => ({
        ...s,
        players: s.players.map((p) => ({ ...p, position: 0, bonuses: [], frozen: false })),
        winnerId: null,
        turn: { date: null, playerId: null, phase: "idle", lastResult: null },
    }));
}

// Changer l'objectif de la course n'a de sens qu'en redemarrant une course
// (les positions deja jouees ne veulent plus rien dire avec un nouveau but).
export function setTrackLength(length) {
    setState((s) => ({
        ...s,
        track: { length },
        players: s.players.map((p) => ({ ...p, position: 0, bonuses: [], frozen: false })),
        winnerId: null,
        turn: { date: null, playerId: null, phase: "idle", lastResult: null },
    }));
}
