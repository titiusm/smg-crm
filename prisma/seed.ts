// Seed: owner, two sales reps, standard line item menu, default global settings.
// Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const LINE_ITEM_SEEDS = [
  {
    itemName: "Panel Detach & Reset",
    defaultUnitPrice: 258.0,
    unitType: "per panel",
    description: "Base rate for removing and reinstalling a solar panel.",
  },
  {
    itemName: "Mounting Bracket D&R",
    defaultUnitPrice: 31.0,
    unitType: "per panel",
    description: "Removal and reinstallation of mounting brackets.",
  },
  {
    itemName: "Electrician Hours",
    defaultUnitPrice: 150.0,
    unitType: "per hour",
    description: "Licensed electrician labor (per hour).",
  },
  {
    itemName: "Steep Pitch Increase",
    defaultUnitPrice: 50.0,
    unitType: "per panel",
    description: "Upcharge for steep-pitch roofs.",
  },
  {
    itemName: "High Roof Increase",
    defaultUnitPrice: 50.0,
    unitType: "per panel",
    description: "Upcharge for high roofs (multi-story or tall elevation).",
  },
  {
    itemName: "Conduit Removal & Reinstallation",
    defaultUnitPrice: 500.0,
    unitType: "flat fee",
    description: "Remove and reinstall conduit as needed.",
  },
  {
    itemName: "Conduit Mounting Bracket Removal & Replacement",
    defaultUnitPrice: 250.0,
    unitType: "flat fee",
    description: "Remove and replace conduit mounting brackets.",
  },
  {
    itemName: "Junction Box Detach & Reset",
    defaultUnitPrice: 175.0,
    unitType: "per unit",
    description: "Detach and reset junction boxes.",
  },
  {
    itemName: "Critter Guard Removal & Replacement",
    defaultUnitPrice: 350.0,
    unitType: "flat fee",
    description: "Remove and replace critter guard around the array.",
  },
];

const GLOBAL_SETTING_SEEDS: Array<{ key: string; value: unknown }> = [
  { key: "company_logo_path", value: "" },
  { key: "license_number", value: "" },
  { key: "default_email_from_name", value: "The Solar Maintenance Guys" },
  { key: "default_email_from_email", value: "" },
  {
    key: "estimate_terms_text",
    value:
      "Payment due within 24 hours of panel detach. Estimate valid for 30 days. Pricing is subject to change if site conditions differ materially from those described.",
  },
  { key: "daily_campaign_sending_limit", value: 50 },
  { key: "company_physical_address", value: "" }, // required for CAN-SPAM
  { key: "follow_up_interval_days", value: 14 },
  { key: "dormant_threshold_days", value: 90 },
  { key: "rep_inactive_threshold_days", value: 2 },
  { key: "high_value_review_threshold", value: 100 },
  { key: "two_party_consent_required", value: false }, // toggleable per spec §7
];

async function upsertUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "SALES_REP";
  password: string;
}) {
  const hashedPassword = await bcrypt.hash(input.password, 10);
  return prisma.user.upsert({
    where: { email: input.email.toLowerCase() },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      isActive: true,
      // Do NOT overwrite password on re-seed — user may have changed it.
    },
    create: {
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      hashedPassword,
      isActive: true,
    },
  });
}

async function main() {
  console.log("Seeding users...");
  const owner = await upsertUser({
    email: process.env.SEED_OWNER_EMAIL ?? "titius@solarmaintenanceguys.com",
    firstName: process.env.SEED_OWNER_FIRST_NAME ?? "Titius",
    lastName: process.env.SEED_OWNER_LAST_NAME ?? "McLaughlin",
    role: "OWNER",
    password: process.env.SEED_OWNER_PASSWORD ?? "ChangeMeOnFirstLogin!",
  });
  console.log(`  Owner: ${owner.email}`);

  const rep1 = await upsertUser({
    email: process.env.SEED_REP1_EMAIL ?? "matthew@somaguys.com",
    firstName: process.env.SEED_REP1_FIRST_NAME ?? "Matthew",
    lastName: process.env.SEED_REP1_LAST_NAME ?? "Gaglione",
    role: "SALES_REP",
    password: process.env.SEED_REP1_PASSWORD ?? "ChangeMeOnFirstLogin!",
  });
  console.log(`  Rep 1: ${rep1.email}`);

  const rep2 = await upsertUser({
    email: process.env.SEED_REP2_EMAIL ?? "peter@solarmaintenanceguys.com",
    firstName: process.env.SEED_REP2_FIRST_NAME ?? "Peter",
    lastName: process.env.SEED_REP2_LAST_NAME ?? "Kim",
    role: "SALES_REP",
    password: process.env.SEED_REP2_PASSWORD ?? "ChangeMeOnFirstLogin!",
  });
  console.log(`  Rep 2: ${rep2.email}`);

  console.log("Seeding standard line item menu...");
  for (const item of LINE_ITEM_SEEDS) {
    await prisma.lineItemMenu.upsert({
      where: { itemName: item.itemName },
      update: {}, // don't overwrite owner-edited prices
      create: item,
    });
  }
  console.log(`  ${LINE_ITEM_SEEDS.length} line items ready.`);

  console.log("Seeding global settings...");
  for (const setting of GLOBAL_SETTING_SEEDS) {
    await prisma.globalSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as object },
    });
  }
  console.log(`  ${GLOBAL_SETTING_SEEDS.length} settings ready.`);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
