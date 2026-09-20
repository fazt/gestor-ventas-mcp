import { createApp } from "./app.js";
import { env } from "./lib/env.js";

const app = createApp();

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${env.PORT}`);
  console.log(`OpenAPI docs: http://localhost:${env.PORT}/api/docs`);
  console.log(`MCP endpoint: http://localhost:${env.PORT}/mcp`);
});
