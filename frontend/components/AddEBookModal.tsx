"use client";

import { useState, useRef } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { BookOpen, Upload, Link2, FileText, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

const inputClass =
  "w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm";
const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";

const ACCEPTED_EBOOK_EXT = [".pdf", ".epub", ".mobi"];
const ACCEPTED_COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EBOOK_MB = 150;
const MAX_COVER_MB = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddEBookModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
    description: "",
    coverImage: "",
    language: "English",
    fileUrl: "",
    fileSizeMb: "",
    format: "PDF" as "PDF" | "EPUB" | "MOBI",
  };
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [form, setForm] = useState(emptyForm);
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const reset = () => {
    setForm(emptyForm);
    setEbookFile(null);
    setCoverFile(null);
    setError("");
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    props.onOpenChange(false);
  };

  const onPickEbookFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EBOOK_EXT.includes(ext)) {
      setError("E-book file must be a PDF, EPUB, or MOBI file.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_EBOOK_MB * 1024 * 1024) {
      setError(`E-book file must be under ${MAX_EBOOK_MB}MB.`);
      e.target.value = "";
      return;
    }
    setError("");
    setEbookFile(file);
  };

  const onPickCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_COVER_TYPES.includes(file.type)) {
      setError("Cover image must be a JPG, PNG, or WEBP file.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      setError(`Cover image must be under ${MAX_COVER_MB}MB.`);
      e.target.value = "";
      return;
    }
    setError("");
    setCoverFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.isbn.trim() || !form.title.trim() || !form.author.trim()) {
      setError("ISBN, title, and author are required.");
      return;
    }

    if (mode === "link" && !form.fileUrl.trim()) {
      setError("File URL is required.");
      return;
    }
    if (mode === "upload" && !ebookFile) {
      setError("Please choose an e-book file to upload.");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (mode === "upload") {
        const fd = new FormData();
        fd.append("isbn", form.isbn.trim());
        fd.append("title", form.title.trim());
        fd.append("author", form.author.trim());
        if (form.publisher.trim()) fd.append("publisher", form.publisher.trim());
        if (form.publishYear) fd.append("publishYear", form.publishYear);
        if (form.edition.trim()) fd.append("edition", form.edition.trim());
        if (form.categoryId) fd.append("categoryId", form.categoryId);
        if (form.description.trim()) fd.append("description", form.description.trim());
        fd.append("language", form.language.trim() || "English");
        fd.append("file", ebookFile as File);
        if (coverFile) fd.append("coverImage", coverFile);
        res = await api.uploadEBook(fd);
      } else {
        res = await api.createEBook({
          isbn: form.isbn.trim(),
          title: form.title.trim(),
          author: form.author.trim(),
          publisher: form.publisher.trim() || undefined,
          publishYear: form.publishYear ? Number(form.publishYear) : undefined,
          edition: form.edition.trim() || undefined,
          categoryId: form.categoryId || undefined,
          description: form.description.trim() || undefined,
          coverImage: form.coverImage.trim() || undefined,
          language: form.language.trim() || "English",
          fileUrl: form.fileUrl.trim(),
          fileSize: form.fileSizeMb ? Math.round(Number(form.fileSizeMb) * 1024 * 1024) : undefined,
          format: form.format,
        });
      }

      if (res.success) {
        props.onSuccess();
        handleClose();
      } else if (res.rateLimited) {
        setError(res.error || "Too many requests. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to add e-book. Please check the fields and try again.");
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
          Add E-Book
        </DialogTitle>
        <DialogDescription>
          {mode === "upload"
            ? "Upload the PDF/EPUB/MOBI file directly — it's stored on the server and served back for reading and downloading."
            : "Paste a direct link to an already-hosted file (e.g. Google Drive, S3, Cloudinary)."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-2 mb-4 p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setMode("upload");
            setError("");
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "upload" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload file
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("link");
            setError("");
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "link" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          Link to file
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
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
            <label className={labelClass}>ISBN *</label>
            <input
              className={inputClass}
              value={form.isbn}
              onChange={update("isbn")}
              placeholder="e.g., 978-0132350884"
              required
            />
          </div>
          {mode === "link" && (
            <div>
              <label className={labelClass}>Format</label>
              <select className={inputClass} value={form.format} onChange={update("format")}>
                <option value="PDF">PDF</option>
                <option value="EPUB">EPUB</option>
                <option value="MOBI">MOBI</option>
              </select>
            </div>
          )}
          {mode === "upload" && (
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={form.categoryId} onChange={update("categoryId")}>
                <option value="">General</option>
                {props.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Publisher</label>
            <input className={inputClass} value={form.publisher} onChange={update("publisher")} />
          </div>
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
        </div>

        {mode === "link" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Edition</label>
              <input className={inputClass} value={form.edition} onChange={update("edition")} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={form.categoryId} onChange={update("categoryId")}>
                <option value="">General</option>
                {props.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === "upload" ? (
          <>
            <div>
              <label className={labelClass}>E-book file * (PDF, EPUB, or MOBI, max {MAX_EBOOK_MB}MB)</label>
              {!ebookFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:border-blue-500 hover:text-blue-400 transition-colors text-sm"
                >
                  <Upload className="w-5 h-5" />
                  Click to choose a file
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-zinc-200 truncate">{ebookFile.name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">{formatBytes(ebookFile.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEbookFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-zinc-500 hover:text-red-400 shrink-0"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.epub,.mobi"
                onChange={onPickEbookFile}
                className="hidden"
              />
            </div>

            <div>
              <label className={labelClass}>
                Cover image <span className="text-zinc-500">(optional, JPG/PNG/WEBP, max {MAX_COVER_MB}MB)</span>
              </label>
              {!coverFile ? (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:border-blue-500 hover:text-blue-400 transition-colors text-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Choose cover image
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-zinc-200 truncate">{coverFile.name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">{formatBytes(coverFile.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverFile(null);
                      if (coverInputRef.current) coverInputRef.current.value = "";
                    }}
                    className="text-zinc-500 hover:text-red-400 shrink-0"
                    aria-label="Remove cover"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPickCoverFile}
                className="hidden"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelClass}>File URL *</label>
              <input
                className={inputClass}
                value={form.fileUrl}
                onChange={update("fileUrl")}
                placeholder="https://.../book.pdf"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cover Image URL</label>
                <input
                  className={inputClass}
                  value={form.coverImage}
                  onChange={update("coverImage")}
                  placeholder="https://.../cover.jpg"
                />
              </div>
              <div>
                <label className={labelClass}>File Size (MB)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={form.fileSizeMb}
                  onChange={update("fileSizeMb")}
                  placeholder="e.g., 4.2"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className={labelClass}>Language</label>
          <input className={inputClass} value={form.language} onChange={update("language")} />
        </div>

        <div>
          <label className={labelClass}>
            Description <span className="text-zinc-500">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={update("description")}
            rows={3}
            className={inputClass}
            placeholder="Short description or summary"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={handleClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
            disabled={loading}
          >
            {loading ? (mode === "upload" ? "Uploading..." : "Adding...") : "Add E-Book"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
