// Retour visuel du stockage serveur : pastille d'etat dans la barre du haut
// et ecran bloquant (#storage-overlay) tant que la partie ne peut pas etre
// chargee ou sauvegardee. Le jeu est rendu inerte pendant ce temps : on ne
// joue pas un coup qui ne pourrait pas etre enregistre.

const pillEl = document.getElementById("sync-status");
const overlayEl = document.getElementById("storage-overlay");
const iconEl = document.getElementById("storage-icon");
const titleEl = document.getElementById("storage-title");
const messageEl = document.getElementById("storage-message");
const actionsEl = document.getElementById("storage-actions");
const shellEl = document.querySelector(".shell");
const homeUrl = document.querySelector('.topright a.iconbtn')?.getAttribute("href") ?? "/";

const PILL = {
    loading: ["pending", "CHARGEMENT…"],
    dirty: ["pending", "ENREGISTREMENT…"],
    saving: ["pending", "ENREGISTREMENT…"],
    saved: ["saved", "SAUVEGARDÉ"],
    offline: ["error", "CONNEXION PERDUE"],
    "load-error": ["error", "HORS LIGNE"],
    conflict: ["error", "NON SAUVEGARDÉ"],
    auth: ["error", "NON SAUVEGARDÉ"],
    forbidden: ["error", "NON SAUVEGARDÉ"],
    invalid: ["error", "NON SAUVEGARDÉ"],
};

const reload = { label: "Recharger la partie", primary: true, onClick: () => location.reload() };

// Ecrans bloquants ; les statuts absents d'ici (saved, dirty, saving) ne
// bloquent pas le jeu.
const SCREENS = {
    loading: {
        icon: "☁️",
        title: "Chargement de la partie…",
        message: "Récupération de la partie sur le serveur.",
        actions: [],
    },
    "load-error": {
        icon: "📡",
        title: "Impossible de charger la partie",
        message: "Le serveur ne répond pas. Vérifie ta connexion puis réessaie.",
        actions: [], // bouton "Reessayer" fourni par l'appelant (voir waitForRetry)
    },
    offline: {
        icon: "📡",
        title: "Connexion perdue",
        message: "La partie est en pause le temps de retrouver le serveur : ton dernier coup n'est pas encore enregistré.",
        actions: [],
    },
    conflict: {
        icon: "🔀",
        title: "Partie modifiée ailleurs",
        message: "Quelqu'un d'autre a joué sur cette partie entre-temps. Tes derniers changements n'ont pas été enregistrés : recharge pour reprendre la partie à jour.",
        actions: [reload],
    },
    auth: {
        icon: "🔒",
        title: "Session expirée",
        message: "Tu as été déconnecté. Reconnecte-toi pour continuer : tes derniers changements n'ont pas été enregistrés.",
        actions: [{ label: "Se reconnecter", primary: true, href: "/" }],
    },
    forbidden: {
        icon: "⛔",
        title: "Accès retiré",
        message: "Tu n'as plus accès à cette partie : tes derniers changements n'ont pas été enregistrés.",
        actions: [{ label: "Retour à mes parties", primary: true, href: homeUrl }],
    },
    invalid: {
        icon: "⚠️",
        title: "Sauvegarde refusée",
        message: "Le serveur a refusé l'état de la partie. Recharge pour repartir de la dernière version enregistrée.",
        actions: [reload],
    },
};

function renderPill(status) {
    const [tone, label] = PILL[status] ?? PILL.saved;
    pillEl.className = `pill sync-status--${tone}`;
    pillEl.innerHTML = `<i></i> ${label}`;
}

function showScreen(screen, extraActions = []) {
    iconEl.textContent = screen.icon;
    titleEl.textContent = screen.title;
    messageEl.textContent = screen.message;
    actionsEl.innerHTML = "";
    [...screen.actions, ...extraActions].forEach((action) => {
        const el = document.createElement(action.href ? "a" : "button");
        el.className = action.primary ? "primary primary--small" : "ghost-btn";
        el.textContent = action.label;
        if (action.href) el.href = action.href;
        else {
            el.type = "button";
            el.addEventListener("click", action.onClick);
        }
        actionsEl.appendChild(el);
    });
    overlayEl.classList.remove("hidden");
    shellEl.inert = true;
    actionsEl.querySelector("button, a")?.focus();
}

function hideScreen() {
    overlayEl.classList.add("hidden");
    shellEl.inert = false;
}

// Branche la pastille et l'ecran bloquant sur un stockage serveur.
export function bindStorageUi(storage) {
    if (storage.mode !== "server") return;

    storage.onStatus((status, detail) => {
        renderPill(status);
        const screen = SCREENS[status];
        if (!screen) {
            hideScreen();
            return;
        }
        if (status === "offline") {
            const seconds = Math.round((detail.retryInMs ?? 0) / 1000);
            showScreen(
                { ...screen, message: `${screen.message} Nouvelle tentative dans ${seconds} s.` },
                [{ label: "Réessayer maintenant", primary: true, onClick: () => storage.flush() }]
            );
            return;
        }
        if (status !== "load-error") showScreen(screen);
    });
}

// Chargement initial : en cas d'echec reseau, l'ecran propose de reessayer
// et la promesse ne se resout qu'une fois la partie chargee.
export function loadWithRetry(storage) {
    return new Promise((resolve) => {
        const attempt = () => {
            storage
                .load()
                .then(resolve)
                .catch((err) => {
                    if (err?.kind === "network") {
                        showScreen(SCREENS["load-error"], [{ label: "Réessayer", primary: true, onClick: attempt }]);
                    }
                    // Autres erreurs (session expiree, acces retire) : l'ecran
                    // correspondant est deja affiche par bindStorageUi.
                });
        };
        attempt();
    });
}
