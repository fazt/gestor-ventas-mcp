import { defineConfig } from "vitest/config";

// Base de datos de test separada (misma instancia de Postgres del docker-compose de dev).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5499/gestor_ventas_test";

// También en el proceso principal: el globalSetup migra esta base antes de la suite.
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Los tests de integración comparten la base: uno detrás de otro.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      PORT: "4070",
      PUBLIC_URL: "http://127.0.0.1:4070",
      WEB_ORIGIN: "http://localhost:5239",
      STORE_TIMEZONE: "America/Lima",
      STORE_TAX_RATE: "0",
      RATE_LIMIT_ENABLED: "true",
      LOGIN_MAX_FAILED_PER_15M: "5",
      MCP_MAX_REQUESTS_PER_MIN: "1000",
    },
  },
});
