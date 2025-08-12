document.addEventListener('DOMContentLoaded', () => {
    const planButtons = document.querySelectorAll('.plan-button');
    const API_BASE_URL = ''; // Sunucu aynı adresten dosyaları sunduğu için boş bırakılabilir

    planButtons.forEach(button => {
        button.addEventListener('click', () => {
            const plan = button.dataset.plan;
            
            // "Bize Ulaşın" butonu için özel davranış
            if (plan === 'enterprise') {
                window.location.href = 'mailto:sales@example.com';
                return;
            }
            
            // Kullanıcı giriş yapmış mı diye kontrol et
            const token = localStorage.getItem('token');
            if (!token) {
                // Giriş yapmamışsa, giriş sayfasına yönlendir.
                // Başarılı girişten sonra bu sayfaya geri dönebilmesi için hedefi parametre olarak ekle.
                window.location.href = `login.html?redirect=pricing.html&plan=${plan}`;
                return;
            }

            // Giriş yapmışsa, ödeme sürecini başlat
            createCheckoutSession(plan, token);
        });
    });

    async function createCheckoutSession(plan, token) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/stripe/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ plan: plan })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.msg || 'Ödeme oturumu oluşturulamadı.');
            }

            const { url } = await res.json();
            // Kullanıcıyı Stripe ödeme sayfasına yönlendir
            window.location.href = url;

        } catch (error) {
            alert(`Hata: ${error.message}`); // Daha şık bir hata gösterimi yapılabilir (toast gibi)
        }
    }
});
