import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  // Singleton
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  SupabaseClient get _client => Supabase.instance.client;

  // --------------------------------------------------------------------------
  // SESSÃO E ESTADO
  // --------------------------------------------------------------------------

  /// Retorna a sessão ativa ou null
  Session? get currentSession => _client.auth.currentSession;

  /// Retorna o usuário logado ou null
  User? get currentUser => _client.auth.currentUser;

  /// Verifica se há sessão ativa
  bool get isLoggedIn => currentSession != null;

  /// Token JWT para usar nas chamadas ao backend Express
  String? get accessToken => currentSession?.accessToken;

  /// Stream de mudanças de autenticação
  Stream<AuthState> get onAuthStateChange => _client.auth.onAuthStateChange;

  // --------------------------------------------------------------------------
  // LOGIN
  // --------------------------------------------------------------------------
  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    return await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  // --------------------------------------------------------------------------
  // CADASTRO
  // --------------------------------------------------------------------------
  Future<AuthResponse> signUp({
    required String email,
    required String password,
    required String nome,
    required String funcao,
    String? veiculoTipo,
    String? veiculoPlaca,
    String? veiculoDescricao,
  }) async {
    return await _client.auth.signUp(
      email: email,
      password: password,
      data: {
        'nome': nome,
        'funcao': funcao,
        if (veiculoTipo != null && veiculoTipo.isNotEmpty) 'veiculo_tipo': veiculoTipo,
        if (veiculoPlaca != null && veiculoPlaca.isNotEmpty) 'veiculo_placa': veiculoPlaca,
        if (veiculoDescricao != null && veiculoDescricao.isNotEmpty) 'veiculo_descricao': veiculoDescricao,
      },
    );
  }

  // --------------------------------------------------------------------------
  // LOGOUT
  // --------------------------------------------------------------------------
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  // --------------------------------------------------------------------------
  // PERFIL DO USUÁRIO
  // --------------------------------------------------------------------------
  Future<Map<String, dynamic>?> getProfile() async {
    final user = currentUser;
    if (user == null) return null;

    try {
      final response = await _client
          .from('perfis')
          .select('nome, funcao, veiculo_tipo')
          .eq('id', user.id)
          .maybeSingle();

      return response;
    } catch (e) {
      print('Erro ao buscar perfil: $e');
      // Fallback para user_metadata se a tabela perfis não estiver disponível
      return {
        'nome': user.userMetadata?['nome'] ?? user.email ?? 'Usuário',
        'funcao': user.userMetadata?['funcao'] ?? 'cidadao',
      };
    }
  }

  /// Dados do usuário para exibição (nome e função)
  Map<String, String> get displayInfo {
    final meta = currentUser?.userMetadata;
    return {
      'nome': meta?['nome'] ?? currentUser?.email ?? 'Usuário',
      'funcao': meta?['funcao'] ?? 'cidadao',
    };
  }
}
