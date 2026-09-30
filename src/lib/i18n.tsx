import { createContext, useContext, useState, type ReactNode } from "react";
import { local } from "./api";

export type Lang = "en" | "ta" | "hi";
export const LANGS: Array<{ id: Lang; label: string; speech: string; name: string }> = [
  { id: "en", label: "English", speech: "en-IN", name: "English" },
  { id: "ta", label: "தமிழ்", speech: "ta-IN", name: "Tamil" },
  { id: "hi", label: "हिन्दी", speech: "hi-IN", name: "Hindi" }
];

type Dict = Record<string, string>;
const en: Dict = {
  "nav.home": "Home", "nav.assess": "New assessment", "nav.work": "My work", "nav.batches": "Batches & QR", "nav.shipments": "Shipments",
  "nav.retail": "Shop billing", "nav.complaints": "Issues", "nav.trials": "Trial & Verify", "nav.assistant": "Assistant", "nav.library": "Library & calculators",
  "nav.evidence": "Methods & data", "nav.login": "Sign in", "nav.logout": "Sign out",
  "home.title": "Choose the right packaging for your food — with the evidence behind it",
  "home.sub": "PackWise helps farmers, startups and small food businesses compare feasible packaging-and-journey plans, understand how to pack, find matching suppliers and trace every batch.",
  "home.start": "Start an assessment", "home.worked": "See the cashew example",
  "step.food": "Food", "step.order": "Order", "step.journey": "Journey", "step.evidence": "Evidence & equipment", "step.review": "Review",
  "food.photo": "Upload a photo", "food.select": "or choose the food", "food.state": "Processing state", "food.confirm": "I confirm this is my food",
  "order.portion": "Portion", "order.kg": "Quantity (kg)", "order.use": "Use", "order.days": "Storage (days)", "order.storage": "Storage place", "order.pack": "Pack size",
  "order.add": "Add a portion", "journey.from": "From", "journey.to": "To", "journey.date": "Departure date", "journey.analyze": "Analyse route & weather",
  "run": "Show my options", "offline": "Offline — calculations still work; live weather, prices and syncing wait for connection.",
  "why": "Why this option?", "choose": "Choose this plan", "cost": "Total cost", "perkg": "per kg",
  "pack.title": "How to pack", "pack.listen": "Listen", "pack.stop": "Stop",
  "ps.prepare": "Prepare: sort, clean and check the food is dry. Remove broken or mouldy pieces.",
  "ps.fill": "Fill: weigh the correct amount into each pack. Keep the seal area clean.",
  "ps.oxygen": "Remove oxygen: flush with nitrogen, vacuum, or add the absorber sachet just before sealing.",
  "ps.seal": "Seal: set the sealer to the right heat and seal in one smooth press. The seal must be even, with no wrinkles.",
  "ps.check": "Check: squeeze sample packs or test them under water. No air should escape.",
  "ps.label": "Label: stick the batch QR label and write the packing date.",
  "ps.group": "Group: place packs in cartons or crates. Do not overfill. Keep vents open for fresh produce.",
  "ps.load": "Load: stack cartons straight, heavy at the bottom, within the stacking limit. Keep away from rain and sun.",
  "ps.transport": "Transport: travel at the planned time. Avoid long stops in the sun.",
  "ps.store": "Store: on arrival keep in the planned place — cool, dry and off the floor.",
  "status.measured": "Measured", "status.reported": "Reported", "status.reference": "Reference estimate", "status.assumed": "Assumed", "status.unknown": "Unknown",
  "support.supported": "Supported", "support.conditional": "Supported with conditions", "support.not-supported": "Not supported"
};
const ta: Dict = {
  "nav.home": "முகப்பு", "nav.assess": "புதிய மதிப்பீடு", "nav.work": "என் பணிகள்", "nav.batches": "தொகுதிகள் & QR", "nav.shipments": "அனுப்புதல்",
  "nav.retail": "கடை பில்லிங்", "nav.complaints": "புகார்கள்", "nav.trials": "சோதனை & உறுதி", "nav.assistant": "உதவியாளர்", "nav.library": "நூலகம் & கணிப்பான்கள்",
  "nav.evidence": "முறைகள் & தரவு", "nav.login": "உள்நுழை", "nav.logout": "வெளியேறு",
  "home.title": "உங்கள் உணவுக்கு சரியான பேக்கேஜிங்கை ஆதாரத்துடன் தேர்வு செய்யுங்கள்",
  "home.sub": "விவசாயிகள், புதிய நிறுவனங்கள் மற்றும் சிறு உணவுத் தொழில்களுக்கு ஏற்ற பேக்கேஜிங் மற்றும் பயணத் திட்டங்களை ஒப்பிட, எப்படி பேக் செய்வது என்று அறிய, சப்ளையர்களைக் கண்டறிய, ஒவ்வொரு தொகுதியையும் கண்காணிக்க PackWise உதவுகிறது.",
  "home.start": "மதிப்பீட்டைத் தொடங்கு", "home.worked": "முந்திரி உதாரணத்தைப் பார்",
  "step.food": "உணவு", "step.order": "ஆர்டர்", "step.journey": "பயணம்", "step.evidence": "ஆதாரம் & கருவிகள்", "step.review": "சரிபார்",
  "food.photo": "புகைப்படம் பதிவேற்று", "food.select": "அல்லது உணவைத் தேர்ந்தெடு", "food.state": "பதப்படுத்தல் நிலை", "food.confirm": "இது என் உணவு என உறுதிப்படுத்துகிறேன்",
  "order.portion": "பகுதி", "order.kg": "அளவு (கிலோ)", "order.use": "பயன்பாடு", "order.days": "சேமிப்பு (நாட்கள்)", "order.storage": "சேமிக்கும் இடம்", "order.pack": "பேக் அளவு",
  "order.add": "பகுதியைச் சேர்", "journey.from": "எங்கிருந்து", "journey.to": "எங்கு", "journey.date": "புறப்படும் தேதி", "journey.analyze": "வழி & வானிலையை ஆய்வு செய்",
  "run": "என் விருப்பங்களைக் காட்டு", "offline": "இணைப்பு இல்லை — கணக்கீடுகள் வேலை செய்யும்; நேரடி வானிலை, விலைகள், ஒத்திசைவு இணைப்புக்குக் காத்திருக்கும்.",
  "why": "இந்த விருப்பம் ஏன்?", "choose": "இந்தத் திட்டத்தைத் தேர்வு செய்", "cost": "மொத்த செலவு", "perkg": "ஒரு கிலோவுக்கு",
  "pack.title": "எப்படி பேக் செய்வது", "pack.listen": "கேள்", "pack.stop": "நிறுத்து",
  "ps.prepare": "தயார் செய்: உணவைப் பிரித்து, சுத்தம் செய்து, உலர்ந்திருக்கிறதா எனப் பாருங்கள். உடைந்த அல்லது பூஞ்சை பிடித்தவற்றை நீக்குங்கள்.",
  "ps.fill": "நிரப்பு: ஒவ்வொரு பேக்கிலும் சரியான எடையை நிரப்புங்கள். சீல் செய்யும் பகுதியைச் சுத்தமாக வைத்திருங்கள்.",
  "ps.oxygen": "ஆக்சிஜனை நீக்கு: நைட்ரஜன் நிரப்புங்கள், வெற்றிடம் செய்யுங்கள், அல்லது சீல் செய்வதற்கு முன் உறிஞ்சும் பையை வையுங்கள்.",
  "ps.seal": "சீல் செய்: சீலரை சரியான வெப்பத்தில் வைத்து ஒரே அழுத்தத்தில் சீல் செய்யுங்கள். சீல் சுருக்கம் இல்லாமல் சீராக இருக்க வேண்டும்.",
  "ps.check": "சரிபார்: மாதிரி பேக்குகளை அழுத்தியோ தண்ணீரில் வைத்தோ சோதியுங்கள். காற்று வெளியேறக் கூடாது.",
  "ps.label": "லேபிள்: தொகுதி QR லேபிளை ஒட்டி, பேக் செய்த தேதியை எழுதுங்கள்.",
  "ps.group": "குழுவாக்கு: பேக்குகளை அட்டைப்பெட்டி அல்லது கூடைகளில் வையுங்கள். அதிகமாக நிரப்ப வேண்டாம். காய்கறிகளுக்கு காற்றோட்டத் துளைகளைத் திறந்து வையுங்கள்.",
  "ps.load": "ஏற்று: பெட்டிகளை நேராக அடுக்குங்கள், கனமானவை கீழே. அடுக்கு வரம்பை மீற வேண்டாம். மழை, வெயிலில் இருந்து காப்பாற்றுங்கள்.",
  "ps.transport": "போக்குவரத்து: திட்டமிட்ட நேரத்தில் பயணியுங்கள். வெயிலில் நீண்ட நேரம் நிறுத்த வேண்டாம்.",
  "ps.store": "சேமி: சேர்ந்தவுடன் திட்டமிட்ட இடத்தில் — குளிர்ந்த, உலர்ந்த, தரைக்கு மேல் வையுங்கள்.",
  "status.measured": "அளக்கப்பட்டது", "status.reported": "தெரிவிக்கப்பட்டது", "status.reference": "குறிப்பு மதிப்பீடு", "status.assumed": "ஊகிக்கப்பட்டது", "status.unknown": "தெரியாது",
  "support.supported": "ஆதரிக்கப்படுகிறது", "support.conditional": "நிபந்தனைகளுடன்", "support.not-supported": "ஆதரிக்கப்படவில்லை"
};
const hi: Dict = {
  "nav.home": "होम", "nav.assess": "नया आकलन", "nav.work": "मेरा काम", "nav.batches": "बैच और QR", "nav.shipments": "शिपमेंट",
  "nav.retail": "दुकान बिलिंग", "nav.complaints": "शिकायतें", "nav.trials": "परीक्षण और सत्यापन", "nav.assistant": "सहायक", "nav.library": "जानकारी और कैलकुलेटर",
  "nav.evidence": "तरीके और डेटा", "nav.login": "साइन इन", "nav.logout": "साइन आउट",
  "home.title": "अपने भोजन के लिए सही पैकेजिंग चुनें — सबूत के साथ",
  "home.sub": "PackWise किसानों, स्टार्टअप और छोटे खाद्य व्यवसायों को उपयुक्त पैकेजिंग और यात्रा योजनाओं की तुलना करने, पैक करने का तरीका समझने, सही सप्लायर खोजने और हर बैच को ट्रैक करने में मदद करता है।",
  "home.start": "आकलन शुरू करें", "home.worked": "काजू का उदाहरण देखें",
  "step.food": "भोजन", "step.order": "ऑर्डर", "step.journey": "यात्रा", "step.evidence": "सबूत और उपकरण", "step.review": "समीक्षा",
  "food.photo": "फोटो अपलोड करें", "food.select": "या भोजन चुनें", "food.state": "प्रसंस्करण स्थिति", "food.confirm": "मैं पुष्टि करता/करती हूँ कि यह मेरा भोजन है",
  "order.portion": "हिस्सा", "order.kg": "मात्रा (किलो)", "order.use": "उपयोग", "order.days": "भंडारण (दिन)", "order.storage": "भंडारण स्थान", "order.pack": "पैक आकार",
  "order.add": "हिस्सा जोड़ें", "journey.from": "कहाँ से", "journey.to": "कहाँ तक", "journey.date": "रवाना होने की तारीख", "journey.analyze": "रास्ता और मौसम देखें",
  "run": "मेरे विकल्प दिखाएँ", "offline": "ऑफलाइन — गणनाएँ काम करेंगी; मौसम, कीमतें और सिंक कनेक्शन मिलने पर होंगे।",
  "why": "यह विकल्प क्यों?", "choose": "यह योजना चुनें", "cost": "कुल लागत", "perkg": "प्रति किलो",
  "pack.title": "कैसे पैक करें", "pack.listen": "सुनें", "pack.stop": "रोकें",
  "ps.prepare": "तैयारी: भोजन को छाँटें, साफ करें और सूखा है यह जाँचें। टूटे या फफूंद लगे टुकड़े हटा दें।",
  "ps.fill": "भरें: हर पैक में सही वजन भरें। सील वाली जगह साफ रखें।",
  "ps.oxygen": "ऑक्सीजन हटाएँ: नाइट्रोजन भरें, वैक्यूम करें, या सील करने से ठीक पहले सोखने वाला पाउच डालें।",
  "ps.seal": "सील करें: सीलर को सही गर्मी पर रखें और एक बार में सील करें। सील बिना सिलवट के एक-सी होनी चाहिए।",
  "ps.check": "जाँचें: नमूना पैक दबाकर या पानी में डालकर जाँचें। हवा बाहर नहीं निकलनी चाहिए।",
  "ps.label": "लेबल: बैच QR लेबल लगाएँ और पैकिंग की तारीख लिखें।",
  "ps.group": "समूह बनाएँ: पैक को डिब्बों या क्रेट में रखें। ज़्यादा न भरें। ताज़ी उपज के लिए हवा के छेद खुले रखें।",
  "ps.load": "लोड करें: डिब्बों को सीधा रखें, भारी नीचे। तय सीमा से ज़्यादा न रखें। बारिश और धूप से बचाएँ।",
  "ps.transport": "परिवहन: तय समय पर यात्रा करें। धूप में लंबे समय तक न रुकें।",
  "ps.store": "भंडारण: पहुँचने पर तय जगह पर रखें — ठंडी, सूखी और ज़मीन से ऊपर।",
  "status.measured": "मापा गया", "status.reported": "बताया गया", "status.reference": "संदर्भ अनुमान", "status.assumed": "मान लिया गया", "status.unknown": "अज्ञात",
  "support.supported": "समर्थित", "support.conditional": "शर्तों के साथ", "support.not-supported": "समर्थित नहीं"
};
const DICTS: Record<Lang, Dict> = { en, ta, hi };

interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; speech: string; langName: string }
const Ctx = createContext<I18n>(null as unknown as I18n);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => local.get<Lang>("packwise-lang", "en"));
  const setLang = (l: Lang) => { setLangState(l); local.set("packwise-lang", l); document.documentElement.lang = l; };
  const t = (k: string) => DICTS[lang][k] ?? en[k] ?? k;
  const meta = LANGS.find((l) => l.id === lang)!;
  return <Ctx.Provider value={{ lang, setLang, t, speech: meta.speech, langName: meta.name }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function speak(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.92;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang || v.lang.startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}
