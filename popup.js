document.addEventListener("DOMContentLoaded", () => {
	// Localize the title dynamically
	const titleElement = document.querySelector("title");
	const localizedTitle = chrome.i18n.getMessage("popup_title");
	if (titleElement && localizedTitle) {
		titleElement.textContent = localizedTitle;
	}

	function getModelPickerModifier() {
		// Prefer DOM state (instant), fallback to storage defaults if needed
		const ctrlEl = document.getElementById("useControlForModelSwitcherRadio");
		const altEl = document.getElementById("useAltForModelSwitcherRadio");
		if (ctrlEl?.checked) return "ctrl";
		if (altEl?.checked) return "alt";
		// Fallback: assume alt if radios not present yet
		return "alt";
	}

	// === Unified shortcut helpers (REPLACES 555) ================================

	// Source of truth for the 10 model-picker slots if storage is empty
	const DEFAULT_MODEL_PICKER_KEY_CODES = [
		"Digit1",
		"Digit2",
		"Digit3",
		"Digit4",
		"Digit5",
		"Digit6",
		"Digit7",
		"Digit8",
		"Digit9",
		"Digit0",
	];

	// Preference: auto-overwrite on duplicate?
	const prefs = { autoOverwrite: false };
	chrome.storage.sync.get("autoOverwrite", (d) => {
		prefs.autoOverwrite = !!d.autoOverwrite;
	});
	// expose to 333
	window.prefs = prefs;

	// Display helper used by chips and hints (platform-aware)
	// Letters are deliberately shown in lowercase for chips and modals.
	function displayFromCode(code) {
		if (!code || code === "" || code === "\u00A0") return "\u00A0";

		// Robust Mac detection (works in Chrome extensions)
		const isMac = (() => {
			const ua = navigator.userAgent || "";
			const plat = navigator.platform || "";
			const uaDataPlat = navigator.userAgentData?.platform ?? "";
			return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
		})();

		// Letters → lowercase
		if (/^Key([A-Z])$/.test(code)) return code.slice(-1).toLowerCase();

		// Numbers (row + numpad)
		if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
		if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);

		// Function keys F1–F24
		if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

		// Punctuation / common physical keys
		const baseMap = {
			Minus: "-",
			Equal: "=",
			BracketLeft: "[",
			BracketRight: "]",
			Backslash: "\\",
			Semicolon: ";",
			Quote: "'",
			Comma: ",",
			Period: ".",
			Slash: "/",
			Backquote: "`",

			// Navigation / whitespace
			Space: "Space",
			Enter: "Enter",
			Escape: "Esc",
			Tab: "Tab",
			Backspace: "Bksp",
			Delete: "Del",
			ArrowLeft: "←",
			ArrowRight: "→",
			ArrowUp: "↑",
			ArrowDown: "↓",

			// International (safe English approximations)
			IntlBackslash: "\\",
			IntlYen: "¥",
			IntlRo: "ro",
			Lang1: "lang1",
			Lang2: "lang2",
			Lang3: "lang3",
			Lang4: "lang4",
			Lang5: "lang5",

			// Media
			VolumeMute: "Mute",
			VolumeDown: "Vol–",
			VolumeUp: "Vol+",
			MediaPlayPause: "Play/Pause",
			MediaTrackNext: "Next",
			MediaTrackPrevious: "Prev",
		};

		// Modifiers, platform-accurate labels
		const mods = isMac
			? {
				MetaLeft: "⌘",
				MetaRight: "⌘",
				AltLeft: "⌥",
				AltRight: "⌥",
				ControlLeft: "Ctrl",
				ControlRight: "Ctrl",
				ShiftLeft: "⇧",
				ShiftRight: "⇧",
				Fn: "fn",
			}
			: {
				MetaLeft: "Win",
				MetaRight: "Win",
				AltLeft: "Alt",
				AltRight: "Alt",
				ControlLeft: "Ctrl",
				ControlRight: "Ctrl",
				ShiftLeft: "Shift",
				ShiftRight: "Shift",
				Fn: "Fn",
			};

		if (code in baseMap) return baseMap[code];
		if (code in mods) return mods[code];

		// Fallback: humanize the raw code (e.g., "IntlBackslash" → "Intl Backslash")
		return code.replace(/([a-z])([A-Z])/g, "$1 $2");
	}

	// Treat DigitX and NumpadX as equivalent
	function codeEquals(a, b) {
		if (a === b) return true;
		const A = a?.match(/^(Digit|Numpad)([0-9])$/);
		const B = b?.match(/^(Digit|Numpad)([0-9])$/);
		const dA = A?.[2];
		const dB = B?.[2];
		return dA !== undefined && dA === dB;
	}

	// Convert single-character popup input to KeyboardEvent.code
	function charToCode(ch) {
		if (!ch) return "";
		const raw = ch.trim();
		if (!raw) return "";
		const upper = raw.toUpperCase();
		if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
		if (/^[0-9]$/.test(raw)) return `Digit${raw}`;
		switch (raw) {
			case "-":
				return "Minus";
			case "=":
				return "Equal";
			case "[":
				return "BracketLeft";
			case "]":
				return "BracketRight";
			case "\\":
				return "Backslash";
			case ";":
				return "Semicolon";
			case "'":
				return "Quote";
			case ",":
				return "Comma";
			case ".":
				return "Period";
			case "/":
				return "Slash";
			case "`":
				return "Backquote";
			case " ":
				return "Space";
			default:
				return ""; // unsupported single char here
		}
	}

	// ---------- Existing helpers (kept) ----------

	// Get current value for every shortcut input (raw text), used by older code paths

	// New: get current KeyboardEvent.code for each popup input (prefers dataset, falls back to char→code)

	function gatherPopupConflictsForModelSwitch(targetMode) {
		if (targetMode !== "alt") return [];

		const owners = [];
		const seen = new Set();

		const modelCodes = window.ShortcutUtils.getModelPickerCodesCache(); // 10 codes

		// Prefer codes from dataset; fallback to char->code
		const popupCodes = {};
		shortcutKeys.forEach((id) => {
			const el = document.getElementById(id);
			let code = el?.dataset?.keyCode || "";
			if (!code) {
				const ch = (el?.value || "").trim();
				code = (window.ShortcutUtils?.charToCode || charToCode)(ch) || "";
			}
			popupCodes[id] = code;
		});

		Object.keys(popupCodes).forEach((id) => {
			const c2 = popupCodes[id];
			if (!c2) return;
			// Find which model slot this collides with (Digit/Numpad normalized)
			let collideIdx = -1;
			for (let i = 0; i < modelCodes.length; i++) {
				const mc = modelCodes[i];
				if (mc && window.ShortcutUtils.codeEquals(mc, c2)) {
					collideIdx = i;
					break;
				}
			}
			if (collideIdx === -1) return;

			const toLabel =
				window.MODEL_NAMES?.[collideIdx] ?? `Model slot ${collideIdx + 1}`;
			if (!seen.has(id)) {
				owners.push({
					type: "shortcut",
					id,
					label: getShortcutLabelById(id),
					keyCode: c2,
					keyLabel: codeToDisplayChar(c2),
					targetLabel: toLabel,
				});
				seen.add(id);
			}
		});

		return owners;
	}

	// Reentrancy guard per-field to avoid double modals/saves
	window.__savingShortcutGuard =
		window.__savingShortcutGuard || Object.create(null);

	// Save a popup input value (char or code) with strict Alt+digit preflight vs chips
	function saveShortcutValue(id, value, fireInput = false) {
		if (window.__savingShortcutGuard[id]) return; // suppress re-entry
		window.__savingShortcutGuard[id] = true;

		const raw = value == null ? "" : String(value);
		const valToSave = raw === "" ? "\u00A0" : raw;

		// helper: clear guard safely
		const clearGuard = () => {
			window.__savingShortcutGuard[id] = false;
		};

		// helper: perform actual save + mirror UI + verify

		function commit(v) {
			chrome.storage.sync.set({ [id]: v }, () => {
				if (chrome.runtime?.lastError) {
					console.error(
						"[saveShortcutValue] set error:",
						chrome.runtime.lastError,
					);
					if (typeof showToast === "function") {
						showToast(
							`Save failed: ${chrome.runtime.lastError.message ?? "storage error"}`,
						);
					}
					clearGuard();
					return;
				}

				const inp = document.getElementById(id);
				if (inp) {
					// Keep the actual KeyboardEvent.code on the element for robust conflict checks
					if (v === "\u00A0") {
						inp.dataset.keyCode = "";
						inp.value = "";
					} else {
						inp.dataset.keyCode = v;
						inp.value = codeToDisplayChar(v);
					}
					if (fireInput)
						inp.dispatchEvent(new Event("input", { bubbles: true }));
				}
				chrome.storage.sync.get(id, (data) => {
					const persisted =
						data && Object.hasOwn(data, id) ? data[id] : undefined;
					if (persisted !== v) {
						console.warn("[saveShortcutValue] verification mismatch", {
							expected: v,
							got: persisted,
						});
						typeof showToast === "function" &&
							showToast("Save did not persist. Trying again…");
						chrome.storage.sync.set({ [id]: v }, () => {
							if (chrome.runtime?.lastError) {
								console.error(
									"[saveShortcutValue] retry error:",
									chrome.runtime.lastError,
								);
								if (typeof showToast === "function") {
									showToast(
										`Save failed: ${chrome.runtime.lastError.message ?? "storage error"}`,
									);
								}
							}
							clearGuard();
						});
					} else {
						clearGuard();
					}
				});
			});
		}

		// clears are simple
		if (valToSave === "\u00A0") {
			commit(valToSave);
			return;
		}

		// normalize to code if needed
		const isCode =
			/^(Key|Digit|Numpad|Arrow|F\d{1,2}|Backspace|Enter|Escape|Tab|Space|Slash|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Backslash)/i.test(
				valToSave,
			);
		const toCode = (s) =>
			window.ShortcutUtils?.charToCode
				? window.ShortcutUtils.charToCode(s)
				: typeof charToCode === "function"
					? charToCode(s)
					: "";
		const code = isCode ? valToSave : raw.length === 1 ? toCode(raw) : "";

		// STRICT PREFLIGHT REMOVED (handled upstream)
		// We intentionally avoid prompting here to prevent double-modals.
		// All duplicate checks/overwrites are performed by the input handler
		// using ShortcutUtils.buildConflictsForCode and showDuplicateModal.
		// This function now focuses on committing the final, conflict-free value.

		// === Generic cross-system conflicts for non-digit / non-Alt cases ===
		if (
			code &&
			typeof window.ShortcutUtils?.buildConflictsForCode === "function"
		) {
			const conflicts = window.ShortcutUtils.buildConflictsForCode(code, {
				type: "shortcut",
				id,
			});
			if (conflicts.length) {
				if (window.prefs?.autoOverwrite && window.ShortcutUtils?.clearOwners) {
					return window.ShortcutUtils.clearOwners(conflicts, () =>
						commit(valToSave),
					);
				}
				const keyLabel = window.ShortcutUtils?.displayFromCode
					? window.ShortcutUtils.displayFromCode(code)
					: code;
				const names = conflicts.map((c) => c.label).join(", ");
				const ask =
					window.showDuplicateModal ||
					((o, cb) =>
						cb(
							window.confirm(
								`This key is assigned to ${o}. Assign here instead?`,
							),
							false,
						));
				ask(
					names,
					(yes, remember) => {
						if (!yes) {
							clearGuard();
							return;
						}
						if (remember) {
							window.prefs = window.prefs || {};
							window.prefs.autoOverwrite = true;
							chrome.storage.sync.set({ autoOverwrite: true });
						}
						if (window.ShortcutUtils?.clearOwners)
							window.ShortcutUtils.clearOwners(conflicts, () =>
								commit(valToSave),
							);
						else commit(valToSave);
					},
					{
						keyLabel,
						targetLabel: getShortcutLabelById(id),
						proceedText: "Proceed with changes?",
					},
				);
				return;
			}
		}

		// no conflicts
		commit(valToSave);
	}
	window.saveShortcutValue = saveShortcutValue;

	// ---------- Static model names for tooltips and picker UI ----------
	const MODEL_NAMES = [
		"GPT-5 Auto", // Slot 1
		"GPT-5 Fast", // Slot 2
		"GPT-5 Thinking Mini", // Slot 3
		"GPT-5 Thinking", // Slot 4
		"GPT-5 Pro", // Slot 5
		"Legacy Models →", // Slot 6
		"4o", // Slot 7
		"4.1", // Slot 8
		"o3", // Slot 9
		"o4-mini", // Slot 0
	];
	// Expose globally so other scopes (conflict builders, tooltips, modals) can read it
	window.MODEL_NAMES = MODEL_NAMES;

	// ---------- Unified registry for model-picker codes ----------
	function getModelPickerCodesCache() {
		const arr = Array.isArray(window.__modelPickerKeyCodes)
			? window.__modelPickerKeyCodes
			: null;
		return arr && arr.length === 10
			? arr.slice(0, 10)
			: DEFAULT_MODEL_PICKER_KEY_CODES.slice();
	}

	function saveModelPickerKeyCodes(codes, cb) {
		window.__modelPickerKeyCodes = codes.slice(0, 10); // update cache first for snappy UI
		chrome.storage.sync.set(
			{ modelPickerKeyCodes: window.__modelPickerKeyCodes },
			() => {
				const err = chrome.runtime?.lastError;
				if (err) {
					console.error("[saveModelPickerKeyCodes] set error:", err);
					if (typeof showToast === "function") {
						showToast(`Save failed: ${err.message || "storage error"}`);
					}
					cb?.(false);
					return;
				}
				cb?.(true);
				// no need to fire onChanged here; we already updated local cache and UI calls render()
			},
		);
	}

	/** Hydrate cache from storage and notify listeners once */
	function initModelPickerCodesCache() {
		if (window.__modelPickerHydrating) return window.__modelPickerHydrating;
		window.__modelPickerHydrating = new Promise((resolve) => {
			chrome.storage.sync.get(
				"modelPickerKeyCodes",
				({ modelPickerKeyCodes }) => {
					window.__modelPickerKeyCodes =
						Array.isArray(modelPickerKeyCodes) &&
							modelPickerKeyCodes.length === 10
							? modelPickerKeyCodes.slice(0, 10)
							: DEFAULT_MODEL_PICKER_KEY_CODES.slice();

					// Broadcast a one-time custom event so editors can render after hydration
					document.dispatchEvent(new CustomEvent("modelPickerHydrated"));
					resolve(window.__modelPickerKeyCodes);
				},
			);
		});
		return window.__modelPickerHydrating;
	}
	initModelPickerCodesCache();

	// expose for 333
	window.saveModelPickerKeyCodes = saveModelPickerKeyCodes;

	// ---------- Cross-system conflict detection ----------
	function getShortcutLabelById(id) {
		const el = document.getElementById(id);
		if (!el) return id;
		const label = el
			.closest(".shortcut-item")
			?.querySelector(".shortcut-label .i18n")
			?.textContent?.trim();
		return label || id;
	}

	/**
	 * Determine if a key code represents a collision in the current modifier domain.
	 * Only blocks keys if the modifier matches.
	 */

	/**
	 * Build list of owners that conflict with `code`.
	 * Rules:
	 * - Model ↔ Model: always conflict.
	 * - Popup ↔ Popup: always conflict.
	 * - Model ↔ Popup: conflict only when model picker uses Alt (no conflict when using Control).
	 * Digits on row and numpad are treated as equal.
	 */
	function buildConflictsForCode(code, selfOwner) {
		const conflicts = [];
		const modelCodes = getModelPickerCodesCache();
		const MODEL_NAMES_SAFE = window.MODEL_NAMES || [];
		const modelMod =
			typeof getModelPickerModifier === "function"
				? getModelPickerModifier()
				: "alt";
		const ownerType = selfOwner?.type ?? null;

		// 1) Model slots
		modelCodes.forEach((c, i) => {
			if (!c) return;
			const isSelfModel = ownerType === "model" && selfOwner.idx === i;
			if (isSelfModel) return;

			if (codeEquals(c, code)) {
				if (ownerType === "shortcut" && modelMod !== "alt") return;
				conflicts.push({
					type: "model",
					idx: i,
					label: MODEL_NAMES_SAFE[i] || `Model slot ${i + 1}`,
				});
			}
		});

		// 2) Popup inputs (read actual saved codes from dataset; fallback to char→code)
		const shouldCheckPopup = ownerType !== "model" || modelMod === "alt";
		if (shouldCheckPopup) {
			shortcutKeys.forEach((id) => {
				const el = document.getElementById(id);
				let c2 = el?.dataset?.keyCode || "";
				if (!c2) {
					const ch = (el?.value || "").trim();
					c2 = (window.ShortcutUtils?.charToCode || charToCode)(ch) || "";
				}
				if (!c2) return;

				const isSelfShortcut = ownerType === "shortcut" && selfOwner.id === id;
				if (isSelfShortcut) return;

				if (codeEquals(c2, code)) {
					conflicts.push({
						type: "shortcut",
						id,
						label: getShortcutLabelById(id),
					});
				}
			});
		}

		return conflicts;
	}

	/**
	 * Clear all conflicting owners immediately in the UI and persist.
	 * - Clears popup inputs without re-triggering their input handlers (avoids races)
	 * - Clears model slots and saves the 10-slot array if touched
	 */
	function clearOwners(owners, done) {
		const codes = getModelPickerCodesCache().slice(0, 10);
		let modelTouched = false;

		owners.forEach((o) => {
			if (o.type === "shortcut") {
				// 1) Clear the visible field right away
				const inp = document.getElementById(o.id);
				if (inp) inp.value = "";

				// 2) Keep any local cache in sync (if present)
				try {
					if (
						typeof shortcutKeyValues === "object" &&
						o.id in shortcutKeyValues
					) {
						shortcutKeyValues[o.id] = "";
					}
				} catch (_) { }

				// 3) Persist to storage (NBSP) without firing input handler
				try {
					saveShortcutValue(o.id, "", false);
				} catch (_) { }
			} else if (o.type === "model") {
				if (o.idx >= 0 && o.idx < codes.length) {
					codes[o.idx] = "";
					modelTouched = true;
				}
			}
		});

		const finish = () => {
			if (typeof done === "function") done();
		};

		if (modelTouched) {
			saveModelPickerKeyCodes(codes, finish);
		} else {
			finish();
		}
	}

	// Reuse the one duplicate modal defined in 222 earlier
	// expose it so 333 can use it

	// Bundle utils for 333
	window.ShortcutUtils = {
		displayFromCode,
		codeEquals,
		charToCode,
		buildConflictsForCode,
		clearOwners,
		getModelPickerCodesCache,
		saveModelPickerKeyCodes,
	};

	// Robust Mac detection (Chrome, Chromium, extension context)
	const isMac = (() => {
		const ua = navigator.userAgent ?? "";
		const plat = navigator.platform ?? "";
		const uaDataPlat = navigator.userAgentData?.platform ?? "";
		return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
	})();

	// Flash highlight animation for newFeatureHighlightFlash div
	const highlightDiv = document.getElementById("newFeatureHighlightFlash");
	if (highlightDiv) {
		highlightDiv.classList.add("flash-highlight");
		setTimeout(() => {
			highlightDiv.classList.remove("flash-highlight");
		}, 3000);
	}

	// Replace shortcut labels for Mac
	const altLabel = isMac ? "Opt ⌥" : "Alt +";
	const ctrlLabel = isMac ? "Command + " : "Control + ";
	document
		.querySelectorAll(".shortcut span, .key-text.platform-alt-label")
		.forEach((span) => {
			if (span.textContent.includes("Alt +")) {
				span.textContent = altLabel;
			}
			if (span.textContent.includes("Ctrl +")) {
				span.textContent = ctrlLabel;
			}
		});

	// --- BEGIN TOAST QUEUE WITH GSAP SUPPORT ---

	let activeToast = null;
	let activeToastTimer = null;

	function showToast(message, duration = 3500) {
		let toastContainer = document.getElementById("toast-container");
		if (!toastContainer) {
			toastContainer = document.createElement("div");
			toastContainer.id = "toast-container";
			Object.assign(toastContainer.style, {
				position: "fixed",
				top: "1em",
				left: "50%",
				transform: "translateX(-50%)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				zIndex: "10000",
				pointerEvents: "none",
			});
			document.body.appendChild(toastContainer);
		}

		if (activeToast) {
			// Update message and reset timer; capture the current node for fade
			activeToast.innerHTML = message;
			clearTimeout(activeToastTimer);
			const target = activeToast; // capture stable reference
			activeToastTimer = setTimeout(() => {
				fadeOutToast(target, toastContainer);
			}, duration);
			return;
		}

		// Create new toast
		const toast = document.createElement("div");
		toast.className = "toast";
		Object.assign(toast.style, {
			background: "rgba(0, 0, 0, 0.82)",
			color: "white",
			padding: "10px 20px",
			borderRadius: "5px",
			boxShadow: "0 2px 6px rgba(0,0,0,0.27)",
			maxWidth: "320px",
			width: "auto",
			marginTop: "4px",
			fontFamily: "Arial, sans-serif",
			fontSize: "14px",
			textAlign: "center",
			opacity: "0",
			pointerEvents: "auto",
		});

		toast.innerHTML = message;
		toastContainer.appendChild(toast);

		// Fade in
		const tweenIn = window.gsap?.to?.(toast, {
			opacity: 1,
			duration: 0.28,
			ease: "power2.out",
		});
		if (!tweenIn) {
			toast.style.transition = "opacity 0.28s";
			requestAnimationFrame(() => {
				toast.style.opacity = "1";
			});
		}

		activeToast = toast;

		// Fade out after duration (capture stable reference)
		const target = toast;
		activeToastTimer = setTimeout(() => {
			fadeOutToast(target, toastContainer);
		}, duration);
	}

	function fadeOutToast(toast, toastContainer) {
		// Guard: toast may already be cleared or detached by another path
		if (!toast?.isConnected) {
			activeToast = null;
			if (
				toastContainer?.childElementCount === 0 &&
				toastContainer?.isConnected
			) {
				toastContainer.remove();
			}
			return;
		}

		// Prevent double-fades on the same node
		if (toast.dataset.fading === "1") return;
		toast.dataset.fading = "1";

		const cleanup = () => {
			if (toast?.isConnected) toast.remove();
			if (
				toastContainer?.childElementCount === 0 &&
				toastContainer?.isConnected
			) {
				toastContainer.remove();
			}
			activeToast = null;
		};

		if (window.gsap?.to) {
			window.gsap.to(toast, {
				opacity: 0,
				duration: 0.28,
				ease: "power2.in",
				onComplete: cleanup,
			});
		} else {
			// Node may get removed mid-flight; recheck before touching style
			if (!toast?.style) {
				cleanup();
				return;
			}
			// Ensure a transition exists for smooth fade
			if (!toast.style.transition) toast.style.transition = "opacity 0.28s";
			// Trigger fade
			requestAnimationFrame(() => {
				if (!toast?.style) {
					cleanup();
					return;
				}
				toast.style.opacity = "0";
			});
			toast.addEventListener("transitionend", cleanup, { once: true });
		}
	}

	// --- END TOAST QUEUE WITH GSAP SUPPORT ---

	// If label forced on to two lines, balance the line break
	/* Balance any label that *actually* wraps */
	function balanceWrappedLabels() {
		const labels = document.querySelectorAll(".shortcut-label .i18n");

		labels.forEach((label) => {
			const original = label.dataset.originalText || label.textContent.trim();

			// Restore pristine label
			label.innerHTML = original;
			label.dataset.originalText = original;

			const words = original.split(" ");
			if (words.length < 2) return;

			const forceBreak = label.classList.contains("force-balance-break");
			const wrapsNaturally = label.scrollWidth > label.clientWidth + 1;

			if (!wrapsNaturally && !forceBreak) return;

			// Smart word-boundary midpoint
			const cumLen = [];
			let sum = 0;
			words.forEach((w, i) => {
				sum += w.length + (i < words.length - 1 ? 1 : 0);
				cumLen.push(sum);
			});

			const half = original.length / 2;
			let breakIdx = cumLen.findIndex((len) => len >= half);
			if (
				breakIdx > 0 &&
				Math.abs(cumLen[breakIdx - 1] - half) <
				Math.abs(cumLen[breakIdx] - half)
			) {
				breakIdx -= 1;
			}

			const first = words.slice(0, breakIdx + 1).join(" ");
			const second = words.slice(breakIdx + 1).join(" ");
			label.innerHTML = `${first}<br>${second}`;
		});
	}

	// === Tooltip helpers (localize + balance) ===

	function localizeText(text) {
		if (!text) return text;
		if (text.startsWith("__MSG_") && text.endsWith("__")) {
			const msgKey = text.replace(/^__MSG_/, "").replace(/__$/, "");
			const msg = chrome.i18n.getMessage(msgKey);
			if (msg) return msg;
		}
		return text;
	}

	/**
	 * Balance into 2–maxLines lines while keeping lines <= maxCharsPerLine.
	 * Prefers FEWER, LONGER lines and low spread. Respects existing \n.
/**
 * Balance into 2–maxLines lines while keeping lines <= maxCharsPerLine.
 * Uses DP to pick optimal breakpoints (no greedy packing), prefers fewer lines,
 * and avoids 1-word widows/orphans.
 */
	function balanceTooltipLines(text, maxCharsPerLine = 36, maxLines = 4) {
		if (!text || text.includes("\n") || text.length <= maxCharsPerLine)
			return text;

		const words = text.trim().split(/\s+/);
		if (words.length === 1) return text;

		// --- tunables ---
		const MIN_FILL_FRAC = 0.72; // target ≥72% of max on non-last lines
		const UNDERFILL_WEIGHT = 6; // penalty per char below the target
		const SHORT_BREAK_WORDS = 2; // avoid lines with ≤2 words (non-last)
		const SHORT_BREAK_PENALTY = 80; // strong penalty for short non-last lines
		const LAST_LINE_SLACK_MULT = 0.6; // last line can be looser
		const LINECOUNT_PENALTY = 8; // bias toward fewer lines
		// -----------------

		// compute length of words[i..j] including spaces between
		const lens = words.map((w) => w.length);
		function lineLen(i, j) {
			let sum = 0;
			for (let k = i; k <= j; k++) sum += lens[k];
			return sum + (j - i); // spaces
		}

		function lineCost(len, isLast, wordCount) {
			if (len > maxCharsPerLine) return Infinity;

			const slack = maxCharsPerLine - len;
			let cost = (isLast ? LAST_LINE_SLACK_MULT : 1.0) * slack * slack;

			// Prefer fuller non-last lines; avoid early short breaks like "Enable to"
			if (!isLast) {
				const minTarget = Math.floor(maxCharsPerLine * MIN_FILL_FRAC);
				if (len < minTarget) {
					cost += UNDERFILL_WEIGHT * (minTarget - len);
				}
				if (wordCount <= SHORT_BREAK_WORDS) {
					cost += SHORT_BREAK_PENALTY;
				}
			}
			return cost;
		}

		function widowPenalty(wordCount) {
			if (wordCount <= 1) return 200; // no 1-word last line
			if (wordCount === 2) return 25; // discourage 2-word widow
			return 0;
		}

		let bestText = null;
		let bestScore = Infinity;

		// Try exact line counts; score picks the best, preferring fewer lines.
		for (let L = 2; L <= Math.min(maxLines, words.length); L++) {
			const n = words.length;
			const dp = Array.from({ length: L + 1 }, () =>
				Array(n + 1).fill(Infinity),
			);
			const prev = Array.from({ length: L + 1 }, () => Array(n + 1).fill(-1));
			dp[0][0] = 0;

			for (let l = 1; l <= L; l++) {
				for (let j = 1; j <= n; j++) {
					for (let i = l - 1; i <= j - 1; i++) {
						const isLast = l === L && j === n;
						const len = lineLen(i, j - 1);
						const wordCount = j - i;

						const lc = lineCost(len, isLast, wordCount);
						if (lc === Infinity) continue;

						const wp = isLast ? widowPenalty(wordCount) : 0;
						const cand = dp[l - 1][i] + lc + wp;

						if (cand < dp[l][j]) {
							dp[l][j] = cand;
							prev[l][j] = i;
						}
					}
				}
			}

			if (dp[L][n] === Infinity) continue;

			const score = dp[L][n] + (L - 2) * LINECOUNT_PENALTY;

			if (score < bestScore) {
				bestScore = score;

				// reconstruct breaks
				const breaks = [];
				let l = L,
					j = n;
				while (l > 0) {
					const i = prev[l][j];
					breaks.push([i, j - 1]);
					j = i;
					l--;
				}
				breaks.reverse();

				bestText = breaks
					.map(([i, j]) => words.slice(i, j + 1).join(" "))
					.join("\n");
			}
		}

		return bestText || text;
	}

	// Syncs with CSS --tooltip-max-ch variable
	function getTooltipMaxCh() {
		const raw = getComputedStyle(document.documentElement).getPropertyValue(
			"--tooltip-max-ch",
		);
		const n = parseInt(raw, 10);
		return Number.isFinite(n) && n > 0 ? n : 36;
	}

	function initTooltips() {
		const maxCh = getTooltipMaxCh(); // stays in sync with CSS

		document
			.querySelectorAll(".info-icon-tooltip[data-tooltip]")
			.forEach((el) => {
				// Keep a separate, untouched source so other features (like "send edited message")
				// can read the unmodified value.
				if (!el.dataset.tooltipSrc) {
					el.dataset.tooltipSrc = el.getAttribute("data-tooltip") || "";
				}

				const raw = el.dataset.tooltipSrc;
				let tooltip = localizeText(raw);
				if (tooltip) tooltip = balanceTooltipLines(tooltip, maxCh, 4);

				// Only write if it actually changed to avoid churn
				if (el.getAttribute("data-tooltip") !== tooltip) {
					el.setAttribute("data-tooltip", tooltip);
				}
			});
	}

	// --- Localize all .i18n elements first (so tooltips are up to date) ---
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		const message = chrome.i18n.getMessage(key);
		if (message) el.textContent = message;
	});

	// --- Initialize tooltips (localize + balanced 1–4 lines) ---
	initTooltips();

	// --- Boundary-aware tooltip nudge -------------------------------

	/**
	 * Finds the boundary container (add data-tooltip-boundary to your main wrapper),
	 * falls back to document.body if not present.
	 */
	function getTooltipBoundary() {
		return document.querySelector("[data-tooltip-boundary]") || document.body;
	}

	/**
	 * Create (or reuse) a hidden measuring node that mimics the tooltip bubble.
	 * We size it using the same typography and width rules so measured width ≈ render width.
	 */
	function getTooltipMeasureEl() {
		if (getTooltipMeasureEl._el) return getTooltipMeasureEl._el;

		const el = document.createElement("div");
		el.style.cssText = [
			"position:fixed",
			"top:-99999px",
			"left:-99999px",
			"visibility:hidden",
			"pointer-events:none",
			"z-index:-1",
			"background:rgba(20,20,20,0.98)",
			"color:#fff",
			"padding:12px 20px",
			"border-radius:10px",
			'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
			"font-size:14px",
			"font-weight:500",
			"text-align:center",
			// Match tooltip wrapping exactly
			"white-space:normal",
			"text-wrap:balance", // <-- add this
			"overflow-wrap:normal",
			"word-break:keep-all",
			"hyphens:auto",
			// Match the tooltip width rule
			"inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw)", // <-- add this
			"max-inline-size:calc(var(--tooltip-max-ch) * 1ch)",
			"box-sizing:border-box",
			"line-height:1.45",
		].join(";");

		document.body.appendChild(el);
		getTooltipMeasureEl._el = el;
		return el;
	}

	/**
	 * Compute horizontal offset so tooltip stays within container edges (±padding).
	 * Applies CSS var --tooltip-offset-x on the trigger element.
	 */
	function nudgeTooltipIntoBounds(triggerEl, { gap = 6 } = {}) {
		const boundary =
			document.querySelector("[data-tooltip-boundary]") || document.body;
		const text = triggerEl.getAttribute("data-tooltip") || "";
		if (!text) {
			triggerEl.style.removeProperty("--tooltip-offset-x");
			triggerEl.style.removeProperty("--tooltip-max-fit");
			return;
		}

		/* ---------- 1. figure out the usable area ---------- */
		const cRect = boundary.getBoundingClientRect();
		const usableLeft = cRect.left + gap;
		const usableRight = cRect.right - gap;
		const usableWidth = Math.max(0, usableRight - usableLeft);

		/* ---------- 2. measure bubble *after* width cap ---------- */
		const meas = getTooltipMeasureEl(); // your hidden measuring div
		meas.style.maxInlineSize = `${usableWidth}px`; // cap first
		meas.textContent = text;
		const bubbleWidth = meas.offsetWidth; // actual width with wrapping

		/* expose this cap so CSS matches real width */
		triggerEl.style.setProperty("--tooltip-max-fit", `${bubbleWidth}px`);

		/* ---------- 3. compute minimal X-offset ---------- */
		const tRect = triggerEl.getBoundingClientRect();
		const bubbleLeft = tRect.left + tRect.width / 2 - bubbleWidth / 2;
		const bubbleRight = bubbleLeft + bubbleWidth;

		let offset = 0;
		if (bubbleLeft < usableLeft) offset += usableLeft - bubbleLeft;
		else if (bubbleRight > usableRight) offset -= bubbleRight - usableRight;

		triggerEl.style.setProperty(
			"--tooltip-offset-x",
			`${Math.round(offset)}px`,
		);
	}

	/**
	 * Hook up listeners to recompute on show / hide / resize.
	 * Add data-tooltip-boundary to your main container (e.g., <main data-tooltip-boundary>…)
	 */
	function setupTooltipBoundary() {
		const boundary = getTooltipBoundary();
		const items = Array.from(
			document.querySelectorAll(".info-icon-tooltip[data-tooltip]"),
		);
		const opts = { padding: 6 };

		function onShow(e) {
			const el = e.currentTarget;
			// (Optional) mirror any width change you made in CSS:
			// getTooltipMeasureEl().style.inlineSize = `clamp(28ch, calc(${getTooltipMaxCh()} * 1ch), 95vw)`;
			nudgeTooltipIntoBounds(el, opts);
		}
		function onHide(e) {
			e.currentTarget.style.removeProperty("--tooltip-offset-x");
		}
		function onResize() {
			// Reflow any currently "active" tooltip (hovered/focused)
			const active = items.filter((el) => el.matches(":hover, :focus"));
			active.forEach((el) => {
				nudgeTooltipIntoBounds(el, opts);
			});
		}

		items.forEach((el) => {
			el.addEventListener("mouseenter", onShow);
			el.addEventListener("focus", onShow);
			el.addEventListener("mouseleave", onHide);
			el.addEventListener("blur", onHide);
		});

		// Recompute on viewport resize (debounced)
		let rid = 0;
		window.addEventListener(
			"resize",
			() => {
				cancelAnimationFrame(rid);
				rid = requestAnimationFrame(onResize);
			},
			{ passive: true },
		);

		// Recompute if the boundary scrolls horizontally
		boundary.addEventListener(
			"scroll",
			() => {
				cancelAnimationFrame(rid);
				rid = requestAnimationFrame(onResize);
			},
			{ passive: true },
		);
	}

	// Call this once after your initTooltips()
	/* initTooltips(); */
	setupTooltipBoundary();

	// --- end boundary hack -----------------------------------------

	function showDuplicateModal(messageOrData, cb, opts = {}) {
		// opts:
		//   keyLabel?: string (already lowercased if you want it lower)
		//   targetLabel?: string (destination label)
		//   lines?: Array<{ key: string, from: string, to: string }>  // for multi, per-item mapping
		//   proceedText?: string
		//   assignText?: string

		const DONT_ASK_SHORTCUT_KEY = "dontAskDuplicateShortcutModal";
		const proceedText = opts.proceedText || "Proceed with changes?";
		const assignText = opts.assignText || "Assign here instead?";

		// HTML-escape helper
		function esc(s) {
			return String(s).replace(
				/[&<>"']/g,
				(m) =>
					({
						"&": "&amp;",
						"<": "&lt;",
						">": "&gt;",
						'"': "&quot;",
						"'": "&#39;",
					})[m],
			);
		}

		function ensureOverlay() {
			let overlay = document.getElementById("dup-overlay");
			if (!overlay) {
				overlay = document.createElement("div");
				overlay.id = "dup-overlay";
				overlay.style.display = "none";
				overlay.innerHTML = `
        <div id="dup-box" style="max-width: 520px;">
          <p id="dup-line1" class="dup-line" style="margin:0 0 6px 0; font-size:14px; font-weight:400;"></p>
          <div id="dup-list-wrap" style="margin:0 0 6px; font-size:14px; font-weight:400; display:none;"></div>
          <p id="dup-line2" class="dup-line" style="margin:0 0 10px 0; font-size:14px; font-weight:400;"></p>

          <label style="display:flex;gap:.5em;align-items:center;margin-top:2px;">
            <input id="dup-dont" type="checkbox"> Don’t ask me again
          </label>

          <div class="dup-btns" style="display:flex;gap:.5em;margin-top:10px;">
            <button id="dup-no">Cancel</button>
            <button id="dup-yes">Yes</button>
          </div>
        </div>`;
				document.body.appendChild(overlay);
			}
			return overlay;
		}

		function parseOwners(input) {
			if (Array.isArray(input)) return input;
			const s = typeof input === "string" ? input : "";
			return s
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
		}

		chrome.storage.sync.get(DONT_ASK_SHORTCUT_KEY, (data) => {
			if (data[DONT_ASK_SHORTCUT_KEY]) {
				cb(true, true);
				return;
			}

			const overlay = ensureOverlay();

			// wire buttons per-open + keyboard shortcuts (Enter=Yes, Escape=Cancel)
			const dontChk = overlay.querySelector("#dup-dont");
			const oldCancel = overlay.querySelector("#dup-no");
			const oldYes = overlay.querySelector("#dup-yes");
			const newCancel = oldCancel.cloneNode(true);
			const newYes = oldYes.cloneNode(true);
			oldCancel.parentNode.replaceChild(newCancel, oldCancel);
			oldYes.parentNode.replaceChild(newYes, oldYes);

			// Helper to attach/detach a one-off keydown handler while the modal is open
			function detachDupKeyHandler() {
				if (overlay.__dupKeyHandler) {
					document.removeEventListener(
						"keydown",
						overlay.__dupKeyHandler,
						true,
					);
					overlay.__dupKeyHandler = null;
				}
			}
			function attachDupKeyHandler() {
				detachDupKeyHandler();
				overlay.__dupKeyHandler = (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();
						newYes.click();
					} else if (e.key === "Escape" || e.key === "Esc") {
						e.preventDefault();
						e.stopPropagation();
						newCancel.click();
					}
				};
				document.addEventListener("keydown", overlay.__dupKeyHandler, true);
			}

			newCancel.addEventListener("click", () => {
				detachDupKeyHandler();
				overlay.style.display = "none";
				cb(false, false);
			});

			newYes.addEventListener("click", () => {
				detachDupKeyHandler();
				const skip = dontChk.checked;
				overlay.style.display = "none";
				if (skip)
					chrome.storage.sync.set({ [DONT_ASK_SHORTCUT_KEY]: true }, () =>
						cb(true, true),
					);
				else cb(true, false);
			});

			// Start listening for Enter/Escape while the modal is visible
			attachDupKeyHandler();

			const line1 = overlay.querySelector("#dup-line1");
			const line2 = overlay.querySelector("#dup-line2");
			const listWrap = overlay.querySelector("#dup-list-wrap");

			const yesBtn = overlay.querySelector("#dup-yes");
			const yesColor = yesBtn ? getComputedStyle(yesBtn).color : "#1a73e8";

			// Build data
			const owners = parseOwners(messageOrData);
			const lines = Array.isArray(opts.lines) ? opts.lines.slice() : null;
			const keyLabel = (opts.keyLabel || "").trim(); // keep caller’s casing (we recommend lower-case upstream)
			const targetLabel = (opts.targetLabel || "").trim();

			// Reset UI zones
			line1.textContent = "";
			line2.textContent = "";
			listWrap.innerHTML = "";
			listWrap.style.display = "none";

			if (lines && lines.length > 0) {
				// Multi with per-item mapping (UL bullets)
				const header = document.createElement("div");
				header.textContent = "Multiple shortcuts will be reassigned:";
				header.style.marginBottom = "6px";
				listWrap.appendChild(header);

				const ul = document.createElement("ul");
				ul.id = "dup-list";
				ul.style.margin = "0 0 6px 1.1em";
				ul.style.padding = "0";
				// better wrapping: only at spaces, no mid-word/mid-span breaks
				ul.style.whiteSpace = "normal";
				ul.style.wordBreak = "keep-all";

				lines.forEach(({ key, from, to }) => {
					const li = document.createElement("li");
					li.style.margin = "0 0 4px 0";
					li.style.listStyle = "disc";
					li.style.whiteSpace = "normal";
					li.style.wordBreak = "keep-all";

					const keySpan = document.createElement("span");
					keySpan.className = "dup-key";
					keySpan.style.fontWeight = "700";
					keySpan.style.color = yesColor;
					keySpan.textContent = String(key || "").toLowerCase();

					const fromSpan = document.createElement("span");
					fromSpan.className = "dup-key";
					fromSpan.style.fontWeight = "700";
					fromSpan.style.color = yesColor;
					fromSpan.textContent = from || "";

					const toSpan = document.createElement("span");
					toSpan.className = "dup-key";
					toSpan.style.fontWeight = "700";
					toSpan.style.color = yesColor;
					toSpan.textContent = to || targetLabel || "";

					li.appendChild(keySpan);
					li.appendChild(document.createTextNode(" will be reassigned from "));
					li.appendChild(fromSpan);
					li.appendChild(document.createTextNode(" to "));
					li.appendChild(toSpan);
					ul.appendChild(li);
				});

				listWrap.appendChild(ul);
				listWrap.style.display = "block";
				line2.textContent = proceedText;
			} else if (owners.length > 1) {
				// Multi (owners only): show header + UL with the SAME keyLabel/to for each
				const header = document.createElement("div");
				header.textContent = "Multiple shortcuts will be reassigned:";
				header.style.marginBottom = "6px";
				listWrap.appendChild(header);

				const ul = document.createElement("ul");
				ul.id = "dup-list";
				ul.style.margin = "0 0 6px 1.1em";
				ul.style.padding = "0";
				ul.style.whiteSpace = "normal";
				ul.style.wordBreak = "keep-all";

				owners.forEach((fromName) => {
					const li = document.createElement("li");
					li.style.margin = "0 0 4px 0";
					li.style.listStyle = "disc";
					li.style.whiteSpace = "normal";
					li.style.wordBreak = "keep-all";

					const keySpan = document.createElement("span");
					keySpan.className = "dup-key";
					keySpan.style.fontWeight = "700";
					keySpan.style.color = yesColor;
					keySpan.textContent = keyLabel || "key";

					const fromSpan = document.createElement("span");
					fromSpan.className = "dup-key";
					fromSpan.style.fontWeight = "700";
					fromSpan.style.color = yesColor;
					fromSpan.textContent = fromName || "";

					const toSpan = document.createElement("span");
					toSpan.className = "dup-key";
					toSpan.style.fontWeight = "700";
					toSpan.style.color = yesColor;
					toSpan.textContent = targetLabel || "";

					li.appendChild(keySpan);
					li.appendChild(document.createTextNode(" will be reassigned from "));
					li.appendChild(fromSpan);
					li.appendChild(document.createTextNode(" to "));
					li.appendChild(toSpan);
					ul.appendChild(li);
				});

				listWrap.appendChild(ul);
				listWrap.style.display = "block";
				line2.textContent = proceedText;
			} else {
				// Single
				const owner = owners[0] || "";
				const prettyKey =
					keyLabel && /^[A-Za-z]$/.test(keyLabel)
						? keyLabel.toLowerCase()
						: keyLabel;

				if (prettyKey) {
					line1.innerHTML = `<span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(prettyKey)}</span> is already assigned to <span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(owner)}</span>.`;
				} else {
					line1.innerHTML = `This key is assigned to <span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(owner)}</span>.`;
				}
				// Bold the CTA
				line2.innerHTML = `<strong>${esc(assignText)}</strong>`;
			}

			overlay.style.display = "flex";
		});
	}

	/* Coalesce duplicate modal requests so the user only answers once */
	(() => {
		if (window.__dupModalGateInstalled) return;
		window.__dupModalGateInstalled = true;

		const rawShow = window.showDuplicateModal || showDuplicateModal;
		const KEY = "dontAskDuplicateShortcutModal";

		const state = {
			open: false,
			waiters: [],
			last: null, // { yes, remember, at }
			dontAskCache: null, // true | false | null (unknown)
		};

		window.showDuplicateModal = function coalescedDuplicateModal(
			messageOrData,
			cb,
			opts = {},
		) {
			// If a dialog is in-flight, just join this request to the same decision.
			if (state.open) {
				state.waiters.push(cb);
				return;
			}

			// If the user just answered very recently, reuse that decision (prevents back-to-back re-prompts).
			if (state.last && Date.now() - state.last.at < 300) {
				cb(state.last.yes, state.last.remember);
				return;
			}

			// If we already know "Don't ask again" is set, auto-accept for all callers.
			const autoAccept = () => {
				const res = { yes: true, remember: true, at: Date.now() };
				state.last = res;
				try {
					cb(true, true);
				} catch (_) { }
			};

			const openModal = () => {
				state.open = true;
				state.waiters = [cb];

				rawShow(
					messageOrData,
					(yes, remember) => {
						// Update caches
						if (remember) state.dontAskCache = true;
						state.last = { yes, remember, at: Date.now() };

						// Resolve all queued callers with the same answer
						const waiters = state.waiters.slice();
						state.waiters.length = 0;
						state.open = false;
						waiters.forEach((fn) => {
							try {
								fn(yes, remember);
							} catch (_) { }
						});
					},
					opts,
				);
			};

			if (state.dontAskCache === true) {
				autoAccept();
				return;
			}

			// Read "Don't ask again" from storage once, then cache
			chrome.storage.sync.get(KEY, (data) => {
				const skip = Boolean(data?.[KEY]);
				if (skip) {
					state.dontAskCache = true;
					autoAccept();
				} else {
					openModal();
				}
			});
		};
	})();

	// End of Utility Functions

	/**
	 * Initializes default settings if not present in Chrome storage.
	 * Sets the radio button and checkbox states and stores them if they haven't been defined yet.
	 */
	chrome.storage.sync.get(
		[
			"hideArrowButtonsCheckbox",
			"hideCornerButtonsCheckbox",
			"removeMarkdownOnCopyCheckbox",
			"moveTopBarToBottomCheckbox",
			"pageUpDownTakeover",
			"selectMessagesSentByUserOrChatGptCheckbox",
			"onlySelectUserCheckbox",
			"onlySelectAssistantCheckbox",
			"disableCopyAfterSelectCheckbox",
			"enableSendWithControlEnterCheckbox",
			"enableStopWithControlBackspaceCheckbox",
			"useAltForModelSwitcherRadio",
			"useControlForModelSwitcherRadio",
			"rememberSidebarScrollPositionCheckbox",
		],
		(data) => {
			const defaults = {
				hideArrowButtonsCheckbox:
					data.hideArrowButtonsCheckbox !== undefined
						? data.hideArrowButtonsCheckbox
						: true, // hide arrows by default
				hideCornerButtonsCheckbox:
					data.hideCornerButtonsCheckbox === undefined
						? true
						: data.hideCornerButtonsCheckbox,
				removeMarkdownOnCopyCheckbox:
					data.removeMarkdownOnCopyCheckbox !== undefined
						? data.removeMarkdownOnCopyCheckbox
						: true, // Default to true
				moveTopBarToBottomCheckbox:
					data.moveTopBarToBottomCheckbox !== undefined
						? data.moveTopBarToBottomCheckbox
						: false, // Default to false
				pageUpDownTakeover:
					data.pageUpDownTakeover !== undefined
						? data.pageUpDownTakeover
						: true, // Default to true
				selectMessagesSentByUserOrChatGptCheckbox:
					data.selectMessagesSentByUserOrChatGptCheckbox !== undefined
						? data.selectMessagesSentByUserOrChatGptCheckbox
						: true, // Default to true
				onlySelectUserCheckbox:
					data.onlySelectUserCheckbox !== undefined
						? data.onlySelectUserCheckbox
						: false, // Default to false
				onlySelectAssistantCheckbox:
					data.onlySelectAssistantCheckbox !== undefined
						? data.onlySelectAssistantCheckbox
						: false, // Default to false
				disableCopyAfterSelectCheckbox:
					data.disableCopyAfterSelectCheckbox !== undefined
						? data.disableCopyAfterSelectCheckbox
						: false, // Default to false
				enableSendWithControlEnterCheckbox:
					data.enableSendWithControlEnterCheckbox !== undefined
						? data.enableSendWithControlEnterCheckbox
						: true, // Default to true
				enableStopWithControlBackspaceCheckbox:
					data.enableStopWithControlBackspaceCheckbox !== undefined
						? data.enableStopWithControlBackspaceCheckbox
						: true, // Default to true
				useAltForModelSwitcherRadio:
					data.useAltForModelSwitcherRadio !== undefined
						? data.useAltForModelSwitcherRadio
						: true, // Default to true
				useControlForModelSwitcherRadio:
					data.useControlForModelSwitcherRadio !== undefined
						? data.useControlForModelSwitcherRadio
						: false, // Default to false
				rememberSidebarScrollPositionCheckbox:
					data.rememberSidebarScrollPositionCheckbox !== undefined
						? data.rememberSidebarScrollPositionCheckbox
						: false, // Default to false
			};

			// Update the checkbox and radio button states in the popup based on stored or default values
			document.getElementById("hideArrowButtonsCheckbox").checked =
				defaults.hideArrowButtonsCheckbox;
			document.getElementById("hideCornerButtonsCheckbox").checked =
				defaults.hideCornerButtonsCheckbox;
			document.getElementById("removeMarkdownOnCopyCheckbox").checked =
				defaults.removeMarkdownOnCopyCheckbox;
			document.getElementById("moveTopBarToBottomCheckbox").checked =
				defaults.moveTopBarToBottomCheckbox;
			document.getElementById("pageUpDownTakeover").checked =
				defaults.pageUpDownTakeover;
			document.getElementById(
				"selectMessagesSentByUserOrChatGptCheckbox",
			).checked = defaults.selectMessagesSentByUserOrChatGptCheckbox;
			document.getElementById("onlySelectUserCheckbox").checked =
				defaults.onlySelectUserCheckbox;
			document.getElementById("onlySelectAssistantCheckbox").checked =
				defaults.onlySelectAssistantCheckbox;
			document.getElementById("disableCopyAfterSelectCheckbox").checked =
				defaults.disableCopyAfterSelectCheckbox;
			document.getElementById("enableSendWithControlEnterCheckbox").checked =
				defaults.enableSendWithControlEnterCheckbox;
			document.getElementById(
				"enableStopWithControlBackspaceCheckbox",
			).checked = defaults.enableStopWithControlBackspaceCheckbox;
			document.getElementById("useAltForModelSwitcherRadio").checked =
				defaults.useAltForModelSwitcherRadio;
			document.getElementById("useControlForModelSwitcherRadio").checked =
				defaults.useControlForModelSwitcherRadio;
			document.getElementById("rememberSidebarScrollPositionCheckbox").checked =
				defaults.rememberSidebarScrollPositionCheckbox;
			// Store the defaults if the values are missing
			chrome.storage.sync.set(defaults);
		},
	);

	/**
	 * Handles checkbox or radio button state changes by saving to Chrome storage and showing a toast.
	 * Prevents attaching multiple event listeners.
	 * @param {string} elementId - The ID of the checkbox or radio button element.
	 * @param {string} storageKey - The key to store the state in Chrome storage.
	 */
	function handleStateChange(elementId, storageKey) {
		const element = document.getElementById(elementId);
		if (element && !element.dataset.listenerAttached) {
			element.addEventListener("change", function () {
				const isChecked = this.checked;
				let obj = {};

				if (
					[
						"selectMessagesSentByUserOrChatGptCheckbox",
						"onlySelectUserCheckbox",
						"onlySelectAssistantCheckbox",
					].includes(storageKey)
				) {
					obj = {
						selectMessagesSentByUserOrChatGptCheckbox: false,
						onlySelectUserCheckbox: false,
						onlySelectAssistantCheckbox: false,
					};
					obj[storageKey] = isChecked;
				} else if (
					[
						"useAltForModelSwitcherRadio",
						"useControlForModelSwitcherRadio",
					].includes(storageKey)
				) {
					obj = {
						useAltForModelSwitcherRadio: false,
						useControlForModelSwitcherRadio: false,
					};
					obj[storageKey] = isChecked;
				} else {
					obj[storageKey] = isChecked;
				}

				chrome.storage.sync.set(obj, () => {
					if (chrome.runtime.lastError) {
						console.error(
							`Error saving "${storageKey}":`,
							chrome.runtime.lastError,
						);
						showToast(
							`Error saving option: ${chrome.runtime.lastError.message}`,
						);
						return;
					}
					console.log(`The value of "${storageKey}" is set to ${isChecked}`);
					showToast("Options saved. Reload page to apply changes.");
				});
			});
			element.dataset.listenerAttached = "true";
		}
	}

	// Apply the handler to each checkbox and radio button
	handleStateChange("hideArrowButtonsCheckbox", "hideArrowButtonsCheckbox");
	handleStateChange("hideCornerButtonsCheckbox", "hideCornerButtonsCheckbox");
	handleStateChange(
		"removeMarkdownOnCopyCheckbox",
		"removeMarkdownOnCopyCheckbox",
	);
	handleStateChange("moveTopBarToBottomCheckbox", "moveTopBarToBottomCheckbox");
	handleStateChange("pageUpDownTakeover", "pageUpDownTakeover");
	handleStateChange(
		"selectMessagesSentByUserOrChatGptCheckbox",
		"selectMessagesSentByUserOrChatGptCheckbox",
	);
	handleStateChange("onlySelectUserCheckbox", "onlySelectUserCheckbox");
	handleStateChange(
		"onlySelectAssistantCheckbox",
		"onlySelectAssistantCheckbox",
	);
	handleStateChange(
		"disableCopyAfterSelectCheckbox",
		"disableCopyAfterSelectCheckbox",
	);
	handleStateChange(
		"enableSendWithControlEnterCheckbox",
		"enableSendWithControlEnterCheckbox",
	);
	handleStateChange(
		"enableStopWithControlBackspaceCheckbox",
		"enableStopWithControlBackspaceCheckbox",
	);
	handleStateChange(
		"rememberSidebarScrollPositionCheckbox",
		"rememberSidebarScrollPositionCheckbox",
	);

	// Specialized wiring for the Model Picker mode radios (Alt vs Control)
	// Shows a dupe modal when switching to Alt would collide with popup shortcuts.
	(function wireModelPickerModeRadios() {
		const alt = document.getElementById("useAltForModelSwitcherRadio");
		const ctrl = document.getElementById("useControlForModelSwitcherRadio");
		if (!alt || !ctrl) return;

		// Avoid double-binding if this script can run twice
		if (
			alt.dataset.listenerAttached === "true" ||
			ctrl.dataset.listenerAttached === "true"
		)
			return;

		function saveMode(mode) {
			const obj = {
				useAltForModelSwitcherRadio: mode === "alt",
				useControlForModelSwitcherRadio: mode === "ctrl",
			};
			chrome.storage.sync.set(obj, () => {
				if (chrome.runtime.lastError) {
					console.error(
						"Error saving model picker mode:",
						chrome.runtime.lastError,
					);
					showToast(`Error: ${chrome.runtime.lastError.message}`);
					return;
				}
				showToast("Options saved. Reload page to apply changes.");
			});
		}

		alt.addEventListener("change", () => {
			if (!alt.checked) return;

			const conflicts = gatherPopupConflictsForModelSwitch("alt");
			if (conflicts.length === 0) {
				saveMode("alt");
				return;
			}

			// Build bulleted lines like: “w will be reassigned from Web Search Tool to GPT-5 Auto”
			const lines = conflicts.map((c) => ({
				key: (c.keyLabel || "").toLowerCase(),
				from: c.label,
				to: c.targetLabel || "Model",
			}));

			const names = conflicts.map((c) => c.label).join(", ");
			window.showDuplicateModal(
				names,
				(yes, remember) => {
					if (yes) {
						window.ShortcutUtils.clearOwners(conflicts, () => {
							saveMode("alt");
							if (remember) {
								window.prefs = window.prefs || {};
								window.prefs.autoOverwrite = true;
								chrome.storage.sync.set({ autoOverwrite: true });
							}
						});
					} else {
						alt.checked = false;
						ctrl.checked = true;
					}
				},
				{ lines, proceedText: "Proceed with changes?" },
			);
		});

		// Switching to Control never collides with Alt-based popup shortcuts; just save.
		ctrl.addEventListener("change", () => {
			if (!ctrl.checked) return;
			saveMode("ctrl");
		});

		alt.dataset.listenerAttached = "true";
		ctrl.dataset.listenerAttached = "true";
	})();

	const shortcutKeys = [
		"shortcutKeyScrollUpOneMessage",
		"shortcutKeyScrollDownOneMessage",
		"shortcutKeyCopyLowest",
		"shortcutKeyEdit",
		"shortcutKeySendEdit",
		"shortcutKeyCopyAllResponses",
		"shortcutKeyCopyAllCodeBlocks",
		"shortcutKeyNewConversation",
		"shortcutKeySearchConversationHistory",
		"shortcutKeyClickNativeScrollToBottom",
		"shortcutKeyToggleSidebar",
		"shortcutKeyActivateInput",
		"shortcutKeySearchWeb",
		"shortcutKeyScrollToTop",
		"shortcutKeyPreviousThread",
		"shortcutKeyNextThread",
		"selectThenCopy",
		"shortcutKeyToggleSidebarFoldersButton",
		"shortcutKeyToggleModelSelector",
		"shortcutKeyRegenerate",
		"shortcutKeyTemporaryChat",
		"shortcutKeyStudy",
		"shortcutKeyCreateImage",
		"shortcutKeyToggleCanvas",
		"shortcutKeyToggleDictate",
		"shortcutKeyCancelDictation",
		"shortcutKeyShare",
		"shortcutKeyThinkLonger",
		"shortcutKeyAddPhotosFiles",
	];
	const shortcutKeyValues = {};

	// Helper: convert KeyboardEvent.code to display label for popup input (reuses chip helper)
	function codeToDisplayChar(code) {
		if (!code || code === "\u00A0") return "";
		const fn =
			window.ShortcutUtils &&
				typeof window.ShortcutUtils.displayFromCode === "function"
				? window.ShortcutUtils.displayFromCode
				: typeof displayFromCode === "function"
					? displayFromCode
					: null;
		return fn ? fn(code) || "" : "";
	}

	// --- Robust shortcut input load/save/wireup (fixes clear bug & always syncs) ---

	// Known fallback defaults for shortcuts that may not have an HTML value attribute
	// Add more entries here if you discover other defaults that must roundtrip.
	const DEFAULT_SHORTCUT_CODE_FALLBACKS = {
		// Show Model Picker default "/"
		shortcutKeyToggleModelSelector: "Slash",
	};

	// Reusable: hydrate all shortcut inputs from storage (or HTML defaults) into value + dataset.keyCode
	function refreshShortcutInputsFromStorage() {
		chrome.storage.sync.get(shortcutKeys, (data) => {
			// Clear old cache
			Object.keys(shortcutKeyValues).forEach((k) => {
				delete shortcutKeyValues[k];
			});

			shortcutKeys.forEach((id) => {
				const el = document.getElementById(id);
				if (!el) return;

				const stored = data[id];
				const defaultValue = (el.getAttribute("value") || "").trim();
				const fallbackCode = DEFAULT_SHORTCUT_CODE_FALLBACKS[id] || "";

				if (
					typeof stored === "string" &&
					stored !== "\u00A0" &&
					stored.trim()
				) {
					el.dataset.keyCode = stored;
					el.value = codeToDisplayChar(stored);
					shortcutKeyValues[id] = el.value;
				} else if (stored === "\u00A0") {
					el.dataset.keyCode = "";
					el.value = "";
					shortcutKeyValues[id] = "";
				} else if (defaultValue) {
					const code =
						(window.ShortcutUtils?.charToCode || charToCode)(defaultValue) ||
						"";
					el.dataset.keyCode = code;
					el.value = code ? codeToDisplayChar(code) : defaultValue;
					shortcutKeyValues[id] = el.value;
				} else if (fallbackCode) {
					el.dataset.keyCode = fallbackCode;
					el.value = codeToDisplayChar(fallbackCode);
					shortcutKeyValues[id] = el.value;
				} else {
					el.dataset.keyCode = "";
					el.value = "";
					shortcutKeyValues[id] = "";
				}
			});
		});
	}

	// Expose for import code to reuse
	window.refreshShortcutInputsFromStorage = refreshShortcutInputsFromStorage;

	// Initial hydrate on popup open
	refreshShortcutInputsFromStorage();

	// Wire up robust key capture: supports arrows, function keys, media keys, labels, and guards input vs keydown
	shortcutKeys.forEach((id) => {
		const input = document.getElementById(id);
		if (!input) return;

		// Build a reverse map from display labels → KeyboardEvent.code (once per popup)
		function getReverseMap() {
			if (window.__revShortcutLabelMap) return window.__revShortcutLabelMap;

			const display =
				window.ShortcutUtils?.displayFromCode || window.displayFromCode;
			const codes = [
				// Letters
				...Array.from(
					{ length: 26 },
					(_, i) => `Key${String.fromCharCode(65 + i)}`,
				),
				// Top-row digits + numpad digits
				...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
				...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
				// Function keys
				...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
				// Punctuation/symbols
				"Minus",
				"Equal",
				"BracketLeft",
				"BracketRight",
				"Backslash",
				"Semicolon",
				"Quote",
				"Comma",
				"Period",
				"Slash",
				"Backquote",
				// Navigation/whitespace/control
				"Space",
				"Enter",
				"Escape",
				"Tab",
				"Backspace",
				"Delete",
				"Insert",
				"Home",
				"End",
				"PageUp",
				"PageDown",
				"ArrowLeft",
				"ArrowRight",
				"ArrowUp",
				"ArrowDown",
				// Numpad ops
				"NumpadDivide",
				"NumpadMultiply",
				"NumpadSubtract",
				"NumpadAdd",
				"NumpadDecimal",
				"NumpadEnter",
				"NumpadEqual",
				// Lock/system/context
				"CapsLock",
				"NumLock",
				"ScrollLock",
				"PrintScreen",
				"Pause",
				"ContextMenu",
				// International
				"IntlBackslash",
				"IntlYen",
				"IntlRo",
				"Lang1",
				"Lang2",
				"Lang3",
				"Lang4",
				"Lang5",
				// Media (stay consistent with your chips)
				"VolumeMute",
				"VolumeDown",
				"VolumeUp",
				"MediaPlayPause",
				"MediaTrackNext",
				"MediaTrackPrevious",
				// Modifiers (for label matching; we still ignore as assignments)
				"MetaLeft",
				"MetaRight",
				"AltLeft",
				"AltRight",
				"ControlLeft",
				"ControlRight",
				"ShiftLeft",
				"ShiftRight",
				"Fn",
			];

			const exact = Object.create(null);
			const lower = Object.create(null);
			const set = new Set(codes);

			// Known synonym labels → codes
			const synonyms = {
				Bksp: "Backspace",
				Backspace: "Backspace",
				Del: "Delete",
				Delete: "Delete",
				Esc: "Escape",
				Enter: "Enter",
				"↩": "Enter",
				"⎋": "Escape",
				"⇥": "Tab",
				Tab: "Tab",
				Space: "Space",
				// Arrows
				"↑": "ArrowUp",
				"↓": "ArrowDown",
				"←": "ArrowLeft",
				"→": "ArrowRight",
				// Paging
				PgUp: "PageUp",
				PgDn: "PageDown",
				"Page Up": "PageUp",
				"Page Down": "PageDown",
				// Navigation
				Home: "Home",
				End: "End",
				Insert: "Insert",
				// Media and volume
				Mute: "VolumeMute",
				"Vol+": "VolumeUp",
				"Vol-": "VolumeDown",
				"Vol–": "VolumeDown",
				"Play/Pause": "MediaPlayPause",
				Next: "MediaTrackNext",
				Prev: "MediaTrackPrevious",
				// Platform modifiers
				Win: "MetaLeft",
				"⌘": "MetaLeft",
				Command: "MetaLeft",
				Ctrl: "ControlLeft",
				Control: "ControlLeft",
				"⌥": "AltLeft",
				Alt: "AltLeft",
				"⇧": "ShiftLeft",
				Shift: "ShiftLeft",
				Fn: "Fn",
			};

			// Fill from synonyms first (exact + lowercase)
			Object.keys(synonyms).forEach((label) => {
				const code = synonyms[label];
				exact[label] = code;
				lower[label.toLowerCase()] = code;
			});

			// Derive from your displayFromCode for canonical labels
			codes.forEach((c) => {
				const label = display ? display(c) : "";
				if (!label || label === "\u00A0") return;
				if (!exact[label]) exact[label] = c;
				const lc = label.toLowerCase();
				if (!lower[lc]) lower[lc] = c;
			});

			// Also allow raw code names typed directly (e.g., "Insert", "MediaPlayPause")
			codes.forEach((c) => {
				if (!exact[c]) exact[c] = c;
				const lc = c.toLowerCase();
				if (!lower[lc]) lower[lc] = c;
			});

			window.__revShortcutLabelMap = { exact, lower, set };
			return window.__revShortcutLabelMap;
		}

		// KEYDOWN: primary path for all keys
		input.addEventListener("keydown", function (e) {
			if (e.key === "Tab") return; // allow navigation
			e.preventDefault();
			e.stopPropagation();

			// Mark that keydown handled this; ignore the next input event flicker
			this.dataset.justHandled = "1";
			setTimeout(() => {
				this.dataset.justHandled = "";
			}, 60);

			// Escape: restore current assignment
			if (e.code === "Escape") {
				const prevCode = this.dataset.keyCode || "";
				this.value = prevCode ? codeToDisplayChar(prevCode) : "";
				return;
			}

			// Clear on Backspace/Delete
			if (e.code === "Backspace" || e.code === "Delete") {
				saveShortcutValue(id, "");
				this.dataset.keyCode = "";
				this.value = "";
				shortcutKeyValues[id] = "";
				showToast("Shortcut cleared. Reload page to apply changes.");
				return;
			}

			// Ignore bare modifiers
			if (/^(Shift|Alt|Control|Meta|Fn)(Left|Right)?$/.test(e.code)) return;

			const code = e.code;
			const selfOwner = { type: "shortcut", id };
			const conflicts = window.ShortcutUtils.buildConflictsForCode(
				code,
				selfOwner,
			);

			const proceed = () => {
				window.ShortcutUtils.clearOwners(conflicts, () => {
					saveShortcutValue(id, code, true);
					this.dataset.keyCode = code;
					this.value = codeToDisplayChar(code);
					shortcutKeyValues[id] = this.value;
					showToast("Options saved. Reload page to apply changes.");
				});
			};

			if (conflicts.length) {
				if (prefs.autoOverwrite) return proceed();
				const keyLabel = codeToDisplayChar(code);
				const targetLabel = getShortcutLabelById(id) || "";
				const names = conflicts.map((c) => c.label).join(", ");
				window.showDuplicateModal(
					names,
					(yes, remember) => {
						if (yes) {
							if (remember) {
								prefs.autoOverwrite = true;
								chrome.storage.sync.set({ autoOverwrite: true });
							}
							proceed();
						}
					},
					{ keyLabel, targetLabel },
				);
			} else {
				proceed();
			}
		});

		// INPUT: fallback for typing/pasting characters or labels
		input.addEventListener("input", function () {
			// If keydown just handled it, ignore this input event to prevent false "unsupported"
			if (this.dataset.justHandled === "1") {
				const current = this.dataset.keyCode || "";
				this.value = current ? codeToDisplayChar(current) : "";
				this.dataset.justHandled = "";
				return;
			}

			const raw = this.value.trim();
			if (!raw) {
				saveShortcutValue(id, "");
				this.dataset.keyCode = "";
				shortcutKeyValues[id] = "";
				showToast("Shortcut cleared. Reload page to apply changes.");
				return;
			}

			// If raw equals current display, keep current code (no change)
			const currentCode = this.dataset.keyCode || "";
			if (currentCode && raw === codeToDisplayChar(currentCode)) {
				this.value = codeToDisplayChar(currentCode);
				return;
			}

			// Try character → code first
			let code = (window.ShortcutUtils?.charToCode || charToCode)(raw);

			// Try label/code reverse map
			if (!code) {
				const map = getReverseMap();
				code = map.exact[raw] || map.lower[raw.toLowerCase()] || "";
			}

			if (!code) {
				// No mapping found; revert to the last good display (if any) and notify
				this.value = currentCode ? codeToDisplayChar(currentCode) : "";
				showToast(
					"Unsupported key. Press a key or enter a valid shortcut label.",
				);
				return;
			}

			const selfOwner = { type: "shortcut", id };
			const conflicts = window.ShortcutUtils.buildConflictsForCode(
				code,
				selfOwner,
			);

			const proceed = () => {
				window.ShortcutUtils.clearOwners(conflicts, () => {
					saveShortcutValue(id, code, true);
					this.dataset.keyCode = code;
					this.value = codeToDisplayChar(code);
					shortcutKeyValues[id] = this.value;
					showToast("Options saved. Reload page to apply changes.");
				});
			};

			if (conflicts.length) {
				if (prefs.autoOverwrite) return proceed();

				const keyLabel = codeToDisplayChar(code);
				const targetLabel = getShortcutLabelById(id) || "";
				const names = conflicts.map((c) => c.label).join(", ");
				window.showDuplicateModal(
					names,
					(yes, remember) => {
						if (yes) {
							if (remember) {
								prefs.autoOverwrite = true;
								chrome.storage.sync.set({ autoOverwrite: true });
							}
							proceed();
						} else {
							// Revert to previously persisted value
							chrome.storage.sync.get(id, (data) => {
								const val = data?.[id];
								const prev = val && val !== "\u00A0" ? val : "";
								this.dataset.keyCode = prev || "";
								this.value = prev ? codeToDisplayChar(prev) : "";
							});
						}
					},
					{ keyLabel, targetLabel },
				);
			} else {
				proceed();
			}
		});
	});

	// Handling separator keys
	const separatorKeys = ["copyCode-userSeparator", "copyAll-userSeparator"];

	// Get the stored values and set them in the inputs
	chrome.storage.sync.get(separatorKeys, (data) => {
		separatorKeys.forEach((id) => {
			const value =
				data[id] !== undefined ? data[id] : document.getElementById(id).value;
			document.getElementById(id).value = value;
		});
	});

	// Save separators without trimming or alteration
	separatorKeys.forEach((id) => {
		const inputField = document.getElementById(id);
		if (inputField && !inputField.dataset.listenerAttached) {
			inputField.addEventListener("blur", function () {
				const separatorValue = this.value; // Use exact user input
				chrome.storage.sync.set({ [id]: separatorValue }, () => {
					showToast("Separator saved. Reload page to apply changes.");
				});
			});
			inputField.dataset.listenerAttached = "true";
		}
	});

	const moveTopBarCheckbox = document.getElementById(
		"moveTopBarToBottomCheckbox",
	);
	const slider = document.getElementById("opacitySlider");
	const sliderValueDisplay = document.getElementById("opacityValue");
	const previewIcon = document.getElementById("opacityPreviewIcon");
	const tooltipContainer = document.getElementById("opacity-tooltip-container");

	chrome.storage.sync.get(
		"popupBottomBarOpacityValue",
		({ popupBottomBarOpacityValue }) => {
			const val =
				typeof popupBottomBarOpacityValue === "number"
					? popupBottomBarOpacityValue
					: 0.6;
			slider.value = val;
			sliderValueDisplay.textContent = val.toFixed(2);
			previewIcon.style.opacity = val;
		},
	);

	function toggleOpacityUI(visible) {
		tooltipContainer.style.display = visible ? "flex" : "none";
	}

	// Update visibility initially and on change
	chrome.storage.sync.get(
		"moveTopBarToBottomCheckbox",
		({ moveTopBarToBottomCheckbox }) => {
			const isVisible =
				moveTopBarToBottomCheckbox !== undefined
					? moveTopBarToBottomCheckbox
					: false;
			moveTopBarCheckbox.checked = isVisible;
			toggleOpacityUI(isVisible);
		},
	);

	moveTopBarCheckbox.addEventListener("change", () => {
		const isChecked = moveTopBarCheckbox.checked;
		toggleOpacityUI(isChecked);
		chrome.storage.sync.set({ moveTopBarToBottomCheckbox: isChecked });
	});

	let sliderTimeout;
	slider.addEventListener("input", () => {
		const val = parseFloat(slider.value);
		sliderValueDisplay.textContent = val.toFixed(2);
		previewIcon.style.opacity = val;

		clearTimeout(sliderTimeout);
		sliderTimeout = setTimeout(() => {
			let numericVal = Number(slider.value);
			if (Number.isNaN(numericVal)) numericVal = 0.6;

			chrome.storage.sync.set(
				{ popupBottomBarOpacityValue: numericVal },
				() => {
					if (chrome.runtime.lastError) {
						console.error("Storage set error:", chrome.runtime.lastError);
					} else {
						console.log("popupBottomBarOpacityValue set to", numericVal);
						showToast("Opacity saved. Reload page to apply changes.");
					}
				},
			);
		}, 500);
	});

	setTimeout(() => {
		balanceWrappedLabels();
	}, 50); // delay lets i18n/localization update labels first

	// ===================== @note Import and Export Settings IIFE =====================

	// === Backup & Restore (Export/Import) ===
	(function settingsBackupInit() {
		// Whitelist known keys (includes all shortcuts + options + model picker + prefs)
		const OPTION_KEYS = [
			"hideArrowButtonsCheckbox",
			"hideCornerButtonsCheckbox",
			"removeMarkdownOnCopyCheckbox",
			"moveTopBarToBottomCheckbox",
			"pageUpDownTakeover",
			"selectMessagesSentByUserOrChatGptCheckbox",
			"onlySelectUserCheckbox",
			"onlySelectAssistantCheckbox",
			"disableCopyAfterSelectCheckbox",
			"enableSendWithControlEnterCheckbox",
			"enableStopWithControlBackspaceCheckbox",
			"useAltForModelSwitcherRadio",
			"useControlForModelSwitcherRadio",
			"rememberSidebarScrollPositionCheckbox",
			"popupBottomBarOpacityValue",
			"fadeSlimSidebarEnabled",
			"popupSlimSidebarOpacityValue",
			"autoOverwrite",
			"dontAskDuplicateShortcutModal",
			"copyCode-userSeparator",
			"copyAll-userSeparator",
			"modelPickerKeyCodes",
		];
		function getExportKeySet() {
			return new Set([...shortcutKeys, ...OPTION_KEYS]);
		}

		// i18n helper — mirrors your 111/222 approach but works in JS too.
		// Usage: t('key') or t('key', 'substitution')
		function t(key, substitution) {
			try {
				const msg = chrome?.i18n?.getMessage?.(key, substitution);
				return msg?.trim() || key; // optional chain + same fallback semantics
			} catch (_) {
				return key;
			}
		}

		/**
		 * Normalize any stored/loaded shortcut value to a valid
		 * `KeyboardEvent.code` or NBSP placeholder.
		 *
		 * 1. Accepts already-valid code strings like "Slash" — **fixes import bug**.
		 * 2. Converts single printable characters (e.g. "/") to codes.
		 * 3. Returns NBSP for empty/invalid input.
		 */
		function normalizeShortcutVal(v) {
			// ── empty / placeholder handling ───────────────────────────────────
			if (v == null) return "\u00A0";
			const s = String(v).trim();
			if (s === "" || s === "\u00A0") return "\u00A0";

			// ── fast-path: value is already a valid `KeyboardEvent.code` ───────
			//    Added `Slash` and other punctuation codes that were missing.
			// Full-string match for every valid KeyboardEvent.code
			const CODE_RE =
				/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(?:Left|Right|Up|Down)|F(?:[1-9]|1[0-9]|2[0-4])|Backspace|Enter|Escape|Tab|Space|Minus|Equal|Bracket(?:Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote|Delete|Insert|Home|End|Page(?:Up|Down)|CapsLock|NumLock|ScrollLock|PrintScreen|Pause|ContextMenu|Numpad(?:Divide|Multiply|Subtract|Add|Decimal|Enter|Equal)|Volume(?:Mute|Down|Up)|Media(?:PlayPause|TrackNext|TrackPrevious)|Meta(?:Left|Right)|Alt(?:Left|Right)|Control(?:Left|Right)|Shift(?:Left|Right)|Fn)$/;

			if (CODE_RE.test(s)) return s;

			// ── fallback: convert single printable char to code ────────────────
			const toCode = window.ShortcutUtils?.charToCode || charToCode;
			const converted = toCode ? toCode(s) : "";

			return converted || "\u00A0";
		}

		function exportSettingsToFile() {
			const keySet = getExportKeySet();

			// Build reverse label map on demand to translate visible labels (↑, Enter, Mute) back to codes
			function getReverseMap() {
				if (window.__revShortcutLabelMapForExport)
					return window.__revShortcutLabelMapForExport;
				const display =
					window.ShortcutUtils?.displayFromCode || window.displayFromCode;
				const codes = [
					...Array.from(
						{ length: 26 },
						(_, i) => `Key${String.fromCharCode(65 + i)}`,
					),
					...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
					...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
					...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
					"Minus",
					"Equal",
					"BracketLeft",
					"BracketRight",
					"Backslash",
					"Semicolon",
					"Quote",
					"Comma",
					"Period",
					"Slash",
					"Backquote",
					"Space",
					"Enter",
					"Escape",
					"Tab",
					"Backspace",
					"Delete",
					"Insert",
					"Home",
					"End",
					"PageUp",
					"PageDown",
					"ArrowLeft",
					"ArrowRight",
					"ArrowUp",
					"ArrowDown",
					"NumpadDivide",
					"NumpadMultiply",
					"NumpadSubtract",
					"NumpadAdd",
					"NumpadDecimal",
					"NumpadEnter",
					"NumpadEqual",
					"CapsLock",
					"NumLock",
					"ScrollLock",
					"PrintScreen",
					"Pause",
					"ContextMenu",
					"IntlBackslash",
					"IntlYen",
					"IntlRo",
					"Lang1",
					"Lang2",
					"Lang3",
					"Lang4",
					"Lang5",
					"VolumeMute",
					"VolumeDown",
					"VolumeUp",
					"MediaPlayPause",
					"MediaTrackNext",
					"MediaTrackPrevious",
					"MetaLeft",
					"MetaRight",
					"AltLeft",
					"AltRight",
					"ControlLeft",
					"ControlRight",
					"ShiftLeft",
					"ShiftRight",
					"Fn",
				];
				const exact = Object.create(null);
				const lower = Object.create(null);

				// Known synonyms
				const synonyms = {
					Bksp: "Backspace",
					Backspace: "Backspace",
					Del: "Delete",
					Delete: "Delete",
					Esc: "Escape",
					"⎋": "Escape",
					Enter: "Enter",
					"↩": "Enter",
					"⇥": "Tab",
					Tab: "Tab",
					Space: "Space",
					"↑": "ArrowUp",
					"↓": "ArrowDown",
					"←": "ArrowLeft",
					"→": "ArrowRight",
					PgUp: "PageUp",
					PgDn: "PageDown",
					"Page Up": "PageUp",
					"Page Down": "PageDown",
					Home: "Home",
					End: "End",
					Insert: "Insert",
					Mute: "VolumeMute",
					"Vol+": "VolumeUp",
					"Vol-": "VolumeDown",
					"Vol–": "VolumeDown",
					"Play/Pause": "MediaPlayPause",
					Next: "MediaTrackNext",
					Prev: "MediaTrackPrevious",
					Win: "MetaLeft",
					"⌘": "MetaLeft",
					Command: "MetaLeft",
					Ctrl: "ControlLeft",
					Control: "ControlLeft",
					"⌥": "AltLeft",
					Alt: "AltLeft",
					"⇧": "ShiftLeft",
					Shift: "ShiftLeft",
					Fn: "Fn",
				};
				Object.keys(synonyms).forEach((lbl) => {
					exact[lbl] = synonyms[lbl];
					lower[lbl.toLowerCase()] = synonyms[lbl];
				});

				codes.forEach((c) => {
					const lbl = display ? display(c) : "";
					if (lbl && lbl !== "\u00A0") {
						exact[lbl] ||= c;
						lower[lbl.toLowerCase()] ||= c;
					}
					exact[c] ||= c;
					lower[c.toLowerCase()] ||= c;
				});

				window.__revShortcutLabelMapForExport = { exact, lower };
				return window.__revShortcutLabelMapForExport;
			}

			function effectiveShortcutCode(id, stored) {
				// 0) If the user explicitly cleared this shortcut, preserve the clear in the export.
				//    NBSP is our canonical "cleared" sentinel for shortcut fields.
				if (stored === "\u00A0") return "\u00A0";

				// 1) If storage holds a real value, export it (normalize in case it's a label/char).
				if (typeof stored === "string" && stored.trim()) {
					return normalizeShortcutVal(stored);
				}

				// 2) Only for truly "unset" keys (no storage record), derive an effective value
				//    so first-time exports include defaults currently visible in the UI.
				const el = document.getElementById(id);

				// Prefer dataset (already a KeyboardEvent.code)
				const ds = el?.dataset?.keyCode || "";
				if (ds && ds !== "\u00A0") return ds;

				// Try the visible label/character in the input
				const visible = el?.value?.trim() || "";
				if (visible) {
					let code = (window.ShortcutUtils?.charToCode ?? charToCode)(visible) || "";
					if (!code) {
						const map = getReverseMap();
						code = map.exact[visible] || map.lower[visible.toLowerCase()] || "";
					}
					if (code) return code;
				}

				// HTML default attribute (single character) → code
				const defAttr = el?.getAttribute("value")?.trim() || "";
				if (defAttr) {
					const c = (window.ShortcutUtils?.charToCode ?? charToCode)(defAttr) || "";
					if (c) return c;
				}

				// Final fallback for known edge cases (e.g., "/")
				const fallback = DEFAULT_SHORTCUT_CODE_FALLBACKS?.[id] || "";
				return fallback || "\u00A0";
			}

			chrome.storage.sync.get(null, (all) => {
				const out = {};

				// Include all known keys present in storage (options, toggles, etc.)
				keySet.forEach((k) => {
					if (Object.hasOwn(all, k)) out[k] = all[k];
				});

				// Ensure EVERY shortcut key is present using "effective" value (not NBSP if a default exists)
				shortcutKeys.forEach((k) => {
					const stored = Object.hasOwn(all, k) ? all[k] : undefined;
					out[k] = effectiveShortcutCode(k, stored);
				});

				// If modelPickerKeyCodes missing, include current cache/default so chips roundtrip too
				if (!Object.hasOwn(out, "modelPickerKeyCodes")) {
					const codes = (
						window.ShortcutUtils?.getModelPickerCodesCache?.() || []
					).slice(0, 10);
					if (codes.length === 10) out.modelPickerKeyCodes = codes;
				}

				const payload = {
					__meta: {
						name: "ChatGPT Custom Shortcuts Pro Settings",
						version: chrome.runtime?.getManifest?.().version || "",
						exportedAt: new Date().toISOString(),
					},
					data: out,
				};

				const blob = new Blob([JSON.stringify(payload, null, 2)], {
					type: "application/json",
				});
				const dateStr = new Date().toISOString().split("T")[0];
				const filename = `${dateStr}_chatgpt_custom_shortcuts_pro_settings.json`;

				const a = document.createElement("a");
				a.href = URL.createObjectURL(blob);
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(a.href);

				showToast(t("toast_export_success"));
			});
		}

		function importSettingsFromFile() {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".json,application/json";
			input.addEventListener("change", () => {
				const file = input.files?.[0];
				if (!file) return;
				const reader = new FileReader();
				reader.onload = () => {
					try {
						const parsed = JSON.parse(String(reader.result || "{}"));
						const src =
							parsed?.data && typeof parsed.data === "object"
								? parsed.data
								: parsed;
						const keySet = getExportKeySet();
						const next = {};

						Object.keys(src || {}).forEach((k) => {
							if (!keySet.has(k)) return;
							let v = src[k];
							if (shortcutKeys.includes(k)) {
								v = normalizeShortcutVal(v);
							}
							next[k] = v;
						});

						// If nothing recognized
						if (Object.keys(next).length === 0) {
							showToast(t("toast_import_no_compatible"));
							return;
						}

						// Confirm overwrite
						const proceed = window.confirm(t("confirm_import_overwrite"));
						if (!proceed) return;

						// Apply to storage
						chrome.storage.sync.get(null, (curr) => {
							const merged = { ...curr, ...next };

							chrome.storage.sync.set(merged, () => {
								if (chrome.runtime.lastError) {
									console.error("Import error:", chrome.runtime.lastError);
									showToast(
										t("toast_import_failed", chrome.runtime.lastError.message),
									);
									return;
								}

								// Rehydrate all shortcut inputs from storage so tricky defaults (e.g., Slash) render correctly
								if (typeof refreshShortcutInputsFromStorage === "function") {
									refreshShortcutInputsFromStorage();
								}

								// Reflect options/radios provided by the file
								const reflectOption = (key, val) => {
									const el = document.getElementById(key);
									if (!el) return;
									if (el.type === "checkbox" || el.type === "radio") {
										el.checked = !!val;
									} else if (
										typeof val === "string" ||
										typeof val === "number"
									) {
										el.value = val;
									}
								};
								Object.keys(next).forEach((k) => {
									if (shortcutKeys.includes(k)) return; // shortcuts already handled by refresh
									reflectOption(k, next[k]);
								});

								// If model picker codes provided, refresh local cache/UI
								if (
									Array.isArray(next.modelPickerKeyCodes) &&
									next.modelPickerKeyCodes.length === 10
								) {
									try {
										window.__modelPickerKeyCodes =
											next.modelPickerKeyCodes.slice(0, 10);
										document.dispatchEvent(
											new CustomEvent("modelPickerHydrated"),
										);
									} catch (_) { }
								}

								showToast(t("toast_import_complete"));
							});
						});
					} catch (e) {
						console.error("Import parse error:", e);
						showToast(t("toast_import_invalid"));
					}
				};
				reader.readAsText(file);
			});
			input.click();
		}

		// JS — updated to rely on external CSS only
		// JS — updated to rely on external CSS only, now localized.
		function injectBackupTile() {
			const grid =
				document.querySelector(".shortcut-grid") ||
				document.querySelector(".shortcut-container .shortcut-grid");

			if (!grid || grid.querySelector(".backup-restore-tile")) return;

			const tile = document.createElement("div");
			tile.className = "shortcut-item backup-restore-tile";
			tile.innerHTML = `
    <div class="shortcut-label" style="flex: 1 1 120px;">
      <span class="i18n" data-i18n="label_backup_restore">${t("label_backup_restore")}</span>
    </div>
    <div class="shortcut-keys">
      <button id="btnExportSettings" class="dup-like-btn i18n" data-i18n="btn_export" type="button" title="${t("tt_export")}">${t("btn_export")}</button>
      <button id="btnImportSettings" class="dup-like-btn i18n" data-i18n="btn_import" type="button" title="${t("tt_import")}">${t("btn_import")}</button>
    </div>
  `;

			grid.appendChild(tile);

			const exportBtn = tile.querySelector("#btnExportSettings");
			const importBtn = tile.querySelector("#btnImportSettings");

			if (exportBtn) exportBtn.addEventListener("click", exportSettingsToFile);
			if (importBtn)
				importBtn.addEventListener("click", importSettingsFromFile);

			// If you have a DOM-i18n pass that hydrates .i18n[data-i18n], it will
			// override the fallback text above; otherwise the text is already set.
			if (typeof initTooltips === "function") initTooltips();
			if (typeof balanceWrappedLabels === "function") balanceWrappedLabels();
		}

		// Inject tile once the grid exists
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", injectBackupTile, {
				once: true,
			});
		} else {
			injectBackupTile();
		}
	})();

	// ===================== Fade Slim Sidebar =====================

	const fadeSlimSidebarCheckbox = document.getElementById(
		"FadeSlimSidebarCheckbox",
	);
	const slimSidebarSlider = document.getElementById("slimSidebarOpacitySlider");
	const slimSidebarSliderValueDisplay = document.getElementById(
		"slimSidebarOpacityValue",
	);
	const slimSidebarPreviewIcon = document.getElementById(
		"slimSidebarOpacityPreviewIcon",
	);
	const slimSidebarTooltipContainer = document.getElementById(
		"slimSidebar-opacity-tooltip-container",
	);

	function setSlimSidebarOpacityUI(val) {
		slimSidebarSlider.value = val;
		slimSidebarSliderValueDisplay.textContent = Number(val).toFixed(2);
		slimSidebarPreviewIcon.style.opacity = val;
	}

	function toggleSlimSidebarOpacityUI(visible) {
		slimSidebarTooltipContainer.style.display = visible ? "flex" : "none";
	}

	// On load, sync checkbox, slider, and UI from storage, enforce "default to 0" logic
	chrome.storage.sync.get(
		["fadeSlimSidebarEnabled", "popupSlimSidebarOpacityValue"],
		(data) => {
			const isEnabled = !!data.fadeSlimSidebarEnabled;
			let val =
				typeof data.popupSlimSidebarOpacityValue === "number"
					? data.popupSlimSidebarOpacityValue
					: null;
			fadeSlimSidebarCheckbox.checked = isEnabled;
			toggleSlimSidebarOpacityUI(isEnabled);

			// On first enable, force to 0 unless already set
			if (isEnabled) {
				if (val === null) {
					// Set storage and UI to 0
					val = 0.0;
					chrome.storage.sync.set({ popupSlimSidebarOpacityValue: val });
				}
				setSlimSidebarOpacityUI(val);
			} else {
				// Don't touch opacity if disabled
				if (val !== null) setSlimSidebarOpacityUI(val);
				else setSlimSidebarOpacityUI(0.0);
			}
		},
	);

	// Checkbox toggles fade and ensures opacity is set to 0 if enabling for the first time
	fadeSlimSidebarCheckbox.addEventListener("change", () => {
		const isChecked = fadeSlimSidebarCheckbox.checked;
		toggleSlimSidebarOpacityUI(isChecked);

		if (isChecked) {
			// Check if value exists—if not, set to 0
			chrome.storage.sync.get("popupSlimSidebarOpacityValue", (data) => {
				let val =
					typeof data.popupSlimSidebarOpacityValue === "number"
						? data.popupSlimSidebarOpacityValue
						: null;
				if (val === null) {
					val = 0.0;
					chrome.storage.sync.set({ popupSlimSidebarOpacityValue: val });
					setSlimSidebarOpacityUI(val);
				} else {
					setSlimSidebarOpacityUI(val);
				}
				chrome.storage.sync.set({ fadeSlimSidebarEnabled: true }, () => {
					showToast("Options saved. Reload page to apply changes.");
				});
			});
		} else {
			chrome.storage.sync.set({ fadeSlimSidebarEnabled: false }, () => {
				showToast("Options saved. Reload page to apply changes.");
			});
		}
	});

	// Slider logic – sync value to UI and storage
	let slimSidebarSliderTimeout;
	slimSidebarSlider.addEventListener("input", () => {
		const val = parseFloat(slimSidebarSlider.value);
		slimSidebarSliderValueDisplay.textContent = val.toFixed(2);
		slimSidebarPreviewIcon.style.opacity = val;

		clearTimeout(slimSidebarSliderTimeout);
		slimSidebarSliderTimeout = setTimeout(() => {
			let numericVal = Number(slimSidebarSlider.value);
			// Use the safe, non-coercing check to satisfy Biome: noGlobalIsNan
			if (Number.isNaN(numericVal)) numericVal = 0.0;

			chrome.storage.sync.set(
				{ popupSlimSidebarOpacityValue: numericVal },
				() => {
					if (chrome.runtime.lastError) {
						console.error("Storage set error:", chrome.runtime.lastError);
					} else {
						showToast(
							"Slim sidebar opacity saved. Reload page to apply changes.",
						);
					}
				},
			);
		}, 500);
	});
});

function enableEditableOpacity(
	valueId,
	sliderId,
	previewIconId,
	storageKey,
	defaultVal,
) {
	const valueSpan = document.getElementById(valueId);
	const slider = document.getElementById(sliderId);
	const previewIcon = document.getElementById(previewIconId);

	valueSpan.addEventListener("click", startEdit);
	valueSpan.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") startEdit();
	});

	function startEdit() {
		valueSpan.classList.add("editing"); // <--- ADD HERE
		const currentValue = parseFloat(valueSpan.textContent);
		const input = document.createElement("input");
		input.type = "text";
		input.value = currentValue.toFixed(2);
		input.maxLength = 4;
		input.style.width = "2.4em";
		valueSpan.textContent = "";
		valueSpan.appendChild(input);
		input.select();
		input.setSelectionRange(2, 4);

		input.addEventListener("input", () => {
			let val = parseFloat(input.value.replace(/[^\d.]/g, ""));
			if (Number.isNaN(val)) val = "";
			else {
				if (val > 1) val = 1;
				if (val < 0) val = 0;
				val = Math.round(val * 100) / 100;
			}
			slider.value = val || 0;
			previewIcon.style.opacity = val || 0;
		});

		input.addEventListener("blur", finishEdit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") input.blur();
			if (
				!/[0-9.]|Backspace|ArrowLeft|ArrowRight|Tab/.test(e.key) &&
				e.key.length === 1
			) {
				e.preventDefault();
			}
		});
	}

	function finishEdit(e) {
		valueSpan.classList.remove("editing"); // <--- REMOVE HERE
		let val = parseFloat(e.target.value.replace(/[^\d.]/g, ""));
		if (Number.isNaN(val)) val = defaultVal;
		if (val > 1) val = 1;
		if (val < 0) val = 0;
		val = Math.round(val * 100) / 100;
		valueSpan.textContent = val.toFixed(2);
		slider.value = val;
		previewIcon.style.opacity = val;
		const obj = {};
		obj[storageKey] = val;
		chrome.storage.sync.set(obj);
	}

	slider.addEventListener("input", () => {
		const val = parseFloat(slider.value);
		valueSpan.textContent = val.toFixed(2);
		previewIcon.style.opacity = val;
	});
}

enableEditableOpacity(
	"opacityValue",
	"opacitySlider",
	"opacityPreviewIcon",
	"popupBottomBarOpacityValue",
	0.6,
);
enableEditableOpacity(
	"slimSidebarOpacityValue",
	"slimSidebarOpacitySlider",
	"slimSidebarOpacityPreviewIcon",
	"popupSlimSidebarOpacityValue",
	0.0,
);

// ===================== Model Picker Keys (robust save + duplicates + clear + reset) =====================
function modelPickerInitSafe() {
	// Wait for ShortcutUtils to load (for hot reload/async)
	if (
		typeof window.ShortcutUtils !== "object" ||
		typeof window.ShortcutUtils.getModelPickerCodesCache !== "function"
	) {
		if (!modelPickerInitSafe._tries) modelPickerInitSafe._tries = 0;
		if (modelPickerInitSafe._tries++ > 30) return;
		return setTimeout(modelPickerInitSafe, 16);
	}

	const chips = Array.from(document.querySelectorAll(".mp-key"));
	if (!chips.length) return;

	// Always use current codes + current MODEL_NAMES
	function render() {
		const codes = window.ShortcutUtils.getModelPickerCodesCache();
		const MODEL_NAMES = window.MODEL_NAMES || [];
		chips.forEach((chip, i) => {
			chip.classList.remove("listening");
			chip.textContent = window.ShortcutUtils.displayFromCode(codes[i] || "");
			chip.setAttribute(
				"data-tooltip",
				`Set shortcut for\n${MODEL_NAMES[i] || `Slot ${i + 1}`}`,
			);
			chip.classList.add("custom-tooltip");
		});
	}

	// Reset button (always triggers full rerender after update)
	(function wireResetButton() {
		let resetEl = document.getElementById("mp-reset-keys");
		if (!resetEl) {
			resetEl = Array.from(
				document.querySelectorAll(".mp-icons .material-symbols-outlined"),
			).find((el) => (el.textContent || "").trim() === "reset_wrench");
			if (resetEl) {
				resetEl.setAttribute("role", "button");
				resetEl.setAttribute("tabindex", "0");
				resetEl.setAttribute("aria-label", "Reset model keys to defaults");
				resetEl.classList.add("tooltip");
				if (!resetEl.getAttribute("data-tooltip")) {
					resetEl.setAttribute("data-tooltip", "Reset model keys to defaults");
				}
			}
		}
		if (!resetEl || resetEl.dataset.mpResetWired) return;

		function showConfirmReset(cb) {
			let overlay = document.getElementById("dup-overlay");
			if (!overlay) {
				overlay = document.createElement("div");
				overlay.id = "dup-overlay";
				overlay.style.display = "none";
				overlay.innerHTML = `
        <div id="dup-box">
          <h2 id="dup-h2" style="margin:0 0 6px 0; font-size:14px; font-weight:400;"></h2>
          <p id="dup-msg" style="margin:0 0 10px 0; font-size:14px; font-weight:400;"></p>
          <label id="dup-dont-wrap" style="display:none;"><input id="dup-dont" type="checkbox"> Don’t ask me again</label>
          <div class="dup-btns" style="display:flex;gap:.5em;margin-top:10px;">
            <button id="dup-no">Cancel</button>
            <button id="dup-yes">Yes</button>
          </div>
        </div>`;
				document.body.appendChild(overlay);
			}
			const h2 = overlay.querySelector("#dup-h2");
			const msg = overlay.querySelector("#dup-msg");
			const dontWrap = overlay.querySelector("#dup-dont-wrap");
			const oldCancel = overlay.querySelector("#dup-no");
			const oldYes = overlay.querySelector("#dup-yes");
			if (h2) h2.textContent = "Reset all model keys to defaults?";
			if (msg) msg.textContent = "This will replace your custom keys.";
			if (dontWrap) dontWrap.style.display = "none";
			const newCancel = oldCancel.cloneNode(true);
			const newYes = oldYes.cloneNode(true);
			oldCancel.parentNode.replaceChild(newCancel, oldCancel);
			oldYes.parentNode.replaceChild(newYes, oldYes);
			newCancel.addEventListener("click", () => {
				overlay.style.display = "none";
				cb(false);
			});
			newYes.addEventListener("click", () => {
				overlay.style.display = "none";
				cb(true);
			});
			overlay.style.display = "flex";
		}

		function triggerReset() {
			showConfirmReset((yes) => {
				if (!yes) return;
				const defaults = [
					"Digit1",
					"Digit2",
					"Digit3",
					"Digit4",
					"Digit5",
					"Digit6",
					"Digit7",
					"Digit8",
					"Digit9",
					"Digit0",
				];
				window.saveModelPickerKeyCodes(defaults, (ok) => {
					if (typeof window.showToast === "function") {
						window.showToast(
							ok
								? "Model keys reset to defaults."
								: "Reset attempted; please reopen the popup.",
						);
					}
					render();
				});
			});
		}
		resetEl.style.cursor = "pointer";
		resetEl.addEventListener("click", triggerReset);
		resetEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				triggerReset();
			}
		});
		resetEl.dataset.mpResetWired = "1";
	})();

	let activeChip = null;
	let activeKeyHandler = null;

	function cancelActiveCapture() {
		if (!activeChip || !activeKeyHandler) return;
		activeChip.removeEventListener("keydown", activeKeyHandler, true);
		activeChip.classList.remove("listening");
		activeChip = null;
		activeKeyHandler = null;
		render();
	}

	chips.forEach((chip, idx) => {
		const startCapture = () => {
			if (activeChip && activeChip !== chip) cancelActiveCapture();
			if (activeChip === chip) return;
			chip.classList.add("listening");
			chip.textContent = "Set";
			const onKey = (e) => {
				e.preventDefault();
				e.stopPropagation();
				const code = e.code;
				if (code === "Escape") {
					cancelActiveCapture();
					return;
				}
				if (code === "Backspace" || code === "Delete") {
					const codes = window.ShortcutUtils.getModelPickerCodesCache().slice();
					codes[idx] = "";
					window.saveModelPickerKeyCodes(codes, () => {
						cancelActiveCapture();
						if (typeof window.showToast === "function") {
							window.showToast(`Cleared key for slot ${idx + 1}.`);
						}
						render();
					});
					return;
				}
				if (/^(Shift|Alt|Control|Meta)(Left|Right)$/.test(code)) return;
				const modelMod =
					typeof getModelPickerModifier === "function"
						? getModelPickerModifier()
						: "alt";
				const selfOwner = { type: "model", idx, modifier: modelMod };
				const codes = window.ShortcutUtils.getModelPickerCodesCache().slice();
				const conflicts = window.ShortcutUtils.buildConflictsForCode
					? window.ShortcutUtils.buildConflictsForCode(code, selfOwner)
					: [];

				const proceedAssign = () => {
					window.ShortcutUtils.clearOwners?.(conflicts, () => {
						codes[idx] = code;
						window.saveModelPickerKeyCodes(codes, () => {
							cancelActiveCapture();
							render();
						});
					});
				};

				if (conflicts.length) {
					if (window.prefs?.autoOverwrite) {
						proceedAssign();
					} else {
						const keyLabel = window.ShortcutUtils.displayFromCode
							? window.ShortcutUtils.displayFromCode(code)
							: code;
						const MODEL_NAMES = window.MODEL_NAMES || [];
						const toLabel = MODEL_NAMES[idx] || `Model slot ${idx + 1}`;
						if (conflicts.length === 1) {
							const owners = [conflicts[0].label];
							window.showDuplicateModal(
								owners,
								(yes, remember) => {
									if (yes) {
										if (remember) {
											window.prefs = window.prefs || {};
											window.prefs.autoOverwrite = true;
											chrome.storage.sync.set({ autoOverwrite: true });
										}
										proceedAssign();
									} else {
										cancelActiveCapture();
									}
								},
								{ keyLabel, targetLabel: toLabel },
							);
						} else {
							const lines = conflicts.map((c) => {
								let k = "";
								if (c.type === "shortcut") {
									const el = document.getElementById(c.id);
									const ch = el?.value?.trim() || "";
									k = ch || "?";
								} else if (c.type === "model") {
									const cur = codes[c.idx];
									k = window.ShortcutUtils.displayFromCode
										? window.ShortcutUtils.displayFromCode(cur)
										: cur || "?";
								}
								return { key: k, from: c.label, to: toLabel };
							});

							const names = conflicts.map((c) => c.label).join(", ");
							window.showDuplicateModal(
								names,
								(yes, remember) => {
									if (yes) {
										if (remember) {
											window.prefs = window.prefs || {};
											window.prefs.autoOverwrite = true;
											chrome.storage.sync.set({ autoOverwrite: true });
										}
										proceedAssign();
									} else {
										cancelActiveCapture();
									}
								},
								{ lines, proceedText: "Proceed with changes?" },
							);
						}
					}
				} else {
					proceedAssign();
				}
			};
			chip.addEventListener("keydown", onKey, true);
			activeChip = chip;
			activeKeyHandler = onKey;
			chip.focus();
		};
		chip.addEventListener("click", startCapture);
		chip.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") startCapture();
		});
	});

	document.addEventListener("mousedown", (evt) => {
		if (!activeChip) return;
		if (!evt.target.closest(".mp-icons")) {
			cancelActiveCapture();
		}
	});

	// Stay perfectly in sync with changes (after delete/reset/dup/modal etc)
	document.addEventListener("modelPickerHydrated", render);
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "sync" && changes.modelPickerKeyCodes) {
			render();
		}
	});
	render();
}
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", modelPickerInitSafe, {
		once: true,
	});
} else {
	modelPickerInitSafe();
}

// Search Filter IIFE

(() => {
	let container,
		bar,
		input,
		idx = [],
		altTables;
	const qSel = (s) => Array.from((container || document).querySelectorAll(s));
	const tok = (s) =>
		(s || "")
			.toLowerCase()
			.replace(/[_-]+/g, " ")
			.split(/[^a-z0-9]+/g)
			.filter(Boolean);
	const loadAlt = () => {
		if (altTables) return altTables;
		altTables = [];
		const guesses = [
			window.APP_LOCALE_MESSAGES,
			window.I18N_MESSAGES,
			window.localeMessages,
			window.messages,
		];
		// Avoid returning a value from forEach callback (Biome: useIterableCallbackReturn)
		guesses.forEach((t) => {
			if (t) altTables.push(t);
		});
		try {
			const el = document.getElementById("i18n-messages");
			if (el?.textContent) altTables.push(JSON.parse(el.textContent));
		} catch { }
		return altTables;
	};

	const getMsg = (key) => {
		if (!key) return "";
		try {
			if (chrome?.i18n?.getMessage) {
				const s = chrome.i18n.getMessage(key);
				if (s) return s;
			}
		} catch { }
		for (const tbl of loadAlt()) {
			if (!tbl) continue;
			if (typeof tbl[key] === "string") return tbl[key];
			if (tbl[key]?.message) return String(tbl[key].message);
		}
		return "";
	};
	const resolveMSG = (v) => {
		const m = /^__MSG_([A-Za-z0-9_]+)__$/.exec(v || "");
		return m ? getMsg(m[1]) : v || "";
	};

	const collect = (tile) => {
		const out = [];

		// Visible strings and inline text
		tile.querySelectorAll("[data-i18n]").forEach((el) => {
			const k = el.getAttribute("data-i18n");
			const msg = getMsg(k);
			if (msg) out.push(msg);

			const txt = (el.textContent || "").trim();
			if (txt) out.push(txt);
		});

		// Tooltips (avoid returning from forEach)
		tile.querySelectorAll("[data-tooltip]").forEach((el) => {
			const tooltip = resolveMSG(el.getAttribute("data-tooltip") || "");
			if (tooltip) out.push(tooltip);
		});

		// Common ARIA/title/placeholder attributes
		["aria-label", "title", "placeholder"].forEach((attr) => {
			const raw = tile.getAttribute(attr);
			if (raw) {
				const val = resolveMSG(raw);
				if (val) out.push(val);
			}
		});

		// Shortcut key labels/inputs
		tile
			.querySelectorAll(
				".shortcut-keys .key-text, .shortcut-keys input.key-input",
			)
			.forEach((el) => {
				const val = (el.value || el.textContent || "").trim();
				if (val) out.push(val);
			});

		return out.filter(Boolean);
	};

	const build = () => {
		const tiles = qSel(".shortcut-item");
		idx = tiles.map((el, i) => {
			el.dataset.tileId ||= `tile-${i}`;
			const words = new Set(collect(el).flatMap(tok));
			return { el, words };
		});
	};

	const match = (set, t) => {
		if (set.has(t)) return true; // exact token match
		for (const w of set) {
			// partial, anywhere in the word
			if (w.includes(t)) return true;
		}
		return false;
	};

	const apply = (q) => {
		const tokens = tok(q),
			all = tokens.length === 0;
		idx.forEach(({ el, words }) => {
			const ok = all || tokens.every((t) => match(words, t));
			el.style.display = ok ? "" : "none";
		});
		bar?.classList.toggle("active", !all);
		container?.classList.toggle("filtering-active", !all);
	};

	const injectBar = () => {
		if (container.querySelector(".ios-searchbar")) return;
		const title = container.querySelector('h1.i18n[data-i18n="popup_title"]');
		const grid = container.querySelector(".shortcut-grid");
		bar = document.createElement("div");
		bar.className = "ios-searchbar";
		bar.innerHTML = `<div class="ios-searchbar-inner">
  <input type="search" class="ios-search-input" placeholder="Search" aria-label="Filter shortcuts by keyword">
  <button type="button" class="ios-search-cancel" aria-label="Cancel search">Cancel</button></div>`;
		const parent = grid?.parentNode ?? title?.parentNode ?? container;
		const refNode = grid ?? title?.nextSibling ?? container.firstChild;
		parent.insertBefore(bar, refNode);
		input = bar.querySelector(".ios-search-input");
		const cancel = bar.querySelector(".ios-search-cancel");
		input.addEventListener("input", () => apply(input.value));
		input.addEventListener("search", () => apply(input.value));
		input.addEventListener("focus", () => bar.classList.add("focused"));
		input.addEventListener("blur", () => {
			if (!input.value) bar.classList.remove("focused");
		});
		cancel.addEventListener("click", () => {
			input.value = "";
			apply("");
			input.blur();
		});

		// Focus the input when bar is injected
		setTimeout(() => {
			input.focus();
			// Optionally select all text if needed:
			// input.select();
		}, 0);
	};

	const observe = () => {
		let t;
		const deb = () => {
			clearTimeout(t);
			t = setTimeout(() => {
				build();
				apply(input?.value || "");
			}, 80);
		};
		const mo = new MutationObserver(() => deb());
		mo.observe(container, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [
				"data-i18n",
				"data-tooltip",
				"title",
				"aria-label",
				"placeholder",
			],
		});
	};

	const run = () => {
		container = document.querySelector(".shortcut-container");
		if (!container) return;
		injectBar();
		build();
		observe();
		// Start with an empty query; input may not be wired yet.
		apply("");
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", run, { once: true });
	} else {
		run();
	}
})();
