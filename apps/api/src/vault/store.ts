/**
 * Vault store: CRUD helpers for the per-user list of vaults plus the
 * "active vault" pointer in user_settings. All routes go through here so
 * the single-vault → multi-vault transition is centralized.
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";

export interface VaultRow {
  id: string;
  userId: string;
  provider: "github" | "notekit";
  owner: string;
  repo: string;
  branch: string;
  label: string | null;
  createdAt: Date;
}

function toApiVault(row: typeof schema.vaults.$inferSelect): VaultRow {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as "github" | "notekit",
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    label: row.label,
    createdAt: row.createdAt,
  };
}

export async function listVaultsForUser(userId: string): Promise<VaultRow[]> {
  const rows = await db
    .select()
    .from(schema.vaults)
    .where(eq(schema.vaults.userId, userId));
  return rows.map(toApiVault);
}

export async function getVaultById(
  userId: string,
  vaultId: string,
): Promise<VaultRow | null> {
  const row = await db.query.vaults.findFirst({
    where: and(
      eq(schema.vaults.id, vaultId),
      eq(schema.vaults.userId, userId),
    ),
  });
  return row ? toApiVault(row) : null;
}

export interface CreateVaultInput {
  userId: string;
  provider: "github" | "notekit";
  owner: string;
  repo: string;
  branch?: string;
  label?: string;
}

export async function createVault(input: CreateVaultInput): Promise<VaultRow> {
  // De-dupe: if this user already has a vault for this provider/owner/repo,
  // return it instead of creating a duplicate. The unique index would reject
  // anyway; this gives the API a friendlier shape.
  const existing = await db.query.vaults.findFirst({
    where: and(
      eq(schema.vaults.userId, input.userId),
      eq(schema.vaults.provider, input.provider),
      eq(schema.vaults.owner, input.owner),
      eq(schema.vaults.repo, input.repo),
    ),
  });
  if (existing) return toApiVault(existing);

  const id = `vlt_${nanoid(16)}`;
  const branch = input.branch ?? "main";
  const label = input.label ?? `${input.owner}/${input.repo}`;
  await db.insert(schema.vaults).values({
    id,
    userId: input.userId,
    provider: input.provider,
    owner: input.owner,
    repo: input.repo,
    branch,
    label,
  });
  const row = await db.query.vaults.findFirst({
    where: eq(schema.vaults.id, id),
  });
  return toApiVault(row!);
}

export async function renameVault(
  userId: string,
  vaultId: string,
  patch: { label?: string | null; branch?: string },
): Promise<VaultRow | null> {
  const existing = await getVaultById(userId, vaultId);
  if (!existing) return null;
  const updates: Partial<typeof schema.vaults.$inferInsert> = {};
  if (patch.label !== undefined) updates.label = patch.label;
  if (patch.branch !== undefined) updates.branch = patch.branch;
  if (Object.keys(updates).length === 0) return existing;
  await db.update(schema.vaults).set(updates).where(eq(schema.vaults.id, vaultId));
  return await getVaultById(userId, vaultId);
}

/**
 * Delete the vault row. Does NOT touch the underlying GitHub repo —
 * this only unregisters it from NoteKit. If the deleted vault was active,
 * the active pointer falls back to whichever vault remains (oldest first),
 * or null if none.
 */
export async function deleteVault(
  userId: string,
  vaultId: string,
): Promise<{ deleted: boolean; newActiveId: string | null }> {
  const existing = await getVaultById(userId, vaultId);
  if (!existing) return { deleted: false, newActiveId: null };

  await db.delete(schema.vaults).where(eq(schema.vaults.id, vaultId));

  // If this was the active vault, pick a new one (or clear).
  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  });
  if (settings?.activeVaultId === vaultId) {
    const remaining = await listVaultsForUser(userId);
    const fallback = remaining[0]?.id ?? null;
    await db
      .update(schema.userSettings)
      .set({ activeVaultId: fallback, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, userId));
    return { deleted: true, newActiveId: fallback };
  }
  return { deleted: true, newActiveId: settings?.activeVaultId ?? null };
}

export async function setActiveVault(
  userId: string,
  vaultId: string,
): Promise<VaultRow | null> {
  const vault = await getVaultById(userId, vaultId);
  if (!vault) return null;
  const existing = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  });
  const now = new Date();
  if (existing) {
    await db
      .update(schema.userSettings)
      .set({ activeVaultId: vaultId, updatedAt: now })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      activeVaultId: vaultId,
      updatedAt: now,
    });
  }
  return vault;
}

/**
 * Resolve the user's active vault. Returns null when no vaults exist or the
 * active pointer is null. All routes that need "the vault" go through here.
 */
export async function getActiveVault(
  userId: string,
): Promise<VaultRow | null> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  });
  if (!settings?.activeVaultId) return null;
  return getVaultById(userId, settings.activeVaultId);
}
