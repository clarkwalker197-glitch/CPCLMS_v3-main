export const DEWEY_SECOND_SUMMARY = [
  ["000", "Computer science, information & general works"], ["010", "Bibliographies"], ["020", "Library & information sciences"], ["030", "Encyclopedias & books of facts"], ["040", "[Unassigned]"], ["050", "Magazines, journals & serials"], ["060", "Associations, organizations & museums"], ["070", "News media, journalism & publishing"], ["080", "Quotations"], ["090", "Manuscripts & rare books"],
  ["100", "Philosophy"], ["110", "Metaphysics"], ["120", "Epistemology"], ["130", "Parapsychology & occultism"], ["140", "Philosophical schools of thought"], ["150", "Psychology"], ["160", "Logic"], ["170", "Ethics"], ["180", "Philosophy of specific places"], ["190", "Philosophy of individual authors"],
  ["200", "Religion"], ["210", "Philosophy & theory of religion"], ["220", "Bible"], ["230", "Christianity"], ["240", "Christian practice & observance"], ["250", "Christian orders & local church"], ["260", "Christian organization, social work & worship"], ["270", "History of Christianity"], ["280", "Christian denominations"], ["290", "Other religions"],
  ["300", "Social sciences, sociology & anthropology"], ["310", "Statistics"], ["320", "Political science"], ["330", "Economics"], ["340", "Law"], ["350", "Public administration & military science"], ["360", "Social problems & social services"], ["370", "Education"], ["380", "Commerce, communications & transportation"], ["390", "Customs, etiquette & folklore"],
  ["400", "Language"], ["410", "Linguistics"], ["420", "English & Old English languages"], ["430", "German & related languages"], ["440", "French & related languages"], ["450", "Italian, Romanian & related languages"], ["460", "Spanish & Portuguese languages"], ["470", "Latin & Italic languages"], ["480", "Classical & modern Greek languages"], ["490", "Other languages"],
  ["500", "Science"], ["510", "Mathematics"], ["520", "Astronomy"], ["530", "Physics"], ["540", "Chemistry"], ["550", "Earth sciences & geology"], ["560", "Fossils & prehistoric life"], ["570", "Life sciences; biology"], ["580", "Plants (Botany)"], ["590", "Animals (Zoology)"],
  ["600", "Technology"], ["610", "Medicine & health"], ["620", "Engineering"], ["630", "Agriculture"], ["640", "Home & family management"], ["650", "Management & public relations"], ["660", "Chemical engineering"], ["670", "Manufacturing"], ["680", "Manufacture for specific uses"], ["690", "Building & construction"],
  ["700", "Arts"], ["710", "Landscaping & area planning"], ["720", "Architecture"], ["730", "Sculpture, ceramics & metalwork"], ["740", "Drawing & decorative arts"], ["750", "Painting"], ["760", "Printmaking & prints"], ["770", "Photography, computer art, film, video"], ["780", "Music"], ["790", "Sports, games & entertainment"],
  ["800", "Literature, rhetoric & criticism"], ["810", "American literature in English"], ["820", "English & Old English literatures"], ["830", "German & related literatures"], ["840", "French & related literatures"], ["850", "Italian, Romanian & related literatures"], ["860", "Spanish & Portuguese literatures"], ["870", "Latin & Italic literatures"], ["880", "Classical & modern Greek literatures"], ["890", "Other literatures"],
  ["900", "History & geography"], ["910", "Geography & travel"], ["920", "Biography & genealogy"], ["930", "History of ancient world"], ["940", "History of Europe"], ["950", "History of Asia"], ["960", "History of Africa"], ["970", "History of North America"], ["980", "History of South America"], ["990", "History of other areas"],
] as const;

export const LIBRARY_CATEGORIES = DEWEY_SECOND_SUMMARY.map(([code, name]) => ({
  code,
  name: `${code} ${name}`,
  slug: `dewey-${code}`,
})) as ReadonlyArray<{ code: string; name: string; slug: string }>;

export function sanitizeClassificationInput(value: string): string {
  const [integerPart = "", decimalPart] = value.replace(/[^\d.]/g, "").split(".");
  const integer = integerPart.slice(0, 3);
  const decimal = decimalPart?.slice(0, 5);
  return decimalPart !== undefined ? `${integer}.${decimal || ""}` : integer;
}

export function normalizeClassificationNumber(value: string): string | null {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,5}))?$/);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 0 && number <= 999
    ? `${String(number).padStart(3, "0")}${match[2] ? `.${match[2]}` : ""}`
    : null;
}

export function categoryForClassification(value: string) {
  if (!/^\d{3}(?:\.\d{0,5})?$/.test(value)) return null;
  const normalized = normalizeClassificationNumber(value);
  if (!normalized) return null;
  const code = normalized.slice(0, 3);
  return LIBRARY_CATEGORIES.find((category) => category.code === code) || null;
}
