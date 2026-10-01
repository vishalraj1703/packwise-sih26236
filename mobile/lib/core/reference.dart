import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/services.dart';

/// Reference data bundled with the app (works offline from first launch).
class Reference {
  Reference._();
  static late List<Map<String, dynamic>> commodities;
  static late List<Map<String, dynamic>> places;
  static late Map<String, dynamic> knowledge;
  static late List<Map<String, dynamic>> examples;
  static late String exampleDisclaimer;
  static late Map<String, String> plainNames;
  static late Map<String, String> structureFormat;
  static late Map<String, dynamic> images;

  static Future<void> load() async {
    Future<dynamic> j(String f) async => jsonDecode(await rootBundle.loadString('assets/data/$f.json'));
    commodities = (await j('commodities') as List).cast<Map<String, dynamic>>();
    places = (await j('places') as List).cast<Map<String, dynamic>>();
    knowledge = await j('knowledge') as Map<String, dynamic>;
    final ex = await j('examples') as Map<String, dynamic>;
    examples = (ex['examples'] as List).cast<Map<String, dynamic>>();
    exampleDisclaimer = ex['disclaimer'] as String;
    final packs = await j('packs') as Map<String, dynamic>;
    plainNames = (packs['plainNames'] as Map).cast<String, String>();
    structureFormat = {for (final s in (packs['structures'] as List)) s['id'] as String: s['format'] as String};
    images = await j('images') as Map<String, dynamic>;
  }

  static Map<String, dynamic> commodity(String id) => commodities.firstWhere((c) => c['id'] == id);

  static String? foodImage(String id) {
    final f = (images['foods'] as Map)[id];
    return f == null ? null : 'assets/images/${f['file']}';
  }

  static String? packImage(String structureId) {
    final f = (images['packs'] as Map)[structureFormat[structureId]];
    return f == null ? null : 'assets/images/${f['file']}';
  }

  static String plainName(String structureId) => plainNames[structureId] ?? structureId;

  static List<Map<String, dynamic>> examplesFor(String structureId) =>
      examples.where((e) => (e['structureIds'] as List).contains(structureId)).toList();

  static List<MapEntry<String, dynamic>> credits() => [
        ...(images['foods'] as Map<String, dynamic>).entries,
        ...(images['packs'] as Map<String, dynamic>).entries,
      ];

  /// Straight-line × 1.3 estimate used when the route service is unreachable (clearly labelled as assumed).
  static Map<String, dynamic> offlineJourney(Map<String, dynamic> from, Map<String, dynamic> to, String date) {
    double rad(num d) => d * math.pi / 180;
    final dLat = rad(to['lat'] - from['lat']), dLon = rad(to['lon'] - from['lon']);
    final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(from['lat'])) * math.cos(rad(to['lat'])) * math.pow(math.sin(dLon / 2), 2);
    final km = 2 * 6371 * math.asin(math.sqrt(h)) * 1.3;
    return {
      'origin': from,
      'destination': to,
      'distanceKm': km.round(),
      'driveHours': double.parse((km / 40).toStringAsFixed(1)),
      'routeSource': 'straight-line-estimate',
      'departureDate': date,
      'transitWeather': [
        {'date': date, 'tMax': 34, 'tMin': 26, 'rhMean': 75, 'precipProb': null, 'source': 'assumed'}
      ],
      'destinationClimate': {'tMean': 30, 'rhMean': 75, 'source': 'assumed', 'note': 'Offline: assumed tropical coastal conditions.'},
      'retrievedAt': DateTime.now().toIso8601String(),
      'warnings': ['Computed offline: route distance is a straight-line estimate × 1.3 and weather is an assumed scenario.'],
    };
  }
}
