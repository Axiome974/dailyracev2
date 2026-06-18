import { getState, setState, subscribe, exportStateString, importStateString } from "./js/state.js";
import { addPlayer, removePlayer, toggleVacation, setAvatar } from "./js/players.js";
import { drawPlayerOfTheDay, resolveAdvance, resolveMegaJump, resolveBonusChest, startNewRace } from "./js/game.js";
import { useBonus } from "./js/bonuses.js";
import { renderAll, fireConfetti, esc, toggleAvatarPicker, closeAvatarPicker, openTurnModal } from "./js/render.js";
import { initRemote, claimPlayer } from "./js/remote.js";
import { alertDialog, confirmDialog, promptDialog } from "./js/dialog.js";

const addPlayerForm = document.getElementById("add-player-form");
const addPlayerInput = document.getElementById("add-player-input");
const turnContentEl = document.getElementById("turn-content");

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
        fireConfetti();
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
        turnContentEl.innerHTML = `<div class="spin-announce"><span class="avatar">${esc(p.avatar)}</span>${esc(p.name)} ?</div>`;
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
    document.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
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
            playChoiceCharge(target, "choice-btn--charging-advance", resolveAdvance, 450, { reveal: true });
            break;
        case "megajump":
            playChoiceCharge(target, "choice-btn--charging-mega", resolveMegaJump, 650, { reveal: true });
            break;
        case "bonus-chest":
            playChoiceCharge(target, "choice-btn--charging-bonus", resolveBonusChest, 550);
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
            if (await confirmDialog("Les positions et bonus seront remis a zero.", "Demarrer une nouvelle course ?")) {
                startNewRace();
            }
            break;
        case "export-session": {
            const code = exportStateString();
            navigator.clipboard?.writeText(code).catch(() => {});
            await promptDialog(
                "Deja copie dans le presse-papier si possible. Sinon, selectionne et copie ce code manuellement :",
                code,
                "Code de session"
            );
            break;
        }
        case "import-session": {
            const code = await promptDialog("Colle le code de session recu :", "", "Importer une session");
            if (!code) break;
            try {
                if (await confirmDialog("Ta partie locale actuelle sera remplacee.", "Charger cette session ?")) {
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
        case "flip-track-card": {
            const flipEl = document.getElementById("track-flip");
            const flipped = flipEl.classList.toggle("is-flipped");
            target.textContent = flipped ? "🏁" : "📖";
            target.title = flipped ? "Revenir a la piste" : "Voir le journal de bord";
            break;
        }
        default:
            break;
    }
});

initRemote(render);
