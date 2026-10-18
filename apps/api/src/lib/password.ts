import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash fijo para comparar cuando el usuario no existe: así el login tarda lo mismo
 * exista o no el correo (evita enumerar cuentas por tiempo de respuesta).
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.Jb0y5bZ5sPQ5hNQe5cQ2bq3m0pW2";
