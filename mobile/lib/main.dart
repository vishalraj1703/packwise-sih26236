import 'package:flutter/material.dart';

import 'core/api.dart';
import 'core/i18n.dart';
import 'core/reference.dart';
import 'core/store.dart';
import 'screens/account.dart';
import 'screens/assess.dart';
import 'screens/assistant.dart';
import 'screens/results.dart';
import 'screens/scan.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Reference.load();
  final store = await Store.open();
  T.lang = (await store.get('lang') as String?) ?? 'en';
  final api = Api(store);
  await api.init();
  runApp(PackWiseApp(api: api));
}

class PackWiseApp extends StatefulWidget {
  const PackWiseApp({super.key, required this.api});
  final Api api;
  @override
  State<PackWiseApp> createState() => _PackWiseAppState();
}

class _PackWiseAppState extends State<PackWiseApp> {
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'PackWise',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: brand), useMaterial3: true, scaffoldBackgroundColor: const Color(0xFFF6F8F7)),
        home: HomeScreen(api: widget.api, onLanguage: () => setState(() {})),
      );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.onLanguage});
  final Api api;
  final VoidCallback onLanguage;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? last;

  @override
  void initState() {
    super.initState();
    _loadLast();
  }

  Future<void> _loadLast() async {
    final l = await widget.api.store.get('last-result');
    if (mounted) setState(() => last = l == null ? null : (l as Map).cast<String, dynamic>());
  }

  void _go(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w)).then((_) {
        _loadLast();
        setState(() {});
      });

  @override
  Widget build(BuildContext context) {
    final foods = Reference.commodities.take(6).toList();
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(10), child: Container(color: brand, padding: const EdgeInsets.all(8), child: const Icon(Icons.inventory_2, color: accent))),
            const SizedBox(width: 10),
            const Text('PackWise', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: brand)),
            const Spacer(),
            PopupMenuButton<String>(
              icon: const Icon(Icons.translate),
              onSelected: (l) async {
                T.lang = l;
                await widget.api.store.set('lang', l);
                widget.onLanguage();
                setState(() {});
              },
              itemBuilder: (_) => [for (final e in T.names.entries) PopupMenuItem(value: e.key, child: Text(e.value))],
            ),
          ]),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: brand, borderRadius: BorderRadius.circular(20)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(T.t('tagline'), style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              SizedBox(
                height: 64,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final f in foods) Padding(padding: const EdgeInsets.only(right: 8), child: FoodPhoto(f['id'] as String, size: 64)),
                ]),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14)),
                onPressed: () => _go(AssessScreen(api: widget.api)),
                icon: const Icon(Icons.search),
                label: Text(T.t('start'), style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          if (last != null)
            Card(
              child: ListTile(
                leading: FoodPhoto(last!['commodity']['id'] as String, size: 48),
                title: Text('Last result: ${last!['commodity']['name']}'),
                subtitle: const Text('Saved on this phone — opens offline'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _go(ResultsScreen(result: last!, api: widget.api)),
              ),
            ),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.35,
            children: [
              _tile(Icons.qr_code_scanner, T.t('scan'), () => _go(ScanScreen(api: widget.api))),
              _tile(Icons.forum, T.t('assistant'), () => _go(AssistantScreen(api: widget.api))),
              _tile(Icons.menu_book, T.t('library'), () => _go(const LibraryScreen())),
              _tile(Icons.person, T.t('account'), () => _go(AccountScreen(api: widget.api, onLanguage: widget.onLanguage))),
            ],
          ),
          const SizedBox(height: 12),
          const Text('For each recommendation, PackWise shows why it fits, what evidence supports it, what conditions it needs and what still needs checking.',
              style: TextStyle(fontSize: 12, color: Colors.black54)),
        ]),
      ),
    );
  }

  Widget _tile(IconData icon, String label, VoidCallback onTap) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Icon(icon, color: brand, size: 32),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      );
}
