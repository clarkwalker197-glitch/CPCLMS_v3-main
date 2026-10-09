"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import MediaImage from "@/components/MediaImage";
import { categoryCodeForId, categoryDisplayName, categoryForClassification, categoryIdForDewey, DEWEY_MAIN_CATEGORIES, mainCategoryForClassification, mainCategoryForCode, normalizeClassificationNumber, sanitizeClassificationInput, subcategoriesForMain } from "@/lib/categories";
import { BookOpen, Upload, X } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface Book {
  id: string;
  isbn: string;
  accessionNo: string;
  title: string;
  author: string;
  publisher?: string;
  publishYear?: number;
  edition?: string;
  pages?: number;
  categoryId?: string;
  classificationNumber?: string;
  replacementValue?: number | string | null;
  description?: string;
  coverImage?: string;
  language?: string;
  shelf?: string;
  row?: string;
  copies?: number;
  availableCopies?: number;
}

const inputClass =
  "w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm";
const labelClass = "block text-sm font-medium text-zinc-300 mb-1.5";
const ACCEPTED_COVER_TYPES: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
const MAX_COVER_MB = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function hasValidCoverSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (file.type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  if (file.type === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export function EditBookModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  book: Book | null;
  categories: Category[];
  onSuccess: () => void;
}) {
  const emptyForm = {
    title: "",
    author: "",
    publisher: "",
    publishYear: "",
    edition: "",
    pages: "",
    categoryId: "",
    classificationNumber: "",
    description: "",
    language: "English",
    copies: "1",
    availableCopies: "1",
    replacementValue: "0",
  };

  const [form, setForm] = useState(emptyForm);
  const [mainCategoryCode, setMainCategoryCode] = useState("");
  const [originalCoverImage, setOriginalCoverImage] = useState<string>("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [coverError, setCoverError] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when book changes
  useEffect(() => {
    if (props.book) {
      setForm({
        title: props.book.title || "",
        author: props.book.author || "",
        publisher: props.book.publisher || "",
        publishYear: props.book.publishYear ? String(props.book.publishYear) : "",
        edition: props.book.edition || "",
        pages: props.book.pages ? String(props.book.pages) : "",
        categoryId: props.book.categoryId || "",
        classificationNumber: props.book.classificationNumber || "",
        description: props.book.description || "",
        language: props.book.language || "English",
        copies: props.book.copies ? String(props.book.copies) : "1",
        availableCopies: props.book.availableCopies ? String(props.book.availableCopies) : "1",
        replacementValue: props.book.replacementValue != null ? String(props.book.replacementValue) : "0",
      });
      const categoryCode = categoryCodeForId(props.book.categoryId, props.categories);
      setMainCategoryCode((mainCategoryForCode(categoryCode) || mainCategoryForCode(props.book.classificationNumber?.slice(0, 3)))?.code || "");
      setOriginalCoverImage(props.book.coverImage || "");
      setCoverFile(null);
      setError("");
      setCoverError("");
    }
  }, [props.book, props.open]);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const clearCoverError = () => setCoverError("");

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

  const onPickCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      clearCoverError();
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const allowedExtensions = ACCEPTED_COVER_TYPES[file.type];
    if (!allowedExtensions?.includes(extension)) {
      setCoverError("Choose a JPG, PNG, or WEBP cover image with a matching file type.");
      setCoverFile(null);
      input.value = "";
      return;
    }
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      setCoverError(`Cover image must be ${MAX_COVER_MB}MB or smaller.`);
      setCoverFile(null);
      input.value = "";
      return;
    }
    try {
      if (!await hasValidCoverSignature(file)) {
        setCoverError("The selected file is not a valid JPG, PNG, or WEBP image.");
        setCoverFile(null);
        input.value = "";
        return;
      }
    } catch {
      setCoverError("Could not read the selected cover image. Please choose it again.");
      setCoverFile(null);
      input.value = "";
      return;
    }
    setCoverError("");
    setCoverFile(file);
  };

  const removeCoverFile = () => {
    setCoverFile(null);
    clearCoverError();
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const reset = () => {
    setForm(emptyForm);
    setMainCategoryCode("");
    setCoverFile(null);
    setOriginalCoverImage("");
    setError("");
    setCoverError("");
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    props.onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!props.book) {
      setError("Book data not loaded");
      return;
    }

    const classificationNumber = normalizeClassificationNumber(form.classificationNumber);
    if (!form.title.trim() || !form.author.trim() || !form.categoryId || !classificationNumber) {
      setError("Title, author, category, and a valid Dewey classification number are required.");
      return;
    }

    const copiesNum = form.copies ? Number(form.copies) : 1;
    const availableCopiesNum = form.availableCopies ? Number(form.availableCopies) : 1;
    const replacementValue = Number(form.replacementValue);

    if (!Number.isInteger(copiesNum) || copiesNum < 1) {
      setError("Total copies must be a whole number of 1 or more.");
      return;
    }

    if (!Number.isInteger(availableCopiesNum) || availableCopiesNum < 0) {
      setError("Available copies must be a whole number of 0 or more.");
      return;
    }

    if (availableCopiesNum > copiesNum) {
      setError("Available copies cannot be more than total copies.");
      return;
    }

    if (!Number.isFinite(replacementValue) || replacementValue < 0) {
      setError("Replacement value must be a valid non-negative amount in pesos.");
      return;
    }

    setLoading(true);
    try {
      const commonFields = {
        title: form.title.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim() || undefined,
        publishYear: form.publishYear ? Number(form.publishYear) : undefined,
        edition: form.edition.trim() || undefined,
        pages: form.pages ? Number(form.pages) : undefined,
        categoryId: form.categoryId || undefined,
        classificationNumber,
        replacementValue: Number(replacementValue.toFixed(2)),
        description: form.description.trim() || undefined,
        language: form.language.trim() || "English",
        copies: copiesNum,
        availableCopies: availableCopiesNum,
      };

      let res;
      if (coverFile) {
        // Update with new cover file using FormData (multipart)
        const fd = new FormData();
        Object.entries(commonFields).forEach(([key, value]) => {
          if (value !== undefined && value !== '') fd.append(key, String(value));
        });
        fd.append('coverImage', coverFile);

        if (!navigator.onLine) {
          setError('An internet connection is required to update the book.');
          return;
        }

        const token = localStorage.getItem('accessToken');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/books/${props.book.id}`,
          {
            method: 'PUT',
            credentials: 'include',
            headers,
            body: fd,
          }
        );
        res = await response.json();
      } else {
        res = await api.updateBook(props.book.id, commonFields);
      }

      if (res.success) {
        props.onSuccess();
        handleClose();
      } else if (res.rateLimited) {
        setError(res.error || "Too many requests. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to update book. Please check the fields and try again.");
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
          Edit Book
        </DialogTitle>
        <DialogDescription>
          Update the book details. Changes are saved immediately.
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
            <label className={labelClass}>Classification Number *</label>
            <input
              className={inputClass}
              value={form.classificationNumber}
              onChange={updateClassificationNumber}
              onBlur={normalizeClassification}
              inputMode="decimal"
              maxLength={9}
              placeholder="e.g., 510.5"
              required
            />
          </div>
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
          <p className="mt-1 text-xs text-zinc-500">Choose a main category, then its 2nd Summary subcategory.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Total Copies *</label>
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
            <label className={labelClass}>Available Copies *</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.availableCopies}
              onChange={update("availableCopies")}
              required
            />
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
            <label className={labelClass}>Replacement Value (₱)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={form.replacementValue}
              onChange={update("replacementValue")}
              placeholder="e.g., 350.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Language</label>
            <input className={inputClass} value={form.language} onChange={update("language")} />
          </div>
          <div></div>
        </div>

        <div>
          <label className={labelClass}>
            Cover image <span className="text-zinc-500">(optional, JPG/PNG/WEBP, max {MAX_COVER_MB}MB)</span>
          </label>
          {!coverFile && !originalCoverImage && (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:border-blue-500 hover:text-blue-400 transition-colors text-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Choose cover image
            </button>
          )}
          {coverError && (
            <p className="mt-2 text-sm text-red-400" role="alert">{coverError}</p>
          )}
          {!coverFile && originalCoverImage && (
            <div className="space-y-2">
              <div className="w-full h-32 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                <MediaImage src={originalCoverImage} alt="Current cover" className="w-full h-full object-cover" fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">No cover preview</div>} />
              </div>
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg"
              >
                Change cover image
              </button>
            </div>
          )}
          {coverFile && (
            <div className="space-y-2">
              <div className="w-full h-32 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(coverFile)} alt="New cover" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2">
                <span className="flex-1 text-sm text-zinc-400 truncate">{coverFile.name}</span>
                <button
                  type="button"
                  onClick={removeCoverFile}
                  className="text-zinc-400 hover:text-red-400 transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <input
            type="file"
            ref={coverInputRef}
            onChange={onPickCoverFile}
            accept={Object.values(ACCEPTED_COVER_TYPES).flat().join(",")}
            className="hidden"
          />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={inputClass}
            value={form.description}
            onChange={update("description")}
            placeholder="Book description..."
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
