// Keeps the user's data in the browser (localStorage) on this device only.
// Storage can be blocked (private mode, strict settings), so every access is guarded.
import { leereDaten } from "./daten.js";

const SCHLUESSEL = "account-cleanup-daten";

export function laden() {
  try {
    const text = localStorage.getItem(SCHLUESSEL);
    return text ? { ...leereDaten(), ...JSON.parse(text) } : leereDaten();
  } catch {
    return leereDaten();
  }
}

/** Returns true if saving worked. */
export function speichern(daten) {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(daten));
    return true;
  } catch {
    return false;
  }
}
