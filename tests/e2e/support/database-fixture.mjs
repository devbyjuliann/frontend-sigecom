import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(
  currentDirectory,
  "../../../../backend-sigecom",
);
const requireBackend = createRequire(join(backendDirectory, "package.json"));
const bcrypt = requireBackend("bcrypt");
const { createDatabasePool } = await import(
  pathToFileURL(join(backendDirectory, "src/db/pool.js"))
);

export const testAccounts = [
  {
    email: "frontend-e2e@sigecom.invalid",
    name: "Vendedor de pruebas",
    role: "seller",
    passwordChangeRequired: false,
  },
  {
    email: "frontend-e2e-forced@sigecom.invalid",
    name: "Cuenta con cambio obligatorio",
    role: "seller",
    passwordChangeRequired: true,
  },
  {
    email: "frontend-e2e-profile@sigecom.invalid",
    name: "Cuenta de perfil de pruebas",
    role: "seller",
    passwordChangeRequired: false,
  },
];

export async function provisionTestAccounts() {
  const password = randomBytes(32).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const pool = createDatabasePool("test");

  try {
    const [[database]] = await pool.query("SELECT DATABASE() AS name");
    if (database.name !== "sigecom_test") {
      throw new Error("Las pruebas de interfaz solo pueden usar sigecom_test.");
    }

    for (const account of testAccounts) {
      const [[role]] = await pool.execute(
        "SELECT id FROM roles WHERE code = ?",
        [account.role],
      );
      if (!role)
        throw new Error(`No existe el rol de pruebas ${account.role}.`);

      const [[existing]] = await pool.execute(
        "SELECT id FROM users WHERE email = ?",
        [account.email],
      );
      if (existing) {
        await pool.execute(
          `UPDATE users SET role_id = ?, display_name = ?, password_hash = ?,
             is_active = 1, password_change_required = ? WHERE id = ?`,
          [
            role.id,
            account.name,
            passwordHash,
            Number(account.passwordChangeRequired),
            existing.id,
          ],
        );
        await pool.execute(
          `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3)
           WHERE user_id = ? AND revoked_at IS NULL`,
          [existing.id],
        );
      } else {
        await pool.execute(
          `INSERT INTO users
             (role_id, email, display_name, password_hash, is_active, password_change_required)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [
            role.id,
            account.email,
            account.name,
            passwordHash,
            Number(account.passwordChangeRequired),
          ],
        );
      }
    }
  } finally {
    await pool.end();
  }

  process.env.SIGECOM_E2E_PASSWORD = password;
}

export async function deactivateTestAccounts() {
  const pool = createDatabasePool("test");
  try {
    for (const { email } of testAccounts) {
      await pool.execute(
        `UPDATE user_sessions AS s
         JOIN users AS u ON u.id = s.user_id
         SET s.revoked_at = UTC_TIMESTAMP(3)
         WHERE u.email = ? AND s.revoked_at IS NULL`,
        [email],
      );
      await pool.execute("UPDATE users SET is_active = 0 WHERE email = ?", [
        email,
      ]);
    }
  } finally {
    await pool.end();
  }
}
