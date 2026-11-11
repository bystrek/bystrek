import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE, type Tx } from '../db/drizzle.provider';
import { diaryCategories } from '../db/schema';
import { UnknownDiaryCategoryError } from './diary.errors';

export interface DiaryCategory {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
}

const columns = {
  id: diaryCategories.id,
  name: diaryCategories.name,
  description: diaryCategories.description,
  parentId: diaryCategories.parentId,
};

// A user's own diaryCategories. Methods that take `db` run inside the caller's transaction.
@Injectable()
export class DiaryCategoriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  list(userId: string): Promise<DiaryCategory[]> {
    return this.db
      .select(columns)
      .from(diaryCategories)
      .where(eq(diaryCategories.userId, userId))
      .orderBy(asc(diaryCategories.name));
  }

  // Throws for the first id that isn't one of the user's diaryCategories.
  async assertOwned(userId: string, ids: string[], db: Db | Tx = this.db): Promise<void> {
    const wanted = [...new Set(ids)];
    if (!wanted.length) return;
    const owned = await db
      .select({ id: diaryCategories.id })
      .from(diaryCategories)
      .where(and(eq(diaryCategories.userId, userId), inArray(diaryCategories.id, wanted)));
    const found = new Set(owned.map((row) => row.id));
    const missing = wanted.find((id) => !found.has(id));
    if (missing) throw new UnknownDiaryCategoryError(missing);
  }

  // Creates the confirmed new diaryCategories and returns every one's id by name. A name the user
  // already has (e.g. added from another tab meanwhile) resolves to the existing category.
  async create(
    userId: string,
    proposed: { name: string; description?: string | null }[],
    db: Db | Tx = this.db,
  ): Promise<Map<string, string>> {
    if (!proposed.length) return new Map();
    await db
      .insert(diaryCategories)
      .values(proposed.map((c) => ({ userId, name: c.name, description: c.description ?? null })))
      .onConflictDoNothing({ target: [diaryCategories.userId, diaryCategories.name] });
    const rows = await db
      .select({ id: diaryCategories.id, name: diaryCategories.name })
      .from(diaryCategories)
      .where(
        and(
          eq(diaryCategories.userId, userId),
          inArray(
            diaryCategories.name,
            proposed.map((c) => c.name),
          ),
        ),
      );
    return new Map(rows.map((row) => [row.name, row.id]));
  }
}
