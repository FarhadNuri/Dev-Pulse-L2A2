import crypto from "crypto";

/**
 * Converts a string into a clean, URL-friendly slug.
 * - Lowercase
 * - Special characters replaced with dashes
 * - Trimmed of leading/trailing dashes
 */
export function generateSlug(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/g, "-")     // replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, "");        // trim leading and trailing hyphens

  return base || "org";
}

/**
 * Appends a short random alphanumeric suffix to avoid slug collisions.
 */
export function appendRandomSuffix(slug: string): string {
  const suffix = crypto.randomBytes(3).toString("hex"); // 6 chars hex
  return `${slug}-${suffix}`;
}

