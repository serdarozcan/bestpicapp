require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// Ortama göre doğru veritabanı yapılandırmasını seç
const knexConfig = require('../knexfile')[process.env.NODE_ENV || 'development'];
const knex = require('knex')(knexConfig);

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error('FATAL ERROR: Gerekli çevre değişkenleri (JWT_SECRET, STRIPE_SECRET_KEY) .env dosyasında tanımlanmamış.');
    // Sunucusuz ortamda process.exit() kullanmaktan kaçının.
    // Vercel loglarında hata görülecektir.
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- TEMEL MIDDLEWARE'LER ---
// Stripe webhook için özel body parser rotadan ÖNCE tanımlanmalı
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`Webhook imza doğrulama hatası:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerId = session.customer;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await knex('users')
            .where({ stripe_customer_id: customerId })
            .update({ subscription_status: subscription.status });
        console.log(`Kullanıcı ${customerId} için abonelik güncellendi: ${subscription.status}`);
    }

    // Diğer abonelik olaylarını (iptal, yenileme vb.) burada işleyebilirsiniz.
    // Örnek:
    // if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    //     const subscription = event.data.object;
    //     await knex('users')
    //         .where({ stripe_customer_id: subscription.customer })
    //         .update({ subscription_status: subscription.status });
    //     console.log(`Kullanıcı ${subscription.customer} için abonelik durumu güncellendi: ${subscription.status}`);
    // }

    res.json({received: true});
});


app.use(cors());
app.use(express.json());


// --- TÜM ROTALAR GEÇİCİ OLARAK DEVRE DIŞI BIRAKILDI ---


// --- Auth Middleware ---
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ msg: 'Token yok, yetkilendirme reddedildi.' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ msg: 'Token geçerli değil.' });
    }
};

// --- API Rotaları ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ msg: 'Lütfen tüm alanları doldurun.' });

        const existingUser = await knex('users').where({ email }).first();
        if (existingUser) return res.status(400).json({ msg: 'Bu e-posta adresi zaten kullanılıyor.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // SQLite ile uyumluluk için `.returning()` olmadan ekleme yap
        await knex('users').insert({ email, password: hashedPassword });

        // Eklenen kullanıcıyı ID'si ile bul
        const newUser = await knex('users').where({ email }).first();
        
        // Güvenlik kontrolü: Kullanıcının başarıyla oluşturulup bulunabildiğini doğrula
        if (!newUser) {
            console.error("Kayıt hatası: Kullanıcı veritabanına eklendi ancak hemen ardından bulunamadı.");
            return res.status(500).json({ msg: 'Sunucu hatası: Kullanıcı durumu doğrulanamadı.' });
        }

        // Şifreyi cevaptan kaldır
        delete newUser.password;

        res.status(201).json({ msg: 'Kullanıcı başarıyla oluşturuldu.', user: newUser });
    } catch (error) {
        console.error("Kayıt sırasında hata:", error); // Sunucu tarafında hatayı logla
        res.status(500).json({ msg: 'Bir hata oluştu, lütfen tekrar deneyin.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ msg: 'Lütfen tüm alanları doldurun.' });
        
        const user = await knex('users').where({ email }).first();
        if (!user) return res.status(400).json({ msg: 'Geçersiz kimlik bilgileri.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Geçersiz kimlik bilgileri.' });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users/me', auth, async (req, res) => {
    try {
        const user = await knex('users').where({ id: req.user.id }).select('id', 'email', 'subscription_status', 'created_at').first();
        if (!user) {
            return res.status(404).json({ msg: 'Kullanıcı bulunamadı.' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const planToPriceId = {
    starter: 'price_1Rv0oYJKzSyZI0qaL85c6iXX',
    professional: 'price_1Rv0p4JKzSyZI0qaHRIWLbgj'
};

app.post('/api/stripe/create-checkout-session', auth, async (req, res) => {
    try {
        const { plan } = req.body;
        const priceId = planToPriceId[plan];
        const userId = req.user.id;

        if (!priceId) {
            return res.status(400).json({ msg: 'Geçersiz plan seçimi.' });
        }
        
        const user = await knex('users').where({ id: userId }).first();
        let stripeCustomerId = user.stripe_customer_id;

        // DB'deki müşteri ID'sinin Stripe'da hala geçerli olup olmadığını kontrol et
        if (stripeCustomerId) {
            await stripe.customers.retrieve(stripeCustomerId)
                .catch(error => {
                    // Müşteri Stripe'da bulunamadıysa (veya başka bir hata varsa)
                    if (error.code === 'resource_missing') {
                        console.warn(`Stripe müşteri ID'si (${stripeCustomerId}) DB'de bulundu ama Stripe'da yok. Yeni bir tane oluşturulacak.`);
                        // ID'yi null yaparak yeni bir müşteri oluşturulmasını tetikle
                        stripeCustomerId = null; 
                    } else {
                        // Ağ hatası gibi beklenmedik bir hata ise, ana hata yakalayıcıya gönder
                        throw error;
                    }
                });
        }

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({ email: user.email });
            stripeCustomerId = customer.id;
            await knex('users').where({ id: userId }).update({ stripe_customer_id: stripeCustomerId });
        }
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${req.headers.origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/pricing.html`,
        });

        res.json({ url: session.url });

    } catch (error) {
        console.error('Stripe oturum oluşturma hatası:', error);
        res.status(500).json({ msg: 'Sunucu hatası, ödeme oturumu oluşturulamadı.' });
    }
});

app.post('/api/stripe/create-portal-session', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await knex('users').where({ id: userId }).first();

        if (!user || !user.stripe_customer_id) {
            return res.status(400).json({ msg: 'Stripe müşteri bilgisi bulunamadı.' });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: `${req.headers.origin}/account.html`,
        });

        res.json({ url: portalSession.url });
    } catch (error) {
        console.error('Stripe portal oturumu oluşturma hatası:', error);
        res.status(500).json({ msg: 'Sunucu hatası, portal oturumu oluşturulamadı.' });
    }
});

// Stripe webhook hariç diğer tüm rotalar /api/ öneki ile gruplandığı için
// webhook rotasını diğer json parser'lardan önce ele almak önemlidir.
// Yukarıdaki webhook kodu zaten doğru yerde.

// --- Frontend Dosyalarını Sunma ---
// VERCEL BU İŞLEMİ OTOMATİK OLARAK YAPTIĞI İÇİN BU KODLARA GEREK YOK.
// app.use(express.static(path.join(__dirname, '..')));
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, '..', 'index.html'));
// });

// Vercel'in sunucuyu kendisi başlatması için app.listen() yerine module.exports kullanılır.
module.exports = app;
