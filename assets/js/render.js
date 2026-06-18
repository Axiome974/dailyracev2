import { getBonusDef, eligibleTargets, BONUS_CATALOG } from "./bonuses.js";
import { canDrawToday } from "./game.js";
import { AVATARS } from "./players.js";

const playersListEl = document.getElementById("players-list");
const trackEl = document.getElementById("track");
const drawControlsEl = document.getElementById("draw-controls");
const turnModalEl = document.getElementById("turn-modal");
const turnContentEl = document.getElementById("turn-content");
const logListEl = document.getElementById("log-list");
const avatarPickerEl = document.getElementById("avatar-picker");
const bonusCatalogListEl = document.getElementById("bonus-catalog-list");

// Catalogue statique : ne depend pas de l'etat de la partie, rendu une seule fois.
bonusCatalogListEl.innerHTML = BONUS_CATALOG.map(
    (b) => `
        <li class="peek-item">
            <span>${esc(b.icon)}</span>
            <span>
                <strong>${esc(b.label)}</strong>${b.passive ? ` <em style="opacity:.7;">(passif)</em>` : ""}<br>
                <span style="font-size:0.8rem;color:var(--ink-soft);">${esc(b.description)}</span>
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

// Delai stable (pas Math.random a chaque rendu) derive de l'id du joueur,
// pour que les pastilles "bonus" ne brillent pas toutes en meme temps.
function stableDelay(id, maxSeconds = 3.2) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return ((hash % 1000) / 1000) * maxSeconds;
}

export function renderAll(state, ui) {
    renderPlayers(state);
    renderTrack(state);
    renderDrawControls(state);
    renderModal(state, ui);
    renderLog(state);
}

export function isModalOpen(state) {
    return Boolean(state.winnerId) || state.turn.phase === "drawn" || state.turn.phase === "resolved";
}

function renderDrawControls(state) {
    if (state.winnerId) {
        drawControlsEl.innerHTML = "";
        return;
    }
    if (state.players.length < 2) {
        drawControlsEl.innerHTML = `<p class="turn-prompt">Ajoute au moins 2 joueurs pour lancer le tirage du jour.</p>`;
        return;
    }
    if (state.turn.phase !== "idle") {
        drawControlsEl.innerHTML = "";
        return;
    }
    if (!canDrawToday(state)) {
        drawControlsEl.innerHTML = `<p class="turn-prompt">🌴 Tout le monde est en vacances ! Impossible de lancer un tirage.</p>`;
        return;
    }
    const already = state.turn.date
        ? ``
        : "";
    drawControlsEl.innerHTML = `
        <button class="draw-btn" type="button" data-action="draw">🎲 Tirer le joueur du jour</button>
        ${already}
    `;
}

function renderModal(state, ui) {
    const open = isModalOpen(state);
    const visible = open && !ui?.modalSuppressed;
    turnModalEl.classList.toggle("hidden", !visible);
    turnModalEl.querySelector(".turn-card")?.classList.toggle("turn-card--victory", Boolean(state.winnerId));
    if (!open) {
        turnContentEl.innerHTML = "";
        return;
    }
    renderTurn(state, ui);
}

export function openTurnModal() {
    turnModalEl.classList.remove("hidden");
}

function renderPlayers(state) {
    if (state.players.length === 0) {
        playersListEl.innerHTML = `<li class="empty-hint">Ajoute tes coequipiers pour lancer la course 👆</li>`;
        return;
    }

    const sorted = [...state.players].sort((a, b) => b.position - a.position);

    playersListEl.innerHTML = sorted
        .map((p) => {
            const isTurn = state.turn.playerId === p.id && state.turn.phase !== "idle";
            const isWinner = state.winnerId === p.id;
            const classes = ["player"];
            if (isTurn) classes.push("player--turn");
            if (isWinner) classes.push("player--winner");
            if (p.onVacation) classes.push("player--vacation");

            const hasShield = p.bonuses.some((b) => b.id === "shield");
            const isFrozen = Boolean(p.frozen);

            return `
                <li class="${classes.join(" ")}" style="--player-color:${esc(p.color)}">
                    <span class="player__avatar-wrap">
                        <button class="player__avatar" type="button" data-action="change-avatar" data-player-id="${p.id}" title="Changer d'avatar">${esc(p.avatar)}</button>
                        ${hasShield ? `<span class="status-badge status-badge--shield" title="Protege par un bouclier"></span>` : ""}
                        ${isFrozen ? `<span class="status-badge status-badge--frozen" title="Givre : passera son prochain tour"></span>` : ""}
                    </span>
                    <span class="player__name">${esc(p.name)}${isWinner ? " 🏆" : ""}</span>
                    ${p.onVacation ? `<span class="vacation-tag" title="En vacances">🌴</span>` : ""}
                    <span class="player__score">${p.position}/${state.track.length}</span>
                    <span class="player__bonuses${p.bonuses.length > 0 ? " player__bonuses--active" : ""}" style="--shine-delay:${stableDelay(p.id)}s;" title="${p.bonuses.length} bonus en reserve">
                        ⚡ ${p.bonuses.length}
                    </span>
                    <button class="player__vacation${p.onVacation ? " player__vacation--active" : ""}" type="button" data-action="toggle-vacation" data-player-id="${p.id}" title="${p.onVacation ? "Revenir de vacances" : "Partir en vacances"}">
                        🌴
                    </button>
                    <button class="player__remove" type="button" data-action="remove-player" data-player-id="${p.id}" aria-label="Retirer ${esc(p.name)}">✕</button>
                </li>
            `;
        })
        .join("");
}

const TRACK_COLS = 4;

function moverHighlight(state) {
    if (state.turn.phase !== "resolved" || !state.turn.lastResult) return null;
    const r = state.turn.lastResult;
    if (r.type === "advance") return { playerId: state.turn.playerId, cls: "success" };
    if (r.type === "megajump") return { playerId: state.turn.playerId, cls: r.success ? "success" : "fail" };
    return null;
}

function captureTokenRects() {
    const rects = {};
    trackEl.querySelectorAll(".track__token").forEach((el) => {
        rects[el.dataset.playerId] = el.getBoundingClientRect();
    });
    return rects;
}

function flipTokens(beforeRects) {
    trackEl.querySelectorAll(".track__token").forEach((el) => {
        const before = beforeRects[el.dataset.playerId];
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (!dx && !dy) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
            el.style.transition = "transform 0.55s cubic-bezier(.34, 1.56, .64, 1)";
            el.style.transform = "translate(0, 0)";
        });
    });
}

// Chaque case (hors depart/arrivee) represente un element qui se repete en
// boucle le long du parcours, avec sa propre petite decoration animee.
const ELEMENTS = ["sea", "earth", "fire", "air"];

function cellTheme(i, length) {
    if (i === 0 || i === length) return null;
    return ELEMENTS[(i - 1) % ELEMENTS.length];
}

function themeDeco(theme) {
    if (theme === "sea") {
        return `
            <span class="deco deco--bubble" style="left:28%;animation-delay:0s;"></span>
            <span class="deco deco--bubble" style="left:52%;animation-delay:0.7s;"></span>
            <span class="deco deco--bubble" style="left:72%;animation-delay:1.3s;"></span>
        `;
    }
    if (theme === "earth") {
        return `
            <span class="deco deco--sprout">🌱</span>
            <span class="deco deco--speck" style="left:22%;top:75%;"></span>
            <span class="deco deco--speck" style="left:62%;top:30%;"></span>
            <span class="deco deco--speck" style="left:42%;top:82%;"></span>
        `;
    }
    if (theme === "fire") {
        return `
            <span class="deco deco--flame"></span>
            <span class="deco deco--spark" style="left:36%;animation-delay:0.2s;"></span>
            <span class="deco deco--spark" style="left:60%;animation-delay:0.7s;"></span>
        `;
    }
    if (theme === "air") {
        return `
            <span class="deco deco--puff" style="top:28%;animation-delay:0s;"></span>
            <span class="deco deco--puff" style="top:62%;animation-delay:1.2s;"></span>
        `;
    }
    return "";
}

function cellRowCol(i) {
    const row = Math.floor(i / TRACK_COLS);
    const colInRow = i % TRACK_COLS;
    const col = row % 2 === 0 ? colInRow : TRACK_COLS - 1 - colInRow;
    return { row, col };
}

function arrowToNext(i, length) {
    if (i >= length) return null;
    const a = cellRowCol(i);
    const b = cellRowCol(i + 1);
    if (a.row !== b.row) return "down";
    return b.col > a.col ? "right" : "left";
}

function renderTrack(state) {
    const length = state.track.length;
    const beforeRects = captureTokenRects();
    const highlight = moverHighlight(state);

    const cells = [];
    for (let i = 0; i <= length; i++) {
        const { row, col } = cellRowCol(i);
        const occupants = state.players.filter((p) => p.position === i);
        const isStart = i === 0;
        const isFinish = i === length;
        const theme = cellTheme(i, length);
        const cellClass = isStart ? "track__cell--start" : isFinish ? "track__cell--finish" : `track__cell--${theme}`;
        const cellStyle = `grid-column:${col + 1};grid-row:${row + 1};`;
        const dir = arrowToNext(i, length);

        cells.push(`
            <div class="track__cell ${cellClass}" style="${cellStyle}">
                ${theme ? themeDeco(theme) : ""}
                <span class="track__cell-number">${isStart ? "🚩" : isFinish ? "🏆" : i}</span>
                <div class="track__tokens">
                    ${occupants
                        .map((p) => {
                            const cls = highlight?.playerId === p.id ? ` track__token--${highlight.cls}` : "";
                            return `
                                <span class="track__token${cls}" data-player-id="${p.id}" title="${esc(p.name)}">
                                    <span class="track__token-inner">${esc(p.avatar)}</span>
                                </span>
                            `;
                        })
                        .join("")}
                </div>
                ${dir ? `<span class="track__arrow track__arrow--${dir}">▶</span>` : ""}
            </div>
        `);
    }

    trackEl.innerHTML = cells.join("");
    requestAnimationFrame(() => flipTokens(beforeRects));
}

function resultMarkup(state, result) {
    const name = esc(playerName(state, state.turn.playerId));

    if (result.type === "advance") {
        return `<div class="result result--success"><span class="big">➡️</span>${name} avance d'une case !</div>`;
    }

    if (result.type === "megajump") {
        return result.success
            ? `<div class="result result--success"><span class="big">🚀</span>Mega Jump reussi ! ${name} avance de 3 cases.</div>`
            : `<div class="result result--fail"><span class="big">💥</span>Mega Jump rate... ${name} recule de 2 cases.</div>`;
    }

    if (result.type === "bonus") {
        const bonus = result.bonus;
        return `
            <div class="result"><span class="big">🎁</span>${name} ouvre la caisse...</div>
            <div class="bonus-reveal">
                <span class="icon">${esc(bonus.icon)}</span>
                <strong>${esc(bonus.label)}</strong>
                <p>${esc(bonus.description)}</p>
                <p class="secret-note">🤫 Ce bonus rejoint ton inventaire secret (max 2). Tu pourras l'utiliser lors d'un prochain tirage, via le choix "⚡ Utiliser un bonus".</p>
            </div>
        `;
    }

    if (result.type === "bonus-full") {
        return `<div class="result result--fail"><span class="big">🎁</span>Inventaire plein (2/2) ! ${name} ne peut pas ouvrir de nouvelle caisse.</div>`;
    }

    if (result.type === "bonus-used") {
        const def = getBonusDef(result.bonusId);
        const target = esc(result.targetName ?? "?");
        if (result.blocked) {
            return `<div class="result result--fail"><span class="big">🛡️</span>${target} bloque le bonus de ${name} grace a son bouclier !</div>`;
        }
        const phrase = {
            boost: `${name} utilise "Coup de boost" !`,
            swap: `${name} echange sa place avec ${target} !`,
            "send-back": `${name} renvoie ${target} au depart !`,
            sabotage: `${name} sabote ${target} (-2 cases) !`,
            twister: `${name} declenche un Twister ! Toutes les positions sont redistribuees !`,
            givre: `${name} givre ${target} : il/elle passera son prochain tour !`,
        }[result.bonusId] ?? `${name} utilise un bonus.`;
        return `<div class="result result--success"><span class="big">${esc(def?.icon ?? "⚡")}</span>${phrase}</div>`;
    }

    if (result.type === "vacation-skip") {
        return `<div class="result"><span class="big">🌴</span>${name} est en vacances : avance automatique d'une case. ${esc(result.substituteName)} prend la parole en premier !</div>`;
    }

    if (result.type === "frozen-skip") {
        return `<div class="result result--fail"><span class="big">❄️</span>${name} est givre(e) et passe son tour !</div>`;
    }

    return "";
}

function renderTurn(state, ui) {
    if (state.winnerId) {
        const winner = state.players.find((p) => p.id === state.winnerId);
        turnContentEl.innerHTML = `
            <div class="victory">
                <div class="victory__sunburst"></div>
                <div class="victory__trophy">🏆</div>
                <div class="victory__avatar">${esc(winner?.avatar ?? "🎉")}</div>
                <h2 class="victory__title">${esc(winner?.name ?? "?")}</h2>
                <p class="victory__subtitle">remporte la course !</p>
                <button class="dialog-btn dialog-btn--primary" type="button" data-action="new-race" style="margin-top:16px;">🔁 Nouvelle course</button>
            </div>
        `;
        return;
    }

    const current = state.players.find((p) => p.id === state.turn.playerId);
    if (!current) {
        turnContentEl.innerHTML = "";
        return;
    }

    if (state.turn.phase === "drawn") {
        if (ui?.bonusPickerOpen && current.bonuses.length > 0) {
            turnContentEl.innerHTML = renderBonusPicker(current);
            return;
        }

        const bonusCount = current.bonuses.length;
        const atCap = bonusCount >= 2;
        const hasUsableBonus = current.bonuses.some((b) => !b.passive);

        turnContentEl.innerHTML = `
            <div class="turn-announce"><span class="avatar">${esc(current.avatar)}</span>C'est au tour de ${esc(current.name)} !</div>
            <div class="choices">
                <button class="choice-btn choice-btn--advance" type="button" data-action="advance">
                    <span class="icon">➡️</span>
                    <span class="label">Avancer</span>
                    <span class="hint">+1 case</span>
                </button>
                <button class="choice-btn choice-btn--mega" type="button" data-action="megajump">
                    <span class="icon">🚀</span>
                    <span class="label">Mega Jump</span>
                    <span class="hint">1/3 chance: +3 · sinon -2</span>
                </button>
                <button class="choice-btn choice-btn--bonus" type="button" data-action="bonus-chest" ${atCap ? "disabled" : ""}>
                    <span class="icon">🎁</span>
                    <span class="label">Caisse bonus</span>
                    <span class="hint">${atCap ? "Inventaire plein (2/2)" : "Bonus secret aleatoire"}</span>
                </button>
                ${
                    hasUsableBonus
                        ? `
                <button class="choice-btn choice-btn--use-bonus" type="button" data-action="use-bonus-choice">
                    <span class="icon">⚡</span>
                    <span class="label">Utiliser un bonus</span>
                    <span class="hint">${bonusCount} en reserve</span>
                </button>`
                        : ""
                }
            </div>
        `;
        return;
    }

    if (state.turn.phase === "resolved") {
        turnContentEl.innerHTML = `
            ${resultMarkup(state, state.turn.lastResult)}
            <button class="ghost-btn ghost-btn--on-card" type="button" data-action="ack-turn" style="margin-top:14px;">✅ OK</button>
        `;
    }
}

function renderLog(state) {
    if (state.log.length === 0) {
        logListEl.innerHTML = `<li class="log-empty">Rien a raconter pour l'instant...</li>`;
        return;
    }

    logListEl.innerHTML = state.log
        .map((entry) => `<li>${esc(logLine(state, entry))}</li>`)
        .join("");
}

function logLine(state, entry) {
    if (entry.type === "drawn") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        return `🎯 ${name} a ete tire au sort.`;
    }
    if (entry.type === "vacation-skip") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        const substitute = entry.substituteName ?? playerName(state, entry.substituteId);
        return `🌴 ${name} a ete tire au sort (en vacances, avance automatique). ${substitute} prend la parole en premier.`;
    }
    if (entry.type === "frozen-skip") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        return `❄️ ${name} etait givre(e) et a passe son tour.`;
    }
    if (entry.type === "turn") {
        const name = entry.playerName ?? playerName(state, entry.playerId);
        const r = entry.result;
        if (r.type === "advance") return `➡️ ${name} a avance d'une case.`;
        if (r.type === "megajump") return r.success ? `🚀 ${name} a reussi un Mega Jump (+3).` : `💥 ${name} a rate un Mega Jump (-2).`;
        if (r.type === "bonus") return `🎁 ${name} a ouvert une caisse bonus.`;
        if (r.type === "bonus-full") return `🎁 ${name} a tente d'ouvrir une caisse, inventaire plein (2/2).`;
    }
    if (entry.type === "bonus-used") {
        const owner = entry.ownerName ?? playerName(state, entry.ownerId);
        const target = entry.targetName ?? (entry.targetId ? playerName(state, entry.targetId) : null);
        const def = getBonusDef(entry.bonusId);
        if (entry.blocked) return `🛡️ ${target} a bloque un bonus de ${owner} grace a son bouclier !`;
        if (def?.id === "boost") return `⚡ ${owner} a utilise "Coup de boost".`;
        if (def?.id === "swap") return `🔀 ${owner} a echange sa place avec ${target}.`;
        if (def?.id === "send-back") return `⏪ ${owner} a renvoye ${target} au depart.`;
        if (def?.id === "sabotage") return `💣 ${owner} a saboté ${target} (-2).`;
        if (def?.id === "twister") return `🌀 ${owner} a declenche un Twister (positions redistribuees).`;
        if (def?.id === "givre") return `❄️ ${owner} a givre ${target}.`;
        return `${owner} a utilise un bonus.`;
    }
    return "";
}

function bonusPickerItem(player, b) {
    if (b.passive) {
        return `
            <li class="peek-item">
                <span>${esc(b.icon)}</span>
                <span>${esc(b.label)} <em style="opacity:.7;">(actif en defense)</em></span>
            </li>
        `;
    }
    if (b.needsTarget) {
        const targets = eligibleTargets(player.id);
        return `
            <li>
                <div class="peek-item"><span>${esc(b.icon)}</span><span>${esc(b.label)}</span></div>
                <div class="target-picker" style="justify-content:flex-start;margin-top:4px;">
                    ${targets
                        .map(
                            (t) =>
                                `<button class="target-btn" type="button" data-action="use-bonus" data-owner-id="${player.id}" data-bonus-uid="${b.uid}" data-target-id="${t.id}">${esc(t.avatar)} ${esc(t.name)}</button>`
                        )
                        .join("") || `<em style="font-size:0.8rem;color:var(--ink-soft);">Pas de cible disponible</em>`}
                </div>
            </li>
        `;
    }
    return `
        <li class="peek-item">
            <span>${esc(b.icon)}</span>
            <span>${esc(b.label)}</span>
            <button class="target-btn" type="button" data-action="use-bonus" data-owner-id="${player.id}" data-bonus-uid="${b.uid}" style="margin-left:auto;">Utiliser</button>
        </li>
    `;
}

function renderBonusPicker(player) {
    return `
        <div class="turn-announce">${esc(player.avatar)} Choisis ton bonus...</div>
        <ul class="peek-list">
            ${player.bonuses.map((b) => bonusPickerItem(player, b)).join("")}
        </ul>
        <button class="ghost-btn ghost-btn--on-card" type="button" data-action="cancel-bonus-picker" style="margin-top:14px;">⬅️ Retour</button>
    `;
}

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
    const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 160);
    const left = Math.min(anchorRect.left, window.innerWidth - 200);
    avatarPickerEl.style.top = `${Math.max(8, top)}px`;
    avatarPickerEl.style.left = `${Math.max(8, left)}px`;
}

export function closeAvatarPicker() {
    avatarPickerEl.classList.add("hidden");
    avatarPickerEl.innerHTML = "";
    delete avatarPickerEl.dataset.playerId;
}

