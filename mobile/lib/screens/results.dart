import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/reference.dart';
import '../widgets/common.dart';

const _tagLabel = {
  'lowest-cost': 'Lowest cost',
  'faster': 'Faster delivery',
  'delay-tolerant': 'Safer if delayed',
  'sustainable': 'Greener choice',
};

Map<String, dynamic> _cand(Map<String, dynamic> r, String key) =>
    (r['portions'] as List).expand((p) => p['candidates'] as List).cast<Map<String, dynamic>>().firstWhere((c) => c['key'] == key);

Map<String, dynamic> _portion(Map<String, dynamic> r, String id) =>
    ((r['input']['portions'] as List).cast<Map<String, dynamic>>()).firstWhere((p) => p['id'] == id);

class ResultsScreen extends StatelessWidget {
  const ResultsScreen({super.key, required this.result, this.api});
  final Map<String, dynamic> result;
  final Api? api;

  @override
  Widget build(BuildContext context) {
    final c = result['commodity'] as Map<String, dynamic>;
    final plans = (result['plans'] as List).cast<Map<String, dynamic>>();
    final insufficient = (result['portions'] as List).where((p) => p['insufficient'] != null).toList();
    return Scaffold(
      appBar: AppBar(title: Text(T.t('options')), backgroundColor: brand, foregroundColor: Colors.white),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Row(children: [
          FoodPhoto(c['id'] as String, size: 72),
          const SizedBox(width: 12),
          Expanded(
              child: Text('${c['name']}\n${result['input']['journey']['origin']['name'].toString().split(',').first} → ${result['input']['journey']['destination']['name'].toString().split(',').first}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 8),
        for (final w in result['warnings'] as List) Notice(w as String, warn: true),
        for (final p in insufficient)
          Card(
            color: const Color(0xFFFDE8E6),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Not enough evidence yet', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFB42318))),
                Text(p['insufficient']['reason'] as String),
                const SizedBox(height: 6),
                for (final m in p['insufficient']['measurements'] as List) Text('• ${m['label']}: ${m['howToMeasure']}'),
              ]),
            ),
          ),
        for (final plan in plans) _PlanCard(plan: plan, result: result),
        const SizedBox(height: 8),
        Text(result['promise'] as String, style: const TextStyle(fontSize: 12, color: Colors.black54)),
      ]),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.result});
  final Map<String, dynamic> plan;
  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final sels = (plan['selections'] as List).cast<Map<String, dynamic>>();
    final cands = [for (final s in sels) _cand(result, s['candidateKey'] as String)];
    final worst = cands.any((c) => c['support'] == 'conditional') ? 'conditional' : 'supported';
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PlanDetail(plan: plan, result: result))),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Wrap(spacing: 6, children: [
                  for (final t in plan['tags'] as List)
                    Chip(label: Text(_tagLabel[t] ?? '$t'), backgroundColor: const Color(0xFFFBECCB), visualDensity: VisualDensity.compact),
                ]),
              ),
              SupportChip(worst),
            ]),
            Text('${T.t('total')}: ${inr(plan['cost']['totalInr'] as num)}  ·  ₹${(plan['cost']['perKgInr'] as num).toStringAsFixed(2)} ${T.t('perkg')}',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            Text('Door to door ≈ ${(plan['deliveryHours'] as num).round()} h · ${plan['transport']['label']}', style: const TextStyle(fontSize: 12)),
            const Divider(),
            for (final c in cands)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  PackPhoto(c['structureId'] as String),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(_portion(result, c['portionId'] as String)['label'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('${c['units']} × ${kgText(c['packSizeKg'] as num)} — ${Reference.plainName(c['structureId'] as String)}'
                          '${c['oxygenControl'] != 'none' ? ' + ${c['oxygenControl']}' : ''}'),
                      if (Reference.examplesFor(c['structureId'] as String).isNotEmpty)
                        Text('${T.t('looks')}: ${_looks(c['structureId'] as String)}', style: const TextStyle(fontSize: 12, color: Color(0xFF3F5859))),
                    ]),
                  ),
                ]),
              ),
            Align(alignment: Alignment.centerRight, child: Text('${T.t('why')} →', style: const TextStyle(color: brand, fontWeight: FontWeight.w700))),
          ]),
        ),
      ),
    );
  }
}

String _looks(String structureId) {
  final e = Reference.examplesFor(structureId).first;
  final brands = (e['brands'] as List).cast<String>();
  return brands.isEmpty ? (e['products'] as String).toLowerCase() : '${brands.join(', ')} ${(e['products'] as String).toLowerCase()}';
}

class PlanDetail extends StatelessWidget {
  const PlanDetail({super.key, required this.plan, required this.result});
  final Map<String, dynamic> plan;
  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final cands = [for (final s in plan['selections'] as List) _cand(result, s['candidateKey'] as String)];
    return Scaffold(
      appBar: AppBar(title: Text(T.t('why')), backgroundColor: brand, foregroundColor: Colors.white),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Text(plan['whatItCommunicates'] as String),
        const SizedBox(height: 8),
        for (final c in cands) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  PackPhoto(c['structureId'] as String, size: 64),
                  const SizedBox(width: 10),
                  Expanded(
                      child: Text('${_portion(result, c['portionId'] as String)['label']}\n${Reference.plainName(c['structureId'] as String)}',
                          style: const TextStyle(fontWeight: FontWeight.w700))),
                  SupportChip(c['support'] as String),
                ]),
                const SizedBox(height: 8),
                Text(c['explanation'] as String),
                const SizedBox(height: 8),
                ShopExamples(c['structureId'] as String),
                if ((c['conditions'] as List).isNotEmpty) ...[
                  const Text('Applies only if', style: TextStyle(fontWeight: FontWeight.w700)),
                  for (final x in c['conditions'] as List) Text('• $x'),
                ],
                if ((c['stillToCheck'] as List).isNotEmpty) ...[
                  const SizedBox(height: 6),
                  const Text('Still needs checking', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF8A5A00))),
                  for (final x in c['stillToCheck'] as List) Text('• $x', style: const TextStyle(color: Color(0xFF8A5A00))),
                ],
                const SizedBox(height: 6),
                const Text('Evidence', style: TextStyle(fontWeight: FontWeight.w700)),
                for (final e in c['evidence'] as List) Text('• ${e['label']}: ${e['value']} (${e['status']})', style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 8),
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: brand),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PackGuide(candidate: c, commodityId: result['commodity']['id'] as String))),
                  icon: const Icon(Icons.record_voice_over),
                  label: Text(T.t('howpack')),
                ),
              ]),
            ),
          ),
        ],
        const Text('Cost breakdown', style: TextStyle(fontWeight: FontWeight.w700)),
        for (final l in plan['cost']['lines'] as List)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(l['label'] as String),
            subtitle: Text('${l['basis'] == 'simulated-quote' ? 'quote (simulated)' : 'estimate'} · ${l['detail']}', style: const TextStyle(fontSize: 11)),
            trailing: Text(inr(l['amountInr'] as num)),
          ),
      ]),
    );
  }
}

/// Pictorial, spoken packing guide in the chosen language.
class PackGuide extends StatefulWidget {
  const PackGuide({super.key, required this.candidate, required this.commodityId});
  final Map<String, dynamic> candidate;
  final String commodityId;
  @override
  State<PackGuide> createState() => _PackGuideState();
}

class _PackGuideState extends State<PackGuide> {
  final tts = FlutterTts();
  int? playing;

  @override
  void dispose() {
    tts.stop();
    super.dispose();
  }

  Future<void> _say(int i, String text) async {
    await tts.stop();
    await tts.setLanguage(T.speech[T.lang]!);
    await tts.setSpeechRate(0.45);
    setState(() => playing = i);
    await tts.speak(text);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.candidate;
    final seal = c['seal'] as Map<String, dynamic>?;
    final steps = <(String, IconData, String)>[
      ('ps.prepare', Icons.cleaning_services, ''),
      ('ps.fill', Icons.scale, '${kgText(c['packSizeKg'] as num)} per pack · ${c['units']} packs'),
      if (c['oxygenControl'] != 'none') ('ps.oxygen', Icons.air, '${c['oxygenControl']}${c['oxygen']?['absorberCc'] != null ? ' · ${c['oxygen']['absorberCc']} cc sachet' : ''}'),
      if (seal != null)
        ('ps.seal', Icons.compress, '${seal['sealTempC'] != null ? 'Sealant ${seal['sealTempC'][0]}–${seal['sealTempC'][1]} °C · ' : ''}seal width ≥ ${seal['sealWidthMm']} mm'),
      if (seal != null) ('ps.check', Icons.water_drop, 'Check ${seal['sampling']['sampleSize']} packs — accept only if none leaks'),
      ('ps.group', Icons.inventory_2, c['cartons'] != null ? '${c['cartons']['unitsPerCarton']} packs per carton' : (c['crate'] != null ? '${c['crate']['crates']} crates' : '')),
      ('ps.transport', Icons.local_shipping, ''),
      ('ps.store', Icons.warehouse, (Reference.commodity(widget.commodityId)['storageAdvice'] ?? '') as String),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(T.t('howpack')), backgroundColor: brand, foregroundColor: Colors.white),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Row(children: [
          PackPhoto(c['structureId'] as String, size: 72),
          const SizedBox(width: 10),
          Expanded(child: Text(Reference.plainName(c['structureId'] as String), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 8),
        for (var i = 0; i < steps.length; i++)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CircleAvatar(radius: 28, backgroundColor: const Color(0xFFE3EFEE), child: Icon(steps[i].$2, color: brand, size: 30)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${i + 1}. ${T.t(steps[i].$1)}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                    if (steps[i].$3.isNotEmpty) Text(steps[i].$3, style: const TextStyle(fontSize: 12, color: Colors.black54)),
                    TextButton.icon(
                      onPressed: () => playing == i ? tts.stop().then((_) => setState(() => playing = null)) : _say(i, T.t(steps[i].$1)),
                      icon: Icon(playing == i ? Icons.stop : Icons.volume_up),
                      label: Text(T.t('listen')),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}
