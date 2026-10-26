import { deactivateTestAccounts } from "./support/database-fixture.mjs";

export default async function globalTeardown() {
  await deactivateTestAccounts();
}
