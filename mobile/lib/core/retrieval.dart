import 'dart:math' as math;

import 'reference.dart';

/// Offline packaging assistant: BM25 retrieval over the reviewed library. It only quotes the
/// library (with citations and the library date) — it never generates numbers.
class OfflineAssistant {
  static const _stop = {'a', 'an', 'the', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'is', 'are', 'be', 'it', 'this', 'that', 'my', 'our', 'your',
    'with', 'what', 'how', 'why', 'when', 'which', 'can', 'do', 'does', 'should', 'i', 'we', 'you', 'me', 'about', 'from', 'at', 'by', 'as', 'not', 'no'};
  static const _syn = {
    'rancidity': 'rancid', 'oxidation': 'oxygen', 'o2': 'oxygen', 'humidity': 'moisture', 'damp': 'moisture', 'water': 'moisture', 'soggy': 'moisture',
    'holes': 'perforation', 'perforations': 'perforation', 'perforated': 'perforation', 'kaju': 'cashew', 'munthiri': 'cashew', 'cashews': 'cashew',
    'peanut': 'nuts', 'groundnut': 'nuts', 'box': 'carton', 'boxes': 'carton', 'cartons': 'carton', 'sealing': 'seal', 'sealer': 'seal', 'sealed': 'seal',
    'recyclable': 'recycle', 'recycling': 'recycle', 'plastic': 'recycle', 'fridge': 'temperature', 'cold': 'temperature', 'heat': 'temperature',
    'barcode': 'qr', 'scan': 'qr',
  };

  static List<String> tokenize(String s) {
    final out = <String>[];
    for (var t in s.toLowerCase().replaceAll(RegExp(r'[^\p{L}\p{N}\s-]', unicode: true), ' ').split(RegExp(r'[\s\-_]+'))) {
      if (t.isEmpty || _stop.contains(t)) continue;
      if (_syn.containsKey(t)) {
        out.add(_syn[t]!);
        continue;
      }
      if (t.length > 3) t = t.endsWith('ies') ? '${t.substring(0, t.length - 3)}y' : t.endsWith('s') ? t.substring(0, t.length - 1) : t;
      out.add(_syn[t] ?? t);
    }
    return out;
  }

  static List<(Map<String, dynamic>, double)> search(String query, {int k = 3}) {
    final articles = (Reference.knowledge['articles'] as List).cast<Map<String, dynamic>>();
    final docs = [
      for (final a in articles)
        (a, tokenize('${a['title']} ${a['title']} ${(a['tags'] as List).join(' ')} ${(a['tags'] as List).join(' ')} ${a['text']}'))
    ];
    final df = <String, int>{};
    for (final d in docs) {
      for (final t in d.$2.toSet()) {
        df[t] = (df[t] ?? 0) + 1;
      }
    }
    final avg = docs.fold<int>(0, (s, d) => s + d.$2.length) / docs.length;
    final q = tokenize(query).toSet();
    final scored = <(Map<String, dynamic>, double)>[];
    for (final d in docs) {
      var score = 0.0;
      for (final t in q) {
        final f = d.$2.where((x) => x == t).length;
        if (f == 0) continue;
        final idf = math.log(1 + (docs.length - (df[t] ?? 0) + 0.5) / ((df[t] ?? 0) + 0.5));
        score += idf * f * 2.4 / (f + 1.4 * (0.25 + 0.75 * d.$2.length / avg));
      }
      if (score > 0.5) scored.add((d.$1, score));
    }
    scored.sort((a, b) => b.$2.compareTo(a.$2));
    return scored.take(k).toList();
  }

  /// Extractive answer: the most relevant sentences, each with its citation.
  static (String, List<Map<String, dynamic>>) answer(String question) {
    final hits = search(question);
    if (hits.isEmpty) {
      return ('I could not find this in the offline packaging library. It may need current data or an expert. '
          'Try asking about moisture, oxygen, sealing, fresh produce, cartons, recycling or measurements.', []);
    }
    final q = tokenize(question).toSet();
    final sentences = <(String, String, double)>[];
    for (final h in hits) {
      for (final s in (h.$1['text'] as String).split(RegExp(r'(?<=\.)\s+'))) {
        final overlap = tokenize(s).where(q.contains).length;
        sentences.add((s, h.$1['id'] as String, overlap + h.$2 / 10));
      }
    }
    sentences.sort((a, b) => b.$3.compareTo(a.$3));
    final best = sentences.take(4).toList()..sort((a, b) => a.$2.compareTo(b.$2));
    return (best.map((x) => '${x.$1} [${x.$2}]').join(' '), hits.map((h) => h.$1).toList());
  }
}
