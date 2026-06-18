import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/login_screen.dart';
import 'screens/map_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Inicializar Supabase
  await Supabase.initialize(
    url: 'https://baas-trafegoalerta.bisn.com.br',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgxNTk5MjA4LCJleHAiOjQ5MzUxOTkyMDh9.EhKoHMrwcwgOY9QYNi0ZP09GeeouHZKLrNk_62jy9-c',
  );

  runApp(const TrafegoAlertApp());
}

class TrafegoAlertApp extends StatelessWidget {
  const TrafegoAlertApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TrafegoAlerta',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0d0f12),
        primaryColor: const Color(0xFF00f2fe),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00f2fe),
          secondary: Color(0xFF00ff88),
        ),
      ),
      home: const AuthGate(),
    );
  }
}

/// Roteador de autenticação reativo: se logado → MapScreen, senão → LoginScreen
class AuthGate extends StatefulWidget {
  const AuthGate({Key? key}) : super(key: key);

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  void initState() {
    super.initState();
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;

    if (session != null) {
      return MapScreen(userToken: session.accessToken);
    } else {
      return const LoginScreen();
    }
  }
}
