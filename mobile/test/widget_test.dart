import 'package:flutter_test/flutter_test.dart';
import 'package:trafego_alert_mobile/main.dart';

void main() {
  testWidgets('Smoke test app launch', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const TrafegoAlertApp());

    // Verify app exists and starts up
    expect(find.byType(TrafegoAlertApp), findsOneWidget);
  });
}
