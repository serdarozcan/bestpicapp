document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = ''; // Adresi göreceli hale getirerek hem lokalde hem de canlıda çalışmasını sağla
    
    // --- DOM Elementleri ---
    const userEmailSpan = document.getElementById('user-email');
    const subscriptionStatusSpan = document.getElementById('subscription-status');
    const manageSubscriptionButton = document.getElementById('manage-subscription-button');
    const guestLinks = document.getElementById('guest-links');
    const userLinks = document.getElementById('user-links');
    const logoutButton = document.getElementById('logout-button');

    // --- Başlangıç Fonksiyonları ---

    async function initialize() {
        const token = localStorage.getItem('token');
        if (!token) {
            // Token yoksa, kullanıcıyı giriş sayfasına yönlendir
            window.location.href = 'login.html';
            return;
        }

        // Navigasyon barını ayarla
        guestLinks.style.display = 'none';
        userLinks.style.display = 'block';

        // Kullanıcı verilerini çek ve göster
        try {
            const res = await fetch(`${API_BASE_URL}/api/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                // Token geçersizse token'ı sil ve giriş sayfasına yönlendir
                localStorage.removeItem('token');
                window.location.href = 'login.html';
                throw new Error('Oturum geçersiz.');
            }

            const user = await res.json();
            userEmailSpan.textContent = user.email;
            subscriptionStatusSpan.textContent = translateSubscriptionStatus(user.subscription_status);

        } catch (error) {
            console.error('Kullanıcı verileri alınamadı:', error);
        }
    }

    // --- Olay Dinleyicileri ---

    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        window.location.href = 'index.html';
    });

    manageSubscriptionButton.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE_URL}/api/stripe/create-portal-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.msg || 'Portal oturu-mu oluşturulamadı.');
            }
            
            const { url } = await res.json();
            // Kullanıcıyı Stripe Müşteri Portalı'na yönlendir
            window.location.href = url;

        } catch (error) {
            alert(`Hata: ${error.message}`);
        }
    });

    // --- Yardımcı Fonksiyonlar ---

    function translateSubscriptionStatus(status) {
        switch (status) {
            case 'active':
                return 'Aktif';
            case 'inactive':
                return 'Pasif';
            case 'trialing':
                return 'Deneme Sürümü';
            case 'past_due':
                return 'Ödeme Gecikmiş';
            default:
                return status;
        }
    }
    
    // --- Başlangıç ---
    initialize();
});
