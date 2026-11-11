import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE, type Tx } from '../db/drizzle.provider';
import { categories } from '../db/schema';
import { UnknownCategoryError } from './log.errors';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
}

const columns = {
  id: categories.id,
  name: categories.name,
  description: categories.description,
  parentId: categories.parentId,
};

// A user's own categories. Methods that take `db` run inside the caller's transaction.
@Injectable()
export class LogCategoriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  list(userId: string): Promise<Category[]> {
    return this.db
      .select(columns)
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.name));
  }

  // Throws for the first id that isn't one of the user's categories.
  async assertOwned(userId: string, ids: string[], db: Db | Tx = this.db): Promise<void> {
    const wanted = [...new Set(ids)];
    if (!wanted.length) return;
    const owned = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), inArray(categories.id, wanted)));
    const found = new Set(owned.map((row) => row.id));
    const missing = wanted.find((id) => !found.has(id));
    if (missing) throw new UnknownCategoryError(missing);
  }

  // Creates the confirmed new categories and returns every one's id by name. A name the user
  // already has (e.g. added from another tab meanwhile) resolves to the existing category.
  async create(
    userId: string,
    proposed: { name: string; description?: string | null }[],
    db: Db | Tx = this.db,
  ): Promise<Map<string, string>> {
    if (!proposed.length) return new Map();
    await db
      .insert(categories)
      .values(proposed.map((c) => ({ userId, name: c.name, description: c.description ?? null })))
      .onConflictDoNothing({ target: [categories.userId, categories.name] });
    const rows = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          inArray(
            categories.name,
            proposed.map((c) => c.name),
          ),
        ),
      );
    return new Map(rows.map((row) => [row.name, row.id]));
  }
}
