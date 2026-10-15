import api from "@/lib/api";

function decodeVapidPublicKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const key = new ArrayBuffer(bytes.length);
  new Uint8Array(key).set(bytes);
  return key;
}

export async function subscribeCurrentBrowserToPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "Browser push is not supported here; your in-app notification preference is saved.";
  }

  const keyResponse = await api.getPushPublicKey();
  if (!keyResponse.success || !keyResponse.data?.enabled || !keyResponse.data.publicKey) {
    return "Your in-app notification preference is saved, but browser push is currently unavailable.";
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied"
      ? "Browser notifications are blocked. Your in-app preference is saved; allow notifications in browser settings for push alerts."
      : "Notification permission was not granted. Your in-app preference is saved.";
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  let createdSubscription = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(keyResponse.data.publicKey),
    });
    createdSubscription = true;
  }

  try {
    const subscriptionJson = subscription.toJSON();
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;
    if (!subscriptionJson.endpoint || !p256dh || !auth) {
      throw new Error("The browser returned an invalid push subscription.");
    }

    const response = await api.subscribeToPush({
      endpoint: subscriptionJson.endpoint,
      keys: { p256dh, auth },
    });
    if (!response.success) {
      throw new Error(response.error || "Could not save this browser's push subscription.");
    }
  } catch (error) {
    if (createdSubscription) await subscription.unsubscribe();
    throw error;
  }

  return null;
}

export async function unsubscribeCurrentBrowserFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await api.unsubscribeFromPush(subscription.endpoint);
  if (!response.success) {
    throw new Error(response.error || "Could not remove this browser's push subscription.");
  }
  await subscription.unsubscribe();
}
