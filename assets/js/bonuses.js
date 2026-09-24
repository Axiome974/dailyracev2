import { getState, setState } from "./state.js";

// Catalogue des bonus. Tous s'activent volontairement depuis l'inventaire en
// debut de tour (ou immediatement s'ils sont ramasses sur une case du plateau).
export const BONUS_CATALOG = [
    {
        id: "send-back",
        label: "Retour au stand",
        icon: "⏪",
        description: "Renvoie un adversaire à la case départ.",
        needsTarget: true,
    },
    {
        id: "swap",
        label: "Échange de place",
        icon: "🔀",
        description: "Échange ta position avec un adversaire.",
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
        description: "Tu avances de 2 cases supplémentaires.",
        needsTarget: false,
    },
    {
        id: "shield",
        label: "Bouclier",
        icon: "🛡️",
        description: "Une fois activé, annule le prochain bonus négatif reçu.",
        needsTarget: false,
    },
    {
        id: "twister",
        label: "Twister",
        icon: "🌀",
        description: "Redistribue aléatoirement les positions de tous les joueurs.",
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
// Taux d'apparition : chaque bonus a un poids relatif (0 a 10, defaut 1 ;
// 0 = jamais) et deux sources autorisees ou non (defaut : oui) :
// "board" = case bonus du plateau, "box" = boite bonus (face 🎁 du de).
export function bonusDropConfig(id, s = getState()) {
    const sources = s.bonusSources?.[id] ?? {};
    return { weight: s.bonusWeights?.[id] ?? 1, board: sources.board ?? true, box: sources.box ?? true };
}

// Tirage pondere dans pool = [{ item, weight }] ; null si rien de tirable.
export function weightedPick(pool) {
    const candidates = pool.filter((x) => x.weight > 0);
    const total = candidates.reduce((sum, x) => sum + x.weight, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const x of candidates) {
        r -= x.weight;
        if (r <= 0) return x.item;
    }
    return candidates[candidates.length - 1].item;
}

// source : "board" ou "box". Retourne null si aucun bonus n'y est autorise.
export function drawRandomBonus(source, s = getState()) {
    return weightedPick(
        BONUS_CATALOG.map((b) => {
            const cfg = bonusDropConfig(b.id, s);
            return { item: b, weight: cfg[source] ? cfg.weight : 0 };
        })
    );
}

// Faux si aucun bonus ne peut sortir d'une boite : le de perd alors sa face 🎁.
export function boxBonusAvailable(s = getState()) {
    return BONUS_CATALOG.some((b) => {
        const cfg = bonusDropConfig(b.id, s);
        return cfg.box && cfg.weight > 0;
    });
}

export function setBonusWeight(bonusId, weight) {
    setState((s) => ({
        ...s,
        bonusWeights: { ...s.bonusWeights, [bonusId]: weight },
    }));
}

export function setBonusSource(bonusId, source, allowed) {
    setState((s) => ({
        ...s,
        bonusSources: { ...s.bonusSources, [bonusId]: { ...s.bonusSources?.[bonusId], [source]: allowed } },
    }));
}

// Remet tous les taux d'apparition (bonus et malus) par defaut.
export function resetDropRates() {
    setState((s) => ({ ...s, bonusWeights: {}, bonusSources: {}, malusWeights: {}, malusSources: {} }));
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
export function eligibleTargets(ownerId, s = getState()) {
    return s.players.filter((p) => p.id !== ownerId && p.id !== s.winnerId && !p.onVacation);
}

// Applique l'effet d'un bonus (inventaire ou case bonus du plateau).
// Si la cible a un bouclier ACTIVE (p.shielded), il est consomme et annule
// l'effet ; un bouclier encore dans l'inventaire ne protege pas.
export function applyBonusEffect(players, { bonusId, ownerId, targetId, length }) {
    const hasShield = (id) => Boolean(players.find((p) => p.id === id)?.shielded);
    const consumeShield = (id) => players.map((p) => (p.id === id ? { ...p, shielded: false } : p));

    let blocked = false;
    if (targetId && hasShield(targetId)) {
        players = consumeShield(targetId);
        blocked = true;
    }

    if (!blocked) {
        switch (bonusId) {
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
            case "shield":
                players = players.map((p) => (p.id === ownerId ? { ...p, shielded: true } : p));
                break;
            case "givre":
                players = players.map((p) => (p.id === targetId ? { ...p, frozen: true } : p));
                break;
            default:
                break;
        }
    }

    return { players, blocked };
}

// Utiliser un bonus se fait en debut de tour, avant le lancer de de (qui a
// lieu quand meme ensuite) : seul le joueur tire au sort peut jouer un de ses
// bonus actifs, une seule fois par tour, pendant la phase "drawn". Les bonus passifs (bouclier) ne
// passent jamais par ici, ils se declenchent automatiquement en defense.
export function useBonus(ownerId, bonusUid, targetId) {
    setState((s) => {
        if (s.turn.phase !== "drawn" || s.turn.playerId !== ownerId || s.turn.bonusUsed) return s;

        const owner = s.players.find((p) => p.id === ownerId);
        const bonus = owner?.bonuses.find((b) => b.uid === bonusUid);
        if (!owner || !bonus) return s;
        if (bonus.needsTarget && !targetId) return s;

        const { players: affected, blocked } = applyBonusEffect(s.players, {
            bonusId: bonus.id,
            ownerId,
            targetId,
            length: s.track.length,
        });
        const players = affected.map((p) =>
            p.id === ownerId ? { ...p, bonuses: removeFirst(p.bonuses, (b) => b.uid === bonusUid) } : p
        );

        const winner = players.find((p) => p.position >= s.track.length);
        const targetName = targetId ? s.players.find((p) => p.id === targetId)?.name : null;

        // Le tour continue : apres son bonus, le joueur lance quand meme le de.
        return {
            ...s,
            players,
            winnerId: winner ? winner.id : s.winnerId,
            turn: {
                ...s.turn,
                bonusUsed: { type: "bonus-used", bonusId: bonus.id, targetName, blocked },
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
