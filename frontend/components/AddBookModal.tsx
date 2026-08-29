"use client";

import { useState, useRef } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { BookOpen, Upload, FileText, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

const inputClass =
  "w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm";
const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";
const ACCEPTED_COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_COVER_MB = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddBookModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  onSuccess: () => void;
}) {
  const emptyForm = {
    isbn: "",
    accessionNo: "",
    title: "",
    author: "",
    publisher: "",
    publishYear: "",
    edition: "",
    pages: "",
    categoryId: "",
    description: "",
    coverImage: "",
    language: "English",
    shelf: "",
    row: "",
    copies: "1",
  };
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

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

  const reset = () => {
    setForm(emptyForm);
    setCoverFile(null);
    setError("");
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    props.onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.isbn.trim() || !form.accessionNo.trim() || !form.title.trim() || !form.author.trim()) {
      setError("ISBN, accession number, title, and author are required.");
      return;
    }
    const copiesNum = form.copies ? Number(form.copies) : 1;
    if (!Number.isInteger(copiesNum) || copiesNum < 1) {
      setError("Copies must be a whole number of 1 or more.");
      return;
    }

    setLoading(true);
    try {
      const commonFields = {
        isbn: form.isbn.trim(),
        accessionNo: form.accessionNo.trim(),
        title: form.title.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim() || undefined,
        publishYear: form.publishYear ? Number(form.publishYear) : undefined,
        edition: form.edition.trim() || undefined,
        pages: form.pages ? Number(form.pages) : undefined,
        categoryId: form.categoryId || undefined,
        description: form.description.trim() || undefined,
        language: form.language.trim() || "English",
        shelf: form.shelf.trim() || undefined,
        row: form.row.trim() || undefined,
        copies: copiesNum,
      };

      const res = coverFile
        ? await api.createBookWithCoverFile(
            Object.fromEntries(
              Object.entries(commonFields)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)])
            ),
            coverFile
          )
        : await api.createBook({
            ...commonFields,
            coverImage: form.coverImage.trim() || undefined,
          });

      if (res.success) {
        props.onSuccess();
        handleClose();
      } else if (res.rateLimited) {
        setError(res.error || "Too many requests. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to add book. Please check the fields and try again.");
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
          Add Book
        </DialogTitle>
        <DialogDescription>
          New copies are marked available immediately — students will see this title as
          borrowable as soon as it&apos;s added.
        </DialogDescription>
      </DialogHeader>

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
          <div>
            <label className={labelClass}>Accession No. *</label>
            <input
              className={inputClass}
              value={form.accessionNo}
              onChange={update("accessionNo")}
              placeholder="e.g., ACC-00231"
              required
            />
          </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Copies *</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.copies}
              onChange={update("copies")}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Shelf</label>
            <input className={inputClass} value={form.shelf} onChange={update("shelf")} placeholder="e.g., A3" />
          </div>
          <div>
            <label className={labelClass}>Row</label>
            <input className={inputClass} value={form.row} onChange={update("row")} placeholder="e.g., 2" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Pages</label>
            <input
              type="number"
              className={inputClass}
              value={form.pages}
              onChange={update("pages")}
            />
          </div>
          <div>
            <label className={labelClass}>Language</label>
            <input className={inputClass} value={form.language} onChange={update("language")} />
          </div>
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
          {!coverFile && (
            <input
              className={`${inputClass} mt-2`}
              value={form.coverImage}
              onChange={update("coverImage")}
              placeholder="...or paste a cover image URL instead"
            />
          )}
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
            {loading ? "Adding..." : "Add Book"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
