// Feux d'artifice "dementiels" pour la victoire, via canvas-confetti (CDN,
// ESM, ~3ko gzip) : la physique (gravite, derive, dispersion) serait fastidieuse
// a retrouver a la main avec le meme rendu. Chargee a la demande, en best-effort
// (si le reseau est coupe pendant le daily, la banniere de victoire fonctionne
// quand meme, juste sans les feux d'artifice).
const CONFETTI_URL = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs";

let confettiPromise = null;

function loadConfetti() {
    if (!confettiPromise) {
        confettiPromise = import(CONFETTI_URL).then((mod) => mod.default);
    }
    return confettiPromise;
}

// Demarre le telechargement sans bloquer, pour qu'il soit deja en cache au
// moment ou quelqu'un gagne reellement.
export function preloadCelebration() {
    loadConfetti().catch(() => {});
}

export async function fireGrandFinale(colors) {
    let confetti;
    try {
        confetti = await loadConfetti();
    } catch (err) {
        console.warn("Feux d'artifice indisponibles (reseau ?), victoire sans confettis.", err);
        return;
    }

    const duration = 4200;
    const end = Date.now() + duration;

    // Une grosse explosion centrale immediate pour l'impact.
    confetti({ particleCount: 220, spread: 360, startVelocity: 50, ticks: 300, origin: { x: 0.5, y: 0.45 }, colors });

    // Deux canons qui tirent en continu depuis les coins bas, comme des
    // bombes de fete.
    (function cannons() {
        confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0, y: 1 }, colors, startVelocity: 65 });
        confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1, y: 1 }, colors, startVelocity: 65 });
        if (Date.now() < end) requestAnimationFrame(cannons);
    })();

    // Des feux d'artifice aleatoires en haut de l'ecran toutes les ~350ms.
    const fireworkTimer = setInterval(() => {
        confetti({
            particleCount: 70,
            startVelocity: 35,
            spread: 100,
            origin: { x: Math.random(), y: Math.random() * 0.5 },
            colors,
            shapes: ["star", "circle"],
            scalar: 1.1,
        });
    }, 350);
    setTimeout(() => clearInterval(fireworkTimer), duration);
}
