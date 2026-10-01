import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/reference.dart';
import '../widgets/common.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.api, required this.onLanguage});
  final Api api;
  final VoidCallback onLanguage;
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  Map<String, dynamic>? user;
  int pending = 0;
  String? msg;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final u = await widget.api.store.get('user');
    final p = await widget.api.store.pending();
    setState(() {
      user = u == null ? null : (u as Map).cast<String, dynamic>();
      pending = p.length;
    });
  }

  Future<void> _login() async {
    setState(() {
      busy = true;
      msg = null;
    });
    try {
      await widget.api.login(email.text.trim(), password.text);
      password.clear();
    } on ApiException catch (e) {
      msg = e.message;
    }
    await _refresh();
    setState(() => busy = false);
  }

  Future<void> _sync() async {
    setState(() => busy = true);
    final (sent, failed) = await widget.api.sync();
    await _refresh();
    setState(() {
      busy = false;
      msg = 'Sent $sent record(s).${failed.isEmpty ? '' : ' Not sent: ${failed.join('; ')}'}';
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(T.t('account')), backgroundColor: brand, foregroundColor: Colors.white),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Language', style: TextStyle(fontWeight: FontWeight.w700)),
          SegmentedButton<String>(
            segments: [for (final e in T.names.entries) ButtonSegment(value: e.key, label: Text(e.value))],
            selected: {T.lang},
            onSelectionChanged: (s) async {
              T.lang = s.first;
              await widget.api.store.set('lang', T.lang);
              widget.onLanguage();
              setState(() {});
            },
          ),
          const Divider(height: 32),
          if (user == null) ...[
            const Text('Sign in (producers) to save assessments', style: TextStyle(fontWeight: FontWeight.w700)),
            TextField(controller: email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
            TextField(controller: password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
            const SizedBox(height: 8),
            FilledButton(onPressed: busy ? null : _login, style: FilledButton.styleFrom(backgroundColor: brand), child: const Text('Sign in')),
          ] else ...[
            ListTile(leading: const Icon(Icons.person), title: Text(user!['name'] as String), subtitle: Text('${user!['role']} · ${user!['email']}')),
            OutlinedButton(onPressed: () async {
              await widget.api.logout();
              await _refresh();
            }, child: const Text('Sign out')),
          ],
          const Divider(height: 32),
          ListTile(
            leading: const Icon(Icons.cloud_upload),
            title: Text('$pending record(s) saved offline'),
            subtitle: const Text('Issue reports and records made without internet'),
            trailing: FilledButton(onPressed: busy || pending == 0 ? null : _sync, child: const Text('Sync')),
          ),
          if (msg != null) Notice(msg!),
          const Divider(height: 32),
          Text('Server: $apiBase', style: const TextStyle(fontSize: 12, color: Colors.black54)),
          const SizedBox(height: 12),
          const Text('Photo credits', style: TextStyle(fontWeight: FontWeight.w700)),
          for (final c in Reference.credits())
            Text('${c.key}: ${c.value['title']} by ${c.value['author']} — ${c.value['license']} (Wikimedia Commons)', style: const TextStyle(fontSize: 11)),
          const SizedBox(height: 12),
          const Text('Supplier, price, transport and billing data are simulated. Commodity values are reference/seed values awaiting expert review.',
              style: TextStyle(fontSize: 11, color: Colors.black54)),
        ]),
      );
}
