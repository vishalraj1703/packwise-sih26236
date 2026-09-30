import type { PackFormat } from "../../shared/types";

const S = { stroke: "#0b2f30", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Packaging-format pictograms (generic formats — never brands). */
export function PackIllustration({ format, opaque = false, className = "h-20 w-20" }: { format: PackFormat; opaque?: boolean; className?: string }) {
  const fill = opaque ? "#c9d3d8" : "#e3efee";
  const body = (() => {
    switch (format) {
      case "pillow-pouch":
        return <><path d="M22 20h56l-4 60H26z" fill={fill} {...S} /><path d="M22 20h56M26 80h48" {...S} strokeDasharray="3 3" /><path d="M36 50h28" {...S} /></>;
      case "stand-up-pouch":
        return <><path d="M26 16h48l2 58c0 6-6 10-26 10s-26-4-26-10z" fill={fill} {...S} /><path d="M26 26h48" {...S} strokeDasharray="4 3" /><circle cx="68" cy="22" r="2" fill="#0b2f30" /></>;
      case "vacuum-pack":
        return <><rect x="18" y="24" width="64" height="52" rx="10" fill={fill} {...S} /><path d="M26 40c8-6 14 6 22 0s14 6 24 0M26 58c8-6 14 6 22 0s14 6 24 0" {...S} /></>;
      case "tin":
        return <><ellipse cx="50" cy="22" rx="26" ry="8" fill="#dfe6e8" {...S} /><path d="M24 22v54c0 5 12 9 26 9s26-4 26-9V22" fill="#dfe6e8" {...S} /><path d="M24 40c0 5 12 9 26 9s26-4 26-9" {...S} /></>;
      case "sack-liner":
        return <><path d="M24 22c10-6 42-6 52 0l4 58c-14 6-46 6-60 0z" fill="#efe7d6" {...S} /><path d="M30 24c6 10 34 10 40 0" {...S} strokeDasharray="3 3" /><path d="M34 40l32 30M66 40L34 70" stroke="#b9a37a" strokeWidth="2" /></>;
      case "crate":
        return <><rect x="14" y="34" width="72" height="44" rx="4" fill="#e3efee" {...S} /><path d="M24 46h12M44 46h12M64 46h12M24 60h12M44 60h12M64 60h12" {...S} /><circle cx="32" cy="30" r="7" fill="#eb6834" stroke="#0b2f30" strokeWidth="2" /><circle cx="50" cy="28" r="7" fill="#eb6834" stroke="#0b2f30" strokeWidth="2" /><circle cx="68" cy="30" r="7" fill="#eb6834" stroke="#0b2f30" strokeWidth="2" /></>;
      case "jar":
        return <><rect x="32" y="14" width="36" height="12" rx="3" fill="#f4c95d" {...S} /><path d="M30 26h40l4 10v42a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V36z" fill={fill} {...S} /></>;
      case "carton":
        return <><path d="M16 36l34-14 34 14v40L50 88 16 76z" fill="#e8d5b0" {...S} /><path d="M16 36l34 14 34-14M50 50v38" {...S} /></>;
      case "clamshell":
      case "tray-film":
        return <><path d="M16 50h68l-6 26H22z" fill={fill} {...S} /><path d="M16 50c8-14 60-14 68 0" {...S} /></>;
      default:
        return <rect x="20" y="20" width="60" height="60" rx="8" fill={fill} {...S} />;
    }
  })();
  return <svg viewBox="0 0 100 100" fill="none" className={className} role="img" aria-label={`${format.replace("-", " ")} illustration`}>{body}</svg>;
}

export type StepKey = "prepare" | "fill" | "oxygen" | "seal" | "check" | "label" | "group" | "load" | "transport" | "store";

/** Large pictorial step illustrations for the packing guide. */
export function StepIllustration({ step, format }: { step: StepKey; format: PackFormat }) {
  const common = { fill: "none", viewBox: "0 0 160 110", className: "h-28 w-full", role: "img" as const, "aria-label": step };
  switch (step) {
    case "prepare":
      return <svg {...common}><path d="M20 70h120l-10 26H30z" fill="#e3efee" {...S} /><circle cx="55" cy="62" r="9" fill="#f4c95d" {...S} /><circle cx="78" cy="60" r="9" fill="#f4c95d" {...S} /><circle cx="101" cy="62" r="9" fill="#f4c95d" {...S} /><path d="M120 20l14 14M134 20l-14 14" stroke="#b42318" strokeWidth="3" /><circle cx="127" cy="46" r="7" fill="#9aa39a" stroke="#0b2f30" strokeWidth="2" /><text x="12" y="22" fontSize="11" fill="#0b2f30">sort · clean · dry</text></svg>;
    case "fill":
      return <svg {...common}><rect x="96" y="70" width="48" height="12" rx="3" fill="#dfe7e6" {...S} /><text x="106" y="96" fontSize="11" fill="#0b2f30">weigh</text><g transform="translate(96 16) scale(0.5)"><PackIllustrationInline format={format} /></g><path d="M30 20h40l-8 22H38z" fill="#f4c95d" {...S} /><path d="M50 42v14M44 52l6 6 6-6" {...S} /><path d="M30 78h50" {...S} strokeDasharray="4 3" /><text x="8" y="107" fontSize="10" fill="#0b2f30">keep seal area clean</text></svg>;
    case "oxygen":
      return <svg {...common}><rect x="18" y="34" width="40" height="56" rx="6" fill="#e6effb" {...S} /><text x="26" y="66" fontSize="14" fontWeight="700" fill="#1c5cab">N₂</text><path d="M58 60h30" {...S} /><path d="M82 54l8 6-8 6" {...S} /><g transform="translate(92 14) scale(0.62)"><PackIllustrationInline format={format} /></g><rect x="120" y="70" width="18" height="14" rx="2" fill="#f4c95d" {...S} /><text x="100" y="104" fontSize="10" fill="#0b2f30">or absorber sachet</text></svg>;
    case "seal":
      return <svg {...common}><rect x="20" y="52" width="120" height="16" rx="4" fill="#3f5859" /><rect x="20" y="30" width="120" height="16" rx="4" fill="#6b8081" /><path d="M40 70v26h80V70" fill="#e3efee" {...S} /><path d="M26 60h108" stroke="#eb6834" strokeWidth="4" /><text x="24" y="22" fontSize="11" fill="#0b2f30">one smooth press · even seal</text></svg>;
    case "check":
      return <svg {...common}><path d="M20 60h120v36H20z" fill="#cde2fb" {...S} /><rect x="54" y="40" width="52" height="40" rx="8" fill="#e3efee" {...S} /><circle cx="70" cy="30" r="3" fill="#1c5cab" /><circle cx="84" cy="22" r="2" fill="#1c5cab" /><path d="M120 24l6 6 12-14" stroke="#1d7a46" strokeWidth="4" fill="none" strokeLinecap="round" /><text x="18" y="106" fontSize="10" fill="#0b2f30">no bubbles · no air escaping</text></svg>;
    case "label":
      return <svg {...common}><g transform="translate(20 10) scale(0.9)"><PackIllustrationInline format={format} /></g><rect x="92" y="28" width="46" height="46" rx="4" fill="#fff" {...S} /><path d="M100 36h10v10h-10zM120 36h10v10h-10zM100 56h10v10h-10zM118 58h4v4h-4zM126 62h4v6h-4z" fill="#0b2f30" /><text x="92" y="92" fontSize="11" fill="#0b2f30">batch QR + date</text></svg>;
    case "group":
      return <svg {...common}><path d="M26 44l54-20 54 20v44L80 104 26 88z" fill="#e8d5b0" {...S} /><path d="M26 44l54 20 54-20M80 64v40" {...S} /><rect x="46" y="20" width="16" height="22" rx="3" fill="#e3efee" {...S} /><rect x="72" y="14" width="16" height="22" rx="3" fill="#e3efee" {...S} /><rect x="98" y="20" width="16" height="22" rx="3" fill="#e3efee" {...S} /></svg>;
    case "load":
      return <svg {...common}><rect x="30" y="66" width="40" height="30" fill="#e8d5b0" {...S} /><rect x="70" y="66" width="40" height="30" fill="#e8d5b0" {...S} /><rect x="30" y="36" width="40" height="30" fill="#e8d5b0" {...S} /><rect x="70" y="36" width="40" height="30" fill="#e8d5b0" {...S} /><path d="M126 40v50M120 46l6-6 6 6M120 84l6 6 6-6" {...S} /><text x="116" y="104" fontSize="10" fill="#0b2f30">max layers</text></svg>;
    case "transport":
      return <svg {...common}><rect x="14" y="36" width="86" height="46" rx="4" fill="#e3efee" {...S} /><path d="M100 50h26l16 16v16h-42z" fill="#cde2fb" {...S} /><circle cx="40" cy="86" r="9" fill="#fff" {...S} /><circle cx="118" cy="86" r="9" fill="#fff" {...S} /><circle cx="140" cy="18" r="9" fill="#f4c95d" stroke="#0b2f30" strokeWidth="2" /><path d="M126 14l-8-4M140 4v-2" stroke="#0b2f30" strokeWidth="2" /></svg>;
    case "store":
      return <svg {...common}><path d="M20 40l60-26 60 26v56H20z" fill="#e3efee" {...S} /><rect x="40" y="70" width="80" height="8" fill="#b9a37a" /><rect x="50" y="50" width="24" height="20" fill="#e8d5b0" {...S} /><rect x="80" y="50" width="24" height="20" fill="#e8d5b0" {...S} /><rect x="124" y="46" width="8" height="30" rx="4" fill="#fff" {...S} /><circle cx="128" cy="76" r="6" fill="#eb6834" stroke="#0b2f30" strokeWidth="2" /></svg>;
  }
}

function PackIllustrationInline({ format }: { format: PackFormat }) {
  // Nested <svg> keeps the pictogram reusable inside other illustrations.
  return <svg width="100" height="100" viewBox="0 0 100 100" fill="none"><g>{PackBody(format)}</g></svg>;
}
function PackBody(format: PackFormat) {
  // minimal duplicate of PackIllustration body for nesting
  const fill = "#e3efee";
  switch (format) {
    case "tin": return <><ellipse cx="50" cy="22" rx="26" ry="8" fill="#dfe6e8" {...S} /><path d="M24 22v54c0 5 12 9 26 9s26-4 26-9V22" fill="#dfe6e8" {...S} /></>;
    case "crate": return <rect x="14" y="34" width="72" height="44" rx="4" fill={fill} {...S} />;
    case "jar": return <path d="M30 26h40l4 10v42a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V36z" fill={fill} {...S} />;
    case "sack-liner": return <path d="M24 22c10-6 42-6 52 0l4 58c-14 6-46 6-60 0z" fill="#efe7d6" {...S} />;
    case "vacuum-pack": return <rect x="18" y="24" width="64" height="52" rx="10" fill={fill} {...S} />;
    case "stand-up-pouch": return <path d="M26 16h48l2 58c0 6-6 10-26 10s-26-4-26-10z" fill={fill} {...S} />;
    default: return <path d="M22 20h56l-4 60H26z" fill={fill} {...S} />;
  }
}
