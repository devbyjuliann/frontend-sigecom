import { describe, expect, it } from "vitest";
import { canSeeNavigationItem } from "./app-shell.jsx";

const reportNavigation = {
  permission: "reports.read",
  requiredPermissions: ["reports.read", "sales.read", "warehouses.read"],
  allowedRoles: ["administrator", "auditor"],
};

describe("Reportes navigation visibility", () => {
  it.each(["administrator", "auditor"])(
    "shows the item to %s with all permissions",
    (role) => {
      expect(
        canSeeNavigationItem(reportNavigation, {
          user: { role },
          permissions: reportNavigation.requiredPermissions,
        }),
      ).toBe(true);
    },
  );

  it.each(["seller", "warehouse"])("hides the item from %s", (role) => {
    expect(
      canSeeNavigationItem(reportNavigation, {
        user: { role },
        permissions: reportNavigation.requiredPermissions,
      }),
    ).toBe(false);
  });

  it("hides the item when any permission is missing", () => {
    expect(
      canSeeNavigationItem(reportNavigation, {
        user: { role: "administrator" },
        permissions: ["reports.read", "sales.read"],
      }),
    ).toBe(false);
  });
});
