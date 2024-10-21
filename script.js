const fs = require('fs');

// Чтение данных из файла db.json
fs.readFile('db.json', 'utf8', (err, data) => {
    if (err) {
        console.error('Ошибка чтения файла:', err);
        return;
    }

    try {
        const jsonData = JSON.parse(data);

        // Подсчет количества элементов, где Телефоны = null
        const nullPhonesCount = jsonData.filter(item => !item['Телефоны'] || item['Телефоны'].length === 0).length;

        // Подсчет количества элементов, где Электронная почта = null
        const nullEmailsCount = jsonData.filter(item => !item['Электронная почта'] || item['Электронная почта'].length === 0).length;

        // Подсчет количества элементов, где и Телефоны, и Электронная почта = null
        const nullPhonesAndEmailsCount = jsonData.filter(item =>
            (!item['Телефоны'] || item['Телефоны'].length === 0) &&
            (!item['Электронная почта'] || item['Электронная почта'].length === 0)
        ).length;

        // Общее количество элементов
        const totalCount = jsonData.length;

        // Анализ по другим параметрам (например, по региону)
        const regionCounts = jsonData.reduce((acc, item) => {
            const region = item['Регион'];
            if (region) {
                acc[region] = (acc[region] || 0) + 1;
            }
            return acc;
        }, {});

        // Вывод результатов
        console.log(`Количество элементов, где Телефоны = null: ${nullPhonesCount}`);
        console.log(`Количество элементов, где Электронная почта = null: ${nullEmailsCount}`);
        console.log(`Количество элементов, где и Телефоны, и Электронная почта = null: ${nullPhonesAndEmailsCount}`);
        console.log(`Общее количество элементов: ${totalCount}`);
        console.log('Количество элементов по регионам:', regionCounts);

    } catch (parseError) {
        console.error('Ошибка парсинга JSON:', parseError);
    }
});
