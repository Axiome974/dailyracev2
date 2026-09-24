// Stockage de la partie. Deux adaptateurs, choisis par la page
// (<body data-storage="...">, voir templates/game/play.html.twig) :
//
// - "local" (mode demo, /demo) : localStorage, cle DEMO_STORAGE_KEY. C'est le
//   comportement historique du jeu, inchange.
// - "server" (mode connecte, /sessions/{id}/play) : l'API GET/PUT de la
//   partie. Il ne lit ni n'ecrit JAMAIS la cle de la demo : les deux modes
//   cohabitent dans le meme navigateur sans se toucher.
//
// Interface commune : load() -> Promise<etat|null>, save(etat), flush(),
// onStatus(fn). Statuts du serveur : "loading", "dirty", "saving", "saved",
// "offline" (nouvel essai automatique), "conflict", "auth", "forbidden",
// "invalid", "load-error".

// Aussi lue par le formulaire de creation de partie pour proposer de
// reprendre la demo (assets/controllers/demo_import_controller.js).
export const DEMO_STORAGE_KEY = "daily-rope-state-v1";

// Regroupe les modifications rapprochees (de qui roule, bonds du pion...) en
// une seule sauvegarde.
const SAVE_DEBOUNCE_MS = 800;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;

export function readStorageConfig() {
    try {
        const config = JSON.parse(document.body.dataset.storage ?? "");
        if (config?.mode === "server" && config.stateUrl) return config;
    } catch {
        // pas de configuration : mode demo
    }
    return { mode: "local" };
}

export function createStorage(config) {
    return config.mode === "server" ? createServerStorage(config) : createLocalStorage();
}

function createLocalStorage() {
    return {
        mode: "local",
        async load() {
            try {
                const raw = localStorage.getItem(DEMO_STORAGE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (err) {
                console.warn("Etat local illisible, nouvelle partie.", err);
                return null;
            }
        },
        save(state) {
            try {
                localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
            } catch (err) {
                console.warn("Impossible de sauvegarder l'etat.", err);
            }
        },
        flush() {},
        onStatus() {},
    };
}

class StorageError extends Error {
    constructor(kind, status = 0) {
        super(kind);
        this.kind = kind;
        this.status = status;
    }
}

function createServerStorage({ stateUrl }) {
    let version = null;
    let pending = null; // dernier etat pas encore envoye
    let inFlight = false;
    let debounceTimer = null;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let blocked = false; // conflit, session expiree... : plus aucune sauvegarde
    const listeners = new Set();

    const emit = (status, detail = {}) => listeners.forEach((fn) => fn(status, detail));

    async function request(method, body, { keepalive = false } = {}) {
        let response;
        try {
            response = await fetch(stateUrl, {
                method,
                headers: {
                    Accept: "application/json",
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                credentials: "same-origin",
                keepalive,
            });
        } catch {
            throw new StorageError("network");
        }

        // Session expiree : le firewall redirige vers le menu (page HTML).
        if (response.redirected || response.status === 401) throw new StorageError("auth", response.status);
        if (response.status === 403) throw new StorageError("forbidden", 403);
        if (response.status === 409) throw new StorageError("conflict", 409);
        if (response.status === 422) throw new StorageError("invalid", 422);
        if (!response.ok) throw new StorageError("network", response.status);
        return response.json();
    }

    function scheduleRetry() {
        clearTimeout(retryTimer);
        emit("offline", { retryInMs: retryDelay });
        retryTimer = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    }

    async function flush() {
        clearTimeout(debounceTimer);
        clearTimeout(retryTimer);
        if (blocked || inFlight || !pending) return;

        inFlight = true;
        const snapshot = pending;
        pending = null;
        emit("saving");

        try {
            const data = await request("PUT", { version, state: snapshot });
            version = data.version;
            retryDelay = RETRY_MIN_MS;
            inFlight = false;
            if (pending) flush();
            else emit("saved");
        } catch (err) {
            inFlight = false;
            if (err.kind === "network") {
                // L'etat envoye reste a sauvegarder, sauf si un plus recent
                // (qui le contient) attend deja.
                pending ??= snapshot;
                scheduleRetry();
            } else {
                blocked = true;
                emit(err.kind);
            }
        }
    }

    // Onglet en arriere-plan : on sauvegarde tout de suite. Fermeture de la
    // page : dernier envoi en keepalive (la reponse ne sera pas lue).
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", () => {
        if (!pending || inFlight || blocked) return;
        request("PUT", { version, state: pending }, { keepalive: true }).catch(() => {});
    });
    // Filet de securite : prevenir avant de quitter avec des changements non envoyes.
    window.addEventListener("beforeunload", (event) => {
        if ((pending || inFlight) && !blocked) event.preventDefault();
    });

    return {
        mode: "server",
        async load() {
            emit("loading");
            try {
                const data = await request("GET");
                version = data.version;
                emit("saved");
                return data.state;
            } catch (err) {
                emit(err.kind === "network" ? "load-error" : err.kind);
                throw err;
            }
        },
        save(state) {
            if (blocked) return;
            pending = state;
            emit(inFlight ? "saving" : "dirty");
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
        },
        flush,
        onStatus(fn) {
            listeners.add(fn);
        },
    };
}
