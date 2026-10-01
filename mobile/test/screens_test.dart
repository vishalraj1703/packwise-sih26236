import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:packwise_mobile/core/reference.dart';
import 'package:packwise_mobile/screens/results.dart';

/// Fixtures are real outputs of the Python engine (backend/app/engine), so these
/// tests check that the phone renders what the server actually returns.
Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

Future<void> show(WidgetTester tester, Widget w) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: w));
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => Reference.load());

  testWidgets('cashew results show priced plans with pack photos and shop examples', (tester) async {
    final r = fixture('cashew');
    await show(tester, ResultsScreen(result: r));
    expect(find.textContaining('Cashew'), findsWidgets);
    expect(find.textContaining('₹'), findsWidgets);
    expect(find.byType(Image), findsWidgets);
    expect(find.textContaining('Not enough evidence'), findsNothing);
  });

  testWidgets('plan detail explains the choice and shows the evidence', (tester) async {
    final r = fixture('cashew');
    final plan = (r['plans'] as List).first as Map<String, dynamic>;
    await show(tester, PlanDetail(plan: plan, result: r));
    expect(tester.takeException(), isNull);
    expect(find.byType(Scaffold), findsOneWidget);
  });

  testWidgets('tomato (fresh produce) results render', (tester) async {
    await show(tester, ResultsScreen(result: fixture('tomato')));
    expect(find.textContaining('Tomato'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pickle without pH/salt data refuses to guess and lists what to measure', (tester) async {
    await show(tester, ResultsScreen(result: fixture('pickle')));
    expect(find.text('Not enough evidence yet'), findsOneWidget);
    expect(find.textContaining('pH meter'), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
  });
}
