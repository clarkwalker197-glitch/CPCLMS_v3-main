"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api";
import { isValidName, nameValidationMessage, sanitizeNameInput } from "@/lib/name-validation";

type EditProfileModalProps = {
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function EditProfileModal({ onClose, onSaved }: EditProfileModalProps) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(`${user?.firstName || ""} ${user?.lastName || ""}`.trim());
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [department, setDepartment] = useState(user?.department || "");
  const [departments, setDepartments] = useState<Array<{ code: string; name: string }>>([]);
  const [yearSection, setYearSection] = useState(user?.yearSection || "");
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState(resolveMediaUrl(user?.avatar));
  const [removePicture, setRemovePicture] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.getDepartments().then((response) => {
      if (!active || !response.success || !Array.isArray(response.data)) return;
      setDepartments(response.data);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!picture) return;
    const objectUrl = URL.createObjectURL(picture);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [picture]);

  const handlePictureChange = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError("Profile picture must be a JPG, PNG, or WEBP file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile picture must be 5MB or smaller.");
      return;
    }
    setError("");
    setRemovePicture(false);
    setPicture(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nameParts = fullName.trim().split(/\s+/);
    const phonePattern = /^\+?[\d\s-]{7,15}$/;
    if (nameParts.length < 2) return setError("Enter your first and last name.");
    if (!isValidName(nameParts[0])) return setError(nameValidationMessage("First name"));
    if (!isValidName(nameParts.slice(1).join(" "))) return setError(nameValidationMessage("Last name"));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (phone && !phonePattern.test(phone)) return setError("Enter a valid phone number.");
    if (user?.role === "STUDENT" && !yearSection.trim()) {
      return setError("Year & Section is required for Student accounts.");
    }
    if ((user?.role === "STUDENT" || user?.role === "FACULTY") && !department.trim()) {
      return setError("Department is required for Student and Faculty accounts.");
    }

    setSaving(true);
    setError("");
    const formData = new FormData();
    formData.append("firstName", nameParts[0]);
    formData.append("lastName", nameParts.slice(1).join(" "));
    formData.append("email", email.trim());
    formData.append("phone", phone.trim());
    formData.append("department", department.trim());
    formData.append("yearSection", yearSection.trim());
    if (picture) formData.append("profilePicture", picture);
    if (removePicture) formData.append("removeProfilePicture", "true");

    try {
      const response = await api.updateProfile(formData);
      if (!response.success) {
        setError(response.error || "Unable to update your profile.");
        return;
      }
      await onSaved();
      setSuccess(true);
    } catch {
      setError("Unable to update your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2 id="edit-profile-title" className="text-lg font-semibold text-white">Edit Profile</h2>
            <p className="mt-1 text-xs text-zinc-500">Update your personal information and profile picture.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close edit profile">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {success && <div className="flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />Profile updated successfully.</div>}

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-xl font-bold text-white">
              {preview && !removePicture ? <img src={preview} alt="Profile preview" className="h-full w-full object-cover" /> : `${user?.firstName?.[0] || "U"}${user?.lastName?.[0] || ""}`.toUpperCase()}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700">
                <ImagePlus className="h-4 w-4" /> Choose picture
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => handlePictureChange(event.target.files?.[0])} />
              </label>
              {(preview || picture) && <button type="button" onClick={() => { setPicture(null); setPreview(""); setRemovePicture(true); }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /> Remove</button>}
            </div>
          </div>

          <Field label="Full Name" value={fullName} onChange={(value) => setFullName(sanitizeNameInput(value))} onBlur={() => setFullName((value) => value.trim())} required />
          <Field label="Email" type="email" value={email} onChange={setEmail} required />
          <Field label="Phone Number" value={phone} onChange={setPhone} placeholder="+63 912 345 6789" />
          <Field label="ID Number" value={user?.libraryId || ""} onChange={() => {}} disabled />
          <label className="block space-y-1.5 text-sm font-medium text-zinc-300">
            Department{user?.role === "LIBRARIAN" ? " (optional)" : " *"}
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              required={user?.role !== "LIBRARIAN"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="">Select a department</option>
              {departments.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}
            </select>
          </label>
          {user?.role === "STUDENT" && <Field label="Year & Section" value={yearSection} onChange={setYearSection} required />}

          <div className="flex justify-end gap-3 border-t border-zinc-800 pt-5">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button type="submit" disabled={saving || success} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, type = "text", placeholder, required, disabled }: { label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; type?: string; placeholder?: string; required?: boolean; disabled?: boolean }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-zinc-300">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} required={required} disabled={disabled} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60" />
    </label>
  );
}