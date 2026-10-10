'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import api from '@/lib/api';

function decodeVapidPublicKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const key = new ArrayBuffer(bytes.length);
  new Uint8Array(key).set(bytes);
  return key;
}

export default function PushNotificationSettings({
  notificationsEnabled,
}: {
  notificationsEnabled: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkExistingSubscription = async () => {
      const available = 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
      setSupported(available);
      if (!available || !notificationsEnabled) {
        setSubscribed(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const subscriptionJson = subscription?.toJSON();
      const p256dh = subscriptionJson?.keys?.p256dh;
      const auth = subscriptionJson?.keys?.auth;
      if (!subscriptionJson?.endpoint || !p256dh || !auth) {
        setSubscribed(false);
        return;
      }

      const response = await api.subscribeToPush({
        endpoint: subscriptionJson.endpoint,
        keys: { p256dh, auth },
      });
      setSubscribed(response.success);
      if (!response.success) {
        setMessage(response.error || 'This device subscription could not be synchronized.');
      }
    };

    void checkExistingSubscription().catch((error: unknown) => {
      console.error('Unable to inspect push notification subscription:', error);
      setMessage('System notifications could not be checked in this browser.');
    });
  }, [notificationsEnabled]);

  const enablePush = async () => {
    if (!notificationsEnabled || busy) return;
    setBusy(true);
    setMessage('');
    let subscription: PushSubscription | null = null;
    let createdSubscription = false;

    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage(permission === 'denied'
          ? 'Notifications are blocked by your browser. Allow them in browser settings to enable system notifications.'
          : 'Notification permission was not granted.');
        return;
      }

      const keyResponse = await api.getPushPublicKey();
      if (!keyResponse.success || !keyResponse.data?.enabled || !keyResponse.data.publicKey) {
        throw new Error(keyResponse.error || 'System notifications are not configured on the server.');
      }

      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidPublicKey(keyResponse.data.publicKey),
        });
        createdSubscription = true;
      }

      const subscriptionJson = subscription.toJSON();
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;
      if (!subscriptionJson.endpoint || !p256dh || !auth) {
        if (createdSubscription) await subscription.unsubscribe();
        throw new Error('The browser returned an invalid push subscription.');
      }

      const response = await api.subscribeToPush({
        endpoint: subscriptionJson.endpoint,
        keys: { p256dh, auth },
      });
      if (!response.success) {
        if (createdSubscription) await subscription.unsubscribe();
        throw new Error(response.error || 'Could not save the system notification subscription.');
      }

      setSubscribed(true);
      setMessage('System notifications are enabled on this device.');
    } catch (error) {
      console.error('Unable to enable system notifications:', error);
      setMessage(error instanceof Error ? error.message : 'Could not enable system notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await api.unsubscribeFromPush(subscription.endpoint);
        if (!response.success) {
          throw new Error(response.error || 'Could not remove the system notification subscription.');
        }
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage('System notifications are disabled on this device.');
    } catch (error) {
      console.error('Unable to disable system notifications:', error);
      setMessage(error instanceof Error ? error.message : 'Could not disable system notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
        <Bell className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100">System Notifications</p>
        <p className="text-xs text-zinc-500">
          {message || (!supported
            ? 'System notifications are not supported by this browser.'
            : !notificationsEnabled
              ? 'Enable Notification Preferences first.'
              : subscribed
                ? 'This device can show alerts when the app is in the background.'
                : 'Get due-date, approval, and library alerts on this device.')}
        </p>
      </div>
      <button
        type="button"
        onClick={subscribed ? disablePush : enablePush}
        disabled={!supported || !notificationsEnabled || busy}
        aria-pressed={subscribed}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${subscribed ? 'bg-blue-600' : 'bg-zinc-700'}`}
        aria-label={subscribed ? 'Disable system notifications' : 'Enable system notifications'}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${subscribed ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
