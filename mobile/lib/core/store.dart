import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Offline storage on the phone (SQLite): cached reference data and results, the
/// sign-in token, and an outbox of records made offline that are sent later.
class Store {
  Store._(this._db);
  final Database _db;
  static Store? _instance;

  static Future<Store> open() async {
    if (_instance != null) return _instance!;
    final db = await openDatabase(
      p.join(await getDatabasesPath(), 'packwise.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        await db.execute('CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, body TEXT NOT NULL, '
            'file_field TEXT, file_path TEXT, label TEXT NOT NULL, created_at TEXT NOT NULL)');
      },
    );
    return _instance = Store._(db);
  }

  Future<dynamic> get(String key) async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: [key]);
    return rows.isEmpty ? null : jsonDecode(rows.first['value'] as String);
  }

  Future<void> set(String key, dynamic value) =>
      _db.insert('kv', {'key': key, 'value': jsonEncode(value)}, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> remove(String key) => _db.delete('kv', where: 'key = ?', whereArgs: [key]);

  Future<void> queue(String path, Map<String, dynamic> body, String label, {String? fileField, String? filePath}) =>
      _db.insert('outbox', {
        'path': path,
        'body': jsonEncode(body),
        'file_field': fileField,
        'file_path': filePath,
        'label': label,
        'created_at': DateTime.now().toIso8601String(),
      });

  Future<List<Map<String, Object?>>> pending() => _db.query('outbox', orderBy: 'id');

  Future<void> done(int id) => _db.delete('outbox', where: 'id = ?', whereArgs: [id]);
}
