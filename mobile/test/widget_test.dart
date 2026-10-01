import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:packwise_mobile/core/i18n.dart';
import 'package:packwise_mobile/core/reference.dart';
import 'package:packwise_mobile/core/retrieval.dart';
import 'package:packwise_mobile/screens/assistant.dart';
import 'package:packwise_mobile/screens/scan.dart';
import 'package:packwise_mobile/widgets/common.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => Reference.load());

  test('reference data and photos are bundled for offline use', () {
    expect(Reference.commodities.length, greaterThanOrEqualTo(14));
    expect(Reference.foodImage('cashew-kernel'), 'assets/images/cashew-kernel.jpg');
    expect(Reference.plainName('bopp-metbopp'), contains('chips'));
    expect(Reference.examplesFor('bopp-metbopp').first['brands'], contains("Lay's"));
  });

  test('offline assistant cites the library and finds the right article', () {
    final hits = OfflineAssistant.search('how do I size micro perforations for tomato');
    expect(hits.first.$1['id'], 'K6');
    final (answer, sources) = OfflineAssistant.answer('why nitrogen flushing for cashew?');
    expect(answer, contains('[K'));
    expect(sources, isNotEmpty);
  });

  test('QR links resolve to batch tokens', () {
    expect(tokenFromQr('https://packwise-production-fc50.up.railway.app/t/FKw4Ktms4BM'), 'FKw4Ktms4BM');
    expect(tokenFromQr('https://example.com/other'), isNull);
  });

  test('Indian currency grouping', () {
    expect(inr(1234567), '₹12,34,567');
    expect(inr(950), '₹950');
  });

  test('offline journey is labelled as an estimate', () {
    final j = Reference.offlineJourney(Reference.places[0], Reference.places[1], '2026-10-05');
    expect(j['routeSource'], 'straight-line-estimate');
    expect(j['distanceKm'], greaterThan(150));
  });

  testWidgets('shop examples card shows brands with the honesty disclaimer', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ShopExamples('bopp-metbopp')))));
    expect(find.textContaining("Lay's"), findsWidgets);
    expect(find.textContaining('no brand endorses'), findsOneWidget);
  });

  testWidgets('library works offline and switches language', (tester) async {
    T.lang = 'ta';
    await tester.pumpWidget(const MaterialApp(home: LibraryScreen()));
    expect(find.text('பேக்கிங் வழிகாட்டி'), findsOneWidget);
    expect(find.textContaining('OTR'), findsWidgets);
    T.lang = 'en';
  });
}
