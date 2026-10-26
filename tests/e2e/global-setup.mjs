import { provisionTestAccounts } from "./support/database-fixture.mjs";

export default async function globalSetup() {
  await provisionTestAccounts();
}
