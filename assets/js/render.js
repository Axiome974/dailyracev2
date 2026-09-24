import { getBonusDef, eligibleTargets, BONUS_CATALOG } from "./bonuses.js";
import { MALUS_CATALOG, tileEffectAt, tileEffectDef } from "./tiles.js";
import { canDrawToday, DIE_BONUS_FACE, dieFaces, tileNeedsTarget } from "./game.js";
import { AVATARS } from "./players.js";

const boardEl = document.getElementById("board");
const playersListEl = document.getElementById("players-list");
const podiumEl = document.getElementById("podium");
const leaderLineEl = document.getElementById("leader-line");
const trackGoalEl = document.getElementById("track-goal");
const drawControlsEl = document.getElementById("draw-controls");
const turnModalEl = document.getElementById("turn-modal");
const revealEl = turnModalEl.querySelector(".reveal");
const turnContentEl = document.getElementById("turn-content");
const confettiEl = document.getElementById("turn-confetti");
const turnConsoleEl = document.getElementById("turn-console");
const consoleConfettiEl = document.getElementById("console-confetti");
const headingEyebrowEl = document.getElementById("heading-eyebrow");
const headingTitleEl = document.getElementById("heading-title");
const headingSubEl = document.getElementById("heading-sub");
// Bandeau de titre optionnel (peut etre retire de la page).
const HEADING_DEFAULT = headingTitleEl
    ? { eyebrow: headingEyebrowEl.innerHTML, title: headingTitleEl.innerHTML, sub: headingSubEl.innerHTML }
    : null;
const logListEl = document.getElementById("log-list");
const avatarPickerEl = document.getElementById("avatar-picker");
const bonusCatalogListEl = document.getElementById("bonus-catalog-list");

const CONFETTI_COLORS = ["#d9ff43", "#ffab64", "#80d7ff", "#f788d0"];

// Catalogue statique : ne depend pas de l'etat de la partie, rendu une seule fois.
const catalogItem = (b, cls = "") => `
    <li class="peek-item${cls}">
        <span class="peek-item__icon">${esc(b.icon)}</span>
        <span>
            <strong>${esc(b.label)}</strong>
            <small>${esc(b.description)}</small>
        </span>
    </li>
`;
bonusCatalogListEl.innerHTML = `
    <li class="peek-section">⚡ Bonus <small>Gagnés au dé (🎁) : ils rejoignent l'inventaire et s'activent en début de tour. Ramassés sur une case bonus du plateau : effet immédiat.</small></li>
    ${BONUS_CATALOG.map((b) => catalogItem(b, " peek-item--bonus")).join("")}
    <li class="peek-section">☠️ Malus <small>Redistribués sur le plateau à chaque nouveau tirage : s'arrêter dessus, c'est les subir.</small></li>
    ${MALUS_CATALOG.map((m) => catalogItem(m, " peek-item--malus")).join("")}
`;

export function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[c]);
}

function playerName(state, id) {
    return state.players.find((p) => p.id === id)?.name ?? "?";
}

function sortedPlayers(state) {
    return [...state.players].sort((a, b) => b.position - a.position);
}

// Delai stable (pas Math.random a chaque rendu) derive de l'id du joueur,
// pour que les pastilles "bonus" ne brillent pas toutes en meme temps.
function stableDelay(id, maxSeconds = 3.2) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return ((hash % 1000) / 1000) * maxSeconds;
}

let lastState = null;
let lastUi = null;

export function renderAll(state, ui) {
    lastState = state;
    lastUi = ui;
    refreshInventoryPopover(state);
    renderGoal(state);
    renderHeading(state, ui);
    renderBoard(state, ui);
    renderPlayers(state);
    renderPodium(state);
    renderConsole(state, ui);
    renderModal(state, ui);
    renderLog(state);
}

function currentPlayer(state) {
    if (state.winnerId || state.turn.phase === "idle") return null;
    return state.players.find((p) => p.id === state.turn.playerId) ?? null;
}

// Etape locale de la phase "drawn" : "ask" (utiliser un bonus ?), "pick"
// (choix du bonus), "target" (choix de la cible du bonus choisi) ou "roll".
function turnStep(state, ui) {
    if (state.turn.phase !== "drawn") return null;
    const current = currentPlayer(state);
    if (!current) return null;
    if (state.turn.bonusUsed || current.bonuses.length === 0) return "roll";
    const step = ui?.turnStep ?? "ask";
    if (step === "target" && !current.bonuses.some((b) => b.uid === ui?.selectedBonusUid)) return "pick";
    return step;
}

const STEP_HINTS = {
    ask: "Utiliser un bonus ou lancer le dé ? Le plateau t'aide à décider.",
    pick: "Choisis le bonus à jouer.",
    target: "Choisis ta cible : les pions ciblables clignotent sur le plateau.",
    roll: "Les cases atteignables (+1 à +3) sont en surbrillance sur le plateau.",
    "tile-target": "Case bonus ! Choisis ta cible directement sur le plateau.",
    "tile-pending": "Case spéciale ! Regarde ce qui t'attend, puis poursuis.",
    "bonus-full": "Inventaire plein : remplacer un bonus ou garder les tiens ?",
    resolved: "Tour joué. Clique sur « Continuer la course » pour rendre la main.",
};

function renderHeading(state, ui) {
    if (!HEADING_DEFAULT) return;
    let view = HEADING_DEFAULT;
    const current = currentPlayer(state);
    if (state.winnerId) {
        view = {
            eyebrow: "🏆 COURSE TERMINÉE",
            title: `${esc(playerName(state, state.winnerId))} <em>GAGNE !</em>`,
            sub: "Lance une nouvelle course pour remettre les compteurs à zéro.",
        };
    } else if (current) {
        view = {
            eyebrow: "⚡ TOUR EN COURS",
            title: `${esc(current.avatar)} ${esc(current.name)} <em>EN PISTE</em>`,
            sub: STEP_HINTS[turnStep(state, ui) ?? state.turn.phase] ?? HEADING_DEFAULT.sub,
        };
    }
    if (headingTitleEl.innerHTML !== view.title) headingTitleEl.innerHTML = view.title;
    headingEyebrowEl.innerHTML = view.eyebrow;
    headingSubEl.innerHTML = view.sub;
}

function renderGoal(state) {
    const length = state.track.length;
    trackGoalEl.textContent = `OBJECTIF : ${length} CASES`;

    const leader = sortedPlayers(state)[0];
    if (state.winnerId) {
        leaderLineEl.innerHTML = `🏆 <b>${esc(playerName(state, state.winnerId))}</b> a gagné la course`;
    } else if (leader) {
        leaderLineEl.innerHTML = `<b>${esc(leader.name)}</b> mène la course`;
    } else {
        leaderLineEl.innerHTML = `<b>—</b>`;
    }
}

function renderDrawControls(state) {
    let title;
    let body;

    if (state.winnerId) {
        title = `${esc(playerName(state, state.winnerId))} a gagné !`;
        body = `<button class="primary draw-box__button" type="button" data-action="new-race">NOUVELLE COURSE <span aria-hidden="true">🔁</span></button>`;
    } else if (state.players.length < 2) {
        title = "Il faut du monde en piste";
        body = `<p class="draw-box__note">Ajoute au moins 2 joueurs pour lancer le tirage du jour.</p>`;
    } else if (!canDrawToday(state)) {
        title = "Tout le monde est en vacances";
        body = `<p class="draw-box__note">🌴 Impossible de lancer un tirage.</p>`;
    } else {
        title = "Qui entre en piste ?";
        body = `<button class="primary draw-box__button" type="button" data-action="draw">LANCER LE TIRAGE <span aria-hidden="true">↗</span></button>`;
    }

    drawControlsEl.innerHTML = `
        <span class="draw-box__kicker">🎲 LE TIRAGE DU JOUR</span>
        <p class="draw-box__title">${title}</p>
        ${body}
    `;
}

/* ---------- Console du tour ---------- */

let lastBurstKey = null;
const narrowQuery = window.matchMedia("(max-width: 1000px)");

// Sur ecran etroit, la console est fixee en bas pendant un tour : on reserve
// sa hauteur en bas de page pour pouvoir faire defiler tout le plateau.
function syncConsoleSpace() {
    const live = turnConsoleEl.classList.contains("draw-box--live") && narrowQuery.matches;
    document.body.style.paddingBottom = live ? `${turnConsoleEl.offsetHeight + 16}px` : "";
}

new ResizeObserver(syncConsoleSpace).observe(turnConsoleEl);
narrowQuery.addEventListener("change", syncConsoleSpace);

function renderConsole(state, ui) {
    const current = currentPlayer(state);
    turnConsoleEl.classList.toggle("draw-box--live", Boolean(current));

    if (!current) {
        turnConsoleEl.classList.remove("draw-box--fail");
        lastBurstKey = null;
        renderDrawControls(state);
        syncConsoleSpace();
        return;
    }

    const { html, tone } = renderTurn(state, ui, current);
    drawControlsEl.innerHTML = `<div class="console">${html}</div>`;
    turnConsoleEl.classList.toggle("draw-box--fail", tone === "fail");

    // Confettis a chaque nouveau resultat, une seule fois meme si l'etat est
    // re-rendu (sync distante).
    const burstKey = state.turn.phase === "resolved" ? `${state.log[0]?.id}` : null;
    if (burstKey && burstKey !== lastBurstKey && tone !== "fail") burstConfetti(consoleConfettiEl);
    lastBurstKey = burstKey;
    syncConsoleSpace();
}

/* ---------- Modale : intro du tirage et victoire ---------- */

function renderModal(state, ui) {
    // Pendant l'intro du tirage, c'est app.js qui pilote la modale.
    if (ui?.introStage) return;
    revealEl.classList.toggle("reveal--victory", Boolean(state.winnerId));
    turnModalEl.classList.toggle("hidden", !state.winnerId);
    if (!state.winnerId) return;

    const winner = state.players.find((p) => p.id === state.winnerId);
    turnContentEl.innerHTML = `
        <div class="victory__sunburst"></div>
        <div class="cap">🏆 VICTOIRE</div>
        <span class="reveal-avatar reveal-avatar--victory">${esc(winner?.avatar ?? "🎉")}</span>
        <h2>${esc(winner?.name ?? "?")} <span>GAGNE !</span></h2>
        <p>remporte la course !</p>
        <div class="podium podium--victory">${podiumMarkup(state)}</div>
        <button class="primary resultbtn" type="button" data-action="new-race">🔁 NOUVELLE COURSE</button>
    `;
}

export function openTurnModal() {
    revealEl.classList.remove("reveal--victory");
    turnModalEl.classList.remove("hidden");
}

export function closeTurnModal() {
    turnModalEl.classList.add("hidden");
}

export function renderSpinFrame(player) {
    turnContentEl.innerHTML = `
        <div class="cap">LE TIRAGE COMMENCE</div>
        <span class="reveal-avatar reveal-avatar--spin">${esc(player.avatar)}</span>
        <h2>${esc(player.name)} <span>?</span></h2>
        <p>La grille retient son souffle…</p>
    `;
}

// player = joueur tel qu'il etait au moment du tirage (vacances/givre inclus) ;
// substitute = joueur qui prend la parole a sa place s'il est en vacances.
export function renderIntroFrame(player, substitute = null) {
    const name = esc(player.name);
    let title = `${name} <span>entre en piste !</span>`;
    let desc = "À toi de jouer, le plateau reste sous tes yeux.";
    if (player.onVacation) {
        title = `${name} <span>est en vacances 🌴</span>`;
        desc = "Pilote automatique : le dé est lancé pour lui/elle.";
    } else if (player.frozen) {
        title = `${name} <span>est bloqué(e) !</span>`;
        desc = "Il/elle passe son tour.";
    }
    const avatar =
        player.onVacation && substitute
            ? `<span class="reveal-avatar reveal-avatar--handover">
                   <span title="${esc(player.name)} (en vacances)">${esc(player.avatar)}</span>
                   <span class="reveal-avatar__arrow" aria-hidden="true">➜</span>
                   <span title="${esc(substitute.name)} prend la parole">${esc(substitute.avatar)}</span>
               </span>`
            : `<span class="reveal-avatar">${esc(player.avatar)}</span>`;
    if (player.onVacation && substitute) {
        desc = `Pilote automatique : le dé est lancé pour lui/elle. <strong class="substitute-name">${esc(substitute.name)}</strong> prend la parole en premier au daily !`;
    }
    turnContentEl.innerHTML = `
        <div class="cap">PILOTE DU JOUR</div>
        ${avatar}
        <h2>${title}</h2>
        <p>${desc}</p>
        <button class="primary resultbtn" type="button" data-action="close-intro">C'est parti !</button>
    `;
    turnContentEl.querySelector('[data-action="close-intro"]').focus();
    burstConfetti(confettiEl);
}

function burstConfetti(container) {
    container.innerHTML = Array.from(
        { length: 30 },
        (_, i) =>
            `<i style="--x:${Math.random() * 100}%;--color:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};--rot:${Math.random() * 360}deg;--delay:${Math.random() * 0.45}s"></i>`
    ).join("");
    setTimeout(() => {
        container.innerHTML = "";
    }, 2400);
}

function renderPlayers(state) {
    if (state.players.length === 0) {
        playersListEl.innerHTML = `<li class="empty-hint">Ajoute tes coéquipiers pour lancer la course 👆</li>`;
        return;
    }

    playersListEl.innerHTML = sortedPlayers(state)
        .map((p, i) => {
            const isTurn = state.turn.playerId === p.id && state.turn.phase !== "idle";
            const isWinner = state.winnerId === p.id;
            const classes = ["score-row"];
            if (i === 0) classes.push("score-row--first");
            if (isTurn) classes.push("score-row--turn");
            if (isWinner) classes.push("score-row--winner");
            if (p.onVacation) classes.push("score-row--vacation");

            const hasShield = Boolean(p.shielded);
            const isFrozen = Boolean(p.frozen);

            return `
                <li class="${classes.join(" ")}" style="--player-color:${esc(p.color)}">
                    <span class="score-row__rank">${String(i + 1).padStart(2, "0")}</span>
                    <span class="score-row__avatar-wrap">
                        <button class="score-row__avatar" type="button" data-action="change-avatar" data-player-id="${p.id}" title="Changer d'avatar">${esc(p.avatar)}</button>
                        ${hasShield ? `<span class="status-badge status-badge--shield" title="Protégé par un bouclier"></span>` : ""}
                        ${isFrozen ? `<span class="status-badge status-badge--frozen" title="Givré : passera son prochain tour"></span>` : ""}
                    </span>
                    <span class="score-row__name">${esc(p.name)}${isWinner ? " 🏆" : ""}${p.onVacation ? ` <span title="En vacances">🌴</span>` : ""}</span>
                    <button class="score-row__bonuses${p.bonuses.length > 0 ? " score-row__bonuses--active" : ""}" type="button" data-action="show-inventory" data-player-id="${p.id}" style="--shine-delay:${stableDelay(p.id)}s;" title="Voir l'inventaire (${p.bonuses.length}/2)" aria-label="Voir l'inventaire de ${esc(p.name)}">⚡${p.bonuses.length}</button>
                    <span class="score-row__points"><b>${p.position}</b><small>/ ${state.track.length}</small></span>
                    <span class="score-row__tools">
                        <button class="row-btn${p.onVacation ? " row-btn--active" : ""}" type="button" data-action="toggle-vacation" data-player-id="${p.id}" title="${p.onVacation ? "Revenir de vacances" : "Partir en vacances"}">🌴</button>
                        <button class="row-btn row-btn--remove" type="button" data-action="remove-player" data-player-id="${p.id}" aria-label="Retirer ${esc(p.name)}" title="Retirer">✕</button>
                    </span>
                </li>
            `;
        })
        .join("");
}

// Podium 2-1-3 ; le gagnant (s'il y en a un) est toujours sur la premiere marche.
function podiumMarkup(state) {
    const sorted = sortedPlayers(state);
    if (state.winnerId) {
        const idx = sorted.findIndex((p) => p.id === state.winnerId);
        if (idx > 0) sorted.unshift(...sorted.splice(idx, 1));
    }
    const [first, second, third] = sorted;
    const step = (p, rank) =>
        p
            ? `<div><span class="face">${esc(p.avatar)}</span><b>${esc(p.name)}</b><div class="step">${rank}<small>${p.position} pts</small></div></div>`
            : `<div class="podium__vacant"><span class="face">·</span><b>&nbsp;</b><div class="step">${rank}</div></div>`;
    return step(second, 2) + step(first, 1) + step(third, 3);
}

function renderPodium(state) {
    podiumEl.innerHTML = state.players.length
        ? podiumMarkup(state)
        : `<p class="podium__empty">Le podium attend ses pilotes.</p>`;
}

/* ---------- Plateau ---------- */

const mobileQuery = window.matchMedia("(max-width: 650px)");

mobileQuery.addEventListener("change", () => {
    if (lastState) renderBoard(lastState, lastUi);
});
window.addEventListener("resize", () => requestAnimationFrame(drawRoad));

// Le nombre de colonnes suit la longueur de la course (3 a 50 cases) pour
// garder un plateau lisible ; sur mobile on reste a 5 colonnes.
function boardColumns(tileCount) {
    if (mobileQuery.matches || tileCount <= 15) return 5;
    if (tileCount <= 24) return 6;
    if (tileCount <= 35) return 7;
    return 8;
}

// Parcours en serpentin qui part du bas a gauche et remonte vers l'arrivee.
function tilePlacement(i, cols, rows) {
    const r = Math.floor(i / cols);
    const k = i % cols;
    return { row: rows - r, col: r % 2 === 0 ? k + 1 : cols - k };
}

function moverHighlight(state) {
    if (state.turn.phase !== "resolved" || !state.turn.lastResult) return null;
    const r = state.turn.lastResult;
    if (r.type === "vacation-skip" && r.delta) return { playerId: state.turn.playerId, cls: "success" };
    if (r.type === "dice" || r.type === "advance") {
        return { playerId: state.turn.playerId, cls: r.tile?.kind === "malus" ? "fail" : "success" };
    }
    if (r.type === "megajump") return { playerId: state.turn.playerId, cls: r.success ? "success" : "fail" };
    return null;
}

function capturePilotRects() {
    const rects = {};
    boardEl.querySelectorAll(".pilot").forEach((el) => {
        rects[el.dataset.playerId] = el.getBoundingClientRect();
    });
    return rects;
}

function flipPilots(beforeRects) {
    boardEl.querySelectorAll(".pilot").forEach((el) => {
        const before = beforeRects[el.dataset.playerId];
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (!dx && !dy) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
            el.style.transition = "transform 0.6s cubic-bezier(.34, 1.56, .64, 1)";
            el.style.transform = "translate(0, 0)";
        });
    });
}

// Etats visibles sur le pion : givre / crevaison (passe son tour),
// bouclier en reserve, vacances.
function pilotStatuses(p) {
    const statuses = [];
    if (p.frozen === "puncture") statuses.push({ id: "puncture", icon: "🔧", label: "Crevaison : passe son prochain tour" });
    else if (p.frozen) statuses.push({ id: "frozen", icon: "❄️", label: "Givré : passe son prochain tour" });
    if (p.shielded) statuses.push({ id: "shield", icon: "🛡️", label: "Bouclier activé : bloque le prochain coup" });
    if (p.onVacation) statuses.push({ id: "vacation", icon: "🌴", label: "En vacances" });
    return statuses;
}

function statusBadges(statuses) {
    if (!statuses.length) return "";
    return `<span class="pilot__statuses">${statuses
        .map((st) => `<span class="pilot__status" title="${esc(st.label)}">${st.icon}</span>`)
        .join("")}</span>`;
}

function finishDeco(tileCount, cols, rows) {
    const topRowIndex = rows - 1;
    const used = tileCount - topRowIndex * cols;
    const empty = cols - used;
    if (empty < 2) return "";
    const column = topRowIndex % 2 === 0 ? `${used + 1} / ${cols + 1}` : `1 / ${empty + 1}`;
    return `
        <div class="finish-deco" style="grid-row:1;grid-column:${column}">
            <span>🏆</span><b>LA LIGNE<br>D'ARRIVÉE</b><small>Encore quelques cases…</small>
        </div>
    `;
}

// Aide a la decision pendant le tour : cases atteignables au de (+1 a +3) et
// pions ciblables (cliquables) quand un bonus attend sa cible.
function boardTurnHints(state, ui) {
    const current = currentPlayer(state);
    const reach = new Map();
    let targetAttrs = null;
    if (!current) return { reach, targetAttrs };

    const step = turnStep(state, ui);
    if (step === "ask" || step === "roll") {
        for (let n = 1; n <= 3; n++) {
            const pos = Math.min(state.track.length, current.position + n);
            reach.set(pos, [...(reach.get(pos) ?? []), `+${n}`]);
        }
    }

    let action = null;
    if (step === "target") {
        action = (id) =>
            `data-action="use-bonus" data-owner-id="${current.id}" data-bonus-uid="${esc(ui.selectedBonusUid)}" data-target-id="${id}"`;
    } else if (["tile-pending", "tile-target"].includes(state.turn.phase) && tileNeedsTarget(state, state.turn.pendingTile)) {
        action = (id) => `data-action="tile-target" data-target-id="${id}"`;
    }
    if (action) {
        const ids = new Set(eligibleTargets(current.id, state).map((t) => t.id));
        targetAttrs = (id) => (ids.has(id) ? action(id) : null);
    }
    return { reach, targetAttrs };
}

// Redistribution du plateau (fin de tour) : les nouvelles cases apparaissent
// une par une. undefined = premier rendu de la page, sans animation.
const APPEAR_STAGGER_MS = 90;
let renderedBoardDrawId;

function renderBoard(state, ui) {
    const length = state.track.length;
    const tileCount = length + 1;
    const cols = boardColumns(tileCount);
    const rows = Math.ceil(tileCount / cols);
    const beforeRects = capturePilotRects();
    const highlight = moverHighlight(state);
    const activeId = state.turn.phase !== "idle" ? state.turn.playerId : null;
    const hints = boardTurnHints(state, ui);
    const drawId = state.board?.drawId ?? null;
    const animateAppear = renderedBoardDrawId !== undefined && drawId !== renderedBoardDrawId;
    renderedBoardDrawId = drawId;
    let appearIndex = 0;

    const tiles = [];
    for (let i = 0; i <= length; i++) {
        const { row, col } = tilePlacement(i, cols, rows);
        const occupants = state.players.filter((p) => Math.min(p.position, length) === i);
        const isStart = i === 0;
        const isFinish = i === length;
        const classes = ["tile"];
        if (isStart) classes.push("tile--start");
        if (isFinish) classes.push("tile--finish");
        if (occupants.length) classes.push("tile--busy");
        // Taille des pions selon le monde sur la case (1 a 5+).
        if (occupants.length) classes.push(`tile--pilots-${Math.min(occupants.length, 5)}`);
        const effect = tileEffectAt(state, i);
        const effectDef = tileEffectDef(effect);
        if (effectDef) classes.push(`tile--${effect.kind}`);
        const reachLabel = hints.reach.get(i);
        if (reachLabel) classes.push("tile--reach");
        const label = isStart ? "DÉPART" : isFinish ? "ARRIVÉE" : String(i).padStart(2, "0");
        let symbol = "";
        if (isStart || isFinish) {
            symbol = `<span class="tile-terrain" aria-hidden="true">${isStart ? "🏁" : "🏆"}</span>`;
        } else if (effectDef) {
            const kindLabel = effect.kind === "bonus" ? "Case bonus" : "Case malus";
            const appear = animateAppear
                ? ` tile-effect--appear" style="--appear-delay:${appearIndex++ * APPEAR_STAGGER_MS}ms`
                : "";
            symbol = `<span class="tile-terrain tile-effect tile-effect--${effect.kind}${appear}" title="${kindLabel} : ${esc(effectDef.label)} — ${esc(effectDef.description)}">${esc(effectDef.icon)}</span>`;
        }
        const aria = `Case ${i}${effectDef ? ` (${effect.kind} : ${effectDef.label})` : ""}${occupants.length ? " : " + occupants.map((p) => p.name).join(", ") : ""}`;

        tiles.push(`
            <div class="${classes.join(" ")}" data-index="${i}" style="grid-row:${row};grid-column:${col}" aria-label="${esc(aria)}">
                <span class="tile-number">${label}</span>
                ${symbol}
                ${reachLabel ? `<span class="tile-reach">${reachLabel.join(" · ")}</span>` : ""}
                <div class="tile-pilots">
                    ${occupants
                        .map((p) => {
                            const cls = ["pilot"];
                            const statuses = pilotStatuses(p);
                            statuses.forEach((st) => cls.push(`pilot--${st.id}`));
                            if (p.id === activeId) cls.push("pilot--active");
                            if (highlight?.playerId === p.id) cls.push(`pilot--${highlight.cls}`);
                            const target = hints.targetAttrs?.(p.id);
                            if (target) cls.push("pilot--target");
                            const attrs = target ? ` ${target} role="button" tabindex="0" aria-label="Cibler ${esc(p.name)}"` : "";
                            return `<span class="${cls.join(" ")}" data-player-id="${p.id}" style="--pilot:${esc(p.color)}" title="${target ? "Cibler " : ""}${esc(p.name)} · case ${i}"${attrs}><span class="pilot__face">${esc(p.avatar)}</span>${statusBadges(statuses)}</span>`;
                        })
                        .join("")}
                </div>
            </div>
        `);
    }

    boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    boardEl.style.gridTemplateRows = `repeat(${rows}, var(--tile-h))`;
    boardEl.innerHTML = tiles.join("") + finishDeco(tileCount, cols, rows);
    requestAnimationFrame(() => {
        drawRoad();
        flipPilots(beforeRects);
    });
}

// Route SVG qui relie le centre des cases dans l'ordre, avec des virages
// arrondis a chaque changement de direction du serpentin.
function drawRoad() {
    const tiles = [...boardEl.querySelectorAll(".tile")].sort((a, b) => a.dataset.index - b.dataset.index);
    boardEl.querySelector(".board-road")?.remove();
    if (tiles.length < 2) return;

    const bounds = boardEl.getBoundingClientRect();
    const tileWidth = tiles[0].getBoundingClientRect().width;
    const points = tiles.map((tile) => {
        const r = tile.getBoundingClientRect();
        return { x: r.left - bounds.left + r.width / 2, y: r.top - bounds.top + r.height / 2 };
    });
    const width = Math.min(45, Math.max(25.5, tileWidth * 0.45));
    const edgeWidth = width + 7.5;
    // Le rayon du virage doit depasser la demi-largeur de la route (bordure
    // comprise), sinon le bord interieur du virage forme un angle vif.
    const wantedRadius = edgeWidth / 2 + 10;
    const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1];
        const b = points[i];
        const c = points[i + 1];
        const incoming = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
        const outgoing = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
        if (incoming.x !== outgoing.x || incoming.y !== outgoing.y) {
            const r = Math.min(wantedRadius, dist(a, b) / 2, dist(b, c) / 2);
            const sweep = incoming.x * outgoing.y - incoming.y * outgoing.x > 0 ? 1 : 0;
            d += ` L ${b.x - incoming.x * r} ${b.y - incoming.y * r} A ${r} ${r} 0 0 ${sweep} ${b.x + outgoing.x * r} ${b.y + outgoing.y * r}`;
        } else {
            d += ` L ${b.x} ${b.y}`;
        }
    }
    d += ` L ${points.at(-1).x} ${points.at(-1).y}`;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "board-road");
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    svg.setAttribute("aria-hidden", "true");
    for (const [cls, strokeWidth] of [
        ["board-road__edge", edgeWidth],
        ["board-road__surface", width],
        ["board-road__center", 2],
    ]) {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("class", cls);
        path.setAttribute("d", d);
        path.setAttribute("stroke-width", strokeWidth);
        svg.append(path);
    }
    boardEl.prepend(svg);
}

/* ---------- Deplacement case par case ---------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const VANISH_MS = 450;
const VANISH_STAGGER_MS = 60;

// Fin de tour : les symboles encore sur le plateau s'evaporent avant la
// redistribution. Resout une fois l'animation terminee.
export async function vanishTileEffects() {
    const effects = [...boardEl.querySelectorAll(".tile-effect")];
    if (!effects.length || reducedMotion.matches) return;
    effects.forEach((el, i) => {
        el.style.setProperty("--vanish-delay", `${i * VANISH_STAGGER_MS}ms`);
        el.classList.add("tile-effect--vanish");
        el.closest(".tile")?.classList.add("tile--clearing");
    });
    await wait(VANISH_MS + (effects.length - 1) * VANISH_STAGGER_MS);
}

export { APPEAR_STAGGER_MS };

// Fait sauter le pion d'une case a l'autre de `from` a `to`, avant que l'etat
// ne soit mis a jour : a la fin, le pion est visuellement sur la case
// d'arrivee (transform conserve), et le re-rendu qui suit ne le deplace plus.
// onHop(n) est appele a chaque atterrissage (son de pas).
export async function hopPilot(playerId, from, to, onHop) {
    const el = boardEl.querySelector(`.pilot[data-player-id="${playerId}"]`);
    if (!el || from === to || reducedMotion.matches) return;

    const layer = el.closest(".tile-pilots");
    if (layer) layer.style.zIndex = "20";
    const origin = el.getBoundingClientRect();
    const originX = origin.left + origin.width / 2;
    const originY = origin.top + origin.height / 2;
    const step = to > from ? 1 : -1;
    let prev = { x: 0, y: 0 };

    for (let i = from + step, n = 0; step > 0 ? i <= to : i >= to; i += step, n++) {
        const tile = boardEl.querySelector(`.tile[data-index="${i}"]`);
        if (!tile) break;
        const r = tile.getBoundingClientRect();
        const next = { x: r.left + r.width / 2 - originX, y: r.bottom - origin.height / 2 - 6 - originY };
        const peak = { x: (prev.x + next.x) / 2, y: Math.min(prev.y, next.y) - 34 };
        await el.animate(
            [
                { transform: `translate(${prev.x}px, ${prev.y}px) scale(1)` },
                { transform: `translate(${peak.x}px, ${peak.y}px) scale(1.2)`, offset: 0.5 },
                { transform: `translate(${next.x}px, ${next.y}px) scale(1)` },
            ],
            { duration: 360, easing: "ease-in-out", fill: "forwards" }
        ).finished;
        onHop?.(n);
        prev = next;
        await wait(110);
    }
}

/* ---------- De ---------- */

function dieLabel(value) {
    return value === DIE_BONUS_FACE ? "Dé : boîte surprise" : `Dé : ${value} case${value > 1 ? "s" : ""}`;
}

// De special a 4 faces : 1 a 3 (nombre de cases, avec un marquage de route)
// ou boite cadeau. Une seule face visible a la fois via data-value.
function dieSvg(value) {
    const road = `<g class="road-mark"><path d="M38 71h24M41 76h18"/><path d="M50 65v13"/></g>`;
    return `
        <svg class="die-svg" id="die" viewBox="0 0 100 100" role="img" aria-label="${dieLabel(value)}" data-value="${value}">
            <defs>
                <linearGradient id="dieFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffef7"/><stop offset=".5" stop-color="#f5efdf"/><stop offset="1" stop-color="#d2c9b8"/></linearGradient>
                <linearGradient id="dieShine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".64"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            </defs>
            <rect x="5" y="5" width="90" height="90" rx="21" fill="#090f1b" opacity=".3" transform="translate(0 3)"/>
            <rect x="4" y="3" width="92" height="92" rx="21" fill="url(#dieFace)" stroke="#fffdf4" stroke-width="2"/>
            <rect x="8" y="7" width="84" height="84" rx="17" fill="none" stroke="#c5bdaf" stroke-opacity=".58"/>
            <path d="M15 10 Q50 1 85 10 Q90 12 90 19 L90 27 Q52 17 10 29 L10 19 Q10 12 15 10Z" fill="url(#dieShine)"/>
            <g class="special-face face-1"><text x="50" y="51" class="die-number">1</text>${road}</g>
            <g class="special-face face-2"><text x="50" y="51" class="die-number">2</text>${road}</g>
            <g class="special-face face-3"><text x="50" y="51" class="die-number">3</text>${road}</g>
            <g class="special-face face-4"><path class="gift-ribbon" d="M50 40v34M32 51h36M34 51v24h32V51"/><path class="gift-bow" d="M50 49c-12-1-19-6-15-11 4-4 11 2 15 11Zm0 0c12-1 19-6 15-11-4-4-11 2-15 11Z"/></g>
        </svg>
    `;
}

export function setDieFace(dieEl, value) {
    dieEl.dataset.value = String(value);
    dieEl.setAttribute("aria-label", dieLabel(value));
}

function bonusRevealCard(bonus, note) {
    return `
        <div class="bonus-reveal">
            <span class="bonus-reveal__icon">${esc(bonus.icon)}</span>
            <strong>${esc(bonus.label)}</strong>
            <p>${esc(bonus.description)}</p>
            ${note ? `<p class="bonus-reveal__note">${note}</p>` : ""}
        </div>
    `;
}

/* ---------- Modale du tour ---------- */

function bonusPhrase(bonusId, name, target) {
    return (
        {
            boost: `${name} utilise « Coup de boost » : +2 cases !`,
            swap: `${name} échange sa place avec ${target} !`,
            "send-back": `${name} renvoie ${target} au départ !`,
            sabotage: `${name} sabote ${target} (-2 cases) !`,
            twister: `${name} déclenche un Twister ! Toutes les positions sont redistribuées !`,
            givre: `${name} givre ${target} : il/elle passera son prochain tour !`,
            shield: `${name} active son bouclier : le prochain coup reçu sera annulé !`,
        }[bonusId] ?? `${name} utilise un bonus.`
    );
}

function tileOutcome(tile, name) {
    const target = esc(tile.targetName ?? "?");
    if (tile.kind === "bonus") {
        if (tile.fizzled) return "Aucune cible disponible : l'effet est perdu.";
        if (tile.blocked) return `${target} bloque l'effet grâce à son bouclier !`;
        return bonusPhrase(tile.id, name, target);
    }
    if (tile.id === "pothole") return `${name} recule de 2 cases.`;
    if (tile.id === "oil") return `${name} glisse et revient à sa case de départ.`;
    if (tile.id === "puncture") return `${name} passera son prochain tour.`;
    if (tile.id === "pickpocket") {
        return tile.lost ? `${name} perd ${esc(tile.lost.icon)} ${esc(tile.lost.label)}.` : `${name} n'avait aucun bonus à perdre, ouf !`;
    }
    return "";
}

function tileCard(tile, outcome) {
    const def = tileEffectDef(tile);
    return `
        <div class="tile-reveal tile-reveal--${tile.kind}">
            <span class="tile-reveal__kicker">${tile.kind === "bonus" ? "⚡ CASE BONUS" : "☠️ CASE MALUS"}</span>
            <span class="tile-reveal__icon">${esc(def?.icon ?? "?")}</span>
            <strong>${esc(def?.label ?? "?")}</strong>
            <p>${outcome}</p>
        </div>
    `;
}

function comboBanner(combo) {
    return `<div class="combo-banner" style="--combo:${combo}"><span>🔥 COMBO</span><b>×${combo}</b><span>!</span></div>`;
}

// Liste des cases enchainees (compact = rappel pendant la chaine).
function comboSteps(chain, name, compact = false) {
    return `
        <ol class="combo-steps${compact ? " combo-steps--compact" : ""}">
            ${chain
                .map((tile) => {
                    const def = tileEffectDef(tile);
                    return `
                <li class="combo-step combo-step--${tile.kind}">
                    <span class="combo-step__icon">${esc(def?.icon ?? "?")}</span>
                    <span><b>${esc(def?.label ?? "?")}</b>${compact ? "" : `<small>${tileOutcome(tile, name)}</small>`}</span>
                </li>`;
                })
                .join("")}
        </ol>
    `;
}

function resultView(state, result) {
    const name = esc(playerName(state, state.turn.playerId));

    if (result.type === "dice") {
        const plural = result.roll > 1 ? "S" : "";
        const view = {
            die: result.roll,
            title: `+${result.roll} CASE${plural} <span>!</span>`,
            desc: `${name} avance de ${result.delta} case${result.delta > 1 ? "s" : ""}.`,
            extra: result.tile ? tileCard(result.tile, tileOutcome(result.tile, name)) : "",
            tone: result.tile?.kind === "malus" ? "fail" : null,
        };
        if (result.combo >= 2) {
            Object.assign(view, {
                title: `QUEL <span>ENCHAÎNEMENT !</span>`,
                desc: `${name} avance de ${result.delta} case${result.delta > 1 ? "s" : ""} et enchaîne ${result.combo} cases spéciales !`,
                extra: comboBanner(result.combo) + comboSteps(result.tiles, name),
                tone: null,
            });
        }
        return view;
    }

    if (result.type === "dice-bonus") {
        let note = "🤫 Ce bonus rejoint ton inventaire secret (max 2). Tu pourras l'utiliser lors d'un prochain tirage.";
        if (result.replaced) note = `🔁 Il remplace ${esc(result.replaced.icon)} ${esc(result.replaced.label)} dans ton inventaire.`;
        if (result.discarded) note = "🗑️ Inventaire inchangé : ce bonus est laissé de côté.";
        return {
            die: result.roll,
            title: `BOÎTE <span>SURPRISE !</span>`,
            desc: `${name} gagne un bonus.`,
            extra: bonusRevealCard(result.bonus, note),
        };
    }

    if (result.type === "advance") {
        return { icon: "➡️", title: `UNE CASE <span>DE PLUS !</span>`, desc: `${name} avance d'une case.` };
    }

    if (result.type === "megajump") {
        return result.success
            ? { icon: "🚀", title: `MEGA JUMP <span>RÉUSSI !</span>`, desc: `${name} avance de 3 cases.` }
            : { icon: "💥", title: `MEGA JUMP <span>RATÉ…</span>`, desc: `${name} recule de 2 cases.`, tone: "fail" };
    }

    if (result.type === "bonus") {
        const bonus = result.bonus;
        return {
            icon: "🎁",
            title: `CAISSE <span>OUVERTE !</span>`,
            desc: `${name} ouvre la caisse…`,
            extra: bonusRevealCard(bonus),
        };
    }

    if (result.type === "bonus-full") {
        return {
            icon: "🎁",
            title: `INVENTAIRE <span>PLEIN</span>`,
            desc: `Inventaire plein (2/2) ! ${name} ne peut pas ouvrir de nouvelle caisse.`,
            tone: "fail",
        };
    }

    if (result.type === "bonus-used") {
        const def = getBonusDef(result.bonusId);
        const target = esc(result.targetName ?? "?");
        if (result.blocked) {
            return {
                icon: "🛡️",
                title: `BONUS <span>BLOQUÉ !</span>`,
                desc: `${target} bloque le bonus de ${name} grâce à son bouclier !`,
                tone: "fail",
            };
        }
        return { icon: def?.icon ?? "⚡", title: `${esc(def?.label ?? "Bonus")} <span>!</span>`, desc: bonusPhrase(result.bonusId, name, target) };
    }

    if (result.type === "vacation-skip") {
        const substitute = `<strong class="substitute-name">${esc(result.substituteName)}</strong> prend la parole en premier au daily !`;
        // Anciennes parties : pas de de, +1 case automatique.
        if (!result.roll) {
            return { icon: "🌴", title: `PILOTE <span>AUTOMATIQUE</span>`, desc: `${name} est en vacances : +1 case. ${substitute}` };
        }
        let outcome = `${name} avance de ${result.delta} case${result.delta > 1 ? "s" : ""}.`;
        if (result.bonus) outcome = `${name} gagne un bonus qui l'attendra au retour.`;
        if (result.consolation) outcome = `Inventaire plein : ${name} avance d'une case à la place.`;
        return {
            die: result.roll,
            title: `🌴 PILOTE <span>AUTOMATIQUE</span>`,
            desc: `${name} est en vacances, le dé a été lancé pour lui/elle. ${outcome} ${substitute}`,
            extra: result.bonus ? bonusRevealCard(result.bonus) : "",
        };
    }

    if (result.type === "frozen-skip") {
        if (result.reason === "puncture") {
            return { icon: "🔧", title: `ENCORE <span>EN RÉPARATION…</span>`, desc: `${name} répare sa crevaison et passe son tour !`, tone: "fail" };
        }
        return { icon: "❄️", title: `TOUR <span>GIVRÉ !</span>`, desc: `${name} est givré(e) et passe son tour !`, tone: "fail" };
    }

    return { icon: "🏁", title: "", desc: "" };
}

function pilotStrip(player) {
    const inventory = player.bonuses.map((b) => esc(b.icon ?? "❔")).join(" ") || "—";
    return `
        <div class="console-pilot" style="--player-color:${esc(player.color)}">
            <span class="console-pilot__avatar">${esc(player.avatar)}</span>
            <span class="console-pilot__name"><small>EN PISTE</small><b>${esc(player.name)}</b></span>
            <span class="console-pilot__bonuses" title="Inventaire (${player.bonuses.length}/2)">${inventory}</span>
        </div>
    `;
}

function targetButtons(player, attrs) {
    const targets = eligibleTargets(player.id);
    if (targets.length === 0) return `<p class="console-hint">Pas de cible disponible.</p>`;
    return `
        <p class="console-hint">🎯 Clique sur un pion qui clignote sur le plateau, ou ici :</p>
        <div class="target-picker">
            ${targets
                .map((t) => `<button class="target-btn" type="button" ${attrs(t.id)}>${esc(t.avatar)} ${esc(t.name)}</button>`)
                .join("")}
        </div>
    `;
}

// Contenu de la console pour le tour en cours ; tone "fail" = mauvais resultat.
function renderTurn(state, ui, current) {
    const phase = state.turn.phase;

    if (phase === "drawn") {
        const step = turnStep(state, ui);
        if (step === "ask") return { html: renderBonusQuestion(current) };
        if (step === "pick") return { html: renderBonusPicker(current) };
        if (step === "target") return { html: renderBonusTarget(current, ui.selectedBonusUid) };
        const canUseBonus = !state.turn.bonusUsed && current.bonuses.length > 0;
        return {
            html: `
                <span class="cap">🎲 DÉ DU CIRCUIT</span>
                ${pilotStrip(current)}
                ${bonusUsedRecap(state)}
                <div class="dice-stage">
                    ${dieSvg(1)}
                    <div class="dice-rule">${dieFaces(state) === DIE_BONUS_FACE ? "1 à 3 : avance d'autant · 🎁 : un bonus" : "1 à 3 : avance d'autant (pas de boîte bonus en jeu)"}</div>
                    <button class="primary" type="button" data-action="roll-die">🎲 JETER LE DÉ</button>
                </div>
                <p class="console-hint">👀 Les cases atteignables sont en surbrillance sur le plateau.</p>
                ${canUseBonus ? `<button class="ghost-btn ghost-btn--block" type="button" data-action="cancel-bonus-picker">⚡ Plutôt utiliser un bonus</button>` : ""}
            `,
        };
    }

    // Case speciale atteinte : on annonce l'effet, il ne s'applique qu'au
    // clic sur "Poursuivre" (ou sur la cible pour un bonus qui en demande une).
    if (phase === "tile-pending" || phase === "tile-target") {
        const pending = state.turn.pendingTile;
        const def = tileEffectDef(pending);
        const isMalus = pending.kind === "malus";
        const needsTarget = tileNeedsTarget(state, pending);
        let note = esc(def?.description ?? "");
        if (!isMalus) note += needsTarget ? " À utiliser tout de suite !" : " Effet immédiat !";
        if (!isMalus && def?.needsTarget && !needsTarget) note += " (aucune cible disponible : il sera perdu)";
        const chain = state.turn.tileChain ?? [];
        const combo = chain.length + 1;
        return {
            tone: isMalus && combo < 2 ? "fail" : null,
            html: `
                <span class="cap">${isMalus ? "☠️ CASE MALUS" : "⚡ CASE BONUS"}</span>
                ${combo >= 2 ? comboBanner(combo) : ""}
                ${chain.length ? comboSteps(chain, esc(current.name), true) : ""}
                <h2>${isMalus ? "AÏE… <span>UN MALUS !</span>" : combo >= 2 ? "ET ENCORE <span>UNE CASE !</span>" : "BONUS <span>RAMASSÉ !</span>"}</h2>
                ${tileCard(pending, note)}
                ${
                    needsTarget
                        ? targetButtons(current, (id) => `data-action="tile-target" data-target-id="${id}"`)
                        : `<button class="primary draw-box__button" type="button" data-action="tile-continue">POURSUIVRE <span aria-hidden="true">➜</span></button>`
                }
            `,
        };
    }

    if (phase === "bonus-full") return { html: renderBonusReplace(current, state.turn.pendingBonus) };

    if (phase === "resolved") {
        const view = resultView(state, state.turn.lastResult);
        return {
            tone: view.tone,
            html: `
                <span class="cap">RÉSULTAT DU TOUR</span>
                ${bonusUsedRecap(state, true)}
                ${view.die ? `<div class="dice-stage dice-stage--result">${dieSvg(view.die)}</div>` : `<span class="console-icon">${esc(view.icon)}</span>`}
                <h2>${view.title}</h2>
                <p>${view.desc}</p>
                ${view.extra ?? ""}
                <button class="primary draw-box__button resultbtn" type="button" data-action="ack-turn">CONTINUER LA COURSE</button>
            `,
        };
    }

    return { html: "" };
}

// Rappel du bonus joue en debut de tour (le de est lance ensuite).
function bonusUsedRecap(state, compact = false) {
    const used = state.turn.bonusUsed;
    if (!used) return "";
    const view = resultView(state, used);
    return `
        <div class="bonus-recap${used.blocked ? " bonus-recap--blocked" : ""}${compact ? " bonus-recap--compact" : ""}">
            <span class="bonus-recap__icon">${esc(view.icon)}</span>
            <span><small>${used.blocked ? "BONUS BLOQUÉ" : "BONUS JOUÉ"}</small>${view.desc}</span>
        </div>
    `;
}

function renderBonusQuestion(player) {
    return `
        <span class="cap">🎯 PILOTE DU JOUR</span>
        ${pilotStrip(player)}
        <p class="console-question">Veux-tu utiliser un bonus ?</p>
        <div class="yesno">
            <button class="yesno__btn yesno__btn--yes" type="button" data-action="bonus-yes">
                <span class="yesno__mark" aria-hidden="true">✓</span>
                <b>OUI</b><small>Choisir un bonus</small>
            </button>
            <button class="yesno__btn yesno__btn--no" type="button" data-action="bonus-no">
                <span class="yesno__mark" aria-hidden="true">✕</span>
                <b>NON</b><small>Lancer le dé</small>
            </button>
        </div>
    `;
}

function renderBonusPicker(player) {
    return `
        <span class="cap">⚡ CHOISIS TON BONUS</span>
        ${pilotStrip(player)}
        <ul class="peek-list peek-list--console">
            ${player.bonuses
                .map(
                    (b) => `
                <li>
                    <button class="bonus-choice" type="button" data-action="select-bonus" data-bonus-uid="${esc(b.uid)}">
                        <span class="peek-item__icon">${esc(b.icon)}</span>
                        <span><strong>${esc(b.label)}</strong><small>${esc(getBonusDef(b.id)?.description ?? b.description ?? "")}</small></span>
                    </button>
                </li>`
                )
                .join("")}
        </ul>
        <button class="ghost-btn ghost-btn--block" type="button" data-action="cancel-bonus-picker">⬅️ Retour</button>
    `;
}

function renderBonusTarget(player, bonusUid) {
    const bonus = player.bonuses.find((b) => b.uid === bonusUid);
    return `
        <span class="cap">🎯 CHOISIS TA CIBLE</span>
        ${pilotStrip(player)}
        <div class="peek-item peek-item--selected">
            <span class="peek-item__icon">${esc(bonus.icon)}</span>
            <span><strong>${esc(bonus.label)}</strong><small>${esc(bonus.description ?? "")}</small></span>
        </div>
        ${targetButtons(
            player,
            (id) => `data-action="use-bonus" data-owner-id="${player.id}" data-bonus-uid="${esc(bonus.uid)}" data-target-id="${id}"`
        )}
        <button class="ghost-btn ghost-btn--block" type="button" data-action="back-to-pick">⬅️ Autre bonus</button>
    `;
}

function renderBonusReplace(player, bonus) {
    return `
        <span class="cap">INVENTAIRE PLEIN</span>
        <div class="dice-stage dice-stage--result">${dieSvg(DIE_BONUS_FACE)}</div>
        <h2>BOÎTE <span>SURPRISE !</span></h2>
        ${bonus ? bonusRevealCard(bonus) : ""}
        <p class="console-question">Remplacer un de tes bonus ?</p>
        <ul class="peek-list peek-list--console">
            ${player.bonuses
                .map(
                    (b) => `
                <li class="peek-item">
                    <span class="peek-item__icon">${esc(b.icon)}</span>
                    <span><strong>${esc(b.label ?? "Bonus")}</strong></span>
                    <button class="target-btn" type="button" data-action="replace-bonus" data-bonus-uid="${esc(b.uid)}" style="margin-left:auto;">Remplacer</button>
                </li>
            `
                )
                .join("")}
        </ul>
        <button class="ghost-btn ghost-btn--block" type="button" data-action="keep-bonuses">Garder mes bonus</button>
    `;
}

/* ---------- Journal ---------- */

function renderLog(state) {
    if (state.log.length === 0) {
        logListEl.innerHTML = `<li class="feed-empty">Rien à raconter pour l'instant…</li>`;
        return;
    }

    logListEl.innerHTML = state.log
        .map((entry) => logEvent(state, entry))
        .filter(Boolean)
        .map(
            (e) => `
                <li class="event">
                    <span class="eventicon">${esc(e.icon)}</span>
                    <div><b>${esc(e.text)}</b><small>${esc(e.kind)}</small></div>
                </li>
            `
        )
        .join("");
}

function logEvent(state, entry) {
    if (entry.type === "drawn") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        return { icon: "🎯", text: `${name} a été tiré au sort.`, kind: "Tirage" };
    }
    if (entry.type === "vacation-skip") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        const substitute = entry.substituteName ?? playerName(state, entry.substituteId);
        let auto = "avance automatique";
        if (entry.roll) {
            auto = `dé automatique : ${entry.roll === DIE_BONUS_FACE ? "🎁" : entry.roll}`;
            if (entry.bonus) auto += ", bonus gagné";
            if (entry.consolation) auto += ", inventaire plein donc +1 case";
        }
        return {
            icon: "🌴",
            text: `${name} a été tiré au sort (en vacances, ${auto}). ${substitute} prend la parole en premier.`,
            kind: entry.delta ? `Vacances · +${entry.delta} case${entry.delta > 1 ? "s" : ""}` : "Vacances",
        };
    }
    if (entry.type === "frozen-skip") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        if (entry.reason === "puncture") return { icon: "🔧", text: `${name} réparait sa crevaison et a passé son tour.`, kind: "Crevaison" };
        return { icon: "❄️", text: `${name} était givré(e) et a passé son tour.`, kind: "Givre" };
    }
    if (entry.type === "turn") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        const r = entry.result;
        if (r.type === "dice") {
            const kind = `+${r.delta} case${r.delta > 1 ? "s" : ""}`;
            if (r.combo >= 2) {
                const steps = r.tiles.map((t) => {
                    const def = tileEffectDef(t);
                    return `${def?.icon ?? ""} ${def?.label ?? "?"}`;
                });
                return {
                    icon: "🔥",
                    text: `${name} a lancé le dé : ${r.roll}, et enchaîne un combo ×${r.combo} : ${steps.join(" → ")} !`,
                    kind: `${kind} · Combo ×${r.combo}`,
                };
            }
            if (r.tile) {
                const def = tileEffectDef(r.tile);
                const target = r.tile.targetName ? ` (cible : ${r.tile.targetName})` : "";
                return {
                    icon: def?.icon ?? "🎲",
                    text: `${name} a lancé le dé : ${r.roll}, et tombe sur ${def?.icon ?? ""} ${def?.label ?? "une case spéciale"}${target}.`,
                    kind: `${kind} · ${r.tile.kind === "bonus" ? "Case bonus" : "Case malus"}${r.tile.blocked ? " bloquée" : ""}`,
                };
            }
            return { icon: "🎲", text: `${name} a lancé le dé : ${r.roll}.`, kind };
        }
        if (r.type === "dice-bonus") {
            if (r.discarded) return { icon: "🎁", text: `${name} a gagné une boîte surprise, mais a gardé ses bonus.`, kind: "Dé : boîte surprise" };
            if (r.replaced) return { icon: "🎁", text: `${name} a gagné une boîte surprise et a remplacé un bonus.`, kind: "Dé : boîte surprise" };
            return { icon: "🎁", text: `${name} a gagné une boîte surprise.`, kind: "Dé : boîte surprise" };
        }
        if (r.type === "advance") return { icon: "➡️", text: `${name} a avancé d'une case.`, kind: "+1 case" };
        if (r.type === "megajump") {
            return r.success
                ? { icon: "🚀", text: `${name} a réussi un Mega Jump.`, kind: "+3 cases" }
                : { icon: "💥", text: `${name} a raté un Mega Jump.`, kind: "-2 cases" };
        }
        if (r.type === "bonus") return { icon: "🎁", text: `${name} a ouvert une caisse bonus.`, kind: "Bonus secret" };
        if (r.type === "bonus-full") return { icon: "🎁", text: `${name} a tenté d'ouvrir une caisse, inventaire plein (2/2).`, kind: "Caisse" };
    }
    if (entry.type === "bonus-used") {
        const owner = entry.ownerName ?? playerName(state, entry.ownerId);
        const target = entry.targetName ?? (entry.targetId ? playerName(state, entry.targetId) : null);
        const def = getBonusDef(entry.bonusId);
        const kind = def?.label ?? "Bonus";
        if (entry.blocked) return { icon: "🛡️", text: `${target} a bloqué un bonus de ${owner} grâce à son bouclier !`, kind: "Bouclier" };
        if (def?.id === "boost") return { icon: "⚡", text: `${owner} a utilisé « Coup de boost ».`, kind };
        if (def?.id === "swap") return { icon: "🔀", text: `${owner} a échangé sa place avec ${target}.`, kind };
        if (def?.id === "send-back") return { icon: "⏪", text: `${owner} a renvoyé ${target} au départ.`, kind };
        if (def?.id === "sabotage") return { icon: "💣", text: `${owner} a saboté ${target} (-2).`, kind };
        if (def?.id === "twister") return { icon: "🌀", text: `${owner} a déclenché un Twister (positions redistribuées).`, kind };
        if (def?.id === "givre") return { icon: "❄️", text: `${owner} a givré ${target}.`, kind };
        if (def?.id === "shield") return { icon: "🛡️", text: `${owner} a activé son bouclier.`, kind };
        return { icon: "⚡", text: `${owner} a utilisé un bonus.`, kind };
    }
    return null;
}

/* ---------- Menu debug ---------- */

const debugListEl = document.getElementById("debug-list");

export function renderDebugPanel(state) {
    if (state.players.length === 0) {
        debugListEl.innerHTML = `<p class="settings-hint">Aucun joueur.</p>`;
        return;
    }
    const catalog = BONUS_CATALOG.map((b) => `<option value="${b.id}">${esc(b.icon)} ${esc(b.label)}</option>`).join("");
    debugListEl.innerHTML = state.players
        .map((p) => {
            const full = p.bonuses.length >= 2;
            const frozen = p.frozen === "puncture" ? "puncture" : p.frozen ? "givre" : "";
            return `
                <div class="debug-player" style="--player-color:${esc(p.color)}">
                    <div class="debug-player__head">
                        <span class="debug-player__avatar">${esc(p.avatar)}</span>
                        <b>${esc(p.name)}</b>
                        <label class="debug-player__score">Score
                            <input class="field debug-pos" type="number" min="0" max="${state.track.length}" value="${p.position}" data-player-id="${p.id}" />
                            <small>/ ${state.track.length}</small>
                        </label>
                    </div>
                    <div class="debug-player__row">
                        <span class="debug-label">Inventaire ${p.bonuses.length}/2</span>
                        ${p.bonuses
                            .map(
                                (b) =>
                                    `<button class="debug-chip" type="button" data-action="debug-remove-bonus" data-player-id="${p.id}" data-bonus-uid="${esc(b.uid)}" title="Retirer">${esc(b.icon ?? "❔")} ${esc(b.label ?? "Bonus")} ✕</button>`
                            )
                            .join("")}
                        <select class="field debug-add-bonus" data-player-id="${p.id}" ${full ? "disabled" : ""} aria-label="Ajouter un bonus à ${esc(p.name)}">
                            <option value="">${full ? "Inventaire plein" : "+ Ajouter…"}</option>
                            ${full ? "" : catalog}
                        </select>
                    </div>
                    <div class="debug-player__row">
                        <span class="debug-label">État</span>
                        <select class="field debug-frozen" data-player-id="${p.id}" aria-label="État de ${esc(p.name)}">
                            <option value="" ${frozen === "" ? "selected" : ""}>Normal</option>
                            <option value="givre" ${frozen === "givre" ? "selected" : ""}>❄️ Givré (passe son tour)</option>
                            <option value="puncture" ${frozen === "puncture" ? "selected" : ""}>🔧 Crevaison (passe son tour)</option>
                        </select>
                        <label class="debug-check">
                            <input type="checkbox" class="debug-shielded" data-player-id="${p.id}" ${p.shielded ? "checked" : ""} />
                            🛡️ Bouclier activé
                        </label>
                    </div>
                </div>
            `;
        })
        .join("");
}

/* ---------- Inventaire d'un joueur (depuis le classement) ---------- */

const inventoryPopoverEl = document.getElementById("inventory-popover");

function inventoryMarkup(player) {
    const statuses = pilotStatuses(player);
    const items = player.bonuses.map((b) => {
        const def = getBonusDef(b.id);
        return `
            <li class="inv-item">
                <span class="inv-item__icon">${esc(b.icon ?? def?.icon ?? "⚡")}</span>
                <span><b>${esc(b.label ?? def?.label ?? "Bonus")}</b><small>${esc(def?.description ?? b.description ?? "")}</small></span>
            </li>`;
    });
    return `
        <div class="inv-pop__head" style="--player-color:${esc(player.color)}">
            <span class="inv-pop__avatar">${esc(player.avatar)}</span>
            <b>${esc(player.name)}</b>
            <small>${player.bonuses.length}/2</small>
            <button class="inv-pop__close" type="button" data-action="close-inventory" aria-label="Fermer">×</button>
        </div>
        <ul class="inv-list">${items.join("") || `<li class="inv-empty">Inventaire vide.</li>`}</ul>
        ${
            statuses.length
                ? `<div class="inv-statuses">${statuses.map((st) => `<span class="inv-status">${st.icon} ${esc(st.label)}</span>`).join("")}</div>`
                : ""
        }
    `;
}

export function toggleInventoryPopover(state, playerId, anchorRect) {
    if (!inventoryPopoverEl.classList.contains("hidden") && inventoryPopoverEl.dataset.playerId === playerId) {
        closeInventoryPopover();
        return;
    }
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return closeInventoryPopover();

    inventoryPopoverEl.dataset.playerId = playerId;
    inventoryPopoverEl.innerHTML = inventoryMarkup(player);
    inventoryPopoverEl.classList.remove("hidden");
    const width = inventoryPopoverEl.offsetWidth;
    const height = inventoryPopoverEl.offsetHeight;
    let top = anchorRect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = anchorRect.top - height - 8;
    const left = Math.min(anchorRect.right - width, window.innerWidth - width - 8);
    inventoryPopoverEl.style.top = `${Math.max(8, top)}px`;
    inventoryPopoverEl.style.left = `${Math.max(8, left)}px`;
}

// Garde la bulle a jour si l'inventaire change pendant qu'elle est ouverte.
function refreshInventoryPopover(state) {
    if (inventoryPopoverEl.classList.contains("hidden")) return;
    const player = state.players.find((p) => p.id === inventoryPopoverEl.dataset.playerId);
    if (!player) return closeInventoryPopover();
    inventoryPopoverEl.innerHTML = inventoryMarkup(player);
}

export function closeInventoryPopover() {
    inventoryPopoverEl.classList.add("hidden");
    inventoryPopoverEl.innerHTML = "";
    delete inventoryPopoverEl.dataset.playerId;
}

/* ---------- Choix d'avatar ---------- */

export function toggleAvatarPicker(state, playerId, anchorRect) {
    const alreadyOpenForThis = !avatarPickerEl.classList.contains("hidden") && avatarPickerEl.dataset.playerId === playerId;
    if (alreadyOpenForThis) {
        closeAvatarPicker();
        return;
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) return closeAvatarPicker();

    avatarPickerEl.dataset.playerId = playerId;
    avatarPickerEl.innerHTML = `
        <div class="avatar-picker__grid">
            ${AVATARS.map(
                (a) => `
                <button class="avatar-picker__option${a === player.avatar ? " avatar-picker__option--selected" : ""}" type="button" data-action="pick-avatar" data-player-id="${playerId}" data-avatar="${a}">${a}</button>
            `
            ).join("")}
        </div>
    `;

    avatarPickerEl.classList.remove("hidden");
    const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 240);
    const left = Math.min(anchorRect.left, window.innerWidth - 290);
    avatarPickerEl.style.top = `${Math.max(8, top)}px`;
    avatarPickerEl.style.left = `${Math.max(8, left)}px`;
}

export function closeAvatarPicker() {
    avatarPickerEl.classList.add("hidden");
    avatarPickerEl.innerHTML = "";
    delete avatarPickerEl.dataset.playerId;
}
