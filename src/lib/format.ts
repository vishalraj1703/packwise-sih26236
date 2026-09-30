export const inr = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;
export const inr2 = (x: number) => `₹${x.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const days = (d: number) => (!Number.isFinite(d) || d >= 1e5 ? "no limit reached" : d > 3650 ? "> 10 years" : `${Math.round(d)} days`);
export const dateStr = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–");
export const dateTimeStr = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "–";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e5) return x.toExponential(1);
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(abs)));
  return x.toFixed(Math.min(d, 4));
}
export const kg = (x: number) => `${x % 1 === 0 ? x : x.toFixed(2)} kg`;
