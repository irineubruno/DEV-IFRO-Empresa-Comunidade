// ==========================================================================
// LOGIN / CADASTRO — TRAFEGOALERT
// Autenticação via Supabase Auth
// ==========================================================================

const SUPABASE_URL = "https://baas-trafegoalerta.bisn.com.br";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgxNTk5MjA4LCJleHAiOjQ5MzUxOTkyMDh9.EhKoHMrwcwgOY9QYNi0ZP09GeeouHZKLrNk_62jy9-c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
window.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // Verificar se já está logado
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = '/';
    return;
  }

  setupTabSwitching();
  setupLoginForm();
  setupRegisterForm();
  setupDemoAccess();
});

// ==========================================================================
// ABAS LOGIN / CADASTRO
// ==========================================================================
function setupTabSwitching() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'flex';
    formRegister.style.display = 'none';
    hideFeedback();
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = 'flex';
    formLogin.style.display = 'none';
    hideFeedback();
  });
}

// ==========================================================================
// FORMULÁRIO DE LOGIN
// ==========================================================================
function setupLoginForm() {
  const form = document.getElementById('form-login');
  const btn = document.getElementById('btn-login');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showFeedback('Preencha todos os campos.', 'error');
      return;
    }

    setButtonLoading(btn, true);

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          showFeedback('E-mail ou senha incorretos.', 'error');
        } else {
          showFeedback('Erro ao entrar: ' + error.message, 'error');
        }
        setButtonLoading(btn, false);
        return;
      }

      showFeedback('Login realizado com sucesso! Redirecionando...', 'success');
      
      setTimeout(() => {
        window.location.href = '/';
      }, 800);

    } catch (err) {
      showFeedback('Erro de conexão com o servidor.', 'error');
      setButtonLoading(btn, false);
    }
  });
}

// ==========================================================================
// FORMULÁRIO DE CADASTRO
// ==========================================================================
function setupRegisterForm() {
  const form = document.getElementById('form-register');
  const btn = document.getElementById('btn-register');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const funcao = document.getElementById('reg-funcao').value;
    const veiculoTipo = document.getElementById('reg-veiculo-tipo').value;
    const veiculoPlaca = document.getElementById('reg-veiculo-placa').value.trim();
    const veiculoDesc = document.getElementById('reg-veiculo-desc').value.trim();

    if (!nome || !email || !password) {
      showFeedback('Preencha nome, e-mail e senha.', 'error');
      return;
    }

    if (password.length < 6) {
      showFeedback('A senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }

    setButtonLoading(btn, true);

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome,
            funcao,
            veiculo_tipo: veiculoTipo || null,
            veiculo_placa: veiculoPlaca || null,
            veiculo_descricao: veiculoDesc || null
          }
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          showFeedback('Este e-mail já está cadastrado. Use a aba "Entrar".', 'error');
        } else {
          showFeedback('Erro ao cadastrar: ' + error.message, 'error');
        }
        setButtonLoading(btn, false);
        return;
      }

      // Em Supabase local, o email confirmation é desabilitado por padrão,
      // então o usuário já fica logado após o signUp
      if (data.session) {
        showFeedback('Conta criada com sucesso! Redirecionando...', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 800);
      } else {
        showFeedback('Conta criada! Verifique seu e-mail para confirmar o acesso.', 'info');
        setButtonLoading(btn, false);
      }

    } catch (err) {
      showFeedback('Erro de conexão com o servidor.', 'error');
      setButtonLoading(btn, false);
    }
  });
}

// ==========================================================================
// ACESSO RÁPIDO DEMO
// ==========================================================================
function setupDemoAccess() {
  const btn = document.getElementById('btn-demo');

  btn.addEventListener('click', async () => {
    setButtonLoading(btn, true, 'Entrando...');

    const demoEmail = 'admin@trafegoalert.local';
    const demoPassword = 'admin123456';

    try {
      // Tentar logar primeiro
      let { data, error } = await supabaseClient.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword
      });

      // Se não existir, criar conta demo
      if (error) {
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
          email: demoEmail,
          password: demoPassword,
          options: {
            data: {
              nome: 'Administrador Demo',
              funcao: 'administrador',
              veiculo_tipo: 'carro_passeio',
              veiculo_placa: 'ADM-0001',
              veiculo_descricao: 'Veículo de teste do sistema'
            }
          }
        });

        if (signUpError) {
          showFeedback('Erro ao criar conta demo: ' + signUpError.message, 'error');
          setButtonLoading(btn, false);
          return;
        }

        data = signUpData;
      }

      if (data.session) {
        showFeedback('Acesso demo ativado! Redirecionando...', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 600);
      } else {
        // Tentar logar novamente após criação
        const { data: retryData, error: retryError } = await supabaseClient.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword
        });

        if (retryError) {
          showFeedback('Conta demo criada. Confirme o e-mail ou tente novamente.', 'info');
          setButtonLoading(btn, false);
        } else {
          showFeedback('Acesso demo ativado! Redirecionando...', 'success');
          setTimeout(() => {
            window.location.href = '/';
          }, 600);
        }
      }

    } catch (err) {
      showFeedback('Erro de conexão. Verifique se o Supabase está rodando.', 'error');
      setButtonLoading(btn, false);
    }
  });
}

// ==========================================================================
// UTILITÁRIOS DE UI
// ==========================================================================
function showFeedback(text, type = 'info') {
  const el = document.getElementById('auth-feedback');
  const span = document.getElementById('feedback-text');
  
  el.style.display = 'block';
  el.className = `auth-feedback ${type}`;
  span.innerText = text;
}

function hideFeedback() {
  const el = document.getElementById('auth-feedback');
  el.style.display = 'none';
}

function setButtonLoading(btn, loading, loadingText = null) {
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="spin"></i> ${loadingText || 'Aguarde...'}`;
    lucide.createIcons();
  } else {
    btn.disabled = false;
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      lucide.createIcons();
    }
  }
}
