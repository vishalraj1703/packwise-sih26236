import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../widgets/common.dart';

/// Extracts the public token from a PackWise batch QR link (…/t/TOKEN).
String? tokenFromQr(String raw) {
  final m = RegExp(r'/t/([A-Za-z0-9_\-]{6,40})').firstMatch(raw);
  return m?.group(1);
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.api});
  final Api api;
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final controller = MobileScannerController();
  bool handled = false;
  final manual = TextEditingController();

  void _open(String token) {
    handled = true;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PublicBatchScreen(api: widget.api, token: token))).then((_) => handled = false);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(T.t('scan')), backgroundColor: brand, foregroundColor: Colors.white),
        body: Column(children: [
          Expanded(
            child: MobileScanner(
              controller: controller,
              onDetect: (capture) {
                if (handled) return;
                for (final b in capture.barcodes) {
                  final t = tokenFromQr(b.rawValue ?? '');
                  if (t != null) {
                    _open(t);
                    break;
                  }
                }
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(child: TextField(controller: manual, decoration: const InputDecoration(labelText: 'Or paste the QR link', border: OutlineInputBorder()))),
              IconButton(
                  onPressed: () {
                    final t = tokenFromQr(manual.text) ?? manual.text.trim();
                    if (t.isNotEmpty) _open(t);
                  },
                  icon: const Icon(Icons.arrow_forward)),
            ]),
          ),
        ]),
      );
}

class PublicBatchScreen extends StatefulWidget {
  const PublicBatchScreen({super.key, required this.api, required this.token});
  final Api api;
  final String token;
  @override
  State<PublicBatchScreen> createState() => _PublicBatchScreenState();
}

class _PublicBatchScreenState extends State<PublicBatchScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool cached = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/public/batch/${widget.token}') as Map<String, dynamic>;
      await widget.api.store.set('batch:${widget.token}', d);
      setState(() => data = d);
    } on ApiException catch (e) {
      final c = await widget.api.store.get('batch:${widget.token}');
      setState(() {
        data = c == null ? null : (c as Map).cast<String, dynamic>();
        cached = c != null;
        error = c == null ? e.message : null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = data;
    return Scaffold(
      appBar: AppBar(title: const Text('Batch record'), backgroundColor: brand, foregroundColor: Colors.white),
      body: d == null
          ? Center(child: error != null ? Padding(padding: const EdgeInsets.all(24), child: Notice(error!, warn: true)) : const CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              if (cached) const Notice('Offline — showing the copy saved on this phone.', warn: true),
              Text('Batch ${d['batchCode']}', style: const TextStyle(color: Colors.black54)),
              Text(d['commodity'] as String, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              if ((d['names'] as Map?)?[T.lang] != null) Text((d['names'] as Map)[T.lang] as String, style: const TextStyle(fontSize: 18)),
              const SizedBox(height: 12),
              _row('Producer', d['producer']),
              _row('Origin', d['origin']),
              _row('Packed on', (d['packedAt'] as String).substring(0, 10)),
              _row('Packaging', d['packaging']),
              _row('How to store', d['handling']['storage']),
              _row('Disposal', d['handling']['disposal']),
              const SizedBox(height: 8),
              const Text('Journey', style: TextStyle(fontWeight: FontWeight.w700)),
              for (final e in d['events'] as List) Text('• ${e['type']} · ${e['location'] ?? ''} · ${(e['time'] as String).substring(0, 10)}'),
              const SizedBox(height: 8),
              Text(d['note'] as String, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 16),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB42318)),
                onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _ReportSheet(api: widget.api, token: widget.token)),
                icon: const Icon(Icons.report_problem),
                label: Text(T.t('report')),
              ),
            ]),
    );
  }

  Widget _row(String k, dynamic v) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k.toUpperCase(), style: const TextStyle(fontSize: 11, color: Colors.black45, fontWeight: FontWeight.w700)),
          Text('${v ?? '–'}'),
        ]),
      );
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.api, required this.token});
  final Api api;
  final String token;
  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  static const cats = {
    'damaged-pack': 'Damaged pack',
    'leaking-seal': 'Seal open / leaking',
    'moisture-soft': 'Soft / damp / lumpy',
    'rancid-smell': 'Rancid or bad smell',
    'mould-insects': 'Mould or insects',
    'foreign-matter': 'Foreign matter',
    'wrong-quantity': 'Wrong quantity',
    'other': 'Other',
  };
  String cat = 'damaged-pack';
  final desc = TextEditingController();
  String? photo;
  String? msg;
  bool busy = false;

  Future<void> _send() async {
    setState(() => busy = true);
    final fields = {'category': cat, 'description': desc.text};
    final path = '/api/public/batch/${widget.token}/complaint';
    try {
      final r = await widget.api.multipart(path, fields, fileField: photo != null ? 'photos' : null, filePath: photo) as Map<String, dynamic>;
      setState(() => msg = r['message'] as String);
    } on ApiException catch (e) {
      if (e.offline) {
        await widget.api.store.queue(path, {...fields, '__multipart': true}, 'Issue report', fileField: photo != null ? 'photos' : null, filePath: photo);
        setState(() => msg = 'Saved on this phone. It will be sent when you are online (Account → Sync).');
      } else {
        setState(() => msg = e.message);
      }
    } finally {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(T.t('report'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          DropdownButtonFormField<String>(
              initialValue: cat, items: [for (final e in cats.entries) DropdownMenuItem(value: e.key, child: Text(e.value))], onChanged: (v) => setState(() => cat = v!)),
          TextField(controller: desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Describe the problem')),
          TextButton.icon(
            onPressed: () async {
              final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1280, imageQuality: 75);
              if (x != null) setState(() => photo = x.path);
            },
            icon: const Icon(Icons.photo_camera),
            label: Text(photo == null ? 'Add a photo (optional)' : 'Photo added ✓'),
          ),
          if (msg != null) Notice(msg!),
          FilledButton(onPressed: busy || desc.text.trim().length < 5 && msg == null ? null : _send, child: Text(T.t('send'))),
        ]),
      );
}
