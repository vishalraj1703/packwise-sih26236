import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/reference.dart';
import '../core/retrieval.dart';
import '../widgets/common.dart';

class _Msg {
  _Msg(this.user, this.text, {this.mode = '', this.sources = const []});
  final bool user;
  final String text;
  final String mode;
  final List<String> sources;
}

/// Assistant: answers from the reviewed library on the phone (offline). When online and the
/// server has a hosted LLM configured, it explains using the same retrieved evidence.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key, required this.api});
  final Api api;
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final msgs = <_Msg>[];
  final q = TextEditingController();
  bool busy = false;
  static const suggestions = ['Why does cashew need nitrogen for 5 months?', 'What do OTR and WVTR mean?', 'How many packs should I leak-test?', 'Why do tomatoes go sour in hot transport?'];

  Future<void> _ask(String text) async {
    if (text.trim().isEmpty) return;
    setState(() {
      msgs.add(_Msg(true, text));
      busy = true;
    });
    q.clear();
    try {
      final status = await widget.api.get('/api/status') as Map<String, dynamic>;
      if (status['ai'] != true) throw ApiException('no-ai', 503);
      final r = await widget.api.post('/api/ai/chat', {
        'question': text,
        'history': [for (final m in msgs.take(msgs.length - 1)) {'role': m.user ? 'user' : 'assistant', 'content': m.text}],
        'language': {'en': 'English', 'ta': 'Tamil', 'hi': 'Hindi'}[T.lang],
      }) as Map<String, dynamic>;
      msgs.add(_Msg(false, r['answer'] as String, mode: 'online explainer', sources: [for (final p in r['passages'] as List) '[${p['id']}] ${p['title']}']));
    } on ApiException {
      final (answer, hits) = OfflineAssistant.answer(text);
      msgs.add(_Msg(false, answer, mode: 'offline library · ${Reference.knowledge['updated']}', sources: [for (final h in hits) '[${h['id']}] ${h['title']}']));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(T.t('assistant')), backgroundColor: brand, foregroundColor: Colors.white),
        body: Column(children: [
          const Notice('Answers come from the reviewed packaging library and never invent OTR, WVTR, thickness, gas mixtures or expiry dates.'),
          Expanded(
            child: ListView(padding: const EdgeInsets.all(12), children: [
              if (msgs.isEmpty) Wrap(spacing: 6, runSpacing: 6, children: [for (final s in suggestions) ActionChip(label: Text(s), onPressed: () => _ask(s))]),
              for (final m in msgs)
                Align(
                  alignment: m.user ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.all(12),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
                    decoration: BoxDecoration(color: m.user ? brand : const Color(0xFFF1F4F3), borderRadius: BorderRadius.circular(14)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(m.text, style: TextStyle(color: m.user ? Colors.white : Colors.black87)),
                      if (!m.user) ...[
                        const SizedBox(height: 4),
                        Text(m.mode, style: const TextStyle(fontSize: 11, color: Colors.black45)),
                        for (final s in m.sources) Text(s, style: const TextStyle(fontSize: 11, color: Colors.black54)),
                      ],
                    ]),
                  ),
                ),
              if (busy) const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
            ]),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(child: TextField(controller: q, decoration: const InputDecoration(hintText: 'Ask about packing, sealing, moisture…', border: OutlineInputBorder()), onSubmitted: _ask)),
                IconButton.filled(onPressed: busy ? null : () => _ask(q.text), icon: const Icon(Icons.send), style: IconButton.styleFrom(backgroundColor: brand)),
              ]),
            ),
          ),
        ]),
      );
}

class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final articles = (Reference.knowledge['articles'] as List).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: Text(T.t('library')), backgroundColor: brand, foregroundColor: Colors.white),
      body: ListView(children: [
        Padding(padding: const EdgeInsets.all(12), child: Text('Works offline · library updated ${Reference.knowledge['updated']} · drafts pending expert review', style: const TextStyle(fontSize: 12))),
        for (final a in articles)
          ExpansionTile(
            title: Text(a['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(a['id'] as String),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            children: [Text(a['text'] as String)],
          ),
      ]),
    );
  }
}
