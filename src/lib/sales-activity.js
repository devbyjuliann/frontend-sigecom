const timeZone = "America/Bogota";
const dayMilliseconds = 86_400_000;

function datePartsInBogota(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function civilDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

function dateText(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function defaultSalesActivityPeriod(now = new Date()) {
  const { year, month, day } = datePartsInBogota(now);
  const end = new Date(0);
  end.setUTCFullYear(year, month - 1, day);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 29 * dayMilliseconds);
  return { dateFrom: dateText(start), dateTo: dateText(end) };
}

export function validateSalesActivityFilters({ dateFrom, dateTo }) {
  const from = civilDate(dateFrom);
  const to = civilDate(dateTo);
  if (!from || !to || from > to) return false;
  return (to.getTime() - from.getTime()) / dayMilliseconds <= 91;
}

const integerFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});
const copIntegerFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatExactCop(value) {
  if (
    typeof value !== "string" ||
    !/^-?(0|[1-9]\d{0,63})\.\d{2}$/.test(value)
  ) {
    return "Importe no disponible";
  }
  const [whole, cents] = value.split(".");
  const integer = BigInt(whole);
  const formattedWhole = copIntegerFormatter.format(integer);
  const negativeSubunit = value.startsWith("-") && integer === 0n;
  return `${negativeSubunit ? "-" : ""}${formattedWhole},${cents}`;
}

export function formatExactQuantity(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,63})$/.test(value)) {
    return null;
  }
  return integerFormatter.format(BigInt(value));
}

export function formatBogotaDateTime(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
