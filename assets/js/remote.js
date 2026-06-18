import { getState, setState, subscribe } from "./state.js";
import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "10.12.2";
const MY_PLAYER_KEY = "daily-rope-my-player-id";

let db = null;
let myUid = null;
let applyingRemote = false;

export function isRemoteActive() {
    return Boolean(firebaseConfig);
}

export function myClaimedPlayerId() {
    return localStorage.getItem(MY_PLAYER_KEY);
}

export async function initRemote(onUpdate) {
    if (!firebaseConfig) return; // mode local : rien a faire

    const statusEl = document.getElementById("sync-status");

    try {
        const [{ initializeApp }, authMod, dbMod] = await Promise.all([
            import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
            import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
            import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-database.js`),
        ]);

        const app = initializeApp(firebaseConfig);
        const auth = authMod.getAuth(app);
        db = dbMod.getDatabase(app);

        await authMod.signInAnonymously(auth);

        authMod.onAuthStateChanged(auth, (user) => {
            if (!user) return;
            myUid = user.uid;

            if (statusEl) {
                statusEl.textContent = "🌐 Multijoueur connecte";
                statusEl.classList.remove("sync-status--local");
                statusEl.classList.add("sync-status--remote");
            }

            listenPublic(dbMod, onUpdate);
            listenPrivate(dbMod, onUpdate);
        });

        subscribe(() => pushLocalChange(dbMod));
    } catch (err) {
        console.warn("Multijoueur indisponible, retour au mode local.", err);
    }
}

function listenPublic(dbMod, onUpdate) {
    dbMod.onValue(dbMod.ref(db, "race/public"), (snapshot) => {
        const remote = snapshot.val();
        if (!remote) return;

        applyingRemote = true;
        setState((s) => ({
            ...s,
            players: (remote.playerOrder ?? []).map((id) => {
                const rp = remote.players?.[id] ?? {};
                const mine = rp.ownerUid === myUid;
                const local = s.players.find((p) => p.id === id);
                return {
                    id,
                    name: rp.name ?? "?",
                    color: rp.color,
                    avatar: rp.avatar,
                    position: rp.position ?? 0,
                    ownerUid: rp.ownerUid ?? null,
                    // Le detail des bonus n'est jamais publie : pour les autres joueurs
                    // on ne garde qu'un compteur. Pour "moi", listenPrivate complete le detail.
                    bonuses: mine && local ? local.bonuses : new Array(rp.bonusCount ?? 0).fill({ hidden: true }),
                };
            }),
            turn: remote.turn ?? s.turn,
            winnerId: remote.winnerId ?? null,
            log: remote.log ?? s.log,
            track: remote.track ?? s.track,
        }));
        applyingRemote = false;
        updateClaimBar();
        onUpdate?.();
    });
}

function listenPrivate(dbMod, onUpdate) {
    dbMod.onValue(dbMod.ref(db, `race/private/${myUid}/bonuses`), (snapshot) => {
        const bonusesByPlayer = snapshot.val() ?? {};
        applyingRemote = true;
        setState((s) => ({
            ...s,
            players: s.players.map((p) =>
                p.ownerUid === myUid ? { ...p, bonuses: Object.values(bonusesByPlayer[p.id] ?? {}) } : p
            ),
        }));
        applyingRemote = false;
        onUpdate?.();
    });
}

function pushLocalChange(dbMod) {
    if (applyingRemote || !db) return;
    const s = getState();

    const players = {};
    s.players.forEach((p) => {
        players[p.id] = {
            name: p.name,
            color: p.color,
            avatar: p.avatar,
            position: p.position,
            ownerUid: p.ownerUid ?? null,
            bonusCount: p.bonuses.length,
        };
    });

    dbMod.set(dbMod.ref(db, "race/public"), {
        playerOrder: s.players.map((p) => p.id),
        players,
        turn: s.turn,
        winnerId: s.winnerId,
        log: s.log,
        track: s.track,
    });

    s.players
        .filter((p) => p.ownerUid === myUid)
        .forEach((p) => {
            const bonusMap = {};
            p.bonuses.forEach((b) => {
                bonusMap[b.uid] = b;
            });
            dbMod.set(dbMod.ref(db, `race/private/${myUid}/bonuses/${p.id}`), bonusMap);
        });
}

export function claimPlayer(playerId) {
    if (!playerId) return;
    localStorage.setItem(MY_PLAYER_KEY, playerId);
    setState((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === playerId ? { ...p, ownerUid: myUid } : p)),
    }));
}

function updateClaimBar() {
    const bar = document.getElementById("claim-bar");
    const select = document.getElementById("claim-select");
    if (!bar || !select) return;

    const state = getState();
    const myId = myClaimedPlayerId();
    const stillMine = myId && state.players.some((p) => p.id === myId && p.ownerUid === myUid);

    if (stillMine) {
        bar.classList.add("hidden");
        return;
    }

    const unclaimed = state.players.filter((p) => !p.ownerUid);
    if (unclaimed.length === 0) {
        bar.classList.add("hidden");
        return;
    }

    select.innerHTML = unclaimed.map((p) => `<option value="${p.id}">${p.avatar} ${p.name}</option>`).join("");
    bar.classList.remove("hidden");
}
