// Динамическая маршрутизация блоков
const contentDiv = document.getElementById('app-content');
const navBtns = document.querySelectorAll('.nav-btn');
let currentBlock = null;

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
    // Не перезагружаем уже активный блок
    if (currentBlock === blockName) {
        console.log(`Блок ${blockName} уже загружен, пропускаем`);
        return;
    }
    // Отменяем любой висящий поисковый запрос при переключении блоков
    abortPendingSearch();

    contentDiv.innerHTML = `<div class="loading-placeholder"><div class="spinner"></div><p>Загрузка раздела...</p></div>`;
    
    try {
        const response = await fetch(`blocks/${blockName}.html`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let html = await response.text();
        contentDiv.innerHTML = html;
        currentBlock = blockName;
        
        if (blockName === 'search') {
            initSearchModule();
        } else if (blockName === 'calculator') {
            initCalculatorModule();
        }
    } catch (error) {
        console.error(error);
        contentDiv.innerHTML = `<div class="message error-text">Ошибка загрузки блока. Проверьте соединение или перезагрузите страницу.</div>`;
        currentBlock = null;
    }
}

/// ------ Модуль ПОИСКА (Open Food Facts + КБЖУ) - РАБОЧАЯ ВЕРСИЯ ------
function initSearchModule() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const loader = document.getElementById('searchLoader');
    const resultsDiv = document.getElementById('productResults');

    if (!searchBtn || !resultsDiv) return;

    function showLoading(show) {
        if (loader) loader.style.display = show ? 'flex' : 'none';
    }

    function showMessage(text, isError = false) {
        resultsDiv.innerHTML = `<div class="message" style="${isError ? 'background:#fee2e2; color:#b91c1c' : 'background:#eef2ff; color:#1e3a8a; border-left-color:#3b82f6'}">${escapeHtml(text)}</div>`;
    }

    function showNoResults() {
        resultsDiv.innerHTML = `<div class="message" style="background:#fff3e0;">😕 Ничего не найдено<br>Попробуйте другой запрос</div>`;
    }

    function getProductName(product) {
        if (product.product_name_ru && product.product_name_ru.trim()) return product.product_name_ru;
        return product.product_name || 'Без названия';
    }

    function getImageUrl(product) {
        return product.image_url || product.image_front_small_url || product.image_front_url || product.image_thumb_url || null;
    }

    function getNutriScoreClass(grade) {
        if (!grade) return '';
        const g = grade.toLowerCase();
        if (g === 'a') return 'nutri-a';
        if (g === 'b') return 'nutri-b';
        if (g === 'c') return 'nutri-c';
        if (g === 'd') return 'nutri-d';
        if (g === 'e') return 'nutri-e';
        return '';
    }

    function getNutrition(product) {
        const nutriments = product.nutriments || {};
        const kcal = nutriments['energy-kcal'] !== undefined ? Math.round(nutriments['energy-kcal']) : null;
        const proteins = nutriments['proteins'] !== undefined ? parseFloat(nutriments['proteins']).toFixed(1) : null;
        const fat = nutriments['fat'] !== undefined ? parseFloat(nutriments['fat']).toFixed(1) : null;
        const carbs = nutriments['carbohydrates'] !== undefined ? parseFloat(nutriments['carbohydrates']).toFixed(1) : null;
        return { kcal, proteins, fat, carbs };
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

    function renderProducts(products) {
        if (!products || products.length === 0) {
            showNoResults();
            return;
        }

        let html = '<div class="results-grid">';
        for (const prod of products) {
            const title = getProductName(prod);
            const brand = prod.brands?.trim() || 'Бренд не указан';
            const quantity = prod.quantity?.trim() || '—';
            const nutriscore = prod.nutriscore_grade ? prod.nutriscore_grade.toUpperCase() : null;
            const nutriscoreClass = nutriscore ? getNutriScoreClass(nutriscore) : '';
            const imageUrl = getImageUrl(prod);
            const nutrition = getNutrition(prod);

            let imageHtml = '';
            if (imageUrl) {
                imageHtml = `<img src="${imageUrl}" alt="${title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'image-placeholder\'>🍽️</div>';">`;
            } else {
                imageHtml = `<div class="image-placeholder">🥫</div>`;
            }

            let nutritionHtml = '';
            const hasAnyNutrient = nutrition.kcal !== null || nutrition.proteins !== null || nutrition.fat !== null || nutrition.carbs !== null;
            if (hasAnyNutrient) {
                nutritionHtml = `<div class="nutrition-block">
                    ${nutrition.kcal !== null ? `<div class="nutri-item"><span class="nutri-label">🔥 Ккал</span><span class="nutri-value">${nutrition.kcal}</span></div>` : ''}
                    ${nutrition.proteins !== null ? `<div class="nutri-item"><span class="nutri-label">🥩 Белки</span><span class="nutri-value">${nutrition.proteins} г</span></div>` : ''}
                    ${nutrition.fat !== null ? `<div class="nutri-item"><span class="nutri-label">🧈 Жиры</span><span class="nutri-value">${nutrition.fat} г</span></div>` : ''}
                    ${nutrition.carbs !== null ? `<div class="nutri-item"><span class="nutri-label">🍚 Углеводы</span><span class="nutri-value">${nutrition.carbs} г</span></div>` : ''}
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
                        <div class="nutriscore" style="margin-bottom: 8px;">
                            ${nutriscore ? `<div class="nutri-badge ${nutriscoreClass}" style="display: inline-block; margin-right: 6px;">${nutriscore}</div><span style="font-size:0.75rem;">Nutri-Score</span>` : '<span style="font-size:0.75rem; color:#94a3b8;">Без оценки</span>'}
                        </div>
                        ${nutritionHtml}
                    </div>
                </div>
            `;
        }
        html += '</div>';
        resultsDiv.innerHTML = html;
    }

    async function performSearch() {
        const query = searchInput.value.trim();
        if (query === '') {
            showMessage('Введите название продукта (например, "молоко", "йогурт")');
            return;
        }

        showLoading(true);
        resultsDiv.innerHTML = '';

        const encodedQuery = encodeURIComponent(query);
        // ПРЯМОЙ ЗАПРОС К API (без прокси) — именно так работала старая версия
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}&search_simple=1&action=process&json=1&lc=ru&page_size=20`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            let products = data?.products || [];
            if (!Array.isArray(products)) products = [];

            const validProducts = products.filter(p => p && (p.product_name || p.product_name_ru));
            if (validProducts.length === 0) {
                showNoResults();
            } else {
                renderProducts(validProducts);
            }
        } catch (error) {
            console.error(error);
            let errorText = 'Ошибка загрузки данных. Проверьте соединение.';
            if (error.name === 'AbortError') errorText = 'Превышено время ожидания.';
            showMessage(errorText, true);
        } finally {
            showLoading(false);
        }
    }

    searchBtn.addEventListener('click', performSearch);
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    // Стартовое сообщение в поле результатов
    resultsDiv.innerHTML = `
        <div class="message" style="background:#eef2ff; color:#1e3a8a;">
            🔎 Введите запрос на русском: <strong>творог</strong>, <strong>кефир</strong>, <strong>овсянка</strong>.<br>
            В карточках отображаются калории, белки, жиры, углеводы (на 100 г продукта) и Nutri-Score.
        </div>
    `;
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
            if (currentBlock === blockName) return; // дополнительная защита
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