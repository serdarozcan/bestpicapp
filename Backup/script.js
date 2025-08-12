document.addEventListener('DOMContentLoaded', () => {
    // --- API Bilgileri (Değişkenler) ---
    const IMAGE_UPLOAD_API_KEY = '3b7f1bd63e8992ea2ed1fcb052074bd5';
    const FAL_AUTH_KEY = 'Key 27a60dfe-c523-45a5-8536-9b695e823da9:1a11deb7858d51cc4150d139cb60d88a';
    const FAL_API_BASE_URL = 'https://queue.fal.run/fal-ai/flux-pro';
    const IMAGE_UPLOAD_API_URL = 'https://api.imgbb.com/1/upload';

    // --- DOM Elementleri ---
    const uploadBox = document.getElementById('upload-box');
    const imageInput = document.getElementById('image-input');
    const processButton = document.getElementById('process-button');
    const promptInput = document.getElementById('prompt-input'); // Prompt input'unu ekle
    const styleCards = document.querySelectorAll('.style-card'); // Stil kartlarını seç
    const originalImage = document.getElementById('original-image');
    const processedImage = document.getElementById('processed-image');
    const resultsSection = document.querySelector('.results');
    const spinnerContainer = document.querySelector('.spinner-container');
    const statusText = document.getElementById('status-text');
    const errorToast = document.getElementById('error-toast');
    const guestLinks = document.getElementById('guest-links');
    const userLinks = document.getElementById('user-links');
    const logoutButton = document.getElementById('logout-button');

    let selectedFile = null;

    // --- Sayfa Yüklendiğinde (Initialization) ---
    function initialize() {
        const token = localStorage.getItem('token');
        if (token) {
            // Kullanıcı giriş yapmış
            guestLinks.style.display = 'none';
            userLinks.style.display = 'block';
        } else {
            // Misafir kullanıcı
            guestLinks.style.display = 'block';
            userLinks.style.display = 'none';
        }
    }


    // --- Olay Dinleyicileri (Event Listeners) ---

    // Çıkış Yap butonu
    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        window.location.reload(); // Sayfayı yenileyerek durumu güncelle
    });

    // Fotoğraf yükleme kutusuna tıklama
    uploadBox.addEventListener('click', () => imageInput.click());

    // Sürükle-bırak işlemleri
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
    });
    uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('dragover'));
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // Dosya seçildiğinde
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // "Fotoğrafı İşle" butonuna tıklama
    processButton.addEventListener('click', processImage);

    // Stil kartlarına tıklama
    styleCards.forEach(card => {
        card.addEventListener('click', () => {
            // Diğerlerinden 'active' sınıfını kaldır
            styleCards.forEach(c => c.classList.remove('active'));
            // Tıklanana 'active' sınıfını ekle
            card.classList.add('active');
        });
    });

    // --- Fonksiyonlar ---

    function handleFileSelect(file) {
        selectedFile = file;
        originalImage.src = URL.createObjectURL(file);
        originalImage.style.display = 'block';
        
        // Arayüzü güncelle
        uploadBox.querySelector('p').textContent = selectedFile.name;
        processButton.classList.remove('process-button-hidden');
        resultsSection.style.display = 'grid';
        processedImage.style.display = 'none';
        spinnerContainer.style.display = 'none';
    }

    async function processImage() {
        if (!selectedFile) {
            showError('Lütfen önce bir fotoğraf seçin.');
            return;
        }

        setLoadingState(true, '1/4: Fotoğraf yükleniyor...');

        try {
            const base64Image = await toBase64(selectedFile);
            
            setLoadingState(true, '2/4: Güvenli sunucuya yükleniyor...');
            const uploadedImageUrl = await uploadImage(base64Image);

            setLoadingState(true, '3/4: Yapay zeka fotoğrafınızı işliyor...');
            
            // Seçili stilin prompt'unu al
            const activeStyleCard = document.querySelector('.style-card.active');
            const stylePrompt = activeStyleCard ? activeStyleCard.dataset.stylePrompt : '';
            
            // Kullanıcının girdiği metni al
            const userPrompt = promptInput.value;
            
            // İki prompt'u birleştir
            const finalPrompt = `${stylePrompt}, ${userPrompt}`;

            const requestId = await startFalRunJob(uploadedImageUrl, finalPrompt);
            
            setLoadingState(true, '4/4: Sonuçlar hazırlanıyor...');
            await pollForResult(requestId);

        } catch (error) {
            showError(error.message || 'Bilinmeyen bir hata oluştu.');
        } finally {
            setLoadingState(false);
        }
    }
    
    function setLoadingState(isLoading, message = '') {
        if (isLoading) {
            processButton.disabled = true;
            processButton.textContent = 'İşleniyor...';
            spinnerContainer.style.display = 'flex';
            statusText.textContent = message;
            processedImage.style.display = 'none';
        } else {
            processButton.disabled = false;
            processButton.textContent = 'Fotoğrafı İşle';
            spinnerContainer.style.display = 'none';
        }
    }

    function showError(message) {
        errorToast.textContent = message;
        errorToast.classList.add('show');
        setTimeout(() => {
            errorToast.classList.remove('show');
        }, 3000);
    }

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    async function uploadImage(base64Image) {
        const formData = new FormData();
        formData.append('key', IMAGE_UPLOAD_API_KEY);
        formData.append('image', base64Image);

        const response = await fetch(IMAGE_UPLOAD_API_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Resim yüklenemedi. Lütfen tekrar deneyin.');
        }

        const data = await response.json();
        if (data.success) {
            return data.data.url;
        } else {
            throw new Error('Resim sunucuya yüklenirken bir hata oluştu.');
        }
    }

    async function startFalRunJob(imageUrl, prompt) {
        const response = await fetch(`${FAL_API_BASE_URL}/kontext`, {
            method: 'POST',
            headers: {
                'Authorization': FAL_AUTH_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: imageUrl,
                prompt: prompt
            })
        });

        if (!response.ok) {
            throw new Error('Yapay zeka işlemi başlatılamadı.');
        }
        return (await response.json()).request_id;
    }

    function pollForResult(requestId) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`${FAL_API_BASE_URL}/requests/${requestId}/status`, {
                        headers: { 'Authorization': FAL_AUTH_KEY }
                    });
                    if (!statusResponse.ok) {
                         // Durum kontrolü başarısız olursa interval'ı durdur ve hata fırlat
                        clearInterval(interval);
                        return reject(new Error('İşlem durumu kontrol edilemedi.'));
                    }
                    const statusData = await statusResponse.json();

                    if (statusData.status === 'COMPLETED') {
                        clearInterval(interval);
                        const resultData = await fetch(`${FAL_API_BASE_URL}/requests/${requestId}`, {
                             headers: { 'Authorization': FAL_AUTH_KEY }
                        }).then(res => res.json());

                        if (resultData && resultData.images && resultData.images[0]?.url) {
                            processedImage.src = resultData.images[0].url;
                            processedImage.style.display = 'block';
                            resolve();
                        } else {
                            reject(new Error('Sonuç alınamadı veya format hatalı.'));
                        }
                    } else if (statusData.status === 'FAILED' || statusData.status === 'ERROR') {
                        clearInterval(interval);
                        reject(new Error('Fotoğraf işleme sırasında bir hata oluştu.'));
                    }
                    // IN_PROGRESS veya QUEUED ise beklemeye devam et...
                } catch (error) {
                    clearInterval(interval);
                    reject(error);
                }
            }, 3000);
        });
    }

    // --- Başlangıç ---
    initialize();
});
