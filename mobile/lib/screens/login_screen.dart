import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/auth_service.dart';
import 'map_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final AuthService _auth = AuthService();
  late TabController _tabController;

  // Controllers de Login
  final _loginEmailController = TextEditingController();
  final _loginPasswordController = TextEditingController();

  // Controllers de Cadastro
  final _regNameController = TextEditingController();
  final _regEmailController = TextEditingController();
  final _regPasswordController = TextEditingController();
  final _regPlacaController = TextEditingController();
  final _regVeiculoDescController = TextEditingController();

  String _selectedFuncao = 'cidadao';
  String _selectedVeiculoTipo = '';

  bool _isLoading = false;
  String? _feedbackMessage;
  bool _isSuccess = false;

  static const Color _accentColor = Color(0xFF00f2fe);
  static const Color _successColor = Color(0xFF00d97e);
  static const Color _dangerColor = Color(0xFFff3b30);

  final Map<String, String> _funcaoLabels = {
    'cidadao': 'Cidadão',
    'motorista': 'Motorista / Transportador',
    'produtor': 'Produtor Rural',
    'secretaria_obras': 'Secretaria de Obras',
    'administrador': 'Administrador',
  };

  final Map<String, String> _veiculoLabels = {
    '': '— Nenhum —',
    'carro_passeio': 'Carro de Passeio',
    'moto': 'Moto',
    'caminhao_graos': 'Caminhão de Grãos',
    'caminhao_madeira': 'Caminhão de Madeira',
    'onibus_escolar': 'Ônibus Escolar',
    'bicicleta': 'Bicicleta',
    'outro': 'Outro',
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      setState(() {
        _feedbackMessage = null;
      });
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _loginEmailController.dispose();
    _loginPasswordController.dispose();
    _regNameController.dispose();
    _regEmailController.dispose();
    _regPasswordController.dispose();
    _regPlacaController.dispose();
    _regVeiculoDescController.dispose();
    super.dispose();
  }

  void _showFeedback(String message, {bool success = false}) {
    setState(() {
      _feedbackMessage = message;
      _isSuccess = success;
    });
  }

  void _navigateToMap() {
    final token = _auth.accessToken ?? '';
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => MapScreen(userToken: token),
      ),
    );
  }

  // ==========================================================================
  // LOGIN
  // ==========================================================================
  Future<void> _handleLogin() async {
    final email = _loginEmailController.text.trim();
    final password = _loginPasswordController.text;

    if (email.isEmpty || password.isEmpty) {
      _showFeedback('Preencha todos os campos.');
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await _auth.signIn(email: email, password: password);

      if (response.session != null) {
        _showFeedback('Login realizado! Redirecionando...', success: true);
        await Future.delayed(const Duration(milliseconds: 600));
        if (mounted) _navigateToMap();
      } else {
        _showFeedback('Erro ao entrar. Verifique suas credenciais.');
      }
    } on AuthException catch (e) {
      if (e.message.contains('Invalid login credentials')) {
        _showFeedback('E-mail ou senha incorretos.');
      } else {
        _showFeedback('Erro: ${e.message}');
      }
    } catch (e) {
      _showFeedback('Erro de conexão com o servidor.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ==========================================================================
  // CADASTRO
  // ==========================================================================
  Future<void> _handleRegister() async {
    final nome = _regNameController.text.trim();
    final email = _regEmailController.text.trim();
    final password = _regPasswordController.text;

    if (nome.isEmpty || email.isEmpty || password.isEmpty) {
      _showFeedback('Preencha nome, e-mail e senha.');
      return;
    }
    if (password.length < 6) {
      _showFeedback('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await _auth.signUp(
        email: email,
        password: password,
        nome: nome,
        funcao: _selectedFuncao,
        veiculoTipo: _selectedVeiculoTipo.isNotEmpty ? _selectedVeiculoTipo : null,
        veiculoPlaca: _regPlacaController.text.trim().isNotEmpty ? _regPlacaController.text.trim() : null,
        veiculoDescricao: _regVeiculoDescController.text.trim().isNotEmpty ? _regVeiculoDescController.text.trim() : null,
      );

      if (response.session != null) {
        _showFeedback('Conta criada com sucesso! Redirecionando...', success: true);
        await Future.delayed(const Duration(milliseconds: 600));
        if (mounted) _navigateToMap();
      } else {
        _showFeedback('Conta criada! Verifique seu e-mail para confirmar.', success: true);
      }
    } on AuthException catch (e) {
      if (e.message.contains('already registered')) {
        _showFeedback('Este e-mail já está cadastrado. Use a aba "Entrar".');
      } else {
        _showFeedback('Erro: ${e.message}');
      }
    } catch (e) {
      _showFeedback('Erro de conexão com o servidor.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ==========================================================================
  // ACESSO DEMO
  // ==========================================================================
  Future<void> _handleDemoAccess() async {
    setState(() => _isLoading = true);

    const demoEmail = 'admin@trafegoalert.local';
    const demoPassword = 'admin123456';

    try {
      // Tentar login primeiro
      AuthResponse response;
      try {
        response = await _auth.signIn(email: demoEmail, password: demoPassword);
      } on AuthException {
        // Se não existe, criar conta demo
        response = await _auth.signUp(
          email: demoEmail,
          password: demoPassword,
          nome: 'Administrador Demo',
          funcao: 'administrador',
          veiculoTipo: 'carro_passeio',
          veiculoPlaca: 'ADM-0001',
          veiculoDescricao: 'Veículo de teste',
        );

        // Se criou mas não logou, logar
        if (response.session == null) {
          response = await _auth.signIn(email: demoEmail, password: demoPassword);
        }
      }

      if (response.session != null) {
        _showFeedback('Acesso demo ativado! Redirecionando...', success: true);
        await Future.delayed(const Duration(milliseconds: 400));
        if (mounted) _navigateToMap();
      } else {
        _showFeedback('Conta demo criada. Tente novamente.');
      }
    } catch (e) {
      _showFeedback('Erro de conexão. Verifique se o Supabase está rodando.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ==========================================================================
  // INTERFACE
  // ==========================================================================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0a0c10),
      body: Stack(
        children: [
          // Fundo com gradiente animado
          _buildAnimatedBackground(),

          // Conteúdo principal
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo
                    _buildLogo(),
                    const SizedBox(height: 32),

                    // Card de autenticação
                    _buildAuthCard(),

                    const SizedBox(height: 20),

                    // Separador
                    _buildDivider(),
                    const SizedBox(height: 16),

                    // Botão demo
                    _buildDemoButton(),

                    // Feedback
                    if (_feedbackMessage != null) ...[
                      const SizedBox(height: 16),
                      _buildFeedback(),
                    ],

                    const SizedBox(height: 24),

                    // Rodapé
                    Text(
                      'QUANYX TECNOLOGIA — Hackathon 2026',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.25),
                        fontSize: 11,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnimatedBackground() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0a0c10),
            Color(0xFF0d1117),
            Color(0xFF0a0c10),
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -80,
            right: -60,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    _accentColor.withOpacity(0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -100,
            left: -80,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF7c3aed).withOpacity(0.06),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogo() {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              colors: [_accentColor, const Color(0xFF7c3aed)],
            ),
            boxShadow: [
              BoxShadow(
                color: _accentColor.withOpacity(0.3),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(Icons.shield, color: Colors.white, size: 32),
        ),
        const SizedBox(height: 16),
        const Text(
          'TrafegoAlert',
          style: TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Centro de Comando — Ariquemes/RO',
          style: TextStyle(
            color: Colors.white.withOpacity(0.4),
            fontSize: 13,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }

  Widget _buildAuthCard() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF161a22).withOpacity(0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 32,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        children: [
          // Tabs
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: TabBar(
              controller: _tabController,
              indicatorColor: _accentColor,
              indicatorWeight: 2.5,
              labelColor: _accentColor,
              unselectedLabelColor: Colors.white.withOpacity(0.4),
              labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              tabs: const [
                Tab(text: 'Entrar'),
                Tab(text: 'Cadastrar'),
              ],
            ),
          ),

          // Formulários
          AnimatedSize(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            child: SizedBox(
              height: _tabController.index == 1 ? 520 : 220,
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildLoginForm(),
                  _buildRegisterForm(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoginForm() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          _buildTextField(
            controller: _loginEmailController,
            label: 'E-mail',
            icon: Icons.mail_outline,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 14),
          _buildTextField(
            controller: _loginPasswordController,
            label: 'Senha',
            icon: Icons.lock_outline,
            obscure: true,
          ),
          const SizedBox(height: 20),
          _buildPrimaryButton(
            text: 'Entrar no Centro de Comando',
            icon: Icons.login,
            onPressed: _isLoading ? null : _handleLogin,
          ),
        ],
      ),
    );
  }

  Widget _buildRegisterForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          _buildTextField(
            controller: _regNameController,
            label: 'Nome completo',
            icon: Icons.person_outline,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _regEmailController,
            label: 'E-mail',
            icon: Icons.mail_outline,
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 12),
          _buildTextField(
            controller: _regPasswordController,
            label: 'Senha (mínimo 6 caracteres)',
            icon: Icons.lock_outline,
            obscure: true,
          ),
          const SizedBox(height: 12),
          _buildDropdown(
            label: 'Tipo de Usuário',
            icon: Icons.badge_outlined,
            value: _selectedFuncao,
            items: _funcaoLabels,
            onChanged: (val) => setState(() => _selectedFuncao = val!),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              '🚗 Veículo (opcional)',
              style: TextStyle(
                color: Colors.white.withOpacity(0.4),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 8),
          _buildDropdown(
            label: 'Tipo de Veículo',
            icon: Icons.directions_car_outlined,
            value: _selectedVeiculoTipo,
            items: _veiculoLabels,
            onChanged: (val) => setState(() => _selectedVeiculoTipo = val!),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _buildTextField(
                  controller: _regPlacaController,
                  label: 'Placa',
                  icon: Icons.confirmation_number_outlined,
                  isSmall: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildTextField(
                  controller: _regVeiculoDescController,
                  label: 'Ex: Hilux 2020',
                  icon: Icons.description_outlined,
                  isSmall: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _buildPrimaryButton(
            text: 'Criar Conta',
            icon: Icons.person_add,
            onPressed: _isLoading ? null : _handleRegister,
          ),
        ],
      ),
    );
  }

  // ==========================================================================
  // COMPONENTES REUTILIZÁVEIS
  // ==========================================================================
  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    bool obscure = false,
    TextInputType keyboardType = TextInputType.text,
    bool isSmall = false,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      style: TextStyle(color: Colors.white, fontSize: isSmall ? 13 : 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(
          color: Colors.white.withOpacity(0.35),
          fontSize: isSmall ? 12 : 13,
        ),
        prefixIcon: Icon(icon, color: Colors.white.withOpacity(0.3), size: isSmall ? 18 : 20),
        filled: true,
        fillColor: Colors.white.withOpacity(0.04),
        contentPadding: EdgeInsets.symmetric(
          vertical: isSmall ? 12 : 14,
          horizontal: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _accentColor, width: 1.5),
        ),
      ),
    );
  }

  Widget _buildDropdown({
    required String label,
    required IconData icon,
    required String value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value,
      dropdownColor: const Color(0xFF1a1e28),
      style: const TextStyle(color: Colors.white, fontSize: 13),
      icon: Icon(Icons.keyboard_arrow_down, color: Colors.white.withOpacity(0.3)),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 13),
        prefixIcon: Icon(icon, color: Colors.white.withOpacity(0.3), size: 20),
        filled: true,
        fillColor: Colors.white.withOpacity(0.04),
        contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
      ),
      items: items.entries.map((e) {
        return DropdownMenuItem(value: e.key, child: Text(e.value));
      }).toList(),
      onChanged: onChanged,
    );
  }

  Widget _buildPrimaryButton({
    required String text,
    required IconData icon,
    VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: _isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  color: Colors.black,
                  strokeWidth: 2,
                ),
              )
            : Icon(icon, size: 20),
        label: Text(
          _isLoading ? 'Aguarde...' : text,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: _accentColor,
          foregroundColor: Colors.black,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          elevation: 0,
        ),
      ),
    );
  }

  Widget _buildDivider() {
    return Row(
      children: [
        Expanded(child: Divider(color: Colors.white.withOpacity(0.08))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('ou', style: TextStyle(color: Colors.white.withOpacity(0.25), fontSize: 12)),
        ),
        Expanded(child: Divider(color: Colors.white.withOpacity(0.08))),
      ],
    );
  }

  Widget _buildDemoButton() {
    return SizedBox(
      width: double.infinity,
      height: 44,
      child: OutlinedButton.icon(
        onPressed: _isLoading ? null : _handleDemoAccess,
        icon: const Icon(Icons.flash_on, size: 18),
        label: const Text(
          'Acesso Rápido Demo (Admin)',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFfbbf24),
          side: BorderSide(color: const Color(0xFFfbbf24).withOpacity(0.3)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }

  Widget _buildFeedback() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
      decoration: BoxDecoration(
        color: (_isSuccess ? _successColor : _dangerColor).withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: (_isSuccess ? _successColor : _dangerColor).withOpacity(0.3),
        ),
      ),
      child: Text(
        _feedbackMessage!,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: _isSuccess ? _successColor : _dangerColor,
          fontSize: 13,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
