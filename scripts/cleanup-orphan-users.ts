/**
 * One-shot cleanup: remove `users` rows that have no auth_account and own no
 * sessions. Useful after a failed signup left an orphan row that blocks
 * re-registering with the same email.
 */
import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const res = await db.execute(sql`
    DELETE FROM users
    WHERE id NOT IN (SELECT user_id FROM auth_accounts)
      AND id NOT IN (SELECT created_by FROM sessions WHERE created_by IS NOT NULL)
    RETURNING id, email
  `);
  console.log("Deleted orphan users:", res);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
