"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import api from "@/lib/api";
import { subscribeCurrentBrowserToPush, unsubscribeCurrentBrowserFromPush } from "@/lib/push-notifications";

type NotificationPreference = "notificationsEnabled" | "systemNotificationsEnabled";
type PreferenceValues = Record<NotificationPreference, boolean>;

interface PushNotificationSettingsProps {
  notificationsEnabled: boolean;
  systemNotificationsEnabled: boolean;
  onPreferenceChange: (
    preference: NotificationPreference,
    enabled: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function PushNotificationSettings({
  notificationsEnabled,
  systemNotificationsEnabled,
  onPreferenceChange,
}: PushNotificationSettingsProps) {
  const [preferences, setPreferences] = useState<PreferenceValues>({
    notificationsEnabled,
    systemNotificationsEnabled,
  });
  const [busyPreference, setBusyPreference] = useState<NotificationPreference | null>(null);
  const [pushSetupBusy, setPushSetupBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPreferences({ notificationsEnabled, systemNotificationsEnabled });
  }, [notificationsEnabled, systemNotificationsEnabled]);

  useEffect(() => {
    let active = true;
    const syncExistingSubscription = async () => {
      const supported = typeof window !== "undefined" &&
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported || (!notificationsEnabled && !systemNotificationsEnabled)) {
        if (active) setSubscribed(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        if (active) setSubscribed(false);
        return;
      }

      const subscriptionJson = subscription.toJSON();
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;
      if (!subscriptionJson.endpoint || !p256dh || !auth) {
        if (active) setSubscribed(false);
        return;
      }

      const response = await api.subscribeToPush({
        endpoint: subscriptionJson.endpoint!,
        keys: { p256dh, auth },
      });
      if (active) {
        setSubscribed(response.success);
        if (!response.success) setMessage(response.error || "This browser's notification subscription could not be synchronized.");
      }
    };

    void syncExistingSubscription().catch((error: unknown) => {
      console.error("Unable to synchronize browser notification subscription:", error);
      if (active) setMessage("This browser's notification subscription could not be checked.");
    });
    return () => {
      active = false;
    };
  }, [notificationsEnabled, systemNotificationsEnabled]);

  const setPreference = async (preference: NotificationPreference) => {
    if (busyPreference) return;
    const enabled = !preferences[preference];
    const previousPreferences = preferences;
    setPreferences((current) => ({ ...current, [preference]: enabled }));
    setBusyPreference(preference);
    setMessage("");

    try {
      const response = await onPreferenceChange(preference, enabled);
      if (!response.success) {
        setPreferences(previousPreferences);
        setMessage(response.error || "Unable to save notification preferences.");
        return;
      }

      const otherPreference = preference === "notificationsEnabled"
        ? previousPreferences.systemNotificationsEnabled
        : previousPreferences.notificationsEnabled;
      if (enabled) {
        const subscriptionMessage = await subscribeCurrentBrowserToPush();
        if (subscriptionMessage) setMessage(subscriptionMessage);
        else setSubscribed(true);
      } else if (!otherPreference) {
        await unsubscribeCurrentBrowserFromPush();
        setSubscribed(false);
      }
    } catch (error) {
      console.error("Unable to update notification preferences:", error);
      setMessage(error instanceof Error ? error.message : "Unable to update notification preferences.");
    } finally {
      setBusyPreference(null);
    }
  };

  const retryPushSetup = async () => {
    if (pushSetupBusy) return;
    setPushSetupBusy(true);
    setMessage("");
    try {
      const subscriptionMessage = await subscribeCurrentBrowserToPush();
      setMessage(subscriptionMessage || "Browser push notifications are enabled on this device.");
      setSubscribed(!subscriptionMessage);
    } catch (error) {
      console.error("Unable to enable browser push notifications:", error);
      setMessage(error instanceof Error ? error.message : "Could not enable browser push notifications.");
    } finally {
      setPushSetupBusy(false);
    }
  };

  return (
    <div className="divide-y divide-zinc-800/60">
      <PreferenceRow
        label="Notification Preferences"
        description="Borrow due alerts and updates"
        checked={preferences.notificationsEnabled}
        disabled={busyPreference !== null}
        onChange={() => void setPreference("notificationsEnabled")}
      />
      <PreferenceRow
        label="System Notifications"
        description={message || (subscribed
          ? "System announcements and important library updates can reach this device."
          : "Receive library announcements and important system-wide updates.")}
        checked={preferences.systemNotificationsEnabled}
        disabled={busyPreference !== null}
        onChange={() => void setPreference("systemNotificationsEnabled")}
      />
      {(preferences.notificationsEnabled || preferences.systemNotificationsEnabled) && !subscribed && (
        <div className="flex justify-end py-2">
          <button
            type="button"
            onClick={() => void retryPushSetup()}
            disabled={busyPreference !== null || pushSetupBusy}
            className="min-h-11 rounded-lg px-3 text-xs font-medium text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
          >
            {pushSetupBusy ? "Setting up push..." : "Set up push on this device"}
          </button>
        </div>
      )}
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-blue-400">
        <Bell className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        disabled={disabled}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-zinc-700"}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
        </span>
      </button>
    </div>
  );
}
