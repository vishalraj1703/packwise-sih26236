import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'store.dart';

/// Backend base URL. Override at build time: flutter build apk --dart-define=API_BASE=http://10.0.2.2:8787
const String apiBase = String.fromEnvironment('API_BASE', defaultValue: 'https://packwise-production-fc50.up.railway.app');

class ApiException implements Exception {
  ApiException(this.message, [this.status = 0]);
  final String message;
  final int status;
  bool get offline => status == 0;
  @override
  String toString() => message;
}

/// Thin client for the Python/FastAPI backend. The token is kept in the phone's SQLite store.
class Api {
  Api(this.store);
  final Store store;
  String? _token;

  Future<void> init() async => _token = await store.get('token') as String?;
  bool get signedIn => _token != null;

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'content-type': 'application/json',
        if (_token != null) 'authorization': 'Bearer $_token',
      };

  Uri _uri(String path) => Uri.parse('$apiBase$path');

  Future<dynamic> _handle(Future<http.Response> Function() send) async {
    http.Response r;
    try {
      r = await send().timeout(const Duration(seconds: 40));
    } on SocketException {
      throw ApiException('You are offline. This needs a connection.');
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Please try again.');
    } on http.ClientException {
      throw ApiException('You are offline. This needs a connection.');
    }
    final body = r.body.isEmpty ? null : jsonDecode(utf8.decode(r.bodyBytes));
    if (r.statusCode >= 400) {
      final details = body is Map && body['details'] is List ? ' (${(body['details'] as List).join('; ')})' : '';
      throw ApiException('${body is Map ? body['error'] ?? 'Request failed' : 'Request failed'}$details', r.statusCode);
    }
    return body;
  }

  Future<dynamic> get(String path) => _handle(() => http.get(_uri(path), headers: _headers()));

  Future<dynamic> post(String path, Map<String, dynamic> body) =>
      _handle(() => http.post(_uri(path), headers: _headers(), body: jsonEncode(body)));

  Future<dynamic> multipart(String path, Map<String, String> fields, {String? fileField, String? filePath}) => _handle(() async {
        final req = http.MultipartRequest('POST', _uri(path))
          ..headers.addAll(_headers(json: false))
          ..fields.addAll(fields);
        if (fileField != null && filePath != null && File(filePath).existsSync()) {
          req.files.add(await http.MultipartFile.fromPath(fileField, filePath));
        }
        return http.Response.fromStream(await req.send());
      });

  Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await post('/api/auth/login', {'email': email, 'password': password}) as Map<String, dynamic>;
    _token = r['token'] as String;
    await store.set('token', _token);
    await store.set('user', r['user']);
    return r['user'] as Map<String, dynamic>;
  }

  Future<void> logout() async {
    try {
      await post('/api/auth/logout', {});
    } catch (_) {}
    _token = null;
    await store.remove('token');
    await store.remove('user');
  }

  /// Sends records saved while offline. Returns (sent, failed messages).
  Future<(int, List<String>)> sync() async {
    var sent = 0;
    final failed = <String>[];
    for (final row in await store.pending()) {
      try {
        final body = (jsonDecode(row['body'] as String) as Map).cast<String, dynamic>();
        if (row['file_field'] != null || body['__multipart'] == true) {
          body.remove('__multipart');
          await multipart(row['path'] as String, body.map((k, v) => MapEntry(k, '$v')),
              fileField: row['file_field'] as String?, filePath: row['file_path'] as String?);
        } else {
          await post(row['path'] as String, body);
        }
        await store.done(row['id'] as int);
        sent++;
      } on ApiException catch (e) {
        failed.add('${row['label']}: ${e.message}');
        if (e.offline) break;
      }
    }
    return (sent, failed);
  }
}
