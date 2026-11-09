import {
  defaultSalesActivityPeriod,
  validateSalesActivityFilters,
} from "./sales-activity.js";

export const defaultInventoryActivityPeriod = defaultSalesActivityPeriod;
export const validateInventoryActivityFilters = validateSalesActivityFilters;

export const inventoryOperationLabels = Object.freeze({
  initial_stock: "Existencia inicial",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
  transfer: "Traslado entre bodegas",
  purchase_receipt: "Recepción de compra",
  supplier_return: "Devolución a proveedor",
  sale_issue: "Salida por venta",
  sale_reversal: "Reversión de venta",
  customer_return: "Devolución de cliente",
});

export const inventoryStatusLabels = Object.freeze({
  all: "Todos los estados",
  positive: "Con existencias",
  depleted: "Agotado",
  below_minimum: "Bajo mínimo",
  inconsistent: "Inconsistente",
  insufficient: "Verificación insuficiente",
});
