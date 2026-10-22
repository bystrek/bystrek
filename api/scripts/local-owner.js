"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localOwnerNeedsPassword = localOwnerNeedsPassword;
exports.seedLocalOwner = seedLocalOwner;
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = require("better-auth/crypto");
const schema_1 = require("./schema");
async function localOwnerNeedsPassword(db, email) {
    const [owner] = await db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email));
    if (owner && (owner.status !== 'active' || owner.role !== 'admin')) {
        throw new Error('Existing local owner is not an active admin');
    }
    if (!owner)
        return true;
    const [account] = await db
        .select({ password: schema_1.accounts.password })
        .from(schema_1.accounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accounts.userId, owner.id), (0, drizzle_orm_1.eq)(schema_1.accounts.providerId, 'credential')));
    return !account?.password;
}
async function seedLocalOwner(db, email, name, password) {
    if (password.length < 8 || password.length > 128) {
        throw new Error('Local password must be 8-128 characters');
    }
    const hashedPassword = await (0, crypto_1.hashPassword)(password);
    await db.transaction(async (tx) => {
        const [owner] = await tx.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email));
        if (owner && (owner.status !== 'active' || owner.role !== 'admin')) {
            throw new Error('Existing local owner is not an active admin');
        }
        const [account] = owner
            ? await tx
                .select({ id: schema_1.accounts.id, password: schema_1.accounts.password })
                .from(schema_1.accounts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.accounts.userId, owner.id), (0, drizzle_orm_1.eq)(schema_1.accounts.providerId, 'credential')))
            : [];
        if (account?.password)
            return;
        const userId = owner
            ? owner.id
            : (await tx
                .insert(schema_1.users)
                .values({ email, name, emailVerified: true, status: 'active', role: 'admin' })
                .returning({ id: schema_1.users.id }))[0].id;
        if (account) {
            await tx
                .update(schema_1.accounts)
                .set({ password: hashedPassword })
                .where((0, drizzle_orm_1.eq)(schema_1.accounts.id, account.id));
        }
        else {
            await tx.insert(schema_1.accounts).values({
                userId,
                issuer: 'local:credential',
                providerId: 'credential',
                accountId: userId,
                password: hashedPassword,
            });
        }
    });
}
//# sourceMappingURL=local-owner.js.map