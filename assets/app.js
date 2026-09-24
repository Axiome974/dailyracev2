import { getState, setState, subscribe, initState, exportStateString, importStateString } from "./js/state.js";
import { readStorageConfig, createStorage } from "./js/storage.js";
import { bindStorageUi, loadWithRetry } from "./js/storage-ui.js";
import { addPlayer, removePlayer, toggleVacation, setAvatar } from "./js/players.js";
import {
    drawPlayerOfTheDay,
    rollDie,
    resolveDiceRoll,
    resolveBonusReplace,
    resolveTileEffect,
    computeTileEffect,
    dieFaces,
    DIE_BONUS_FACE,
    startNewRace,
    setTrackLength,
} from "./js/game.js";
import {
    useBonus,
    BONUS_CATALOG,
    bonusDropConfig,
    boxBonusAvailable,
    setBonusWeight,
    setBonusSource,
    resetDropRates,
} from "./js/bonuses.js";
import { renderAll, esc, toggleAvatarPicker, closeAvatarPicker, toggleInventoryPopover, closeInventoryPopover, openTurnModal, closeTurnModal, renderSpinFrame, renderIntroFrame, setDieFace, renderDebugPanel, hopPilot, vanishTileEffects, APPEAR_STAGGER_MS } from "./js/render.js";
import {
    ensureBoard,
    withFreshBoard,
    countTileEffects,
    tileEffectBounds,
    setTileEffectBounds,
    MALUS_CATALOG,
    malusDropConfig,
    setMalusWeight,
    setMalusSource,
} from "./js/tiles.js";
import { alertDialog, confirmDialog, promptDialog } from "./js/dialog.js";
import { fireGrandFinale, preloadCelebration } from "./js/celebration.js";
import { sfx, isMuted, setMuted } from "./js/sound.js";
import {
    debugSetPosition,
    debugAddBonus,
    debugRemoveBonus,
    debugSetFrozen,
    debugSetShielded,
    debugResetTurn,
    debugRedrawBoard,
} from "./js/debug.js";

const VICTORY_CONFETTI = ["#d9ff43", "#ffab64", "#80d7ff", "#f788d0", "#ffffff"];
const flashLayerEl = document.getElementById("flash-layer");
const appEl = document.querySelector(".shell");

preloadCelebration();

function renderSoundButton() {
    const btn = document.getElementById("sound-btn");
    btn.textContent = isMuted() ? "🔇" : "🔊";
    btn.title = isMuted() ? "Activer le son" : "Couper le son";
    btn.setAttribute("aria-label", btn.title);
}
renderSoundButton();

// Son de l'effet d'une case, une fois applique (apres "Poursuivre").
function tileEffectSound(tile) {
    if (tile.blocked) sfx.shield();
    else if (tile.kind === "malus") sfx.back();
    else sfx.yes();
}

// Son du resultat d'une action jouee sur cet appareil (lu dans l'etat juste
// apres la resolution).
function playOutcomeSound() {
    const { phase, lastResult: r, pendingTile, bonusUsed } = getState().turn;
    if (phase === "drawn" && bonusUsed) {
        if (bonusUsed.blocked) sfx.shield();
        else sfx.bonus();
        return;
    }
    if (phase === "bonus-full") {
        sfx.gift();
        return;
    }
    // Arrivee sur une case speciale : annonce (les pas ont deja sonne).
    if (phase === "tile-pending") {
        if (pendingTile.kind === "malus") sfx.malus();
        else sfx.bonus();
        return;
    }
    if (!r) return;
    if (r.type === "dice-bonus") {
        sfx.gift();
    } else if (r.type === "bonus-used") {
        if (r.blocked) sfx.shield();
        else sfx.bonus();
    }
}

const MAX_DROP_WEIGHT = 10;

function dropRow(kind, def, cfg, sources) {
    const off = cfg.weight <= 0 || sources.every((src) => !cfg[src]);
    const labels = { board: "Plateau", box: "Boîte bonus" };
    return `
        <div class="drop-row drop-row--${kind}${off ? " drop-row--off" : ""}">
            <span class="drop-row__icon">${esc(def.icon)}</span>
            <span class="drop-row__label">${esc(def.label)}</span>
            <span class="drop-row__sources">
                ${sources
                    .map(
                        (src) => `
                    <label class="drop-check">
                        <input type="checkbox" class="drop-source" data-kind="${kind}" data-id="${def.id}" data-source="${src}" ${cfg[src] ? "checked" : ""} />
                        ${labels[src]}
                    </label>`
                    )
                    .join("")}
            </span>
            <input class="drop-range" type="range" min="0" max="${MAX_DROP_WEIGHT}" step="1" value="${cfg.weight}" data-kind="${kind}" data-id="${def.id}" aria-label="Taux d'apparition : ${esc(def.label)}" />
            <output class="drop-value">${cfg.weight || "Jamais"}</output>
        </div>
    `;
}

function dropWarnings(state, bonusCfgs, malusCfgs) {
    const warnings = [];
    if (!boxBonusAvailable(state)) warnings.push("⚠️ Aucun bonus dans les boîtes : le dé n'a plus de face 🎁 (1 à 3 uniquement).");
    if (!bonusCfgs.some((c) => c.board && c.weight > 0)) warnings.push("ℹ️ Aucun bonus ramassable : pas de case bonus sur le plateau.");
    if (!malusCfgs.some((c) => c.board && c.weight > 0)) warnings.push("ℹ️ Aucun malus actif : pas de case malus sur le plateau.");
    return warnings.map((w) => `<p class="drop-warning">${w}</p>`).join("");
}

function renderDropRates() {
    const state = getState();
    const bonusCfgs = BONUS_CATALOG.map((b) => bonusDropConfig(b.id, state));
    const malusCfgs = MALUS_CATALOG.map((m) => malusDropConfig(m.id, state));

    document.getElementById("bonus-weights").innerHTML = `
        <div id="drop-warnings">${dropWarnings(state, bonusCfgs, malusCfgs)}</div>
        <p class="drop-section">⚡ Bonus</p>
        ${BONUS_CATALOG.map((b, i) => dropRow("bonus", b, bonusCfgs[i], ["board", "box"])).join("")}
        <p class="drop-section">☠️ Malus <small>Uniquement sur le plateau, jamais dans les boîtes.</small></p>
        ${MALUS_CATALOG.map((m, i) => dropRow("malus", m, malusCfgs[i], ["board"])).join("")}
    `;
}

// Mise a jour sans reconstruire la liste (garde le focus sur la barre ou la
// case a cocher en cours d'utilisation, clavier compris).
function refreshDropRates() {
    const state = getState();
    const bonusCfgs = BONUS_CATALOG.map((b) => bonusDropConfig(b.id, state));
    const malusCfgs = MALUS_CATALOG.map((m) => malusDropConfig(m.id, state));
    document.getElementById("drop-warnings").innerHTML = dropWarnings(state, bonusCfgs, malusCfgs);
    const rows = [
        ...BONUS_CATALOG.map((b, i) => ["bonus", b.id, bonusCfgs[i], ["board", "box"]]),
        ...MALUS_CATALOG.map((m, i) => ["malus", m.id, malusCfgs[i], ["board"]]),
    ];
    rows.forEach(([kind, id, cfg, sources]) => {
        const row = document.querySelector(`.drop-range[data-kind="${kind}"][data-id="${id}"]`)?.closest(".drop-row");
        row?.classList.toggle("drop-row--off", cfg.weight <= 0 || sources.every((src) => !cfg[src]));
    });
}

const TILE_INPUTS = {
    bonusMin: "settings-bonus-min",
    bonusMax: "settings-bonus-max",
    malusMin: "settings-malus-min",
    malusMax: "settings-malus-max",
};

function fillTileEffectSettings() {
    const { bonus, malus, slots } = tileEffectBounds();
    const values = { bonusMin: bonus.min, bonusMax: bonus.max, malusMin: malus.min, malusMax: malus.max };
    Object.entries(TILE_INPUTS).forEach(([key, id]) => {
        const el = document.getElementById(id);
        el.value = values[key];
        el.max = slots;
    });
    document.getElementById("settings-tiles-hint").textContent =
        `À chaque nouveau tirage, un nombre aléatoire de cases bonus et de cases malus, chacun entre son min et son max (0 à ${slots}). Min = max : nombre exact.`;
}

function readTileEffectSettings() {
    const { slots } = tileEffectBounds();
    const cfg = {};
    for (const [key, id] of Object.entries(TILE_INPUTS)) {
        const n = Number(document.getElementById(id).value);
        if (!Number.isInteger(n) || n < 0 || n > slots) return null;
        cfg[key] = n;
    }
    if (cfg.bonusMin > cfg.bonusMax || cfg.malusMin > cfg.malusMax) return null;
    if (cfg.bonusMin + cfg.malusMin > slots) return null;
    return cfg;
}

document.addEventListener("keydown", (e) => {
    // Pions ciblables du plateau : activables au clavier comme des boutons.
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-action]')) {
        e.preventDefault();
        e.target.click();
        return;
    }
    if (e.key !== "Escape") return;
    closeInventoryPopover();
    ["settings-modal", "bonus-weights-modal", "bonus-catalog-modal", "debug-modal"].forEach((id) => {
        const modal = document.getElementById(id);
        if (!modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
        }
    });
});

document.addEventListener("change", (e) => {
    const playerId = e.target.dataset?.playerId;
    if (e.target.matches(".debug-pos")) {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) debugSetPosition(playerId, n);
        return;
    }
    if (e.target.matches(".debug-add-bonus")) {
        if (e.target.value) debugAddBonus(playerId, e.target.value);
        return;
    }
    if (e.target.matches(".debug-shielded")) {
        debugSetShielded(playerId, e.target.checked);
        return;
    }
    if (e.target.matches(".debug-frozen")) {
        debugSetFrozen(playerId, e.target.value === "givre" ? true : e.target.value || false);
        return;
    }
    const { kind, id } = e.target.dataset;
    if (e.target.matches(".drop-range")) {
        const w = Math.max(0, Math.min(MAX_DROP_WEIGHT, Math.round(Number(e.target.value)) || 0));
        if (kind === "bonus") setBonusWeight(id, w);
        else setMalusWeight(id, w);
        refreshDropRates();
        return;
    }
    if (e.target.matches(".drop-source")) {
        if (kind === "bonus") setBonusSource(id, e.target.dataset.source, e.target.checked);
        else setMalusSource(id, e.target.checked);
        refreshDropRates();
    }
});

// Valeur affichee en direct pendant qu'on fait glisser la barre.
document.addEventListener("input", (e) => {
    if (!e.target.matches(".drop-range")) return;
    const out = e.target.parentElement.querySelector(".drop-value");
    out.textContent = Number(e.target.value) || "Jamais";
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
// Etat d'interface local (jamais synchronise) :
// - turnStep : etape de la phase "drawn" ("ask" = utiliser un bonus ?,
//   "pick" = choix du bonus, "target" = choix de la cible, "roll" = de) ;
// - selectedBonusUid : bonus choisi qui attend sa cible ;
// - introStage : "spin" / "reveal" pendant l'intro plein ecran du tirage.
const uiState = { turnStep: null, selectedBonusUid: null, introStage: null };

function render() {
    const state = getState();
    if (state.turn.phase !== "drawn") {
        uiState.turnStep = null;
        uiState.selectedBonusUid = null;
    }
    renderAll(state, uiState);
    if (!document.getElementById("debug-modal").classList.contains("hidden")) renderDebugPanel(state);
    if (state.winnerId && state.winnerId !== previousWinnerId) {
        flashScreen();
        shakeScreen();
        fireGrandFinale(VICTORY_CONFETTI);
        sfx.victory();
    }
    previousWinnerId = state.winnerId;
}

// Stockage choisi par la page : localStorage en demo, serveur en mode
// connecte. Rien n'est rendu avant que la partie soit chargee.
const storage = createStorage(readStorageConfig());
bindStorageUi(storage);
initState(await loadWithRetry(storage), (state) => storage.save(state));

subscribe(render);
ensureBoard();
render();

addPlayerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (addPlayer(addPlayerInput.value)) {
        addPlayerInput.value = "";
    }
    addPlayerInput.focus();
});

// Le tirage garde un moment plein ecran (roulette puis annonce du pilote),
// ferme par le bouton "C'est parti !" : le tour se joue ensuite dans la
// console, plateau visible.
const narrowScreen = window.matchMedia("(max-width: 1000px)");

function showIntro(pick) {
    if (!pick) {
        closeIntro();
        return;
    }
    uiState.introStage = "reveal";
    const state = getState();
    const substitute = pick.onVacation
        ? state.players.find((p) => p.id === state.turn.lastResult?.substituteId) ?? null
        : null;
    renderIntroFrame(pick, substitute);
    if (pick.onVacation || pick.frozen) sfx.skip();
    else sfx.reveal();
}

function closeIntro() {
    uiState.introStage = null;
    closeTurnModal();
    render();
    if (narrowScreen.matches && getState().turn.phase !== "idle") {
        document.getElementById("board").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function playDrawAnimation() {
    const state = getState();
    const candidates = state.players.filter((p) => p.id !== state.winnerId);
    uiState.introStage = "spin";
    openTurnModal();
    if (candidates.length < 2) {
        showIntro(drawPlayerOfTheDay());
        return;
    }

    const start = performance.now();
    const totalDuration = 1100;
    let delay = 70;

    function tick() {
        const p = candidates[Math.floor(Math.random() * candidates.length)];
        renderSpinFrame(p);
        sfx.tick();
        if (performance.now() - start < totalDuration) {
            delay = Math.min(delay * 1.15, 220);
            setTimeout(tick, delay);
        } else {
            showIntro(drawPlayerOfTheDay());
        }
    }
    tick();
}

function setTurnStep(step) {
    uiState.turnStep = step;
    render();
}

const DIE_ROLL_DURATION = 1250;
const DIE_SETTLE_DELAY = 650;

// Le resultat est tire des le clic, l'animation ne fait que "chercher" la
// face avant de s'y arreter ; l'etat n'est modifie qu'une fois le de pose.
// Fin de tour : les cases bonus/malus restantes s'evaporent, puis le plateau
// est redistribue pour le prochain tirage (selon les taux d'apparition du
// moment). Fin de tour et nouveau plateau forment une seule mise a jour,
// faite apres l'animation : aucun tirage ne peut se glisser entre les deux.
let endingTurn = false;

async function endTurn(button) {
    if (endingTurn) return;
    endingTurn = true;
    button.disabled = true;

    if (countTileEffects(getState()) > 0) sfx.vanish();
    await vanishTileEffects();

    setState((s) => withFreshBoard({ ...s, turn: { ...s.turn, phase: "idle" } }, true));
    const appeared = countTileEffects(getState());
    if (appeared > 0) sfx.appear(appeared, APPEAR_STAGGER_MS);

    // Fin de tour : on enregistre sans attendre le regroupement.
    storage.flush();
    endingTurn = false;
}

// Effets qui font avancer/reculer le pion le long de la piste : on les anime
// case par case (les autres, echange/twister, glissent directement).
const WALKING_EFFECTS = new Set(["boost", "pothole", "oil"]);
let tileEffectBusy = false;

// Joue l'effet de la case annoncee : calcule le nouvel etat, anime le
// deplacement du pion, puis valide. Si l'effet mene sur une autre case
// speciale, elle est annoncee a son tour (combo).
async function playTileEffect(targetId) {
    if (tileEffectBusy) return;
    const before = getState();
    const next = computeTileEffect(before, targetId);
    if (next === before) return;

    tileEffectBusy = true;
    document.querySelectorAll("#draw-controls button").forEach((b) => (b.disabled = true));
    const playerId = before.turn.playerId;
    const from = before.players.find((p) => p.id === playerId)?.position;
    const to = next.players.find((p) => p.id === playerId)?.position;
    const applied = (next.turn.tileChain ?? next.turn.lastResult?.tiles ?? [next.turn.lastResult?.tile]).at(-1);

    if (applied) tileEffectSound(applied);
    if (WALKING_EFFECTS.has(before.turn.pendingTile.id) && from !== to && !applied?.blocked) {
        await new Promise((r) => setTimeout(r, 250));
        await hopPilot(playerId, from, to, (n) => sfx.hop(n));
    }

    // Si l'etat a change pendant l'animation (sync distante), on recalcule.
    if (getState() === before) setState(next);
    else resolveTileEffect(targetId);
    tileEffectBusy = false;

    const turn = getState().turn;
    if (turn.phase === "tile-pending") {
        const combo = (turn.tileChain?.length ?? 0) + 1;
        setTimeout(() => {
            sfx.combo(combo);
            if (turn.pendingTile.kind === "malus") sfx.malus();
            else sfx.bonus();
        }, 150);
    } else if (turn.lastResult?.combo >= 2) {
        setTimeout(() => sfx.combo(turn.lastResult.combo + 1), 150);
    }
}

function playDieRoll(btnEl) {
    const dieEl = document.getElementById("die");
    if (!dieEl) return;
    btnEl.disabled = true;
    const roll = rollDie();
    const faces = dieFaces();
    dieEl.classList.add("is-rolling");
    const interval = setInterval(() => {
        setDieFace(dieEl, 1 + Math.floor(Math.random() * faces));
        sfx.rattle();
    }, 75);
    setTimeout(() => {
        clearInterval(interval);
        setDieFace(dieEl, roll);
        dieEl.classList.remove("is-rolling");
        sfx.dieLand();
        setTimeout(async () => {
            // Le pion avance case par case sous nos yeux, puis l'etat est
            // mis a jour (arrivee, eventuelle case speciale a annoncer).
            if (roll !== DIE_BONUS_FACE) {
                const state = getState();
                const player = state.players.find((p) => p.id === state.turn.playerId);
                if (player) {
                    const to = Math.min(state.track.length, player.position + roll);
                    await hopPilot(player.id, player.position, to, (n) => sfx.hop(n));
                }
            }
            resolveDiceRoll(roll);
            playOutcomeSound();
        }, DIE_SETTLE_DELAY);
    }, DIE_ROLL_DURATION);
}

document.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) {
        closeAvatarPicker();
        if (!e.target.closest("#inventory-popover")) closeInventoryPopover();
        return;
    }
    if (!target.closest("#inventory-popover") && target.dataset.action !== "show-inventory") closeInventoryPopover();

    const action = target.dataset.action;

    switch (action) {
        case "draw":
            ensureBoard();
            playDrawAnimation();
            break;
        case "bonus-yes":
            sfx.yes();
            setTurnStep("pick");
            break;
        case "bonus-no":
            sfx.no();
            setTurnStep("roll");
            break;
        case "cancel-bonus-picker":
            sfx.click();
            setTurnStep("ask");
            break;
        case "roll-die":
            playDieRoll(target);
            break;
        case "replace-bonus":
            sfx.click();
            resolveBonusReplace(target.dataset.bonusUid);
            break;
        case "keep-bonuses":
            sfx.click();
            resolveBonusReplace(null);
            break;
        case "tile-target":
        case "tile-continue":
            playTileEffect(target.dataset.targetId ?? null);
            break;
        case "use-bonus":
            useBonus(target.dataset.ownerId, target.dataset.bonusUid, target.dataset.targetId || null);
            playOutcomeSound();
            break;
        case "select-bonus": {
            const state = getState();
            const owner = state.players.find((p) => p.id === state.turn.playerId);
            const bonus = owner?.bonuses.find((b) => b.uid === target.dataset.bonusUid);
            if (!bonus) break;
            if (bonus.needsTarget) {
                sfx.click();
                uiState.selectedBonusUid = bonus.uid;
                setTurnStep("target");
            } else {
                useBonus(owner.id, bonus.uid, null);
                playOutcomeSound();
            }
            break;
        }
        case "back-to-pick":
            sfx.click();
            uiState.selectedBonusUid = null;
            setTurnStep("pick");
            break;
        case "close-intro":
            if (uiState.introStage === "reveal") {
                sfx.click();
                closeIntro();
            }
            break;
        case "toggle-sound":
            setMuted(!isMuted());
            renderSoundButton();
            sfx.click();
            break;
        case "ack-turn":
            sfx.click();
            endTurn(target);
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
            fillTileEffectSettings();
            document.getElementById("settings-modal").classList.remove("hidden");
            break;
        case "open-bonus-weights":
            renderDropRates();
            document.getElementById("bonus-weights-modal").classList.remove("hidden");
            break;
        case "close-bonus-weights":
            document.getElementById("bonus-weights-modal").classList.add("hidden");
            break;
        case "reset-weights":
            resetDropRates();
            renderDropRates();
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
        case "apply-tile-effects": {
            const cfg = readTileEffectSettings();
            if (!cfg) {
                const { slots } = tileEffectBounds();
                await alertDialog(
                    `Chaque valeur doit être un entier entre 0 et ${slots}, avec min ≤ max, et la somme des deux minimums ne peut pas dépasser ${slots}.`,
                    "Valeurs invalides"
                );
                break;
            }
            if (
                await confirmDialog(
                    `Bonus : ${cfg.bonusMin} à ${cfg.bonusMax} · Malus : ${cfg.malusMin} à ${cfg.malusMax}. Les cases vont être redistribuées tout de suite.`,
                    "Appliquer ces réglages ?"
                )
            ) {
                setTileEffectBounds(cfg);
                fillTileEffectSettings();
            }
            break;
        }
        case "open-debug":
            document.getElementById("settings-modal").classList.add("hidden");
            renderDebugPanel(getState());
            document.getElementById("debug-modal").classList.remove("hidden");
            break;
        case "close-debug":
            document.getElementById("debug-modal").classList.add("hidden");
            break;
        case "debug-remove-bonus":
            debugRemoveBonus(target.dataset.playerId, target.dataset.bonusUid);
            break;
        case "debug-redraw-board":
            debugRedrawBoard();
            break;
        case "debug-reset-turn":
            if (await confirmDialog("Le tour en cours sera annulé (sans effet sur les scores).", "Réinitialiser le tour ?")) {
                debugResetTurn();
            }
            break;
        case "show-inventory":
            closeAvatarPicker();
            toggleInventoryPopover(getState(), target.dataset.playerId, target.getBoundingClientRect());
            break;
        case "close-inventory":
            closeInventoryPopover();
            break;
        case "pick-avatar":
            setAvatar(target.dataset.playerId, target.dataset.avatar);
            closeAvatarPicker();
            break;
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

