import { getBonusDef, eligibleTargets, BONUS_CATALOG } from "./bonuses.js";
import { canDrawToday, DIE_BONUS_FACE } from "./game.js";
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
const logListEl = document.getElementById("log-list");
const avatarPickerEl = document.getElementById("avatar-picker");
const bonusCatalogListEl = document.getElementById("bonus-catalog-list");

const CONFETTI_COLORS = ["#d9ff43", "#ffab64", "#80d7ff", "#f788d0"];

// Catalogue statique : ne depend pas de l'etat de la partie, rendu une seule fois.
bonusCatalogListEl.innerHTML = BONUS_CATALOG.map(
    (b) => `
        <li class="peek-item">
            <span class="peek-item__icon">${esc(b.icon)}</span>
            <span>
                <strong>${esc(b.label)}</strong>${b.passive ? ` <em>(passif)</em>` : ""}
                <small>${esc(b.description)}</small>
            </span>
        </li>
    `
).join("");

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

export function renderAll(state, ui) {
    lastState = state;
    renderGoal(state);
    renderBoard(state);
    renderPlayers(state);
    renderPodium(state);
    renderDrawControls(state);
    renderModal(state, ui);
    renderLog(state);
}

export function isModalOpen(state) {
    return Boolean(state.winnerId) || ["drawn", "bonus-full", "resolved"].includes(state.turn.phase);
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
    } else if (state.turn.phase !== "idle") {
        title = "Tour en cours…";
        body = `<button class="primary draw-box__button" type="button" disabled>LANCER LE TIRAGE <span aria-hidden="true">↗</span></button>`;
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

let lastBurstKey = null;

function renderModal(state, ui) {
    const open = isModalOpen(state);
    const visible = open && !ui?.modalSuppressed;
    turnModalEl.classList.toggle("hidden", !visible);
    revealEl.classList.toggle("reveal--victory", Boolean(state.winnerId));
    if (!open) {
        turnContentEl.innerHTML = "";
        revealEl.classList.remove("reveal--fail");
        lastBurstKey = null;
        return;
    }
    const tone = renderTurn(state, ui);
    revealEl.classList.toggle("reveal--fail", tone === "fail");

    // Petite pluie de confettis a chaque nouvelle etape du tour (tirage,
    // resultat), une seule fois meme si l'etat est re-rendu (sync distante).
    const burstKey = visible && !state.winnerId ? `${state.turn.phase}:${state.log[0]?.id}` : null;
    if (burstKey && burstKey !== lastBurstKey && tone !== "fail") burstConfetti();
    if (visible) lastBurstKey = burstKey;
}

export function openTurnModal() {
    revealEl.classList.remove("reveal--fail", "reveal--victory");
    turnModalEl.classList.remove("hidden");
}

export function renderSpinFrame(player) {
    turnContentEl.innerHTML = `
        <div class="cap">LE TIRAGE COMMENCE</div>
        <span class="reveal-avatar reveal-avatar--spin">${esc(player.avatar)}</span>
        <h2>${esc(player.name)} <span>?</span></h2>
        <p>La grille retient son souffle…</p>
    `;
}

function burstConfetti() {
    confettiEl.innerHTML = Array.from(
        { length: 30 },
        (_, i) =>
            `<i style="--x:${Math.random() * 100}%;--color:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};--rot:${Math.random() * 360}deg;--delay:${Math.random() * 0.45}s"></i>`
    ).join("");
    setTimeout(() => {
        confettiEl.innerHTML = "";
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

            const hasShield = p.bonuses.some((b) => b.id === "shield");
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
                    <span class="score-row__bonuses${p.bonuses.length > 0 ? " score-row__bonuses--active" : ""}" style="--shine-delay:${stableDelay(p.id)}s;" title="${p.bonuses.length} bonus en réserve">⚡${p.bonuses.length}</span>
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

function renderPodium(state) {
    const [first, second, third] = sortedPlayers(state);
    if (!first) {
        podiumEl.innerHTML = `<p class="podium__empty">Le podium attend ses pilotes.</p>`;
        return;
    }
    const step = (p, rank) =>
        p
            ? `<div><span class="face">${esc(p.avatar)}</span><b>${esc(p.name)}</b><div class="step">${rank}</div></div>`
            : `<div class="podium__vacant"><span class="face">·</span><b>&nbsp;</b><div class="step">${rank}</div></div>`;
    podiumEl.innerHTML = step(second, 2) + step(first, 1) + step(third, 3);
}

/* ---------- Plateau ---------- */

const TERRAINS = ["🌿", "🌊", "🔥", "🌬️", "🌲", "⚡", "🌋", "🌴", "☁️", "✨"];
const mobileQuery = window.matchMedia("(max-width: 650px)");

mobileQuery.addEventListener("change", () => {
    if (lastState) renderBoard(lastState);
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
    if (r.type === "dice" || r.type === "advance") return { playerId: state.turn.playerId, cls: "success" };
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

function renderBoard(state) {
    const length = state.track.length;
    const tileCount = length + 1;
    const cols = boardColumns(tileCount);
    const rows = Math.ceil(tileCount / cols);
    const beforeRects = capturePilotRects();
    const highlight = moverHighlight(state);
    const activeId = state.turn.phase !== "idle" ? state.turn.playerId : null;

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
        if (occupants.length > 2) classes.push("tile--crowded");
        const terrain = isStart ? "🏁" : isFinish ? "🏆" : TERRAINS[(i - 1) % TERRAINS.length];
        const label = isStart ? "DÉPART" : isFinish ? "ARRIVÉE" : String(i).padStart(2, "0");
        const aria = `Case ${i}${occupants.length ? " : " + occupants.map((p) => p.name).join(", ") : ""}`;

        tiles.push(`
            <div class="${classes.join(" ")}" data-index="${i}" style="grid-row:${row};grid-column:${col}" aria-label="${esc(aria)}">
                <span class="tile-number">${label}</span>
                <span class="tile-terrain" aria-hidden="true">${terrain}</span>
                <div class="tile-pilots">
                    ${occupants
                        .map((p) => {
                            const cls = ["pilot"];
                            if (p.id === activeId) cls.push("pilot--active");
                            if (highlight?.playerId === p.id) cls.push(`pilot--${highlight.cls}`);
                            return `<span class="${cls.join(" ")}" data-player-id="${p.id}" style="--pilot:${esc(p.color)}" title="${esc(p.name)} · case ${i}"><span class="pilot__face">${esc(p.avatar)}</span></span>`;
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
    const radius = Math.min(24, tileWidth * 0.22);

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1];
        const b = points[i];
        const c = points[i + 1];
        const incoming = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
        const outgoing = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
        if (incoming.x !== outgoing.x || incoming.y !== outgoing.y) {
            d += ` L ${b.x - incoming.x * radius} ${b.y - incoming.y * radius} Q ${b.x} ${b.y} ${b.x + outgoing.x * radius} ${b.y + outgoing.y * radius}`;
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
    const width = Math.min(45, Math.max(25.5, tileWidth * 0.45));
    for (const [cls, strokeWidth] of [
        ["board-road__edge", width + 7.5],
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

function resultView(state, result) {
    const name = esc(playerName(state, state.turn.playerId));

    if (result.type === "dice") {
        const plural = result.roll > 1 ? "S" : "";
        return {
            die: result.roll,
            title: `+${result.roll} CASE${plural} <span>!</span>`,
            desc: `${name} avance de ${result.delta} case${result.delta > 1 ? "s" : ""}.`,
        };
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
        const phrase = {
            boost: `${name} utilise « Coup de boost » : +2 cases !`,
            swap: `${name} échange sa place avec ${target} !`,
            "send-back": `${name} renvoie ${target} au départ !`,
            sabotage: `${name} sabote ${target} (-2 cases) !`,
            twister: `${name} déclenche un Twister ! Toutes les positions sont redistribuées !`,
            givre: `${name} givre ${target} : il/elle passera son prochain tour !`,
        }[result.bonusId] ?? `${name} utilise un bonus.`;
        return { icon: def?.icon ?? "⚡", title: `${esc(def?.label ?? "Bonus")} <span>!</span>`, desc: phrase };
    }

    if (result.type === "vacation-skip") {
        return {
            icon: "🌴",
            title: `PILOTE <span>AUTOMATIQUE</span>`,
            desc: `${name} est en vacances : avance automatique d'une case. ${esc(result.substituteName)} prend la parole en premier !`,
        };
    }

    if (result.type === "frozen-skip") {
        return { icon: "❄️", title: `TOUR <span>GIVRÉ !</span>`, desc: `${name} est givré(e) et passe son tour !`, tone: "fail" };
    }

    return { icon: "🏁", title: "", desc: "" };
}

// Retourne la tonalite du contenu affiche ("fail" pour un mauvais resultat).
function renderTurn(state, ui) {
    if (state.winnerId) {
        const winner = state.players.find((p) => p.id === state.winnerId);
        turnContentEl.innerHTML = `
            <div class="victory__sunburst"></div>
            <div class="cap">🏆 VICTOIRE</div>
            <span class="reveal-avatar reveal-avatar--victory">${esc(winner?.avatar ?? "🎉")}</span>
            <h2>${esc(winner?.name ?? "?")} <span>GAGNE !</span></h2>
            <p>remporte la course !</p>
            <button class="primary resultbtn" type="button" data-action="new-race">🔁 NOUVELLE COURSE</button>
        `;
        return "victory";
    }

    const current = state.players.find((p) => p.id === state.turn.playerId);
    if (!current) {
        turnContentEl.innerHTML = "";
        return null;
    }

    if (state.turn.phase === "drawn") {
        const usable = current.bonuses.filter((b) => !b.passive);
        let step = ui?.turnStep ?? (usable.length > 0 ? "ask" : "roll");
        if (usable.length === 0) step = "roll";

        if (step === "pick") {
            turnContentEl.innerHTML = renderBonusPicker(current);
        } else if (step === "ask") {
            turnContentEl.innerHTML = renderBonusQuestion(current, usable);
        } else {
            turnContentEl.innerHTML = `
                <div class="cap">DÉ DU CIRCUIT</div>
                <h2>${esc(current.avatar)} ${esc(current.name)} <span>lance le dé !</span></h2>
                <div class="dice-stage">
                    ${dieSvg(1)}
                    <div class="dice-rule">1 à 3 : avance du nombre indiqué · 🎁 : un bonus</div>
                    <button class="primary" type="button" data-action="roll-die">🎲 JETER LE DÉ</button>
                </div>
            `;
        }
        return null;
    }

    if (state.turn.phase === "bonus-full") {
        turnContentEl.innerHTML = renderBonusReplace(current, state.turn.pendingBonus);
        return null;
    }

    if (state.turn.phase === "resolved") {
        const view = resultView(state, state.turn.lastResult);
        turnContentEl.innerHTML = `
            <div class="cap">RÉSULTAT DU TOUR</div>
            ${view.die ? `<div class="dice-stage dice-stage--result">${dieSvg(view.die)}</div>` : `<span class="reveal-avatar">${esc(view.icon)}</span>`}
            <h2>${view.title}</h2>
            <p>${view.desc}</p>
            ${view.extra ?? ""}
            <button class="primary resultbtn" type="button" data-action="ack-turn">CONTINUER LA COURSE</button>
        `;
        return view.tone ?? null;
    }

    return null;
}

function bonusPickerItem(player, b) {
    if (b.passive) {
        return `
            <li class="peek-item">
                <span class="peek-item__icon">${esc(b.icon)}</span>
                <span><strong>${esc(b.label)}</strong> <em>(actif en défense)</em></span>
            </li>
        `;
    }
    if (b.needsTarget) {
        const targets = eligibleTargets(player.id);
        return `
            <li class="peek-item peek-item--stacked">
                <span class="peek-item__head"><span class="peek-item__icon">${esc(b.icon)}</span><strong>${esc(b.label)}</strong></span>
                <div class="target-picker">
                    ${targets
                        .map(
                            (t) =>
                                `<button class="target-btn" type="button" data-action="use-bonus" data-owner-id="${player.id}" data-bonus-uid="${b.uid}" data-target-id="${t.id}">${esc(t.avatar)} ${esc(t.name)}</button>`
                        )
                        .join("") || `<em>Pas de cible disponible</em>`}
                </div>
            </li>
        `;
    }
    return `
        <li class="peek-item">
            <span class="peek-item__icon">${esc(b.icon)}</span>
            <span><strong>${esc(b.label)}</strong></span>
            <button class="target-btn" type="button" data-action="use-bonus" data-owner-id="${player.id}" data-bonus-uid="${b.uid}" style="margin-left:auto;">Utiliser</button>
        </li>
    `;
}

function renderBonusPicker(player) {
    return `
        <div class="cap">BONUS EN RÉSERVE</div>
        <span class="reveal-avatar">${esc(player.avatar)}</span>
        <h2>Choisis <span>ton bonus</span></h2>
        <ul class="peek-list peek-list--reveal">
            ${player.bonuses.map((b) => bonusPickerItem(player, b)).join("")}
        </ul>
        <button class="ghost-btn resultbtn" type="button" data-action="cancel-bonus-picker">⬅️ Retour</button>
    `;
}

function renderBonusQuestion(player, usable) {
    return `
        <div class="cap">PILOTE DU JOUR</div>
        <span class="reveal-avatar">${esc(player.avatar)}</span>
        <h2>${esc(player.name)} <span>entre en piste !</span></h2>
        <p>Tu as ${usable.length} bonus activable${usable.length > 1 ? "s" : ""} en réserve : ${usable.map((b) => esc(b.icon)).join(" ")}</p>
        <p class="yesno__question">Veux-tu utiliser un bonus ?</p>
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

function renderBonusReplace(player, bonus) {
    return `
        <div class="cap">INVENTAIRE PLEIN</div>
        <div class="dice-stage dice-stage--result">${dieSvg(DIE_BONUS_FACE)}</div>
        <h2>BOÎTE <span>SURPRISE !</span></h2>
        ${bonus ? bonusRevealCard(bonus) : ""}
        <p class="yesno__question">Ton inventaire est plein (2/2). Remplacer un bonus ?</p>
        <ul class="peek-list peek-list--reveal">
            ${player.bonuses
                .map(
                    (b) => `
                <li class="peek-item">
                    <span class="peek-item__icon">${esc(b.icon)}</span>
                    <span><strong>${esc(b.label ?? "Bonus")}</strong>${b.passive ? " <em>(passif)</em>" : ""}</span>
                    <button class="target-btn" type="button" data-action="replace-bonus" data-bonus-uid="${esc(b.uid)}" style="margin-left:auto;">Remplacer</button>
                </li>
            `
                )
                .join("")}
        </ul>
        <button class="ghost-btn resultbtn" type="button" data-action="keep-bonuses">Garder mes bonus</button>
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
        return {
            icon: "🌴",
            text: `${name} a été tiré au sort (en vacances, avance automatique). ${substitute} prend la parole en premier.`,
            kind: "Vacances",
        };
    }
    if (entry.type === "frozen-skip") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        return { icon: "❄️", text: `${name} était givré(e) et a passé son tour.`, kind: "Givre" };
    }
    if (entry.type === "turn") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        const r = entry.result;
        if (r.type === "dice") {
            return { icon: "🎲", text: `${name} a lancé le dé : ${r.roll}.`, kind: `+${r.delta} case${r.delta > 1 ? "s" : ""}` };
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
        return { icon: "⚡", text: `${owner} a utilisé un bonus.`, kind };
    }
    return null;
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
