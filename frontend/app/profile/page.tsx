"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "next-themes";
import api from "@/lib/api";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import EditProfileModal from "@/components/EditProfileModal";
import {
  Pencil,
  Lock,
  Bell,
  Palette,
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  GraduationCap,
  IdCard,
  User as UserIcon,
  Check,
  ChevronDown,
  AlertCircle,
  Loader2,
  X,
  LogOut,
} from "lucide-react";

const roleLabel = (role?: string) => {
  if (role === "LIBRARIAN") return "Librarian";
  if (role === "FACULTY") return "Faculty";
  return "Student";
};

const roleBadge = (role?: string) => {
  if (role === "LIBRARIAN")
    return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30";
  if (role === "FACULTY")
    return "bg-violet-500/15 text-violet-400 ring-violet-500/30";
  return "bg-blue-500/15 text-blue-400 ring-blue-500/30";
};

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-sm font-medium text-zinc-100 truncate">
          {value || "N/A"}
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [notifications, setNotifications] = useState(user?.notificationsEnabled ?? true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(user?.notificationsEnabled ?? true);
  }, [user?.notificationsEnabled]);

  useEffect(() => {
    const closeThemeMenu = (event: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) setThemeOpen(false);
    };
    document.addEventListener("mousedown", closeThemeMenu);
    return () => document.removeEventListener("mousedown", closeThemeMenu);
  }, []);

  const updateNotifications = async (enabled: boolean) => {
    const previous = notifications;
    setNotifications(enabled);
    setNotificationSaving(true);
    const response = await api.updateNotificationPreferences(enabled);
    setNotificationSaving(false);
    if (!response.success) {
      setNotifications(previous);
      return;
    }
    await refreshUser();
  };

  const themeLabel = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";
  const themeOptions = ["light", "dark", "system"] as const;

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const initials =
    (user?.firstName?.charAt(0) || "U") +
    (user?.lastName?.charAt(0) || "");

  const role = user?.role || "STUDENT";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
        <Sidebar />

        <div className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
            {/* Page Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">My Profile</h1>
              <p className="text-sm text-zinc-400 mt-1">
                View and manage your account information
              </p>
            </div>

            {/* Profile Header Card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 sm:p-8 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-blue-600/30 shrink-0 overflow-hidden">
                  {user?.avatar ? <img src={user.avatar} alt="Profile" className="h-full w-full object-cover" /> : initials.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-3">
                    <h2 className="text-xl font-bold text-white">
                      {user?.firstName} {user?.lastName}
                    </h2>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${roleBadge(role)}`}
                    >
                      {roleLabel(role)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-1 flex items-center gap-1.5">
                    <IdCard className="w-3.5 h-3.5" />
                    {user?.libraryId || "N/A"}
                  </p>
                  <p className="text-sm text-zinc-400 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {user?.email || "N/A"}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-semibold transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                </div>
              </div>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-800">
                  <h3 className="text-base font-semibold text-white">
                    Personal Information
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Your account details
                  </p>
                </div>
                <div className="px-6 py-2 divide-y divide-zinc-800/60">
                  <InfoRow
                    icon={UserIcon}
                    label="Full Name"
                    value={`${user?.firstName} ${user?.lastName}`}
                  />
                  <InfoRow icon={IdCard} label="ID Number" value={user?.libraryId} />
                  <InfoRow icon={Mail} label="Email" value={user?.email} />
                  <InfoRow icon={Phone} label="Phone Number" value={user?.phone} />
                  <InfoRow
                    icon={Building2}
                    label="Department"
                    value={user?.department}
                  />
                  {role === "STUDENT" && (
                    <InfoRow
                      icon={GraduationCap}
                      label="Year & Section"
                      value={user?.yearSection}
                    />
                  )}
                </div>
              </div>

              {/* Account Settings */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-800">
                  <h3 className="text-base font-semibold text-white">
                    Account Settings
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Security and preferences
                  </p>
                </div>

                <div className="px-6 py-2 divide-y divide-zinc-800/60">
                  {/* Change Password */}
                  <button onClick={() => setPasswordOpen(true)} className="w-full flex items-center gap-3 py-3.5 text-left group">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0 group-hover:bg-blue-500/10 transition-colors">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        Change Password
                      </p>
                      <p className="text-xs text-zinc-500">
                        Update your password to keep your account secure
                      </p>
                    </div>
                    <ChevronIcon />
                  </button>

{/* Notification Preferences */}
                  <div
                    onClick={() => !notificationSaving && updateNotifications(!notifications)}
                    className="w-full flex items-center gap-3 py-3.5 text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0 group-hover:bg-blue-500/10 transition-colors">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        Notification Preferences
                      </p>
                      <p className="text-xs text-zinc-500">
                        Borrow due alerts and updates
                      </p>
                    </div>
                    <Toggle checked={notifications} onChange={updateNotifications} disabled={notificationSaving} />
                  </div>

                  {/* Theme Preference */}
                  <div className="flex items-center gap-3 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
                      <Palette className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        Theme Preference
                      </p>
                      <p className="text-xs text-zinc-500">Applied across the entire app</p>
                    </div>
                    <div className="relative shrink-0" ref={themeRef}>
                      <button
                        type="button"
                        onClick={() => setThemeOpen((open) => !open)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-2.5 py-1.5 text-xs font-medium text-blue-400 ring-1 ring-blue-500/30 hover:bg-blue-500/25"
                        aria-haspopup="listbox"
                        aria-expanded={themeOpen}
                      >
                        <Check className="h-3 w-3" /> {themeLabel} <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {themeOpen && (
                        <div className="absolute right-0 top-full z-20 mt-2 w-32 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-2xl" role="listbox">
                          {themeOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => { setTheme(option); setThemeOpen(false); }}
                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm capitalize ${theme === option ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-zinc-800"}`}
                              role="option"
                              aria-selected={theme === option}
                            >
                              {option} {theme === option && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Account Status */}
                  <div className="flex items-center gap-3 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        Account Status
                      </p>
                      <p className="text-xs text-zinc-500">
                        {user?.isActive ? "Your account is active and in good standing" : "Your account is currently suspended"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${user?.isActive ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : "bg-red-500/15 text-red-400 ring-red-500/30"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user?.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                      {user?.isActive ? "Active" : "Suspended"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {editing && <EditProfileModal onClose={() => setEditing(false)} onSaved={refreshUser} />}
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
    </ProtectedRoute>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="w-4 h-4 text-zinc-500 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 4.5l7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      disabled={disabled}
      className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-50 ${
        checked ? "bg-blue-600" : "bg-zinc-700"
      }`}
      aria-pressed={checked}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    setSaving(true);
    setError("");
    const response = await api.changePassword(currentPassword, newPassword);
    setSaving(false);
    if (!response.success) {
      setError(response.error || "Unable to change password.");
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <h2 id="change-password-title" className="text-lg font-semibold text-white">Change Password</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close change password"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          {error && <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} />
          <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} />
          <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1.5 text-sm font-medium text-zinc-300">{label}<input type="password" value={value} onChange={(event) => onChange(event.target.value)} required className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>;
}
