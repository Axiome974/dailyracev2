import { getState, setState, todayISO } from "./state.js";
import { drawRandomBonus, boxBonusAvailable, eligibleTargets, getBonusDef, BONUS_CATALOG } from "./bonuses.js";
import { withFreshBoard, tileEffectAt, consumeTile, applyTileEffect } from "./tiles.js";

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

// Un joueur en vacances n'est jamais mis en lumiere : le de est lance pour
// lui automatiquement (pilote automatique, sans cases speciales ni choix) et
// un suppleant pioche au hasard parmi les joueurs presents est designe pour
// parler en premier au daily. Face bonus avec inventaire plein : +1 case a la
// place (consolation reservee aux vacanciers).
function applyVacationSkip(pick, substitute) {
    const roll = rollDie();
    setState((s) => {
        const length = s.track.length;
        const player = s.players.find((p) => p.id === pick.id);
        const outcome = { roll, delta: 0, bonus: null };

        let updated = player;
        if (roll !== DIE_BONUS_FACE) {
            const position = clamp(player.position + roll, length);
            outcome.delta = position - player.position;
            updated = { ...player, position };
        } else if (player.bonuses.length < MAX_BONUSES) {
            const bonus = drawBoxBonus(s);
            outcome.bonus = bonus;
            updated = { ...player, bonuses: [...player.bonuses, { ...bonus, uid: crypto.randomUUID() }] };
        } else {
            const position = clamp(player.position + 1, length);
            outcome.delta = position - player.position;
            outcome.consolation = true;
            updated = { ...player, position };
        }

        const players = s.players.map((p) => (p.id === pick.id ? updated : p));
        const winner = players.find((p) => p.position >= length);

        return {
            ...s,
            players,
            winnerId: winner ? winner.id : s.winnerId,
            turn: {
                date: todayISO(),
                playerId: pick.id,
                phase: "resolved",
                lastResult: { type: "vacation-skip", substituteId: substitute.id, substituteName: substitute.name, ...outcome },
            },
            log: [
                {
                    id: crypto.randomUUID(),
                    type: "vacation-skip",
                    playerId: pick.id,
                    playerName: pick.name,
                    substituteId: substitute.id,
                    substituteName: substitute.name,
                    ...outcome,
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
    // frozen vaut true (bonus Givre) ou "puncture" (case malus Crevaison).
    const reason = pick.frozen === "puncture" ? "puncture" : "givre";
    setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === pick.id ? { ...p, frozen: false } : p)),
        turn: {
            date: todayISO(),
            playerId: pick.id,
            phase: "resolved",
            lastResult: { type: "frozen-skip", reason },
        },
        log: [
            { id: crypto.randomUUID(), type: "frozen-skip", playerId: pick.id, playerName: pick.name, reason },
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

// Sans aucun bonus autorise dans les boites, le de n'a plus de face 🎁.
export function dieFaces(s = getState()) {
    return boxBonusAvailable(s) ? DIE_BONUS_FACE : DIE_BONUS_FACE - 1;
}

export function rollDie() {
    return 1 + Math.floor(Math.random() * dieFaces());
}

// Filet de securite si les reglages changent entre le lancer et sa resolution.
function drawBoxBonus(s) {
    return drawRandomBonus("box", s) ?? BONUS_CATALOG[0];
}

function finishTurn(s, player, players, result, extra = {}) {
    const winner = players.find((p) => p.position >= s.track.length);
    return {
        ...s,
        ...extra,
        players,
        winnerId: winner ? winner.id : s.winnerId,
        turn: { ...s.turn, phase: "resolved", lastResult: result, pendingTile: null, tileChain: null },
        log: [turnLogEntry(s, player, result), ...s.log].slice(0, 30),
    };
}

// Deplacement de 1 a 3 cases. Si le pion s'arrete sur une case speciale du
// jour, la case est consommee et le tour passe en "tile-pending" : l'effet
// est d'abord annonce, puis applique par resolveTileEffect() quand le joueur
// poursuit (ou choisit sa cible pour un bonus qui en demande une).
function resolveDiceMove(roll) {
    setState((s) => {
        if (s.turn.phase !== "drawn") return s;
        const player = s.players.find((p) => p.id === s.turn.playerId);
        if (!player) return s;

        const position = clamp(player.position + roll, s.track.length);
        const delta = position - player.position;
        const players = s.players.map((p) => (p.id === player.id ? { ...p, position } : p));

        const effect = tileEffectAt(s, position);
        if (!effect) return finishTurn(s, player, players, { type: "dice", roll, delta });

        return {
            ...s,
            players,
            board: consumeTile(s.board, position),
            turn: {
                ...s.turn,
                phase: "tile-pending",
                pendingTile: { ...effect, roll, delta, fromPosition: player.position },
            },
        };
    });
}

// Les cases a cible n'acceptent qu'une cible eligible ; s'il n'y en a aucune,
// l'effet est perdu (targetId ignore).
export function tileNeedsTarget(s, pendingTile) {
    if (pendingTile?.kind !== "bonus" || !getBonusDef(pendingTile.id)?.needsTarget) return false;
    return eligibleTargets(s.turn.playerId, s).length > 0;
}

// Applique l'effet de la case annoncee et retourne le nouvel etat (fonction
// pure hors hasard, pour que l'interface puisse animer le deplacement avant de
// valider). COMBO : si l'effet deplace le joueur sur une autre case speciale,
// celle-ci est consommee et annoncee a son tour ; turn.tileChain garde les
// effets deja joues. La chaine est finie : chaque case n'est touchee qu'une fois.
export function computeTileEffect(s, targetId = null) {
    // "tile-target" : ancien nom de la phase (parties en cours).
    if (!["tile-pending", "tile-target"].includes(s.turn.phase) || !s.turn.pendingTile) return s;
    const player = s.players.find((p) => p.id === s.turn.playerId);
    if (!player) return s;

    const { roll, delta, fromPosition, ...effect } = s.turn.pendingTile;
    let target = null;
    if (tileNeedsTarget(s, s.turn.pendingTile)) {
        if (!eligibleTargets(player.id, s).some((t) => t.id === targetId)) return s;
        target = targetId;
    }
    const turnStart = fromPosition ?? player.position - delta;
    const applied = applyTileEffect(s.players, effect, player.id, target, {
        length: s.track.length,
        fromPosition: turnStart,
    });
    const chain = [...(s.turn.tileChain ?? []), applied.info];

    const moved = applied.players.find((p) => p.id === player.id);
    const nextEffect = moved.position !== player.position ? tileEffectAt(s, moved.position) : null;
    if (nextEffect) {
        return {
            ...s,
            players: applied.players,
            board: consumeTile(s.board, moved.position),
            turn: {
                ...s.turn,
                phase: "tile-pending",
                pendingTile: { ...nextEffect, roll, delta, fromPosition: turnStart },
                tileChain: chain,
            },
        };
    }

    const result = { type: "dice", roll, delta, tile: chain[0] };
    if (chain.length > 1) Object.assign(result, { tiles: chain, combo: chain.length });
    return finishTurn(s, player, applied.players, result);
}

export function resolveTileEffect(targetId = null) {
    setState((s) => computeTileEffect(s, targetId));
}

export function resolveDiceRoll(roll) {
    if (roll !== DIE_BONUS_FACE) {
        resolveDiceMove(roll);
        return;
    }
    applyTurn((s, player) => {
        const bonus = drawBoxBonus(s);
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
    setState((s) =>
        withFreshBoard(
            {
                ...s,
                players: s.players.map((p) => ({ ...p, position: 0, bonuses: [], frozen: false, shielded: false })),
                winnerId: null,
                turn: { date: null, playerId: null, phase: "idle", lastResult: null },
            },
            true
        )
    );
}

// Changer l'objectif de la course n'a de sens qu'en redemarrant une course
// (les positions deja jouees ne veulent plus rien dire avec un nouveau but).
export function setTrackLength(length) {
    setState((s) =>
        withFreshBoard(
            {
                ...s,
                track: { length },
                players: s.players.map((p) => ({ ...p, position: 0, bonuses: [], frozen: false, shielded: false })),
                winnerId: null,
                turn: { date: null, playerId: null, phase: "idle", lastResult: null },
            },
            true
        )
    );
}
