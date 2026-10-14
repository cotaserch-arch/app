// Push notifications for the iPhone/Android app, sent through Expo's push
// service (free, no API key needed for basic sends).
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export const isExpoToken = (t) => typeof t === "string" && /^Expo(nent)?PushToken\[[\w-]{10,}\]$/.test(t);

export function createPusher({ fetchImpl = fetch, log = console } = {}) {
  let queue = [];
  let timer = null;

  async function flush() {
    timer = null;
    const batch = queue.splice(0, 100);
    if (!batch.length) return;
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) log.error?.(`[push] Expo push failed: HTTP ${res.status}`);
    } catch (error) {
      log.error?.(`[push] Expo push failed: ${error.message}`);
    }
    if (queue.length) timer = setTimeout(flush, 1_000);
  }

  return {
    send(to, { title, body, url }) {
      if (!isExpoToken(to)) return;
      queue.push({ to, title, body, sound: "default", data: { url } });
      if (!timer) timer = setTimeout(flush, 500);
    },
    pending: () => queue.length,
    flush,
  };
}
