"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { BookOpen, Link2 } from "lucide-react";

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

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    description: "",
    coverImage: "",
    language: "English",
    fileUrl: "",
    format: "PDF" as 'PDF' | 'EPUB' | 'MOBI',
  };

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        description: props.ebook.description || "",
        coverImage: props.ebook.coverImage || "",
        language: props.ebook.language || "English",
        fileUrl: props.ebook.fileUrl || "",
        format: (props.ebook.format || "PDF") as 'PDF' | 'EPUB' | 'MOBI',
      });
      setError("");
    }
  }, [props.ebook, props.open]);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const reset = () => {
    setForm(emptyForm);
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

    if (!props.ebook) {
      setError("E-book data not loaded");
      return;
    }

    if (!form.title.trim() || !form.author.trim() || !form.fileUrl.trim()) {
      setError("Title, author, and file URL are required.");
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
        description: form.description.trim() || undefined,
        coverImage: form.coverImage.trim() || undefined,
        language: form.language.trim() || "English",
        fileUrl: form.fileUrl.trim(),
        format: form.format,
      };

      const res = await api.updateEBook(props.ebook.id, updateData);

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
          Update the e-book details. Changes are saved immediately.
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
          <div>
            <label className={labelClass}>Format</label>
            <select className={inputClass} value={form.format} onChange={update("format")}>
              <option value="PDF">PDF</option>
              <option value="EPUB">EPUB</option>
              <option value="MOBI">MOBI</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Language</label>
          <input className={inputClass} value={form.language} onChange={update("language")} />
        </div>

        <div>
          <label className={labelClass}>File URL *</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                className={inputClass}
                value={form.fileUrl}
                onChange={update("fileUrl")}
                placeholder="https://example.com/ebook.pdf"
                required
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (form.fileUrl) {
                  window.open(form.fileUrl, "_blank");
                }
              }}
              disabled={!form.fileUrl}
              className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Open file URL"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>
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
      </form>

      <div className="flex gap-2 mt-6">
        <button
          onClick={handleClose}
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </Dialog>
  );
}
