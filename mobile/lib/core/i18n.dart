/// English / Tamil / Hindi strings for the farmer-facing screens.
class T {
  static String lang = 'en';
  static const speech = {'en': 'en-IN', 'ta': 'ta-IN', 'hi': 'hi-IN'};
  static const names = {'en': 'English', 'ta': 'தமிழ்', 'hi': 'हिन्दी'};

  static const _d = <String, Map<String, String>>{
    'app': {'en': 'PackWise', 'ta': 'PackWise', 'hi': 'PackWise'},
    'tagline': {
      'en': 'Right packaging for your food — with the evidence behind it',
      'ta': 'உங்கள் உணவுக்கு சரியான பேக்கேஜிங் — ஆதாரத்துடன்',
      'hi': 'आपके भोजन के लिए सही पैकेजिंग — सबूत के साथ'
    },
    'start': {'en': 'Find packaging for my food', 'ta': 'என் உணவுக்கு பேக்கேஜிங் கண்டுபிடி', 'hi': 'मेरे भोजन के लिए पैकेजिंग खोजें'},
    'scan': {'en': 'Scan a batch QR', 'ta': 'QR ஸ்கேன் செய்', 'hi': 'QR स्कैन करें'},
    'assistant': {'en': 'Ask a question', 'ta': 'கேள்வி கேள்', 'hi': 'सवाल पूछें'},
    'library': {'en': 'Packing guides', 'ta': 'பேக்கிங் வழிகாட்டி', 'hi': 'पैकिंग गाइड'},
    'account': {'en': 'Account & sync', 'ta': 'கணக்கு & ஒத்திசைவு', 'hi': 'खाता और सिंक'},
    'home': {'en': 'Home', 'ta': 'முகப்பு', 'hi': 'होम'},
    'photo': {'en': 'Take a photo', 'ta': 'புகைப்படம் எடு', 'hi': 'फोटो लें'},
    'orchoose': {'en': 'or choose your food', 'ta': 'அல்லது உணவைத் தேர்ந்தெடு', 'hi': 'या अपना भोजन चुनें'},
    'confirm': {'en': 'Yes, this is my food', 'ta': 'ஆம், இது என் உணவு', 'hi': 'हाँ, यह मेरा भोजन है'},
    'qty': {'en': 'How many kg?', 'ta': 'எத்தனை கிலோ?', 'hi': 'कितने किलो?'},
    'days': {'en': 'Store for how many days?', 'ta': 'எத்தனை நாட்கள் சேமிக்க?', 'hi': 'कितने दिन रखना है?'},
    'use': {'en': 'Selling as', 'ta': 'விற்பனை வகை', 'hi': 'बेचने का तरीका'},
    'retail': {'en': 'Small retail packs', 'ta': 'சிறு சில்லறை பேக்', 'hi': 'छोटे खुदरा पैक'},
    'bulk': {'en': 'Bulk', 'ta': 'மொத்தம்', 'hi': 'थोक'},
    'room': {'en': 'Where will it be stored?', 'ta': 'எங்கே சேமிக்கப்படும்?', 'hi': 'कहाँ रखा जाएगा?'},
    'from': {'en': 'From', 'ta': 'எங்கிருந்து', 'hi': 'कहाँ से'},
    'to': {'en': 'To', 'ta': 'எங்கு', 'hi': 'कहाँ तक'},
    'date': {'en': 'Departure date', 'ta': 'புறப்படும் தேதி', 'hi': 'रवाना होने की तारीख'},
    'sealer': {'en': 'Which sealing machine do you have?', 'ta': 'எந்த சீல் இயந்திரம் உள்ளது?', 'hi': 'आपके पास कौन सी सील मशीन है?'},
    'show': {'en': 'Show my options', 'ta': 'என் விருப்பங்களைக் காட்டு', 'hi': 'मेरे विकल्प दिखाएँ'},
    'next': {'en': 'Next', 'ta': 'அடுத்து', 'hi': 'आगे'},
    'back': {'en': 'Back', 'ta': 'பின்', 'hi': 'पीछे'},
    'options': {'en': 'Your packaging options', 'ta': 'உங்கள் பேக்கேஜிங் விருப்பங்கள்', 'hi': 'आपके पैकेजिंग विकल्प'},
    'why': {'en': 'Why this option?', 'ta': 'இந்த விருப்பம் ஏன்?', 'hi': 'यह विकल्प क्यों?'},
    'howpack': {'en': 'How to pack', 'ta': 'எப்படி பேக் செய்வது', 'hi': 'कैसे पैक करें'},
    'looks': {'en': 'Looks like', 'ta': 'இது போல', 'hi': 'ऐसा दिखता है'},
    'shops': {'en': 'Packs like this in shops', 'ta': 'கடைகளில் இது போன்ற பேக்குகள்', 'hi': 'दुकानों में ऐसे पैक'},
    'total': {'en': 'Total cost', 'ta': 'மொத்த செலவு', 'hi': 'कुल लागत'},
    'perkg': {'en': 'per kg', 'ta': 'ஒரு கிலோ', 'hi': 'प्रति किलो'},
    'offline': {
      'en': 'Offline — guides, the assistant and saved results still work. New options need a connection.',
      'ta': 'இணைப்பு இல்லை — வழிகாட்டிகள், உதவியாளர், சேமித்த முடிவுகள் வேலை செய்யும்.',
      'hi': 'ऑफलाइन — गाइड, सहायक और सहेजे गए नतीजे काम करते हैं।'
    },
    'listen': {'en': 'Listen', 'ta': 'கேள்', 'hi': 'सुनें'},
    'report': {'en': 'Report a problem', 'ta': 'புகார் செய்', 'hi': 'समस्या बताएं'},
    'send': {'en': 'Send', 'ta': 'அனுப்பு', 'hi': 'भेजें'},
    'ask': {'en': 'Ask', 'ta': 'கேள்', 'hi': 'पूछें'},
    'supported': {'en': 'Supported', 'ta': 'ஆதரிக்கப்படுகிறது', 'hi': 'समर्थित'},
    'conditional': {'en': 'With conditions', 'ta': 'நிபந்தனைகளுடன்', 'hi': 'शर्तों के साथ'},
    'ps.prepare': {
      'en': 'Prepare: sort, clean and check the food is dry. Remove broken or mouldy pieces.',
      'ta': 'தயார் செய்: உணவைப் பிரித்து, சுத்தம் செய்து, உலர்ந்திருக்கிறதா எனப் பாருங்கள். உடைந்த அல்லது பூஞ்சை பிடித்தவற்றை நீக்குங்கள்.',
      'hi': 'तैयारी: भोजन को छाँटें, साफ करें और सूखा है यह जाँचें। टूटे या फफूंद लगे टुकड़े हटा दें।'
    },
    'ps.fill': {
      'en': 'Fill: weigh the correct amount into each pack. Keep the seal area clean.',
      'ta': 'நிரப்பு: ஒவ்வொரு பேக்கிலும் சரியான எடையை நிரப்புங்கள். சீல் செய்யும் பகுதியைச் சுத்தமாக வைத்திருங்கள்.',
      'hi': 'भरें: हर पैक में सही वजन भरें। सील वाली जगह साफ रखें।'
    },
    'ps.oxygen': {
      'en': 'Remove oxygen: flush with nitrogen, vacuum, or add the absorber sachet just before sealing.',
      'ta': 'ஆக்சிஜனை நீக்கு: நைட்ரஜன் நிரப்புங்கள், வெற்றிடம் செய்யுங்கள், அல்லது சீல் செய்வதற்கு முன் உறிஞ்சும் பையை வையுங்கள்.',
      'hi': 'ऑक्सीजन हटाएँ: नाइट्रोजन भरें, वैक्यूम करें, या सील करने से ठीक पहले सोखने वाला पाउच डालें।'
    },
    'ps.seal': {
      'en': 'Seal: set the sealer to the right heat and seal in one smooth press. The seal must be even, with no wrinkles.',
      'ta': 'சீல் செய்: சீலரை சரியான வெப்பத்தில் வைத்து ஒரே அழுத்தத்தில் சீல் செய்யுங்கள். சீல் சுருக்கம் இல்லாமல் சீராக இருக்க வேண்டும்.',
      'hi': 'सील करें: सीलर को सही गर्मी पर रखें और एक बार में सील करें। सील बिना सिलवट के एक-सी होनी चाहिए।'
    },
    'ps.check': {
      'en': 'Check: squeeze sample packs or test them under water. No air should escape.',
      'ta': 'சரிபார்: மாதிரி பேக்குகளை அழுத்தியோ தண்ணீரில் வைத்தோ சோதியுங்கள். காற்று வெளியேறக் கூடாது.',
      'hi': 'जाँचें: नमूना पैक दबाकर या पानी में डालकर जाँचें। हवा बाहर नहीं निकलनी चाहिए।'
    },
    'ps.group': {
      'en': 'Group: place packs in cartons or crates. Do not overfill. Keep vents open for fresh produce.',
      'ta': 'குழுவாக்கு: பேக்குகளை அட்டைப்பெட்டி அல்லது கூடைகளில் வையுங்கள். அதிகமாக நிரப்ப வேண்டாம்.',
      'hi': 'समूह बनाएँ: पैक को डिब्बों या क्रेट में रखें। ज़्यादा न भरें। ताज़ी उपज के लिए हवा के छेद खुले रखें।'
    },
    'ps.transport': {
      'en': 'Transport: travel at the planned time. Avoid long stops in the sun. Keep away from rain.',
      'ta': 'போக்குவரத்து: திட்டமிட்ட நேரத்தில் பயணியுங்கள். வெயிலில் நீண்ட நேரம் நிறுத்த வேண்டாம்.',
      'hi': 'परिवहन: तय समय पर यात्रा करें। धूप में लंबे समय तक न रुकें। बारिश से बचाएँ।'
    },
    'ps.store': {
      'en': 'Store: on arrival keep in the planned place — cool, dry and off the floor.',
      'ta': 'சேமி: சேர்ந்தவுடன் திட்டமிட்ட இடத்தில் — குளிர்ந்த, உலர்ந்த, தரைக்கு மேல் வையுங்கள்.',
      'hi': 'भंडारण: पहुँचने पर तय जगह पर रखें — ठंडी, सूखी और ज़मीन से ऊपर।'
    },
  };

  static String t(String key) => _d[key]?[lang] ?? _d[key]?['en'] ?? key;
}
