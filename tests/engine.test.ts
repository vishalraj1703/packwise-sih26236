import { describe, expect, it } from "vitest";
import { psat, arrhenius } from "../shared/engine/physics";
import { structureAtTest, minimumGauge, recyclability } from "../shared/engine/barrier";
import { getStructure } from "../shared/data/materials";
import { moistureTrajectory, requiredWvtr } from "../shared/engine/moisture";
import { requiredOtr, headspaceO2Mg, sizeAbsorber } from "../shared/engine/oxygen";
import { holeConductance, equilibrium, respirationO2 } from "../shared/engine/map";
import { mckeeBct, zeroAcceptanceSample, istaDropHeightCm } from "../shared/engine/sealing";
import { welch, twoProportions, normInv, tTwoSidedP, decide, lockHash, sampleSizeMeans } from "../shared/engine/validation";
import { recommend, type AssessmentInput } from "../shared/engine/recommend";
import { offlineJourney } from "../shared/engine/journey";
import { offlineAnswer } from "../shared/engine/retrieval";

const profile = [{ label: "store", days: 100, tC: 30, rhPct: 75, status: "assumed" as const }];

describe("physics", () => {
  it("saturation vapour pressure matches steam tables", () => {
    expect(psat(25)).toBeGreaterThan(3150);
    expect(psat(25)).toBeLessThan(3180);
    expect(psat(38)).toBeGreaterThan(6600);
    expect(psat(38)).toBeLessThan(6650);
  });
  it("Arrhenius increases rates with temperature", () => {
    expect(arrhenius(40, 23, 33)).toBeGreaterThan(1.5);
    expect(arrhenius(40, 23, 23)).toBeCloseTo(1, 6);
  });
});

describe("Gap 2 — laminate barrier", () => {
  it("series resistance is dominated by the best barrier layer", () => {
    const foil = structureAtTest(getStructure("pet-al-pe"));
    const pe = structureAtTest(getStructure("ldpe-50"));
    expect(foil.otr).toBeLessThan(0.1);
    expect(pe.otr).toBeGreaterThan(3000);
    expect(pe.wvtr).toBeCloseTo(9, 0); // 18 g per 25 µm → 9 g at 50 µm
  });
  it("minimum gauge scales inversely with the requirement", () => {
    const g = minimumGauge("LDPE", undefined, 9)!;
    expect(g.exactUm).toBeCloseTo(50, 0);
    expect(g.gaugeUm).toBe(50);
  });
  it("classifies recyclability into PWM categories", () => {
    expect(recyclability(getStructure("ldpe-50")).pwmCategory).toContain("Category II");
    expect(recyclability(getStructure("pet-al-pe")).pwmCategory).toContain("Category III");
  });
});

describe("Gap 1 — moisture and oxygen requirements", () => {
  const inp = { initialWb: 4, criticalWb: 5, isoA: 0.005, isoB: 0.085, isoRange: [0.2, 0.75] as [number, number], fillKg: 0.5, areaM2: 0.06 };
  it("a better barrier gives a longer time to the moisture limit", () => {
    const poor = moistureTrajectory(inp, profile, () => 1e-4 * 0.06);
    const good = moistureTrajectory(inp, profile, () => 1e-6 * 0.06);
    expect(poor.criticalDayExtended!).toBeLessThan(good.criticalDayExtended!);
  });
  it("finds a finite required WVTR", () => {
    const r = requiredWvtr(inp, profile);
    expect(r.wvtrTest).toBeGreaterThan(0);
    expect(r.alwaysOk).toBe(false);
  });
  it("flags food already above its limit immediately", () => {
    const r = moistureTrajectory({ ...inp, initialWb: 5.2 }, profile, () => 1e-6);
    expect(r.criticalDay).toBe(0);
  });
  it("required OTR is inversely proportional to duration", () => {
    const a = requiredOtr(10, 0.5, 0.06, [{ ...profile[0], days: 50 }]);
    const b = requiredOtr(10, 0.5, 0.06, [{ ...profile[0], days: 100 }]);
    expect(a / b).toBeCloseTo(2, 5);
  });
  it("headspace oxygen and absorber sizing are consistent", () => {
    expect(headspaceO2Mg(1, 0.209)).toBeGreaterThan(260);
    const s = sizeAbsorber(0.3, 50);
    expect(s.sachetCc!).toBeGreaterThanOrEqual(s.neededCc);
  });
});

describe("Gap 3 — MAP", () => {
  it("per-hole conductance is in the expected range for a 100 µm hole", () => {
    const k = holeConductance(100, 35, 20, "O2");
    expect(k).toBeGreaterThan(80);
    expect(k).toBeLessThan(250);
    expect(holeConductance(100, 35, 20, "CO2")).toBeLessThan(k);
  });
  it("equilibrium O2 falls as temperature raises respiration", () => {
    const p = { rco2At20: 25, q10: 2.3, rq: 1, km: 0.03 };
    const e1 = equilibrium({ gO2: 200, gCO2: 700 }, 1, 13, p);
    const e2 = equilibrium({ gO2: 200, gCO2: 700 }, 1, 25, p);
    expect(e2.o2).toBeLessThan(e1.o2);
    expect(respirationO2(0.209, 30, p)).toBeGreaterThan(respirationO2(0.209, 20, p));
  });
});

describe("Gap 4 — sealing & mechanical", () => {
  it("c = 0 sampling gives 59 samples for 95% / 5%", () => {
    expect(zeroAcceptanceSample(1000)).toBe(59);
    expect(zeroAcceptanceSample(20)).toBe(20);
  });
  it("McKee BCT is plausible for a 5-ply box", () => {
    const b = mckeeBct(7800, 6.5, 1.4);
    expect(b).toBeGreaterThan(3500);
    expect(b).toBeLessThan(6000);
  });
  it("ISTA drop heights decrease with weight", () => {
    expect(istaDropHeightCm(5)).toBe(76);
    expect(istaDropHeightCm(50)).toBe(20);
  });
});

describe("Gap 5 — statistics", () => {
  it("normal and t quantiles", () => {
    expect(normInv(0.975)).toBeCloseTo(1.96, 2);
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 2);
  });
  it("Welch detects a clear difference and decide() uses the CI", () => {
    const w = welch([5.1, 5.2, 5.3, 5.0, 5.2], [4.1, 4.2, 4.0, 4.3, 4.1])!;
    expect(w.p).toBeLessThan(0.001);
    expect(decide(w.ci, { metric: "m", direction: "treatment-lower", minimumDifference: 0.3, unit: "%" })).toBe("meets-threshold");
  });
  it("two-proportion CI contains the observed difference", () => {
    const t = twoProportions(38, 50, 48, 50);
    expect(t.ci[0]).toBeLessThan(t.diff);
    expect(t.ci[1]).toBeGreaterThan(t.diff);
  });
  it("lock hash is stable and sensitive to changes", () => {
    expect(lockHash({ a: 1 })).toBe(lockHash({ a: 1 }));
    expect(lockHash({ a: 1 })).not.toBe(lockHash({ a: 2 }));
    expect(sampleSizeMeans(0.3, 0.3)).toBe(16);
  });
});

describe("recommendation sequence", () => {
  const journey = offlineJourney({ name: "Panruti", lat: 11.776, lon: 79.552, state: "Tamil Nadu" }, { name: "Chennai", lat: 13.083, lon: 80.27, state: "Tamil Nadu" }, "2026-10-05");
  const make = (p: Partial<AssessmentInput> & { commodityId: string; state: any; portions: AssessmentInput["portions"] }): AssessmentInput => ({
    identification: { method: "user-select", confirmed: true }, properties: {}, equipment: ["heat-impulse"], journey, userState: "Tamil Nadu", ...p
  });
  const portion = (storageDays: number, kg = 20, storage: any = { type: "ambient-room", status: "assumed" }) => [{ id: "p", label: "x", kg, use: "retail" as const, storageDays, storage }];

  it("long cashew storage requires oxygen control and a high barrier", () => {
    const r = recommend(make({ commodityId: "cashew-kernel", state: "unroasted", portions: portion(150, 30) }));
    const ok = r.portions[0].candidates.filter((c) => c.support === "supported");
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every((c) => c.oxygenControl !== "none")).toBe(true);
    expect(ok.some((c) => c.structureId === "ldpe-50")).toBe(false);
    expect(r.plans.length).toBeGreaterThan(0);
  });
  it("short storage accepts a plain LDPE pouch", () => {
    const r = recommend(make({ commodityId: "cashew-kernel", state: "unroasted", portions: portion(14) }));
    expect(r.portions[0].candidates.some((c) => c.structureId === "ldpe-50" && c.support === "supported")).toBe(true);
  });
  it("never offers a pack the user cannot close", () => {
    const r = recommend(make({ commodityId: "cashew-kernel", state: "unroasted", equipment: [], portions: portion(14, 10) }));
    for (const c of r.portions[0].candidates.filter((x) => x.support !== "not-supported")) expect(c.viaService ?? c.sealMethod).toBeTruthy();
  });
  it("reports insufficient evidence for pickle without pH", () => {
    const r = recommend(make({ commodityId: "mango-pickle", state: "processed", portions: portion(30, 10) }));
    expect(r.portions[0].insufficient).not.toBeNull();
    expect(r.plans.length).toBe(0);
  });
  it("hot transit creates MAP risk for tomato", () => {
    const r = recommend(make({ commodityId: "tomato", state: "fresh-whole", portions: portion(5, 50, { type: "cool-room", status: "assumed" }) }));
    const hot = r.portions[0].candidates.filter((c) => c.transportId === "dedicated" && c.map);
    expect(hot.some((c) => c.reasons.some((x) => x.includes("anaerobic") || x.includes("window")))).toBe(true);
  });
  it("plans prefer fully supported options", () => {
    const r = recommend(make({ commodityId: "cashew-kernel", state: "unroasted", portions: portion(150, 30) }));
    const cheapest = r.plans.find((p) => p.tags.includes("lowest-cost"))!;
    const cands = r.portions.flatMap((p) => p.candidates);
    expect(cheapest.selections.every((s) => cands.find((c) => c.key === s.candidateKey)!.support === "supported")).toBe(true);
  });
});

describe("offline assistant", () => {
  it("retrieves relevant passages with citations", () => {
    const a = offlineAnswer("how do I size micro perforations for tomato");
    expect(a.passages[0].id).toBe("K6");
    expect(a.answer).toMatch(/\[K\d+\]/);
  });
});
