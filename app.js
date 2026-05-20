// Динамическая маршрутизация блоков
const contentDiv = document.getElementById('app-content');
const navBtns = document.querySelectorAll('.nav-btn');

// Глобальный контекст для отмены активного поиска
let searchContext = {
    controller: null,
    active: false
};

function abortPendingSearch() {
    if (searchContext.controller) {
        searchContext.controller.abort();
        searchContext.controller = null;
    }
    searchContext.active = false;
}

// Функция загрузки HTML блока и выполнения скриптов внутри него
async function loadBlock(blockName) {
    // Отменяем любой висящий поисковый запрос при переключении блоков
    abortPendingSearch();

    contentDiv.innerHTML = `<div class="loading-placeholder"><div class="spinner"></div><p>Загрузка раздела...</p></div>`;
    
    try {
        const response = await fetch(`blocks/${blockName}.html`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let html = await response.text();
        contentDiv.innerHTML = html;
        
        if (blockName === 'search') {
            initSearchModule();
        } else if (blockName === 'calculator') {
            initCalculatorModule();
        }
    } catch (error) {
        console.error(error);
        contentDiv.innerHTML = `<div class="message error-text">Ошибка загрузки блока. Проверьте соединение или перезагрузите страницу.</div>`;
    }
}

// ------ Модуль ПОИСКА (Open Food Facts + КБЖУ) ------
function initSearchModule() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const loader = document.getElementById('searchLoader');
    const resultsDiv = document.getElementById('productResults');
    
    if (!searchBtn) return;

    // Убираем старый контекст для нового экземпляра
    abortPendingSearch();
    
    function showLoader(show) {
        if (loader) loader.style.display = show ? 'flex' : 'none';
    }
    function showMessage(text, isError = false) {
        if (!resultsDiv) return;
        resultsDiv.innerHTML = `<div class="message" style="${isError ? 'background:#fee2e2; color:#b91c1c' : ''}">${escapeHtml(text)}</div>`;
    }
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
    
    async function performSearch() {
        const query = searchInput.value.trim();
        if (query === '') { showMessage('Введите название продукта'); return; }
        
        // Отменяем предыдущий запрос, если он ещё выполняется
        abortPendingSearch();
        
        showLoader(true);
        if (resultsDiv) resultsDiv.innerHTML = '';
        
        const encoded = encodeURIComponent(query);
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&lc=ru&page_size=20`;
        
        const controller = new AbortController();
        searchContext.controller = controller;
        searchContext.active = true;
        
        try {
            const timeout = setTimeout(() => controller.abort(), 14000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'NutriPortal-App/1.0 (Educational)' }
            });
            clearTimeout(timeout);
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            let products = data?.products || [];
            if (!Array.isArray(products)) products = [];
            const valid = products.filter(p => p && (p.product_name || p.product_name_ru));
            
            // Проверяем, что блок поиска всё ещё активен и контейнер существует
            if (!searchContext.active || !resultsDiv || !document.body.contains(resultsDiv)) {
                console.log('Поиск отменён – блок уже неактивен');
                return;
            }
            
            if (valid.length === 0) showMessage('Ничего не найдено');
            else renderProducts(valid, resultsDiv);
        } catch (err) {
            if (!searchContext.active) return; // игнорируем ошибки от старого запроса
            let msg = 'Ошибка загрузки данных. Проверьте соединение.';
            if (err.name === 'AbortError') msg = 'Превышено время ожидания.';
            showMessage(msg, true);
        } finally {
            if (searchContext.controller === controller) {
                searchContext.controller = null;
                searchContext.active = false;
            }
            showLoader(false);
        }
    }
    
    function renderProducts(products, container) {
        try {
            if (!container || !document.body.contains(container)) return;
            let html = '<div class="results-grid">';
            for (const prod of products) {
                const title = (prod.product_name_ru?.trim()) || prod.product_name || 'Без названия';
                const brand = prod.brands?.trim() || 'Бренд не указан';
                const quantity = prod.quantity?.trim() || '—';
                const imgUrl = prod.image_url || prod.image_front_small_url || null;
                const n = prod.nutriments || {};
                const kcal = n['energy-kcal'] !== undefined ? Math.round(n['energy-kcal']) : null;
                const proteins = n['proteins'] !== undefined ? parseFloat(n['proteins']).toFixed(1) : null;
                const fat = n['fat'] !== undefined ? parseFloat(n['fat']).toFixed(1) : null;
                const carbs = n['carbohydrates'] !== undefined ? parseFloat(n['carbohydrates']).toFixed(1) : null;
                
                let imageHtml = imgUrl ? `<img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'image-placeholder\'>🥫</div>';">` : `<div class="image-placeholder">🍽️</div>`;
                let nutritionHtml = '';
                if (kcal !== null || proteins !== null || fat !== null || carbs !== null) {
                    nutritionHtml = `<div class="nutrition-block">
                        ${kcal !== null ? `<div class="nutri-item"><span class="nutri-label">🔥 Ккал</span><span class="nutri-value">${kcal}</span></div>` : ''}
                        ${proteins !== null ? `<div class="nutri-item"><span class="nutri-label">🥩 Белки</span><span class="nutri-value">${proteins} г</span></div>` : ''}
                        ${fat !== null ? `<div class="nutri-item"><span class="nutri-label">🧈 Жиры</span><span class="nutri-value">${fat} г</span></div>` : ''}
                        ${carbs !== null ? `<div class="nutri-item"><span class="nutri-label">🍚 Углеводы</span><span class="nutri-value">${carbs} г</span></div>` : ''}
                    </div>`;
                } else {
                    nutritionHtml = `<div class="nutrition-block"><div class="no-nutri">Нет данных о КБЖУ</div></div>`;
                }
                html += `
                    <div class="product-card">
                        <div class="product-image">${imageHtml}</div>
                        <div class="product-info">
                            <div class="product-title">${escapeHtml(title)}</div>
                            <div class="brand">🏷️ ${escapeHtml(brand)}</div>
                            <div class="quantity">📦 ${escapeHtml(quantity)}</div>
                            ${nutritionHtml}
                        </div>
                    </div>
                `;
            }
            html += '</div>';
            container.innerHTML = html;
        } catch (err) {
            console.warn('Ошибка отрисовки:', err);
            if (container && document.body.contains(container)) {
                container.innerHTML = `<div class="message error-text">Ошибка отображения результатов</div>`;
            }
        }
    }
    
    searchBtn.addEventListener('click', performSearch);
    if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
}

// ------ Модуль КАЛЬКУЛЯТОРА (без изменений, оставляем как есть) ------
function initCalculatorModule() {
    const calcBtn = document.getElementById('calcBtn');
    const ageInput = document.getElementById('age');
    const weightInput = document.getElementById('weight');
    const heightInput = document.getElementById('height');
    const genderRadios = document.querySelectorAll('input[name="gender"]');
    const formulaSelect = document.getElementById('formulaSelect');
    const activitySelect = document.getElementById('activity');
    const resultsDiv = document.getElementById('kcalResults');
    const errorSpan = document.getElementById('calcError');
    
    if (!calcBtn) return;
    
    function getGender() { for (let r of genderRadios) if (r.checked) return r.value; return 'male'; }
    function getActivityFactor() { return parseFloat(activitySelect.value); }
    function calculateBMR(weight, height, age, gender, formula) {
        if (formula === 'mifflin') {
            if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
            else return 10 * weight + 6.25 * height - 5 * age - 161;
        } else {
            if (gender === 'male') return 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
            else return 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
        }
    }
    function getMacros(weight, calories, goalType) {
        let proteinPerKg, fatPerKg;
        switch (goalType) {
            case 'lose': proteinPerKg = 2.2; fatPerKg = 0.7; break;
            case 'gain': proteinPerKg = 1.8; fatPerKg = 0.9; break;
            default: proteinPerKg = 1.8; fatPerKg = 0.8;
        }
        const proteinG = weight * proteinPerKg;
        const fatG = weight * fatPerKg;
        const proteinCal = proteinG * 4;
        const fatCal = fatG * 9;
        let carbCal = calories - proteinCal - fatCal;
        if (carbCal < 0) carbCal = 0;
        const carbG = carbCal / 4;
        return { protein: Math.round(proteinG), fat: Math.round(fatG), carbs: Math.round(carbG) };
    }
    function renderKcalResults(tdee, weight) {
        const maintain = Math.round(tdee);
        const lose = Math.round(tdee * 0.85);
        const gain = Math.round(tdee * 1.10);
        const macrosMaintain = getMacros(weight, maintain, 'maintain');
        const macrosLose = getMacros(weight, lose, 'lose');
        const macrosGain = getMacros(weight, gain, 'gain');
        resultsDiv.innerHTML = `
            <div class="kcal-card">
                <h4>⚖️ Поддержание веса</h4>
                <div class="kcal-value">${maintain} ккал/сутки</div>
                <div class="macro-row"><span>🥩 Белки</span><span>${macrosMaintain.protein} г</span></div>
                <div class="macro-row"><span>🧈 Жиры</span><span>${macrosMaintain.fat} г</span></div>
                <div class="macro-row"><span>🍚 Углеводы</span><span>${macrosMaintain.carbs} г</span></div>
                <small>норма 1.8/0.8 г на кг</small>
            </div>
            <div class="kcal-card">
                <h4>📉 Снижение веса (дефицит 15%)</h4>
                <div class="kcal-value">${lose} ккал/сутки</div>
                <div class="macro-row"><span>🥩 Белки</span><span>${macrosLose.protein} г</span></div>
                <div class="macro-row"><span>🧈 Жиры</span><span>${macrosLose.fat} г</span></div>
                <div class="macro-row"><span>🍚 Углеводы</span><span>${macrosLose.carbs} г</span></div>
                <small>белки ↑ 2.2 / жиры ↓ 0.7 г на кг</small>
            </div>
            <div class="kcal-card">
                <h4>💪 Набор массы (профицит 10%)</h4>
                <div class="kcal-value">${gain} ккал/сутки</div>
                <div class="macro-row"><span>🥩 Белки</span><span>${macrosGain.protein} г</span></div>
                <div class="macro-row"><span>🧈 Жиры</span><span>${macrosGain.fat} г</span></div>
                <div class="macro-row"><span>🍚 Углеводы</span><span>${macrosGain.carbs} г</span></div>
                <small>белки 1.8 / жиры ↑ 0.9 г на кг</small>
            </div>
        `;
    }
    function calculateAndDisplay() {
        errorSpan.innerText = '';
        const age = parseInt(ageInput.value);
        const weight = parseFloat(weightInput.value);
        const height = parseFloat(heightInput.value);
        if (isNaN(age) || age < 1 || age > 100) { errorSpan.innerText = 'Возраст от 1 до 100 лет.'; return; }
        if (isNaN(weight) || weight <= 0) { errorSpan.innerText = 'Корректный вес (кг).'; return; }
        if (isNaN(height) || height <= 0) { errorSpan.innerText = 'Корректный рост (см).'; return; }
        const gender = getGender();
        const formula = formulaSelect.value;
        const bmr = calculateBMR(weight, height, age, gender, formula);
        const tdee = bmr * getActivityFactor();
        renderKcalResults(tdee, weight);
    }
    calcBtn.addEventListener('click', calculateAndDisplay);
    calculateAndDisplay();
}

// Навигация
function setupNavigation() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const blockName = btn.getAttribute('data-block');
            if (!blockName) return;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await loadBlock(blockName);
        });
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    await loadBlock('welcome');
});