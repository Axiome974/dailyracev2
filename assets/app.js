import { getState, setState, subscribe, exportStateString, importStateString } from "./js/state.js";
import { addPlayer, removePlayer, toggleVacation, setAvatar } from "./js/players.js";
import {
    drawPlayerOfTheDay,
    resolveAdvance,
    resolveMegaJump,
    resolveBonusChest,
    startNewRace,
    setTrackLength,
} from "./js/game.js";
import { useBonus, BONUS_CATALOG, setBonusWeight, resetBonusWeights } from "./js/bonuses.js";
import { renderAll, esc, toggleAvatarPicker, closeAvatarPicker, openTurnModal, renderSpinFrame } from "./js/render.js";
import { initRemote, claimPlayer } from "./js/remote.js";
import { alertDialog, confirmDialog, promptDialog } from "./js/dialog.js";
import { fireGrandFinale, preloadCelebration } from "./js/celebration.js";

const VICTORY_CONFETTI = ["#d9ff43", "#ffab64", "#80d7ff", "#f788d0", "#ffffff"];
const flashLayerEl = document.getElementById("flash-layer");
const appEl = document.querySelector(".shell");

preloadCelebration();

function renderBonusWeights() {
    const container = document.getElementById("bonus-weights");
    const weights = getState().bonusWeights ?? {};
    container.innerHTML = BONUS_CATALOG.map((b) => {
        const w = weights[b.id] ?? 1;
        return `
            <div class="bonus-weight-row${w <= 0 ? " bonus-weight-row--disabled" : ""}">
                <span class="bonus-weight-row__icon">${esc(b.icon)}</span>
                <span class="bonus-weight-row__label">${esc(b.label)}</span>
                <input class="bonus-weight-row__input" type="number" min="0" max="10" step="1" value="${w}" data-bonus-id="${b.id}" />
            </div>
        `;
    }).join("");
}

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["settings-modal", "bonus-weights-modal", "bonus-catalog-modal"].forEach((id) => {
        const modal = document.getElementById(id);
        if (!modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
        }
    });
});

document.addEventListener("change", (e) => {
    if (!e.target.matches(".bonus-weight-row__input")) return;
    const raw = Math.round(Number(e.target.value));
    const w = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 1;
    e.target.value = w;
    setBonusWeight(e.target.dataset.bonusId, w);
    e.target.closest(".bonus-weight-row")?.classList.toggle("bonus-weight-row--disabled", w <= 0);
});

function flashScreen() {
    flashLayerEl.classList.remove("flash-active");
    requestAnimationFrame(() => flashLayerEl.classList.add("flash-active"));
}

function shakeScreen() {
    appEl.classList.remove("screen-shake");
    requestAnimationFrame(() => appEl.classList.add("screen-shake"));
    setTimeout(() => appEl.classList.remove("screen-shake"), 500);
}

const addPlayerForm = document.getElementById("add-player-form");
const addPlayerInput = document.getElementById("add-player-input");

let previousWinnerId = null;
const uiState = { bonusPickerOpen: false, modalSuppressed: false };

// Masque la modale le temps que l'animation du pion (deplacement sur le
// plateau) se joue derriere, puis la rouvre avec le resultat.
const BOARD_REVEAL_DELAY = 750;

function resolveWithBoardReveal(resolveFn) {
    uiState.modalSuppressed = true;
    render();
    resolveFn();
    setTimeout(() => {
        uiState.modalSuppressed = false;
        render();
    }, BOARD_REVEAL_DELAY);
}

function render() {
    const state = getState();
    if (state.turn.phase !== "drawn") uiState.bonusPickerOpen = false;
    renderAll(state, uiState);
    if (state.winnerId && state.winnerId !== previousWinnerId) {
        flashScreen();
        shakeScreen();
        fireGrandFinale(VICTORY_CONFETTI);
    }
    previousWinnerId = state.winnerId;
}

subscribe(render);
render();

addPlayerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (addPlayer(addPlayerInput.value)) {
        addPlayerInput.value = "";
    }
    addPlayerInput.focus();
});

function playDrawAnimation() {
    const state = getState();
    const candidates = state.players.filter((p) => p.id !== state.winnerId);
    if (candidates.length < 2) {
        drawPlayerOfTheDay();
        return;
    }

    openTurnModal();
    const start = performance.now();
    const totalDuration = 1100;
    let delay = 70;

    function tick() {
        const p = candidates[Math.floor(Math.random() * candidates.length)];
        renderSpinFrame(p);
        if (performance.now() - start < totalDuration) {
            delay = Math.min(delay * 1.15, 220);
            setTimeout(tick, delay);
        } else {
            drawPlayerOfTheDay();
        }
    }
    tick();
}

function playChoiceCharge(btnEl, chargeClass, resolveFn, delay, { reveal = false } = {}) {
    document.querySelectorAll(".choice").forEach((b) => (b.disabled = true));
    btnEl.classList.add(chargeClass);
    setTimeout(() => {
        if (reveal) {
            resolveWithBoardReveal(resolveFn);
        } else {
            resolveFn();
        }
    }, delay);
}

document.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) {
        closeAvatarPicker();
        return;
    }

    const action = target.dataset.action;

    switch (action) {
        case "draw":
            playDrawAnimation();
            break;
        case "advance":
            playChoiceCharge(target, "choice--charging-advance", resolveAdvance, 450, { reveal: true });
            break;
        case "megajump":
            playChoiceCharge(target, "choice--charging-mega", resolveMegaJump, 650, { reveal: true });
            break;
        case "bonus-chest":
            playChoiceCharge(target, "choice--charging-bonus", resolveBonusChest, 550);
            break;
        case "use-bonus-choice":
            uiState.bonusPickerOpen = true;
            render();
            break;
        case "cancel-bonus-picker":
            uiState.bonusPickerOpen = false;
            render();
            break;
        case "use-bonus":
            resolveWithBoardReveal(() =>
                useBonus(target.dataset.ownerId, target.dataset.bonusUid, target.dataset.targetId || null)
            );
            break;
        case "ack-turn":
            setState((s) => ({ ...s, turn: { ...s.turn, phase: "idle" } }));
            break;
        case "remove-player":
            if (await confirmDialog("Retirer ce joueur de la course ?")) {
                removePlayer(target.dataset.playerId);
            }
            break;
        case "toggle-vacation":
            toggleVacation(target.dataset.playerId);
            break;
        case "new-race":
            if (await confirmDialog("Les positions et bonus seront remis à zéro.", "Démarrer une nouvelle course ?")) {
                startNewRace();
            }
            break;
        case "open-settings":
            document.getElementById("settings-target").value = getState().track.length;
            document.getElementById("settings-modal").classList.remove("hidden");
            break;
        case "open-bonus-weights":
            renderBonusWeights();
            document.getElementById("bonus-weights-modal").classList.remove("hidden");
            break;
        case "close-bonus-weights":
            document.getElementById("bonus-weights-modal").classList.add("hidden");
            break;
        case "reset-weights":
            resetBonusWeights();
            renderBonusWeights();
            break;
        case "close-settings":
            document.getElementById("settings-modal").classList.add("hidden");
            break;
        case "apply-target": {
            const current = getState().track.length;
            const raw = document.getElementById("settings-target").value;
            const n = Math.round(Number(raw));
            if (!Number.isFinite(n) || n < 3 || n > 50) {
                await alertDialog("Choisis un nombre entier entre 3 et 50.", "Valeur invalide");
                break;
            }
            if (n === current) break;
            if (
                await confirmDialog(
                    `Objectif fixé à ${n}. La course va redémarrer (positions et bonus remis à zéro).`,
                    "Confirmer ?"
                )
            ) {
                setTrackLength(n);
            }
            break;
        }
        case "export-session": {
            const code = exportStateString();
            navigator.clipboard?.writeText(code).catch(() => {});
            await promptDialog(
                "Déjà copié dans le presse-papier si possible. Sinon, sélectionne et copie ce code manuellement :",
                code,
                "Code de session"
            );
            break;
        }
        case "import-session": {
            const code = await promptDialog("Colle le code de session reçu :", "", "Importer une session");
            if (!code) break;
            try {
                if (await confirmDialog("Ta partie locale actuelle sera remplacée.", "Charger cette session ?")) {
                    importStateString(code);
                }
            } catch (err) {
                await alertDialog("Code invalide ou corrompu.", "Import impossible");
            }
            break;
        }
        case "change-avatar": {
            const rect = target.getBoundingClientRect();
            toggleAvatarPicker(getState(), target.dataset.playerId, rect);
            e.stopPropagation();
            break;
        }
        case "pick-avatar":
            setAvatar(target.dataset.playerId, target.dataset.avatar);
            closeAvatarPicker();
            break;
        case "claim-player": {
            const select = document.getElementById("claim-select");
            claimPlayer(select?.value);
            break;
        }
        case "show-bonus-help":
            document.getElementById("bonus-catalog-modal").classList.remove("hidden");
            break;
        case "close-bonus-catalog":
            document.getElementById("bonus-catalog-modal").classList.add("hidden");
            break;
        default:
            break;
    }
});

initRemote(render);
