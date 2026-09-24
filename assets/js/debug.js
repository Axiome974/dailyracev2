import { setState } from "./state.js";
import { getBonusDef } from "./bonuses.js";
import { withFreshBoard } from "./tiles.js";

// Outils du menu debug : modifier directement scores, inventaires et etats
// des joueurs, sans passer par les regles du jeu. Le gagnant est recalcule a
// chaque modification de position.
const MAX_BONUSES = 2;

function withWinner(s, players) {
    const current = players.find((p) => p.id === s.winnerId && p.position >= s.track.length);
    const winner = current ?? players.find((p) => p.position >= s.track.length);
    return { ...s, players, winnerId: winner ? winner.id : null };
}

function updatePlayer(id, fn) {
    setState((s) => withWinner(s, s.players.map((p) => (p.id === id ? fn(p, s) : p))));
}

export function debugSetPosition(id, position) {
    updatePlayer(id, (p, s) => ({ ...p, position: Math.max(0, Math.min(s.track.length, Math.round(position))) }));
}

export function debugAddBonus(id, bonusId) {
    const def = getBonusDef(bonusId);
    if (!def) return;
    updatePlayer(id, (p) =>
        p.bonuses.length >= MAX_BONUSES ? p : { ...p, bonuses: [...p.bonuses, { ...def, uid: crypto.randomUUID() }] }
    );
}

export function debugRemoveBonus(id, uid) {
    updatePlayer(id, (p) => ({ ...p, bonuses: p.bonuses.filter((b) => b.uid !== uid) }));
}

// value : false, true (givre) ou "puncture" (crevaison).
export function debugSetFrozen(id, value) {
    updatePlayer(id, (p) => ({ ...p, frozen: value }));
}

export function debugSetShielded(id, value) {
    updatePlayer(id, (p) => ({ ...p, shielded: value }));
}

// Remet le tour a zero (utile si une partie reste bloquee au milieu d'un tour).
export function debugResetTurn() {
    setState((s) => ({ ...s, turn: { date: null, playerId: null, phase: "idle", lastResult: null } }));
}

export function debugRedrawBoard() {
    setState((s) => withFreshBoard(s, true));
}
