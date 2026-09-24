import { getState, setState } from "./state.js";
import { getBonusDef, drawRandomBonus, applyBonusEffect, weightedPick } from "./bonuses.js";

// Cases speciales du plateau : a la fin de chaque tour (donc avant chaque
// nouveau tirage), le plateau est redistribue : un nombre aleatoire (entre le
// min et le max des reglages) de cases recoivent un bonus ou un malus, tires
// selon les taux d'apparition. Le joueur qui s'y arrete avec son de le
// subit/l'utilise immediatement (jamais stocke dans l'inventaire), puis la
// case redevient normale jusqu'a la prochaine redistribution.
// La disposition est gardee dans l'etat (state.board) pour survivre a un
// rafraichissement ; drawId identifie chaque redistribution (animation).

export const MALUS_CATALOG = [
    {
        id: "pothole",
        label: "Nid-de-poule",
        icon: "🕳️",
        description: "Tu recules de 2 cases.",
    },
    {
        id: "oil",
        label: "Flaque d'huile",
        icon: "🛢️",
        description: "Tu glisses et reviens à ta case de départ du tour.",
    },
    {
        id: "puncture",
        label: "Crevaison",
        icon: "🔧",
        description: "Tu passeras ton prochain tour.",
    },
    {
        id: "pickpocket",
        label: "Pickpocket",
        icon: "🦝",
        description: "Tu perds un bonus de ton inventaire au hasard.",
    },
];

export function getMalusDef(id) {
    return MALUS_CATALOG.find((m) => m.id === id);
}

// Taux d'apparition des malus : poids relatif (0 a 10, defaut 1) et presence
// autorisee sur le plateau (seule source possible d'un malus).
export function malusDropConfig(id, s = getState()) {
    return { weight: s.malusWeights?.[id] ?? 1, board: s.malusSources?.[id]?.board ?? true };
}

function drawRandomMalus(s) {
    return weightedPick(
        MALUS_CATALOG.map((m) => {
            const cfg = malusDropConfig(m.id, s);
            return { item: m, weight: cfg.board ? cfg.weight : 0 };
        })
    );
}

export function setMalusWeight(malusId, weight) {
    setState((s) => ({ ...s, malusWeights: { ...s.malusWeights, [malusId]: weight } }));
}

export function setMalusSource(malusId, allowed) {
    setState((s) => ({ ...s, malusSources: { ...s.malusSources, [malusId]: { board: allowed } } }));
}

// effect = { kind: "bonus" | "malus", id }
export function tileEffectDef(effect) {
    if (!effect) return null;
    return effect.kind === "bonus" ? getBonusDef(effect.id) : getMalusDef(effect.id);
}

function clampInt(n, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(n))));
}

// Seules les cases entre le depart et l'arrivee peuvent etre speciales.
// Bonus et malus ont chacun leur plage [min, max] ; par defaut 1 a 1/8 du
// plateau (arrondi au-dessus) chacun, soit ~1/4 du plateau au maximum.
export function tileEffectBounds(s = getState()) {
    const slots = Math.max(0, s.track.length - 1);
    const defaultMax = Math.min(slots, Math.max(1, Math.ceil(s.track.length / 8)));
    const cfg = s.tileEffects ?? {};
    const range = (minKey, maxKey) => {
        const max = clampInt(cfg[maxKey] ?? defaultMax, 0, slots);
        const min = clampInt(cfg[minKey] ?? Math.min(1, max), 0, max);
        return { min, max };
    };
    return { bonus: range("bonusMin", "bonusMax"), malus: range("malusMin", "malusMax"), slots };
}

function randomBetween({ min, max }) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function generateBoard(s) {
    const { bonus, malus, slots } = tileEffectBounds(s);

    const cells = Array.from({ length: slots }, (_, i) => i + 1);
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // Les cases sont distribuees une par une ; s'il n'y en a pas assez pour
    // tout le monde, les dernieres sont simplement ignorees.
    const effects = {};
    const bonusCount = randomBetween(bonus);
    const malusCount = randomBetween(malus);
    let next = 0;
    for (let i = 0; i < bonusCount && next < cells.length; i++) {
        const drawn = drawRandomBonus("board", s);
        if (!drawn) break;
        effects[cells[next++]] = { kind: "bonus", id: drawn.id };
    }
    for (let i = 0; i < malusCount && next < cells.length; i++) {
        const m = drawRandomMalus(s);
        if (!m) break;
        effects[cells[next++]] = { kind: "malus", id: m.id };
    }
    return { drawId: crypto.randomUUID(), length: s.track.length, effects };
}

// Un plateau n'est plus valable si l'objectif de la course a change.
function boardIsCurrent(s) {
    return Boolean(s.board) && s.board.length === s.track.length;
}

// force = redistribuer meme si un plateau valable existe deja (fin de tour,
// nouvelle course, nouveaux reglages).
export function withFreshBoard(s, force = false) {
    if (!force && boardIsCurrent(s)) return s;
    return { ...s, board: generateBoard(s) };
}

// Premier chargement (ou ancienne partie) : pose un plateau s'il en manque un.
export function ensureBoard() {
    if (boardIsCurrent(getState())) return;
    setState((s) => withFreshBoard(s));
}

export function countTileEffects(s) {
    return Object.keys(s.board?.effects ?? {}).length;
}

// cfg = { bonusMin, bonusMax, malusMin, malusMax }
export function setTileEffectBounds(cfg) {
    setState((s) => withFreshBoard({ ...s, tileEffects: cfg }, true));
}

export function tileEffectAt(s, position) {
    if (!boardIsCurrent(s) || position <= 0 || position >= s.track.length) return null;
    return s.board.effects?.[position] ?? null;
}

export function consumeTile(board, position) {
    const effects = { ...board.effects };
    delete effects[position];
    return { ...board, effects };
}

function applyMalus(players, malusId, playerId, { length, fromPosition }) {
    const player = players.find((p) => p.id === playerId);
    let lost = null;
    let updated = player;

    switch (malusId) {
        case "pothole":
            updated = { ...player, position: Math.max(0, Math.min(length, player.position - 2)) };
            break;
        case "oil":
            updated = { ...player, position: fromPosition };
            break;
        case "puncture":
            updated = { ...player, frozen: "puncture" };
            break;
        case "pickpocket":
            if (player.bonuses.length > 0) {
                const idx = Math.floor(Math.random() * player.bonuses.length);
                const b = player.bonuses[idx];
                lost = { id: b.id, label: b.label, icon: b.icon };
                updated = { ...player, bonuses: player.bonuses.filter((_, i) => i !== idx) };
            }
            break;
        default:
            break;
    }

    return { players: players.map((p) => (p.id === playerId ? updated : p)), lost };
}

// Retourne les joueurs modifies et un resume de ce qui s'est passe (stocke
// dans le resultat du tour et le journal).
export function applyTileEffect(players, effect, playerId, targetId, { length, fromPosition }) {
    const def = tileEffectDef(effect);
    const info = { kind: effect.kind, id: effect.id };

    if (effect.kind === "bonus") {
        if (def?.needsTarget && !targetId) {
            return { players, info: { ...info, fizzled: true } };
        }
        const { players: affected, blocked } = applyBonusEffect(players, {
            bonusId: effect.id,
            ownerId: playerId,
            targetId,
            length,
        });
        const targetName = targetId ? players.find((p) => p.id === targetId)?.name ?? null : null;
        return { players: affected, info: { ...info, blocked, targetName } };
    }

    const { players: affected, lost } = applyMalus(players, effect.id, playerId, { length, fromPosition });
    return { players: affected, info: { ...info, lost } };
}
