const dialogEl = document.getElementById("app-dialog");
const titleEl = document.getElementById("dialog-title");
const messageEl = document.getElementById("dialog-message");
const inputEl = document.getElementById("dialog-input");
const actionsEl = document.getElementById("dialog-actions");
const backdropEl = dialogEl.querySelector(".modal-overlay__backdrop");

let activeResolve = null;
let dismissValue = false;

function close(value) {
    if (!activeResolve) return;
    dialogEl.classList.add("hidden");
    const resolve = activeResolve;
    activeResolve = null;
    resolve(value);
}

backdropEl.addEventListener("click", () => close(dismissValue));

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dialogEl.classList.contains("hidden")) {
        close(dismissValue);
    }
});

function open({ title, message, type, defaultValue = "", placeholder = "", confirmText = "OK", cancelText = "Annuler" }) {
    return new Promise((resolve) => {
        activeResolve = resolve;
        dismissValue = type === "prompt" ? null : type === "confirm" ? false : true;

        titleEl.textContent = title ?? "";
        titleEl.classList.toggle("hidden", !title);
        messageEl.textContent = message ?? "";
        messageEl.classList.toggle("hidden", !message);

        inputEl.classList.toggle("hidden", type !== "prompt");
        if (type === "prompt") {
            inputEl.value = defaultValue;
            inputEl.placeholder = placeholder;
        }

        actionsEl.innerHTML = "";

        if (type !== "alert") {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "ghost-btn ghost-btn--on-card";
            cancelBtn.textContent = cancelText;
            cancelBtn.addEventListener("click", () => close(type === "prompt" ? null : false));
            actionsEl.appendChild(cancelBtn);
        }

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "dialog-btn dialog-btn--primary";
        okBtn.textContent = confirmText;
        okBtn.addEventListener("click", () => close(type === "prompt" ? inputEl.value : true));
        actionsEl.appendChild(okBtn);

        dialogEl.classList.remove("hidden");
        requestAnimationFrame(() => {
            if (type === "prompt") {
                inputEl.focus();
                inputEl.select();
            } else {
                okBtn.focus();
            }
        });
    });
}

export function alertDialog(message, title) {
    return open({ title, message, type: "alert", confirmText: "OK" });
}

export function confirmDialog(message, title) {
    return open({ title, message, type: "confirm", confirmText: "Confirmer", cancelText: "Annuler" });
}

export function promptDialog(message, defaultValue, title, placeholder) {
    return open({ title, message, type: "prompt", defaultValue, placeholder, confirmText: "Valider", cancelText: "Annuler" });
}
