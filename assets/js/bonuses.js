import { getState, setState } from "./state.js";

// Catalogue de bonus a definir/completer plus tard. Chaque entree decrit
// son effet ; "passive: true" = ne se declenche pas via un bouton, reste
// en reserve jusqu'a etre consomme par un effet adverse (ex: bouclier).
export const BONUS_CATALOG = [
    {
        id: "send-back",
        label: "Retour au stand",
        icon: "⏪",
        description: "Renvoie un adversaire a la case depart.",
        needsTarget: true,
    },
    {
        id: "swap",
        label: "Echange de place",
        icon: "🔀",
        description: "Echange ta position avec un adversaire.",
        needsTarget: true,
    },
    {
        id: "sabotage",
        label: "Sabotage",
        icon: "💣",
        description: "Un adversaire recule de 2 cases.",
        needsTarget: true,
    },
    {
        id: "boost",
        label: "Coup de boost",
        icon: "⚡",
        description: "Tu avances de 2 cases supplementaires.",
        needsTarget: false,
    },
    {
        id: "shield",
        label: "Bouclier",
        icon: "🛡️",
        description: "Annule automatiquement le prochain bonus negatif recu.",
        needsTarget: false,
        passive: true,
    },
    {
        id: "twister",
        label: "Twister",
        icon: "🌀",
        description: "Redistribue aleatoirement les positions de tous les joueurs.",
        needsTarget: false,
    },
    {
        id: "givre",
        label: "Givre",
        icon: "❄️",
        description: "Givre un adversaire : il passera son prochain tour.",
        needsTarget: true,
    },
];

export function getBonusDef(id) {
    return BONUS_CATALOG.find((b) => b.id === id);
}

// Tirage pondere : state.bonusWeights associe un poids relatif a chaque id de
// bonus (absent ou non defini = poids 1, valeur par defaut). Un poids de 0
// retire completement le bonus du tirage, sans avoir a toucher au catalogue.
export function drawRandomBonus() {
    const weights = getState().bonusWeights ?? {};
    const pool = BONUS_CATALOG.map((b) => ({ b, w: weights[b.id] ?? 1 })).filter((x) => x.w > 0);
    if (pool.length === 0) return BONUS_CATALOG[0];

    const total = pool.reduce((sum, x) => sum + x.w, 0);
    let r = Math.random() * total;
    for (const x of pool) {
        r -= x.w;
        if (r <= 0) return x.b;
    }
    return pool[pool.length - 1].b;
}

export function setBonusWeight(bonusId, weight) {
    setState((s) => ({
        ...s,
        bonusWeights: { ...s.bonusWeights, [bonusId]: weight },
    }));
}

export function resetBonusWeights() {
    setState((s) => ({ ...s, bonusWeights: {} }));
}

function clamp(pos, length) {
    return Math.max(0, Math.min(length, pos));
}

function removeFirst(arr, pred) {
    const idx = arr.findIndex(pred);
    if (idx === -1) return arr;
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

// Cible legitime pour un bonus adverse: tout joueur autre que le proprietaire,
// hors gagnant deja arrive, et hors joueurs en vacances (immunises).
export function eligibleTargets(ownerId) {
    const s = getState();
    return s.players.filter((p) => p.id !== ownerId && p.id !== s.winnerId && !p.onVacation);
}

// Utiliser un bonus est le 4eme choix du tour : seul le joueur tire au sort
// peut jouer un de ses bonus actifs, et uniquement pendant la phase "drawn"
// (avant d'avoir choisi une des 4 actions). Les bonus passifs (bouclier) ne
// passent jamais par ici, ils se declenchent automatiquement en defense.
export function useBonus(ownerId, bonusUid, targetId) {
    setState((s) => {
        if (s.turn.phase !== "drawn" || s.turn.playerId !== ownerId) return s;

        const owner = s.players.find((p) => p.id === ownerId);
        const bonus = owner?.bonuses.find((b) => b.uid === bonusUid);
        if (!owner || !bonus || bonus.passive) return s;
        if (bonus.needsTarget && !targetId) return s;

        const length = s.track.length;
        let players = s.players;

        const hasShield = (id) => players.find((p) => p.id === id)?.bonuses.some((b) => b.id === "shield");
        const consumeShield = (id) =>
            players.map((p) => (p.id === id ? { ...p, bonuses: removeFirst(p.bonuses, (b) => b.id === "shield") } : p));

        let blocked = false;
        if (targetId && hasShield(targetId)) {
            players = consumeShield(targetId);
            blocked = true;
        }

        if (!blocked) {
            switch (bonus.id) {
                case "send-back":
                    players = players.map((p) => (p.id === targetId ? { ...p, position: 0 } : p));
                    break;
                case "swap": {
                    const a = players.find((p) => p.id === ownerId);
                    const b = players.find((p) => p.id === targetId);
                    if (a && b) {
                        const posA = a.position;
                        players = players.map((p) => {
                            if (p.id === ownerId) return { ...p, position: b.position };
                            if (p.id === targetId) return { ...p, position: posA };
                            return p;
                        });
                    }
                    break;
                }
                case "sabotage":
                    players = players.map((p) => (p.id === targetId ? { ...p, position: clamp(p.position - 2, length) } : p));
                    break;
                case "boost":
                    players = players.map((p) => (p.id === ownerId ? { ...p, position: clamp(p.position + 2, length) } : p));
                    break;
                case "twister": {
                    const positions = players.map((p) => p.position);
                    for (let i = positions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [positions[i], positions[j]] = [positions[j], positions[i]];
                    }
                    players = players.map((p, idx) => ({ ...p, position: positions[idx] }));
                    break;
                }
                case "givre":
                    players = players.map((p) => (p.id === targetId ? { ...p, frozen: true } : p));
                    break;
                default:
                    break;
            }
        }

        players = players.map((p) =>
            p.id === ownerId ? { ...p, bonuses: removeFirst(p.bonuses, (b) => b.uid === bonusUid) } : p
        );

        const winner = players.find((p) => p.position >= length);
        const targetName = targetId ? s.players.find((p) => p.id === targetId)?.name : null;

        return {
            ...s,
            players,
            winnerId: winner ? winner.id : s.winnerId,
            turn: {
                ...s.turn,
                phase: "resolved",
                lastResult: { type: "bonus-used", bonusId: bonus.id, targetName, blocked },
            },
            log: [
                {
                    id: crypto.randomUUID(),
                    type: "bonus-used",
                    ownerId,
                    ownerName: owner.name,
                    targetId,
                    targetName,
                    bonusId: bonus.id,
                    blocked,
                },
                ...s.log,
            ].slice(0, 30),
        };
    });
}
