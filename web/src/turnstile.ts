// Cloudflare Turnstile, loaded only when someone opens the join step, so visitors who never join
// never load a third-party script.
import { TURNSTILE_SITE_KEY } from "@vram-receipt/core";

type TurnstileApi = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("could not load the human check"));
    };
    document.head.append(s);
  });
  return loading;
}

/**
 * Show the check in `el`. `onToken` gets a fresh token, or null when it expires or fails.
 * Returns a reset function: tokens are single-use, so call it after every send.
 */
export async function mountCheck(el: HTMLElement, onToken: (t: string | null) => void): Promise<() => void> {
  const api = await load();
  let id: string | null = null;
  if (!el.dataset.mounted) {
    id = api.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      action: "join",
      callback: (t: string) => onToken(t),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
    el.dataset.mounted = id;
  }
  const wid = id ?? el.dataset.mounted!;
  return () => {
    onToken(null);
    api.reset(wid);
  };
}
