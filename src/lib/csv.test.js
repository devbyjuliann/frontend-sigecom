import { describe, expect, it } from "vitest";
import { createCsv } from "./csv.js";

describe("createCsv", () => {
  it("writes a UTF-8 BOM, quotes separators and neutralizes spreadsheet formulas", () => {
    expect(
      createCsv(
        [
          {
            name: "Cliente, S.A.S.",
            note: '=HYPERLINK("https://invalid")',
            amount: -12.5,
          },
        ],
        [
          { key: "name", label: "Nombre" },
          { key: "note", label: "Nota" },
          { key: "amount", label: "Valor", type: "number" },
        ],
      ),
    ).toBe(
      '\uFEFFNombre,Nota,Valor\r\n"Cliente, S.A.S.","\'=HYPERLINK(""https://invalid"")",-12.5\r\n',
    );
  });

  it("emits empty fields for nullish values and safely quotes line breaks", () => {
    expect(
      createCsv(
        [{ value: "Línea 1\nLínea 2", missing: null }],
        [
          { key: "value", label: "Detalle" },
          { key: "missing", label: "No disponible" },
        ],
      ),
    ).toBe('\uFEFFDetalle,No disponible\r\n"Línea 1\nLínea 2",\r\n');
  });
});
