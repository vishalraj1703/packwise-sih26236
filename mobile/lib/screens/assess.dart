import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/reference.dart';
import '../widgets/common.dart';
import 'results.dart';

/// Farmer-friendly assessment: food (photo or pick) → order → journey → equipment → options.
class AssessScreen extends StatefulWidget {
  const AssessScreen({super.key, required this.api});
  final Api api;
  @override
  State<AssessScreen> createState() => _AssessScreenState();
}

class _Portion {
  _Portion(this.label, this.kg, this.days, this.use, this.storage);
  String label;
  double kg;
  double days;
  String use;
  String storage;
  Map<String, dynamic> toJson(int i) => {
        'id': 'p${i + 1}',
        'label': label,
        'kg': kg,
        'use': use,
        'storageDays': days,
        'storage': {'type': storage, 'status': 'assumed'},
      };
}

class _AssessScreenState extends State<AssessScreen> {
  int step = 0;
  String? commodityId;
  String? state;
  bool confirmed = false;
  String identMethod = 'user-select';
  String? aiNote;
  String search = '';
  final portions = <_Portion>[_Portion('Portion 1', 50, 14, 'retail', 'ambient-room')];
  Map<String, dynamic>? from = Reference.places[0], to = Reference.places[1];
  DateTime departure = DateTime.now().add(const Duration(days: 3));
  Map<String, dynamic>? journey;
  final equipment = <String>{'heat-impulse'};
  double? moisture;
  bool busy = false;
  String? error;

  Map<String, dynamic> get commodity => Reference.commodity(commodityId!);

  Future<void> _photo() async {
    final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1280, imageQuality: 80);
    if (x == null) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await widget.api.multipart('/api/ai/identify', {}, fileField: 'photo', filePath: x.path) as Map<String, dynamic>;
      final cands = (r['candidates'] as List).cast<Map<String, dynamic>>().where((c) => c['commodityId'] != 'other').toList();
      if (!mounted) return;
      if (cands.isEmpty) {
        setState(() => error = 'The photo did not match a food in the list. Please choose it below.');
      } else {
        final best = cands.first;
        final c = Reference.commodity(best['commodityId'] as String);
        setState(() {
          commodityId = c['id'] as String;
          state = (c['states'] as List).contains(best['processingState']) ? best['processingState'] as String : c['defaultState'] as String;
          identMethod = 'photo-ai';
          confirmed = false;
          aiNote = '${best['commonName']} (${((best['confidence'] as num) * 100).round()}%) — ${best['visibleCondition']}';
        });
      }
    } on ApiException catch (e) {
      setState(() => error = e.status == 503 ? 'Photo identification is not available right now. Please choose your food below.' : e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _analyzeJourney() async {
    setState(() {
      busy = true;
      error = null;
    });
    final date = departure.toIso8601String().substring(0, 10);
    final maxDays = portions.map((p) => p.days).reduce((a, b) => a > b ? a : b);
    try {
      journey = await widget.api.post('/api/journey/analyze', {'origin': from, 'destination': to, 'departureDate': date, 'storageDays': maxDays})
          as Map<String, dynamic>;
    } on ApiException {
      journey = Reference.offlineJourney(from!, to!, date);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _run() async {
    setState(() {
      busy = true;
      error = null;
    });
    final input = {
      'commodityId': commodityId,
      'state': state,
      'identification': {'method': identMethod, 'confirmed': confirmed},
      'portions': [for (var i = 0; i < portions.length; i++) portions[i].toJson(i)],
      'properties': {
        if (moisture != null)
          'initialMoistureWb': {'value': moisture, 'lo': moisture! - 0.3, 'hi': moisture! + 0.3, 'unit': '% w.b.', 'status': 'measured'}
      },
      'equipment': equipment.toList(),
      'journey': journey,
      'userState': from?['state'],
    };
    try {
      final r = widget.api.signedIn
          ? ((await widget.api.post('/api/assessments', {'input': input})) as Map<String, dynamic>)['result']
          : await widget.api.post('/api/assessments/compute', input);
      await widget.api.store.set('last-result', r);
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultsScreen(result: (r as Map).cast<String, dynamic>(), api: widget.api)));
    } on ApiException catch (e) {
      setState(() => error = e.offline ? '${T.t('offline')} Your last saved result is under Home.' : e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  bool get canNext => switch (step) {
        0 => commodityId != null && confirmed,
        1 => portions.every((p) => p.kg > 0),
        2 => journey != null,
        _ => true,
      };

  @override
  Widget build(BuildContext context) {
    final steps = [_food, _order, _journey, _equipment];
    return Scaffold(
      appBar: AppBar(title: Text(T.t('start')), backgroundColor: brand, foregroundColor: Colors.white),
      body: Column(children: [
        LinearProgressIndicator(value: (step + 1) / steps.length, color: accent, backgroundColor: const Color(0xFFE3EFEE)),
        if (busy) const LinearProgressIndicator(),
        Expanded(child: ListView(padding: const EdgeInsets.all(16), children: [steps[step](), if (error != null) Notice(error!, warn: true)])),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              if (step > 0) OutlinedButton(onPressed: busy ? null : () => setState(() => step--), child: Text(T.t('back'))),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: step == steps.length - 1 ? accent : brand, foregroundColor: step == steps.length - 1 ? Colors.black : Colors.white),
                onPressed: busy || !canNext ? null : () => step == steps.length - 1 ? _run() : setState(() => step++),
                child: Text(step == steps.length - 1 ? T.t('show') : T.t('next')),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _food() {
    final list = Reference.commodities
        .where((c) => search.isEmpty || '${c['name']} ${(c['aliases'] as List).join(' ')} ${(c['names'] as Map).values.join(' ')}'.toLowerCase().contains(search.toLowerCase()))
        .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      FilledButton.icon(
          onPressed: busy ? null : _photo, icon: const Icon(Icons.photo_camera), label: Text(T.t('photo')), style: FilledButton.styleFrom(backgroundColor: brand, padding: const EdgeInsets.all(16))),
      const Padding(
          padding: EdgeInsets.symmetric(vertical: 6),
          child: Text('A photo can suggest the food and how it looks. It cannot measure moisture, pH, fat or freshness.', style: TextStyle(fontSize: 12, color: Colors.black54))),
      if (aiNote != null) Notice('Photo suggestion: $aiNote — please confirm below.'),
      const SizedBox(height: 8),
      Text(T.t('orchoose'), style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'cashew, தக்காளி, नूडल्स…', border: OutlineInputBorder()), onChanged: (v) => setState(() => search = v)),
      const SizedBox(height: 8),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.78,
        children: [
          for (final c in list)
            InkWell(
              onTap: () => setState(() {
                commodityId = c['id'] as String;
                state = c['defaultState'] as String;
                identMethod = 'user-select';
                confirmed = false;
                aiNote = null;
              }),
              child: Container(
                decoration: BoxDecoration(
                    border: Border.all(color: commodityId == c['id'] ? brand : const Color(0xFFDFE7E6), width: commodityId == c['id'] ? 3 : 1),
                    borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.all(6),
                child: Column(children: [
                  Expanded(child: FoodPhoto(c['id'] as String, size: double.infinity)),
                  const SizedBox(height: 4),
                  Text(c['name'] as String, maxLines: 2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                  Text((c['names'] as Map)[T.lang == 'en' ? 'ta' : T.lang] ?? '', maxLines: 1, style: const TextStyle(fontSize: 10, color: Colors.black54)),
                ]),
              ),
            ),
        ],
      ),
      if (commodityId != null) ...[
        const SizedBox(height: 12),
        Row(children: [
          FoodPhoto(commodityId!, size: 64),
          const SizedBox(width: 12),
          Expanded(
              child: DropdownButtonFormField<String>(
            initialValue: state,
            decoration: const InputDecoration(labelText: 'Processing state', border: OutlineInputBorder()),
            items: [for (final s in commodity['states'] as List) DropdownMenuItem(value: s as String, child: Text(s))],
            onChanged: (v) => setState(() => state = v),
          )),
        ]),
        CheckboxListTile(value: confirmed, onChanged: (v) => setState(() => confirmed = v ?? false), title: Text('${T.t('confirm')}: ${commodity['name']}')),
      ],
    ]);
  }

  Widget _order() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < portions.length; i++)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text(portions[i].label, style: const TextStyle(fontWeight: FontWeight.w700))),
                  if (portions.length > 1) IconButton(onPressed: () => setState(() => portions.removeAt(i)), icon: const Icon(Icons.delete_outline)),
                ]),
                TextFormField(
                    initialValue: portions[i].kg.toString(),
                    decoration: InputDecoration(labelText: T.t('qty')),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => portions[i].kg = double.tryParse(v) ?? 0),
                TextFormField(
                    initialValue: portions[i].days.toString(),
                    decoration: InputDecoration(labelText: T.t('days')),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => portions[i].days = double.tryParse(v) ?? 0),
                DropdownButtonFormField<String>(
                  initialValue: portions[i].use,
                  decoration: InputDecoration(labelText: T.t('use')),
                  items: [DropdownMenuItem(value: 'retail', child: Text(T.t('retail'))), DropdownMenuItem(value: 'bulk', child: Text(T.t('bulk')))],
                  onChanged: (v) => setState(() => portions[i].use = v!),
                ),
                DropdownButtonFormField<String>(
                  initialValue: portions[i].storage,
                  decoration: InputDecoration(labelText: T.t('room')),
                  items: const [
                    DropdownMenuItem(value: 'ambient-room', child: Text('Ordinary room')),
                    DropdownMenuItem(value: 'cool-room', child: Text('Cool room (~15 °C)')),
                    DropdownMenuItem(value: 'cold-room', child: Text('Cold room (~4 °C)')),
                    DropdownMenuItem(value: 'retail-shelf', child: Text('Shop shelf')),
                  ],
                  onChanged: (v) => setState(() => portions[i].storage = v!),
                ),
              ]),
            ),
          ),
        if (portions.length < 4)
          TextButton.icon(
              onPressed: () => setState(() => portions.add(_Portion('Portion ${portions.length + 1}', 10, 14, 'retail', 'ambient-room'))),
              icon: const Icon(Icons.add),
              label: const Text('Add another portion (different storage or use)')),
      ]);

  Widget _journey() {
    DropdownButtonFormField<int> place(String label, Map<String, dynamic>? v, void Function(Map<String, dynamic>) set) => DropdownButtonFormField<int>(
          initialValue: v == null ? null : Reference.places.indexWhere((p) => p['name'] == v['name']),
          isExpanded: true,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
          items: [for (var i = 0; i < Reference.places.length; i++) DropdownMenuItem(value: i, child: Text(Reference.places[i]['name'] as String, overflow: TextOverflow.ellipsis))],
          onChanged: (i) => setState(() {
            set(Reference.places[i!]);
            journey = null;
          }),
        );
    final j = journey;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      place(T.t('from'), from, (p) => from = p),
      const SizedBox(height: 10),
      place(T.t('to'), to, (p) => to = p),
      const SizedBox(height: 10),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.event),
        title: Text('${T.t('date')}: ${departure.toIso8601String().substring(0, 10)}'),
        onTap: () async {
          final d = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: departure);
          if (d != null) {
            setState(() {
              departure = d;
              journey = null;
            });
          }
        },
      ),
      FilledButton.icon(
          onPressed: busy ? null : _analyzeJourney, icon: const Icon(Icons.route), label: const Text('Check route & weather'), style: FilledButton.styleFrom(backgroundColor: brand)),
      if (j != null) ...[
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${j['distanceKm']} km · about ${j['driveHours']} h driving', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(j['routeSource'] == 'osrm' ? 'Road route' : 'Estimated distance (offline)', style: const TextStyle(fontSize: 12)),
              for (final w in j['transitWeather'] as List)
                Text('${w['date']}: ${w['tMin']}–${w['tMax']} °C, ${w['rhMean']}% humidity${w['precipProb'] != null ? ', rain ${w['precipProb']}%' : ''} (${w['source']})'),
              for (final w in j['warnings'] as List) Notice(w as String, warn: true),
            ]),
          ),
        ),
      ],
    ]);
  }

  Widget _equipment() {
    const labels = {
      'heat-impulse': 'Hand impulse sealer',
      'band-sealer': 'Band sealer',
      'vacuum-chamber': 'Vacuum machine',
      'vacuum-gas-flush': 'Vacuum + nitrogen machine',
      'can-seamer': 'Can seamer',
      'sack-stitch': 'Sack stitching machine',
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(T.t('sealer'), style: const TextStyle(fontWeight: FontWeight.w700)),
      Wrap(spacing: 8, children: [
        for (final e in labels.entries)
          FilterChip(
              label: Text(e.value),
              selected: equipment.contains(e.key),
              onSelected: (v) => setState(() => v ? equipment.add(e.key) : equipment.remove(e.key))),
      ]),
      const Text('No machine? PackWise can suggest a nearby packing service instead.', style: TextStyle(fontSize: 12, color: Colors.black54)),
      if (commodity['moisture'] != null) ...[
        const SizedBox(height: 16),
        TextField(
          decoration: InputDecoration(
              labelText: 'Measured moisture % (optional)',
              helperText: 'Leave empty to use the reference range ${commodity['moisture']['initialWb']['lo']}–${commodity['moisture']['initialWb']['hi']}%',
              border: const OutlineInputBorder()),
          keyboardType: TextInputType.number,
          onChanged: (v) => moisture = double.tryParse(v),
        ),
      ],
      if ((commodity['requiredMeasurements'] as List?)?.isNotEmpty ?? false)
        Notice('This food needs lab measurements (${(commodity['requiredMeasurements'] as List).map((m) => m['label']).join(', ')}). '
            'PackWise will tell you exactly what to measure before recommending packaging.', warn: true),
    ]);
  }
}
