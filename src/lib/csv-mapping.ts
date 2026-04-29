// CSV field-mapping + Outscraper heuristics (spec §9.16).
// Maps raw CSV headers to Company model fields. User can override in UI.
export const SYSTEM_FIELDS = [
  { key: "companyName", label: "Company name", required: true },
  { key: "phoneNumber", label: "Phone number", required: false },
  { key: "email", label: "Email", required: false },
  { key: "website", label: "Website", required: false },
  { key: "addressStreet", label: "Street address", required: false },
  { key: "addressCity", label: "City", required: false },
  { key: "addressState", label: "State", required: false },
  { key: "addressZip", label: "Zip", required: false },
  { key: "googleRating", label: "Google rating", required: false },
  { key: "googleReviewCount", label: "Google review count", required: false },
  { key: "latitude", label: "Latitude", required: false },
  { key: "longitude", label: "Longitude", required: false },
  { key: "yearEstablished", label: "Year established", required: false },
  { key: "employeeCount", label: "Employee count", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

export type SystemFieldKey = (typeof SYSTEM_FIELDS)[number]["key"];

// Guess mapping from CSV header. Tuned for Outscraper output.
// If multiple headers would map to the same field, only the highest-priority one wins.
export function guessMapping(headers: string[]): Record<string, SystemFieldKey | ""> {
  // Priority-ordered claims: first claim on a system field wins.
  const PRIORITY: Array<{ field: SystemFieldKey; keys: string[] }> = [
    { field: "companyName", keys: ["name", "business_name", "company_name", "company"] },
    { field: "phoneNumber", keys: ["phone", "phone_number", "telephone"] },
    // Outscraper stores actual emails in email_1 / email_2 / ... ; `name_for_emails`
    // is a normalized business name used for deliverability lookups (NOT an email).
    { field: "email", keys: ["email", "email_1", "email_address"] },
    { field: "website", keys: ["site", "website", "url"] },
    { field: "addressStreet", keys: ["street", "address1", "address", "address_line_1"] },
    { field: "addressCity", keys: ["city"] },
    // `us_state` first because Outscraper populates it reliably; `state` often empty.
    { field: "addressState", keys: ["us_state", "state"] },
    { field: "addressZip", keys: ["postal_code", "zip", "zipcode", "zip_code", "postal"] },
    { field: "googleRating", keys: ["rating", "google_rating"] },
    { field: "googleReviewCount", keys: ["reviews", "review_count", "google_review_count", "reviews_count"] },
    { field: "latitude", keys: ["latitude", "lat"] },
    { field: "longitude", keys: ["longitude", "lon", "lng"] },
    { field: "yearEstablished", keys: ["year_established", "year_founded", "founded"] },
    { field: "employeeCount", keys: ["employee_count", "employees"] },
  ];

  const claimed = new Set<SystemFieldKey>();
  const map: Record<string, SystemFieldKey | ""> = {};
  // Initialize every header as unmapped
  for (const h of headers) map[h] = "";
  // Make a lookup: lowercased key -> original header
  const lower = new Map<string, string>();
  for (const h of headers) lower.set(h.trim().toLowerCase(), h);

  for (const { field, keys } of PRIORITY) {
    if (claimed.has(field)) continue;
    for (const candidate of keys) {
      const h = lower.get(candidate);
      if (h && map[h] === "") {
        map[h] = field;
        claimed.add(field);
        break;
      }
    }
  }
  return map;
}
