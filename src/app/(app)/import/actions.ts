"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { normalizePhone, safeTrim, isValidEmail } from "@/lib/utils";
import { SYSTEM_FIELDS, type SystemFieldKey } from "@/lib/csv-mapping";
import type { CompanySource, Prisma } from "@prisma/client";

// Step 1 — upload the CSV and stage a parsed preview with guessed mapping.
export async function uploadCsv(formData: FormData) {
  const session = await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  const name = file.name || "import.csv";
  const text = await file.text();

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }
  const rows = parsed.data;
  const headers = parsed.meta.fields ?? [];

  // Create import stub; default empty mapping (user fills in on next step).
  const imp = await prisma.csvImport.create({
    data: {
      filename: name,
      importedByUserId: session.user.id,
      rowsTotal: rows.length,
      fieldMapping: { headers, mapping: {} } as unknown as Prisma.InputJsonValue,
    },
  });

  // Stash raw rows (up to 20,000 — chunk inserts to keep under payload limits).
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((row, j) => ({
      importId: imp.id,
      rowIndex: i + j,
      mappedData: {} as Prisma.InputJsonValue,
      rawData: row as unknown as Prisma.InputJsonValue,
    }));
    await prisma.csvImportStagingRow.createMany({ data: chunk });
  }

  redirect(`/import/${imp.id}/map`);
}

// Step 2 — save field mapping, then apply it to staged rows + detect duplicates.
export async function applyMapping(formData: FormData) {
  const session = await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const importId = String(formData.get("importId") ?? "");
  if (!importId) throw new Error("Missing importId");

  const imp = await prisma.csvImport.findUnique({ where: { id: importId } });
  if (!imp) throw new Error("Import not found");
  if (imp.status !== "STAGED") throw new Error("Import already finalized");

  // Build mapping from form fields "map__<csv column>"
  const mapping: Record<string, SystemFieldKey | ""> = {};
  const meta = imp.fieldMapping as { headers: string[]; mapping: Record<string, SystemFieldKey | ""> };
  for (const h of meta.headers) {
    const v = String(formData.get(`map__${h}`) ?? "");
    if (SYSTEM_FIELDS.some((f) => f.key === v)) mapping[h] = v as SystemFieldKey;
    else mapping[h] = "";
  }
  // Require companyName
  const hasNameMapped = Object.values(mapping).includes("companyName");
  if (!hasNameMapped) throw new Error("You must map one column to Company name");

  // Apply mapping to each staged row. Detect duplicates concurrently.
  // (Processes in chunks.)
  const allRows = await prisma.csvImportStagingRow.findMany({
    where: { importId },
    orderBy: { rowIndex: "asc" },
  });

  let duplicateCount = 0;
  const CHUNK = 200;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const batch = allRows.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (row) => {
        const raw = row.rawData as Record<string, string>;
        const mapped = applyMappingToRow(raw, mapping);
        const dup = await detectDuplicate(mapped);
        if (dup) duplicateCount++;
        await prisma.csvImportStagingRow.update({
          where: { id: row.id },
          data: {
            mappedData: mapped as unknown as Prisma.InputJsonValue,
            isDuplicate: !!dup,
            matchReason: dup?.reason ?? null,
            matchCompanyId: dup?.companyId ?? null,
            action: dup ? "MERGE_WITH_EXISTING" : "IMPORT_NEW",
          },
        });
      })
    );
  }

  await prisma.csvImport.update({
    where: { id: importId },
    data: {
      fieldMapping: { headers: meta.headers, mapping } as unknown as Prisma.InputJsonValue,
      duplicatesFound: duplicateCount,
    },
  });

  if (duplicateCount > 0) {
    redirect(`/import/${importId}/review`);
  } else {
    redirect(`/import/${importId}/finalize`);
  }
}

// Step 3 — user resolves each duplicate (import new / merge / skip)
export async function setRowAction(formData: FormData) {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const rowId = String(formData.get("rowId") ?? "");
  const action = String(formData.get("action") ?? "IMPORT_NEW") as
    | "IMPORT_NEW"
    | "MERGE_WITH_EXISTING"
    | "SKIP";
  const row = await prisma.csvImportStagingRow.findUnique({
    where: { id: rowId },
  });
  if (!row) throw new Error("Not found");
  await prisma.csvImportStagingRow.update({
    where: { id: rowId },
    data: { action },
  });
  revalidatePath(`/import/${row.importId}/review`);
}

// Step 4 — finalize: actually create/update the companies.
export async function finalizeImport(formData: FormData) {
  const session = await requireRole(["OWNER", "LIMITED_ADMIN"]);
  const importId = String(formData.get("importId") ?? "");
  if (!importId) throw new Error("Missing importId");

  const imp = await prisma.csvImport.findUnique({ where: { id: importId } });
  if (!imp) throw new Error("Import not found");
  if (imp.status !== "STAGED") throw new Error("Already finalized");

  const rows = await prisma.csvImportStagingRow.findMany({
    where: { importId },
  });

  let imported = 0;
  let skipped = 0;
  const CHUNK = 100;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (row) => {
        const data = row.mappedData as Partial<MappedCompany>;
        if (!data.companyName) {
          skipped++;
          return;
        }
        if (row.action === "SKIP") {
          skipped++;
          return;
        }
        if (row.action === "MERGE_WITH_EXISTING" && row.matchCompanyId) {
          await prisma.company.update({
            where: { id: row.matchCompanyId },
            data: {
              phoneNumber: data.phoneNumber ?? undefined,
              email: data.email ?? undefined,
              website: data.website ?? undefined,
              addressStreet: data.addressStreet ?? undefined,
              addressCity: data.addressCity ?? undefined,
              addressState: data.addressState ?? undefined,
              addressZip: data.addressZip ?? undefined,
              latitude: data.latitude ?? undefined,
              longitude: data.longitude ?? undefined,
              googleRating: data.googleRating ?? undefined,
              googleReviewCount: data.googleReviewCount ?? undefined,
              yearEstablished: data.yearEstablished ?? undefined,
              employeeCount: data.employeeCount ?? undefined,
            },
          });
          imported++;
          return;
        }
        // IMPORT_NEW
        await prisma.company.create({
          data: {
            companyName: data.companyName,
            phoneNumber: data.phoneNumber ?? null,
            email: data.email ?? null,
            website: data.website ?? null,
            addressStreet: data.addressStreet ?? null,
            addressCity: data.addressCity ?? null,
            addressState: data.addressState ?? null,
            addressZip: data.addressZip ?? null,
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            googleRating: data.googleRating ?? null,
            googleReviewCount: data.googleReviewCount ?? null,
            yearEstablished: data.yearEstablished ?? null,
            employeeCount: data.employeeCount ?? null,
            notes: data.notes ?? null,
            source: "CSV_IMPORT" as CompanySource,
            createdByUserId: session.user.id,
          },
        });
        imported++;
      })
    );
  }

  await prisma.csvImport.update({
    where: { id: importId },
    data: {
      rowsImported: imported,
      rowsSkipped: skipped,
      status: "FINALIZED",
      finalizedAt: new Date(),
    },
  });
  await recordAudit({
    userId: session.user.id,
    actionType: "CSV_IMPORT",
    entityType: "CSV_IMPORT",
    entityId: importId,
    newValue: {
      filename: imp.filename,
      rowsImported: imported,
      rowsSkipped: skipped,
      duplicatesFound: imp.duplicatesFound,
    },
  });
  revalidatePath("/companies");
  redirect(`/companies`);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface MappedCompany {
  companyName: string;
  phoneNumber: string | null;
  email: string | null;
  website: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  latitude: number | null;
  longitude: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  yearEstablished: number | null;
  employeeCount: number | null;
  notes: string | null;
}

function applyMappingToRow(
  raw: Record<string, string>,
  mapping: Record<string, SystemFieldKey | "">
): Partial<MappedCompany> {
  const pick = (fieldKey: SystemFieldKey): string | null => {
    // find the csv header mapped to this field
    const col = Object.keys(mapping).find((k) => mapping[k] === fieldKey);
    if (!col) return null;
    return safeTrim(raw[col]);
  };

  const name = pick("companyName");
  if (!name) return {};

  const parseFloatOrNull = (s: string | null): number | null => {
    if (!s) return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  const parseIntOrNull = (s: string | null): number | null => {
    if (!s) return null;
    const n = parseInt(s, 10);
    return isFinite(n) ? n : null;
  };

  const email = pick("email");
  const cleanedEmail = email && isValidEmail(email) ? email.toLowerCase() : null;

  return {
    companyName: name,
    phoneNumber: normalizePhone(pick("phoneNumber") ?? ""),
    email: cleanedEmail,
    website: pick("website"),
    addressStreet: pick("addressStreet"),
    addressCity: pick("addressCity"),
    addressState: pick("addressState"),
    addressZip: pick("addressZip"),
    latitude: parseFloatOrNull(pick("latitude")),
    longitude: parseFloatOrNull(pick("longitude")),
    googleRating: parseFloatOrNull(pick("googleRating")),
    googleReviewCount: parseIntOrNull(pick("googleReviewCount")),
    yearEstablished: parseIntOrNull(pick("yearEstablished")),
    employeeCount: parseIntOrNull(pick("employeeCount")),
    notes: pick("notes"),
  };
}

async function detectDuplicate(data: Partial<MappedCompany>): Promise<{ companyId: string; reason: string } | null> {
  // Spec §9.16: duplicate if exact phone, exact email, or 100% identical name.
  const candidates: Array<{ reason: string; where: Prisma.CompanyWhereInput }> = [];
  if (data.phoneNumber) {
    candidates.push({ reason: "phone", where: { phoneNumber: data.phoneNumber, deletedAt: null } });
  }
  if (data.email) {
    candidates.push({ reason: "email", where: { email: data.email, deletedAt: null } });
  }
  if (data.companyName) {
    candidates.push({ reason: "exact_name", where: { companyName: data.companyName, deletedAt: null } });
  }
  for (const c of candidates) {
    const hit = await prisma.company.findFirst({ where: c.where, select: { id: true } });
    if (hit) return { companyId: hit.id, reason: c.reason };
  }
  return null;
}
