import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootPackage = require("../../../package.json");

export function getRootPackageVersion() {
  return rootPackage.version;
}
