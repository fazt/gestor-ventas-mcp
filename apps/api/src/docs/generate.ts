import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openApiDocument } from "./openapi.js";

const outFile = resolve(process.cwd(), "openapi.json");
writeFileSync(outFile, `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");
console.log(`Wrote ${outFile}`);
