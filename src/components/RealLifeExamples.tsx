import { useEffect, useState } from "react";
import { examplesFor, EXAMPLE_DISCLAIMER } from "../../shared/data/examples";
import { PackIllustration } from "./Illustrations";

export interface VerifiedExample {
  id: number; structure_id: string; commodity_id: string | null; product: string; brand: string; photo_path: string; photo_source: string;
  documented_structure: string; structure_source: string; labelled_shelf_life: string | null; storage_instructions: string | null; source_date: string; reviewer: string | null;
}

let cache: Promise<VerifiedExample[]> | null = null;
export function loadVerifiedExamples(force = false): Promise<VerifiedExample[]> {
  if (!cache || force) cache = fetch("/api/examples").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return cache;
}

export function useVerifiedExamples(structureId: string) {
  const [list, setList] = useState<VerifiedExample[]>([]);
  useEffect(() => { loadVerifiedExamples().then((all) => setList(all.filter((e) => e.structure_id === structureId))); }, [structureId]);
  return list;
}

/** One-line "looks like" hint for compact cards. */
export function LooksLike({ structureId }: { structureId: string }) {
  const verified = useVerifiedExamples(structureId);
  const fam = examplesFor(structureId)[0];
  if (verified.length) return <div className="text-xs text-good">✓ Verified example: {verified[0].brand} {verified[0].product}</div>;
  if (!fam) return null;
  return <div className="text-xs text-ink-2">Looks like: {fam.brands.length ? `${fam.brands.join(", ")} ${fam.products.toLowerCase()}` : fam.products.toLowerCase()}</div>;
}

/** Full "Packs like this in shops" section. */
export default function RealLifeExamples({ structureId, commodityId }: { structureId: string; commodityId?: string }) {
  const verified = useVerifiedExamples(structureId);
  const fam = examplesFor(structureId);
  if (!verified.length && !fam.length) return null;
  const sorted = [...verified].sort((a, b) => (a.commodity_id === commodityId ? -1 : b.commodity_id === commodityId ? 1 : 0));
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="label">Packs like this that you can see in shops</div>
      <div className="space-y-3">
        {sorted.map((v) => (
          <div key={v.id} className="flex gap-3 rounded-xl border border-good/30 bg-white p-2">
            <a href={v.photo_path} target="_blank" rel="noreferrer"><img src={v.photo_path} alt={`${v.brand} ${v.product} pack`} className="h-24 w-24 shrink-0 rounded-lg object-cover" /></a>
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2"><strong>{v.brand} — {v.product}</strong><span className="chip bg-good-bg text-good">✓ verified</span></div>
              <div className="text-ink-2">Documented structure: {v.documented_structure}</div>
              {v.labelled_shelf_life && <div className="text-ink-2">Shelf life printed on its label: {v.labelled_shelf_life}</div>}
              {v.storage_instructions && <div className="text-ink-2">Storage on label: {v.storage_instructions}</div>}
              <div className="mt-1 text-xs text-ink-3">Structure source: {v.structure_source} · Photo: {v.photo_source} · Checked {v.source_date}{v.reviewer ? ` by ${v.reviewer}` : ""}</div>
            </div>
          </div>
        ))}
        {fam.map((e) => (
          <div key={e.id} className="flex gap-3">
            <PackIllustration format={e.format} opaque={e.visible.some((x) => x.toLowerCase().includes("silver") || x.toLowerCase().includes("foil"))} className="h-14 w-14 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">{e.products}{e.brands.length > 0 && <> — e.g. {e.brands.join(", ")}</>}</div>
              <div className="text-xs text-ink-2">What you can see: {e.visible.join(" · ")}</div>
              <div className="text-xs text-ink-2">{e.sameNeed}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">{EXAMPLE_DISCLAIMER}</p>
    </div>
  );
}
