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

function browserPushUnavailableMessage(): string {
  if (!window.isSecureContext) {
    return "Browser push requires a secure HTTPS connection; your in-app notification preference is saved.";
  }
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return "On iPhone or iPad, install this site to your Home Screen and use iOS/iPadOS 16.4 or later for browser push; your in-app preference is saved.";
  }
  return "Browser push is not supported by this browser or device; your in-app notification preference is saved.";
}

function supportsBrowserPush(): boolean {
  return window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const activeRegistration = await navigator.serviceWorker.getRegistration("/");
  if (!activeRegistration?.active) {
    throw new Error("The browser notification service worker could not be activated. Reload the page and try again.");
  }
  return activeRegistration;
}

export async function subscribeCurrentBrowserToPush(): Promise<string | null> {
  if (typeof window === "undefined" || !supportsBrowserPush()) {
    return typeof window === "undefined"
      ? "Browser push is only available in a browser; your in-app notification preference is saved."
      : browserPushUnavailableMessage();
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied"
      ? "Browser notifications are blocked. Your in-app preference is saved; allow notifications in browser settings for push alerts."
      : "Notification permission was not granted. Your in-app preference is saved.";
  }

  const keyResponse = await api.getPushPublicKey();
  if (!keyResponse.success || !keyResponse.data?.enabled || !keyResponse.data.publicKey) {
    throw new Error(keyResponse.error || "Could not load browser push settings from the server.");
  }

  const registration = await registerPushServiceWorker();
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
  if (typeof window === "undefined" || !supportsBrowserPush()) return;
  const registration = await registerPushServiceWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await api.unsubscribeFromPush(subscription.endpoint);
  if (!response.success) {
    throw new Error(response.error || "Could not remove this browser's push subscription.");
  }
  await subscription.unsubscribe();
}
