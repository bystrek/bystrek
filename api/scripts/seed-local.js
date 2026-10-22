"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
const schema = __importStar(require("../src/db/schema"));
const local_owner_1 = require("./local-owner");
async function main() {
    const email = process.env.SEED_OWNER_EMAIL;
    const name = process.env.SEED_OWNER_NAME;
    const password = process.env.SEED_OWNER_PASSWORD;
    const databaseUrl = process.env.DATABASE_URL;
    if (!email || !name || !password || !databaseUrl) {
        throw new Error('SEED_OWNER_EMAIL, SEED_OWNER_NAME, SEED_OWNER_PASSWORD and DATABASE_URL are required');
    }
    const client = (0, postgres_1.default)(databaseUrl);
    const db = (0, postgres_js_1.drizzle)(client, { schema });
    try {
        if (await (0, local_owner_1.localOwnerNeedsPassword)(db, email)) {
            await (0, local_owner_1.seedLocalOwner)(db, email, name, password);
            console.log(`Local owner ${email} ready`);
        }
        else {
            console.log(`Local owner ${email} already has a password`);
        }
    }
    finally {
        await client.end();
    }
}
void main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
//# sourceMappingURL=seed-local.js.map