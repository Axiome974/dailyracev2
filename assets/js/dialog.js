const dialogEl = document.getElementById("app-dialog");
const titleEl = document.getElementById("dialog-title");
const messageEl = document.getElementById("dialog-message");
const inputEl = document.getElementById("dialog-input");
const numberInputEl = document.getElementById("dialog-number-input");
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

function open({ title, message, type, defaultValue = "", placeholder = "", confirmText = "OK", cancelText = "Annuler", min, max }) {
    return new Promise((resolve) => {
        activeResolve = resolve;
        dismissValue = type === "confirm" ? false : type === "alert" ? true : null;

        titleEl.textContent = title ?? "";
        titleEl.classList.toggle("hidden", !title);
        messageEl.textContent = message ?? "";
        messageEl.classList.toggle("hidden", !message);

        inputEl.classList.toggle("hidden", type !== "prompt");
        numberInputEl.classList.toggle("hidden", type !== "number");

        if (type === "prompt") {
            inputEl.value = defaultValue;
            inputEl.placeholder = placeholder;
        }
        if (type === "number") {
            numberInputEl.value = defaultValue;
            numberInputEl.min = min ?? "";
            numberInputEl.max = max ?? "";
        }

        actionsEl.innerHTML = "";

        if (type !== "alert") {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "ghost-btn ghost-btn--on-card";
            cancelBtn.textContent = cancelText;
            cancelBtn.addEventListener("click", () => close(dismissValue));
            actionsEl.appendChild(cancelBtn);
        }

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "dialog-btn dialog-btn--primary";
        okBtn.textContent = confirmText;
        okBtn.addEventListener("click", () => {
            if (type === "prompt") return close(inputEl.value);
            if (type === "number") return close(numberInputEl.value);
            close(true);
        });
        actionsEl.appendChild(okBtn);

        dialogEl.classList.remove("hidden");
        requestAnimationFrame(() => {
            if (type === "prompt") {
                inputEl.focus();
                inputEl.select();
            } else if (type === "number") {
                numberInputEl.focus();
                numberInputEl.select();
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

export function numberDialog(message, defaultValue, title, { min, max } = {}) {
    return open({ title, message, type: "number", defaultValue, min, max, confirmText: "Valider", cancelText: "Annuler" });
}
