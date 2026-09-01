"use client";

  import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import {
  MapPin,
  Clock,
  BookOpen,
  Phone,
  Mail,
  Edit2,
  X,
  Check,
} from "lucide-react";


interface LibraryInfo {
  title: string;
  introduction: string;
  location: string;
  address: string;
  openingHours: string;
  closingHours: string;
  rules: string[];
  librarianName: string;
  librarianPosition: string;
  librarianEmail: string;
  librarianExtension: string;
  librarianOffice: string;
  services: string[];
}

const DEFAULT_LIBRARY_INFO: LibraryInfo = {
  title: "About the Library",
  introduction: "Welcome to Cordova Public College Library. Our library is dedicated to providing comprehensive educational resources, a welcoming environment, and excellent service to support the academic and personal development of our students, faculty, and staff.",
  location: "Cordova Public College",
  address: "123 Academic Avenue, Cordova City",
  openingHours: "8:00 AM",
  closingHours: "6:00 PM",
  rules: [
    "Maintain silence and use library materials responsibly",
    "Maximum of 5 books per student per borrowing period",
    "Borrowing period is 14 days for students, 30 days for faculty",
    "Overdue fines: ₱25 per day per book",
    "Damaged or lost books must be replaced or payment made",
    "No food or drinks allowed in the library",
    "All materials must be returned before graduation",
    "Library cards are required for all transactions"
  ],
  librarianName: "Maria Santos",
  librarianPosition: "Head Librarian",
  librarianEmail: "maria.santos@cordova.edu.ph",
  librarianExtension: "ext. 2050",
  librarianOffice: "Library Administration Office, 2nd Floor",
  services: [
    "Book borrowing and returning",
    "Reference and research assistance",
    "Computer and internet access",
    "Printing and scanning services",
    "Study areas and quiet zones",
    "Digital resources and e-books",
    "Interlibrary loan services",
    "Library orientation for new members"
  ]
};

export default function PoliciesPage() {
  const { user } = useAuth();
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo>(DEFAULT_LIBRARY_INFO);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<LibraryInfo>(DEFAULT_LIBRARY_INFO);
  const [successMsg, setSuccessMsg] = useState("");

  const isLibrarian = user?.role === "LIBRARIAN";
  const canViewPage = user?.role === "STUDENT" || user?.role === "FACULTY" || user?.role === "LIBRARIAN";

  useEffect(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem("libraryInfo");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLibraryInfo(parsed);
        setEditData(parsed);
      } catch {
        setLibraryInfo(DEFAULT_LIBRARY_INFO);
        setEditData(DEFAULT_LIBRARY_INFO);
      }
    }
  }, []);

  const handleEditStart = () => {
    setEditData(libraryInfo);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  const handleEditChange = (field: keyof LibraryInfo, value: any) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditArrayChange = (field: "rules" | "services", index: number, value: string) => {
    setEditData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };

  const handleAddArrayItem = (field: "rules" | "services") => {
    setEditData(prev => ({
      ...prev,
      [field]: [...prev[field], ""]
    }));
  };

  const handleRemoveArrayItem = (field: "rules" | "services", index: number) => {
    setEditData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleSave = () => {
    setLibraryInfo(editData);
    localStorage.setItem("libraryInfo", JSON.stringify(editData));
    setIsEditing(false);
    setSuccessMsg("Library information updated successfully");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  if (!canViewPage) {
    return (
      <div className="flex h-screen bg-zinc-950">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
            <p className="text-zinc-400">You don't have permission to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      <Sidebar />

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 lg:p-8">
          {/* Success Message */}
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-400 flex items-center gap-2">
              <Check className="w-5 h-5" />
              {successMsg}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">{libraryInfo.title}</h1>
              <p className="text-zinc-400 text-sm">Learn more about our library and services</p>
            </div>
            {isLibrarian && !isEditing && (
              <button
                onClick={handleEditStart}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>

          {!isEditing ? (
            // VIEW MODE
            <>
              {/* Introduction */}
              <div className="mb-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <p className="text-zinc-300 leading-relaxed text-lg">
                  {libraryInfo.introduction}
                </p>
              </div>

              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Location Card */}
                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <MapPin className="w-6 h-6 text-blue-400" />
                    <h3 className="text-lg font-semibold text-white">Location</h3>
                  </div>
                  <p className="text-zinc-300 font-medium mb-1">{libraryInfo.location}</p>
                  <p className="text-zinc-400 text-sm">{libraryInfo.address}</p>
                </div>

                {/* Opening Hours Card */}
                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <Clock className="w-6 h-6 text-emerald-400" />
                    <h3 className="text-lg font-semibold text-white">Opening Hours</h3>
                  </div>
                  <p className="text-zinc-300 font-medium mb-2">Monday - Friday</p>
                  <p className="text-zinc-400 text-sm">{libraryInfo.openingHours} - {libraryInfo.closingHours}</p>
                  <p className="text-zinc-300 font-medium mt-3 mb-2">Saturday - Sunday</p>
                  <p className="text-zinc-400 text-sm">Closed</p>
                </div>
              </div>

              {/* Library Rules Section */}
              <div className="mb-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-amber-400" />
                  Library Rules
                </h2>
                <ul className="space-y-3">
                  {libraryInfo.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-amber-400 font-bold text-lg mt-0.5 flex-shrink-0">•</span>
                      <span className="text-zinc-300">{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Librarian Section */}
              <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-800/50 rounded-xl">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <Phone className="w-6 h-6 text-blue-400" />
                  Head Librarian
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1">Name</p>
                    <p className="text-lg font-semibold text-white mb-4">{libraryInfo.librarianName}</p>
                    
                    <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1">Position</p>
                    <p className="text-zinc-300 mb-4">{libraryInfo.librarianPosition}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1">Email</p>
                    <p className="text-zinc-300 mb-4 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-400" />
                      <a href={`mailto:${libraryInfo.librarianEmail}`} className="hover:text-blue-400 transition-colors">
                        {libraryInfo.librarianEmail}
                      </a>
                    </p>

                    <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1">Extension</p>
                    <p className="text-zinc-300">{libraryInfo.librarianExtension}</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 uppercase tracking-wide mb-1 mt-6">Office</p>
                <p className="text-zinc-300">{libraryInfo.librarianOffice}</p>
              </div>

              {/* Services Section */}
              <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-emerald-400" />
                  Our Services
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {libraryInfo.services.map((service, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg">
                      <span className="text-emerald-400 font-bold text-lg mt-0.5 flex-shrink-0">✓</span>
                      <span className="text-zinc-300">{service}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            // EDIT MODE (Librarian only)
            <div className="space-y-6">
              {/* Edit Form */}
              <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <h3 className="text-lg font-bold text-white mb-4">Edit Page Information</h3>

                {/* Title and Introduction */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Title</label>
                    <input
                      type="text"
                      value={editData.title}
                      onChange={(e) => handleEditChange("title", e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">Introduction</label>
                    <textarea
                      value={editData.introduction}
                      onChange={(e) => handleEditChange("introduction", e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                </div>

                {/* Location and Hours */}
                <div className="space-y-4 mb-6">
                  <h4 className="font-semibold text-white">Location & Hours</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Location</label>
                      <input
                        type="text"
                        value={editData.location}
                        onChange={(e) => handleEditChange("location", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Address</label>
                      <input
                        type="text"
                        value={editData.address}
                        onChange={(e) => handleEditChange("address", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Opening Hours</label>
                      <input
                        type="text"
                        value={editData.openingHours}
                        onChange={(e) => handleEditChange("openingHours", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Closing Hours</label>
                      <input
                        type="text"
                        value={editData.closingHours}
                        onChange={(e) => handleEditChange("closingHours", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Library Rules */}
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white">Library Rules</h4>
                    <button
                      onClick={() => handleAddArrayItem("rules")}
                      className="text-sm px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                    >
                      Add Rule
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editData.rules.map((rule, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={rule}
                          onChange={(e) => handleEditArrayChange("rules", idx, e.target.value)}
                          className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleRemoveArrayItem("rules", idx)}
                          className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Librarian Info */}
                <div className="space-y-4 mb-6">
                  <h4 className="font-semibold text-white">Head Librarian Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Name</label>
                      <input
                        type="text"
                        value={editData.librarianName}
                        onChange={(e) => handleEditChange("librarianName", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Position</label>
                      <input
                        type="text"
                        value={editData.librarianPosition}
                        onChange={(e) => handleEditChange("librarianPosition", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
                      <input
                        type="email"
                        value={editData.librarianEmail}
                        onChange={(e) => handleEditChange("librarianEmail", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Extension</label>
                      <input
                        type="text"
                        value={editData.librarianExtension}
                        onChange={(e) => handleEditChange("librarianExtension", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Office</label>
                      <input
                        type="text"
                        value={editData.librarianOffice}
                        onChange={(e) => handleEditChange("librarianOffice", e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Services */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white">Services</h4>
                    <button
                      onClick={() => handleAddArrayItem("services")}
                      className="text-sm px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                    >
                      Add Service
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editData.services.map((service, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={service}
                          onChange={(e) => handleEditArrayChange("services", idx, e.target.value)}
                          className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleRemoveArrayItem("services", idx)}
                          className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Edit Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleEditCancel}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
