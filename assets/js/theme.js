// Le theme est une preference d'appareil (comme une sonnerie), pas une donnee
// de partie : il vit dans son propre slot localStorage, separe de l'etat du
// jeu, pour ne jamais etre ecrase par un export/import de session partagee.
const THEME_KEY = "daily-rope-theme";
const DEFAULT_THEME = "aurore";

export const THEMES = [
    {
        id: "aurore",
        label: "Aurore",
        swatch: ["#2b2c29", "#00cec9"],
        dot: "#ff5d8f",
        confetti: ["#ff5d8f", "#fdcb6e", "#6c5ce7", "#00b894", "#0984e3", "#a29bfe"],
    },
    {
        id: "neon",
        label: "Neon",
        swatch: ["#1a0b2e", "#ff2bd6"],
        dot: "#00f0ff",
        confetti: ["#00f0ff", "#ff2bd6", "#7c3aed", "#ffd60a"],
    },
    {
        id: "ocean",
        label: "Ocean",
        swatch: ["#032f4a", "#05a8aa"],
        dot: "#ff8c42",
        confetti: ["#05a8aa", "#ff8c42", "#00c2a8", "#ffd166"],
    },
    {
        id: "foret",
        label: "Foret",
        swatch: ["#1b4332", "#74c69d"],
        dot: "#f4a261",
        confetti: ["#74c69d", "#f4a261", "#2a9d8f", "#e9c46a"],
    },
    {
        id: "sunset",
        label: "Coucher de soleil",
        swatch: ["#3d0e4f", "#ff6b6b"],
        dot: "#ffd23f",
        confetti: ["#ff6b6b", "#ffd23f", "#ff8c42", "#d62828"],
    },
    {
        id: "minuit",
        label: "Minuit",
        swatch: ["#0f0c29", "#302b63"],
        dot: "#ff2e87",
        confetti: ["#ff2e87", "#00d9ff", "#302b63", "#f9c80e"],
    },
    {
        id: "papier",
        label: "Papier",
        swatch: ["#fafafa", "#cccccc"],
        dot: "#1a1a1a",
        confetti: ["#1a1a1a", "#4a4a4a", "#787878", "#aaaaaa", "#000000"],
    },
    {
        id: "papier-inverse",
        label: "Papier inverse",
        swatch: ["#1a1a1a", "#444444"],
        dot: "#fafafa",
        confetti: ["#ffffff", "#e0e0e0", "#bbbbbb", "#888888"],
    },
    {
        id: "dracula",
        label: "Dracula",
        swatch: ["#282a36", "#bd93f9"],
        dot: "#ff79c6",
        confetti: ["#ff79c6", "#50fa7b", "#bd93f9", "#8be9fd", "#f1fa8c"],
    },
    {
        id: "synthwave87",
        label: "Synthwave 87",
        swatch: ["#2d1b4e", "#ff6ec7"],
        dot: "#00d9ff",
        confetti: ["#00d9ff", "#ff6ec7", "#ff9e3d", "#ffd23f"],
    },
];

export function getTheme() {
    try {
        return localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    } catch {
        return DEFAULT_THEME;
    }
}

export function applyTheme(themeId) {
    document.documentElement.dataset.theme = themeId;
    try {
        localStorage.setItem(THEME_KEY, themeId);
    } catch {
        // stockage indisponible (mode prive, etc.) : le theme reste applique
        // pour la session en cours, simplement non persiste.
    }
}

const MODE_KEY = "daily-rope-mode";
const DEFAULT_MODE = "light";

export function getMode() {
    try {
        return localStorage.getItem(MODE_KEY) || DEFAULT_MODE;
    } catch {
        return DEFAULT_MODE;
    }
}

export function applyMode(mode) {
    document.documentElement.dataset.mode = mode;
    try {
        localStorage.setItem(MODE_KEY, mode);
    } catch {
        // idem theme : preference non persistee si le stockage est indisponible.
    }
}

export function initTheme() {
    applyTheme(getTheme());
    applyMode(getMode());
}
