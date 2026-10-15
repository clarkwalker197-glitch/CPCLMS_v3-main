"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api";
import MediaImage from "@/components/MediaImage";
import { categoryCodeForId, categoryDisplayName, categoryForClassification, categoryIdForDewey, DEWEY_MAIN_CATEGORIES, mainCategoryForClassification, mainCategoryForCode, normalizeClassificationNumber, sanitizeClassificationInput, subcategoriesForMain } from "@/lib/categories";
import { BookOpen, FileText, Link2, Upload, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface EBook {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishYear?: number;
  edition?: string;
  categoryId?: string;
  classificationNumber?: string;
  description?: string;
  coverImage?: string;
  language?: string;
  fileUrl: string;
  fileSize?: number;
  format?: 'PDF' | 'EPUB' | 'MOBI';
  status?: string;
}

const inputClass =
  "w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm";
const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";
const ACCEPTED_EBOOK_EXT = [".pdf", ".epub", ".mobi"];
const ACCEPTED_EBOOK_MIME: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".epub": ["application/epub+zip", "application/zip"],
  ".mobi": ["application/x-mobipocket-ebook"],
};
const MAX_EBOOK_MB = 50;

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidFileUrl(value: string): boolean {
  if (value.startsWith("/uploads/ebooks/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isUploadedEBookUrl(value: string): boolean {
  return value.startsWith("/uploads/ebooks/")
    || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/ebooks\/ebook-/i.test(value);
}

function sourceLabel(value: string): string {
  if (isUploadedEBookUrl(value)) {
    const filename = value.split("/").pop()?.split("?")[0];
    return filename ? `Uploaded file · ${decodeURIComponent(filename)}` : "Uploaded file";
  }
  return value.length > 72 ? `${value.slice(0, 69)}…` : value;
}

export function EditEBookModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ebook: EBook | null;
  categories: Category[];
  onSuccess: () => void;
}) {
  const emptyForm = {
    isbn: "",
    title: "",
    author: "",
    publisher: "",
    publishYear: "",
    edition: "",
    categoryId: "",
    classificationNumber: "",
    description: "",
    coverImage: "",
    language: "English",
    fileUrl: "",
    format: "PDF" as 'PDF' | 'EPUB' | 'MOBI',
  };

  const [form, setForm] = useState(emptyForm);
  const [mainCategoryCode, setMainCategoryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileMode, setFileMode] = useState<"upload" | "link">("link");
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when e-book changes
  useEffect(() => {
    if (props.ebook) {
      setForm({
        isbn: props.ebook.isbn || "",
        title: props.ebook.title || "",
        author: props.ebook.author || "",
        publisher: props.ebook.publisher || "",
        publishYear: props.ebook.publishYear ? String(props.ebook.publishYear) : "",
        edition: props.ebook.edition || "",
        categoryId: props.ebook.categoryId || "",
        classificationNumber: props.ebook.classificationNumber || "",
        description: props.ebook.description || "",
        coverImage: props.ebook.coverImage || "",
        language: props.ebook.language || "English",
        fileUrl: props.ebook.fileUrl || "",
        format: (props.ebook.format || "PDF") as 'PDF' | 'EPUB' | 'MOBI',
      });
      const categoryCode = categoryCodeForId(props.ebook.categoryId, props.categories);
      setMainCategoryCode((mainCategoryForCode(categoryCode) || mainCategoryForCode(props.ebook.classificationNumber?.slice(0, 3)))?.code || "");
      setError("");
      setEbookFile(null);
      setFileMode("link");
    }
  }, [props.ebook, props.open]);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const updateClassificationNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeClassificationInput(e.target.value);
    const detected = categoryForClassification(value);
    const mainCategory = mainCategoryForClassification(value);
    const categoryId = detected ? categoryIdForDewey(detected, props.categories) : undefined;
    setMainCategoryCode(mainCategory?.code || "");
    setForm((current) => ({ ...current, classificationNumber: value, categoryId: categoryId || "" }));
  };

  const normalizeClassification = () => setForm((current) => ({
    ...current,
    classificationNumber: normalizeClassificationNumber(current.classificationNumber) || current.classificationNumber,
  }));

  const reset = () => {
    setForm(emptyForm);
    setMainCategoryCode("");
    setError("");
    setEbookFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    props.onOpenChange(false);
  };

  const onPickEbookFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_EBOOK_EXT.includes(extension)) {
      setError("E-book file must be a PDF, EPUB, or MOBI file.");
      event.target.value = "";
      return;
    }
    if (file.type && file.type !== "application/octet-stream" && !ACCEPTED_EBOOK_MIME[extension]?.includes(file.type)) {
      setError("The selected file type does not match its file extension.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EBOOK_MB * 1024 * 1024) {
      setError(`E-book file must be no larger than ${MAX_EBOOK_MB} MB.`);
      event.target.value = "";
      return;
    }
    setError("");
    setEbookFile(file);
    setForm((current) => ({
      ...current,
      format: extension === ".epub" ? "EPUB" : extension === ".mobi" ? "MOBI" : "PDF",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!props.ebook) {
      setError("E-book data not loaded");
      return;
    }

    const classificationNumber = normalizeClassificationNumber(form.classificationNumber);
    if (!form.title.trim() || !form.author.trim() || !form.categoryId || !classificationNumber) {
      setError("Title, author, category, and a valid Dewey classification number are required.");
      return;
    }
    if (fileMode === "link" && !isValidFileUrl(form.fileUrl.trim())) {
      setError("Enter a valid http or https file URL.");
      return;
    }
    if (!ebookFile && !isValidFileUrl(form.fileUrl.trim())) {
      setError("Choose an e-book file to upload or enter a valid http or https file URL.");
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        isbn: form.isbn.trim() || undefined,
        title: form.title.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim() || undefined,
        publishYear: form.publishYear ? Number(form.publishYear) : undefined,
        edition: form.edition.trim() || undefined,
        categoryId: form.categoryId || undefined,
        classificationNumber,
        description: form.description.trim() || undefined,
        coverImage: form.coverImage.trim() || undefined,
        language: form.language.trim() || "English",
        ...(form.fileUrl.trim() !== (props.ebook.fileUrl || "").trim()
          ? { fileUrl: form.fileUrl.trim() }
          : {}),
        format: form.format,
      };

      const res = fileMode === "upload" && ebookFile
        ? await api.updateEBookWithFile(
            props.ebook.id,
            Object.fromEntries(
              Object.entries(updateData)
                .filter(([key, value]) => key !== "fileUrl" && value !== undefined)
                .map(([key, value]) => [key, String(value)])
            ),
            ebookFile
          )
        : await api.updateEBook(props.ebook.id, updateData);

      if (res.success) {
        props.onSuccess();
        handleClose();
      } else if (res.rateLimited) {
        setError(res.error || "Too many requests. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to update e-book. Please check the fields and try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={handleClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          Edit E-Book
        </DialogTitle>
        <DialogDescription>
          Update the e-book details and keep the current file or replace it with an upload or link.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={update("title")}
              placeholder="e.g., Clean Code"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Author *</label>
            <input
              className={inputClass}
              value={form.author}
              onChange={update("author")}
              placeholder="e.g., Robert C. Martin"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>ISBN</label>
            <input
              className={inputClass}
              value={form.isbn}
              onChange={update("isbn")}
              placeholder="e.g., 978-0132350884"
            />
          </div>
          <div>
            <label className={labelClass}>Publisher</label>
            <input className={inputClass} value={form.publisher} onChange={update("publisher")} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Publish Year</label>
            <input
              type="number"
              className={inputClass}
              value={form.publishYear}
              onChange={update("publishYear")}
              placeholder="e.g., 2008"
            />
          </div>
          <div>
            <label className={labelClass}>Edition</label>
            <input className={inputClass} value={form.edition} onChange={update("edition")} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Classification Number *</label>
            <input className={inputClass} value={form.classificationNumber} onChange={updateClassificationNumber} onBlur={normalizeClassification} inputMode="decimal" maxLength={9} placeholder="e.g., 812.54" required />
          </div>
          <div>
            <label className={labelClass}>Category *</label>
            <select className={inputClass} value={mainCategoryCode} onChange={(e) => {
              setMainCategoryCode(e.target.value);
              setForm((current) => ({ ...current, categoryId: "" }));
            }} required>
              <option value="">Select a main category</option>
              {DEWEY_MAIN_CATEGORIES.map((category) => (
                <option key={category.code} value={category.code}>{category.name} ({category.range})</option>
              ))}
            </select>
            <select className={`${inputClass} mt-2`} value={form.categoryId} onChange={update("categoryId")} disabled={!mainCategoryCode} required>
              <option value="">Select a subcategory</option>
              {subcategoriesForMain(mainCategoryCode).map((category) => {
                const categoryId = categoryIdForDewey(category, props.categories);
                return <option key={category.code} value={categoryId}>{categoryDisplayName(category.name)}</option>;
              })}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Format</label>
          <select className={inputClass} value={form.format} onChange={update("format")}>
              <option value="PDF">PDF</option>
              <option value="EPUB">EPUB</option>
              <option value="MOBI">MOBI</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Language</label>
          <input className={inputClass} value={form.language} onChange={update("language")} />
        </div>

        <div>
          <label className={labelClass}>File source *</label>
          <div className="mb-3 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
            <button
              type="button"
              onClick={() => { setFileMode("upload"); setError(""); }}
              aria-pressed={fileMode === "upload"}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${fileMode === "upload" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Upload className="h-4 w-4" /> Upload file
            </button>
            <button
              type="button"
              onClick={() => { setFileMode("link"); setError(""); }}
              aria-pressed={fileMode === "link"}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${fileMode === "link" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Link2 className="h-4 w-4" /> Paste link
            </button>
          </div>

          {fileMode === "upload" ? (
            <div className="space-y-3">
              {form.fileUrl && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
                  <p className="text-xs font-medium text-zinc-400">Current file</p>
                  <p className="mt-1 truncate text-sm text-zinc-200" title={form.fileUrl}>{sourceLabel(form.fileUrl)}</p>
                </div>
              )}
              {ebookFile ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="truncate text-sm text-zinc-200">{ebookFile.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{formatBytes(ebookFile.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEbookFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="shrink-0 text-zinc-500 hover:text-red-400"
                    aria-label="Remove selected e-book file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 py-5 text-sm text-zinc-400 transition-colors hover:border-blue-500 hover:text-blue-400"
                >
                  <Upload className="h-5 w-5" />
                  {form.fileUrl ? "Choose a replacement e-book file" : "Choose a PDF, EPUB, or MOBI file"}
                  <span className="text-xs text-zinc-500">Maximum file size: {MAX_EBOOK_MB} MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.epub,.mobi,application/pdf,application/epub+zip,application/x-mobipocket-ebook"
                onChange={onPickEbookFile}
                className="hidden"
              />
              {form.fileUrl && !ebookFile && (
                <p className="text-xs text-zinc-500">Leave the current file selected to keep it unchanged.</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={form.fileUrl}
                onChange={update("fileUrl")}
                placeholder="https://example.com/ebook.pdf"
                aria-label="E-book file URL"
              />
              <button
                type="button"
                onClick={() => {
                  if (form.fileUrl && isValidFileUrl(form.fileUrl)) {
                    window.open(resolveMediaUrl(form.fileUrl), "_blank", "noopener,noreferrer");
                  }
                }}
                disabled={!form.fileUrl || !isValidFileUrl(form.fileUrl)}
                className="rounded-xl bg-zinc-800 p-2.5 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Open file URL"
                aria-label="Open file URL in a new tab"
              >
                <Link2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Cover Image URL</label>
          <input
            className={inputClass}
            value={form.coverImage}
            onChange={update("coverImage")}
            placeholder="https://example.com/cover.jpg"
            type="url"
          />
          <div className="mt-2 h-32 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <MediaImage src={form.coverImage} alt="E-book cover preview" className="h-full w-full object-contain" fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">No cover preview</div>} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={inputClass}
            value={form.description}
            onChange={update("description")}
            placeholder="E-book description..."
            rows={3}
          />
        </div>

      </div>

      <div className="mt-4 flex shrink-0 gap-2 border-t border-zinc-800 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleClose}
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (fileMode === "upload" && ebookFile ? "Uploading file..." : "Saving...") : "Save Changes"}
        </button>
      </div>
      </form>
    </Dialog>
  );
}
