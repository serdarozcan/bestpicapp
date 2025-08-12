document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = ''; // Sunucu aynı adresten dosyaları sunduğu için boş bırakılabilir
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorToast = document.getElementById('error-toast');

    // --- Olay Dinleyicileri ---

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = registerForm.email.value;
            const password = registerForm.password.value;
            const passwordConfirm = registerForm['password-confirm'].value;

            if (password !== passwordConfirm) {
                return showError('Şifreler uyuşmuyor.');
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.msg || 'Bir hata oluştu.');
                }
                
                // Kayıt başarılı, kullanıcıyı giriş sayfasına yönlendir
                window.location.href = 'login.html';

            } catch (error) {
                showError(error.message);
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;

            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.msg || 'Bir hata oluştu.');
                }

                // Giriş başarılı, token'ı kaydet ve ana sayfaya yönlendir
                localStorage.setItem('token', data.token);
                window.location.href = 'index.html';

            } catch (error) {
                showError(error.message);
            }
        });
    }

    // --- Yardımcı Fonksiyonlar ---

    function showError(message) {
        errorToast.textContent = message;
        errorToast.classList.add('show');
        setTimeout(() => {
            errorToast.classList.remove('show');
        }, 3000);
    }
});
