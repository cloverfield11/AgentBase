const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const archiver = require('archiver');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const searchUrl = 'https://pb.nalog.ru/search-proc.json';
const tinkoffUrl = 'https://www.tinkoff.ru/api/common/dadata/suggestions/api/4_1/rs/suggest/party?appName=company-pages';
const checkoUrl = (ogrn) => `https://checko.ru/company/${ogrn}?contacts`;

const headers = {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
};

const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

function writeLog(log) {
    const date = new Date();
    const fileName = `log-${date.toISOString().split('T')[0]}.log`;
    const filePath = path.join(logDirectory, fileName);
    const logEntry = `[${date.toISOString()}] ${log}\n`;

    fs.appendFileSync(filePath, logEntry);
}

app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendLog = (log) => {
        res.write(`data: ${log}\n\n`);
        writeLog(log);
    };

    req.on('close', () => {
        res.end();
    });

    app.locals.sendLog = sendLog;
});

async function getTinkoffData(ogrn) {
    try {
        const response = await axios.post(tinkoffUrl, {
            count: 20,
            query: ogrn,
            branch_type: "MAIN"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'ru',
                'Origin': 'https://www.tbank.ru',
                'Referer': 'https://www.tbank.ru/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
            }
        });

        const data = response.data;
        if (data.suggestions && data.suggestions.length > 0) {
            const firstSuggestion = data.suggestions[0].data;
            app.locals.sendLog(`Данные по ОГРН: ${ogrn} найдены.\n`);

            return {
                "КПП": firstSuggestion.kpp || '',
                "ФИО руководителя": firstSuggestion.management?.name || '',
                "Должность руководителя": firstSuggestion.management?.post || '',
                "Организационно-правовая форма": firstSuggestion.opf?.short || '',
                "Полное наименование с ОПФ": firstSuggestion.name?.full_with_opf || '',
                "Краткое наименование с ОПФ": firstSuggestion.name?.short_with_opf || '',
                "Полное наименование": firstSuggestion.name?.full || '',
                "Краткое наименование": firstSuggestion.name?.short || '',
                "ИНН": firstSuggestion.inn || '',
                "Адрес": firstSuggestion.address?.value || '',
                "Регион": firstSuggestion.address?.data?.region_with_type || '',
                "Город": firstSuggestion.address?.data?.city || firstSuggestion.address?.data?.settlement || '',
                "Улица": firstSuggestion.address?.data?.street || firstSuggestion.address?.data?.settlement_with_type || '',
                "Дом": firstSuggestion.address?.data?.house || '',
                "Широта": firstSuggestion.address?.data?.geo_lat || '',
                "Долгота": firstSuggestion.address?.data?.geo_lon || '',
                "Выручка": firstSuggestion.finance?.revenue || '',
                "Среднесписочная численность работников": firstSuggestion.employee_count || '',
            };
        } else {
            app.locals.sendLog(`Данные для ОГРН ${ogrn} не найдены.\n`);
            return null;
        }
    } catch (error) {
        app.locals.sendLog(`Ошибка при получении данных для ОГРН ${ogrn}: ${error.message}\n`);
        return null;
    }
}

async function extractCheckoData(ogrn) {
    try {
        const response = await axios.get(checkoUrl(ogrn));
        const $ = cheerio.load(response.data);

        const phones = [];
        $('a[href^="tel:"]').each((i, el) => {
            phones.push($(el).text().trim());
        });

        const emails = [];
        $('a[href^="mailto:"]').each((i, el) => {
            emails.push($(el).text().trim());
        });

        const websiteSelector = 'div.row.gy-3.gx-4.mt-1 > div:nth-child(2) > a[href^="http"]';
        const website = $(websiteSelector).attr('href') || null;

        app.locals.sendLog(`Контакты для ОГРН ${ogrn} успешно извлечены.\n`);

        return {
            "Телефоны": phones,
            "Электронная почта": emails,
            "Веб-сайт": website
        };

    } catch (error) {
        app.locals.sendLog(`Ошибка при извлечении контактов для ОГРН ${ogrn}: ${error.message}\n`);
        return null;
    }
}

async function fetchOrganizations(vid, region, money, rowCount) {
    let allData = [];
    let page = 1;
    const startTime = new Date();
    let totalItems = rowCount;
    let processedItems = 0;
    let errorCount = 0;

    while (true) {
        const data_1 = new URLSearchParams({
            mode: 'search-ul-ext',
            okvedUlExt: vid.join(','),
            regionUlExt: region.join(','),
            statusUlExt: '10',
            revenueUlExt: `${money};10000001`,
            mspUl1: '1',
            mspUl2: '1',
            mspUl3: '1',
            page: page.toString(),
            pageSize: '100',
        });

        try {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response_1 = await axios.post(searchUrl, data_1.toString(), { headers });
            const responseData_1 = response_1.data;
            app.locals.sendLog(`Запрос для страницы ${page} успешен.\n`);

            const requestId = responseData_1.id;

            const data_2 = new URLSearchParams({
                id: requestId,
                method: 'get-response'
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            const response_2 = await axios.post(searchUrl, data_2.toString(), { headers });
            const responseData_2 = response_2.data;
            app.locals.sendLog(`Данные для страницы ${page} успешно получены.\n`);

            if (responseData_2.ul && responseData_2.ul.data) {
                for (const item of responseData_2.ul.data) {
                    const filteredData = {
                        "ОГРН": item.ogrn,
                        "Дата регистрации": item.dtreg,
                        "Сфера деятельности": item.okved2name,
                    };

                    let tinkoffData = null;
                    let checkoData = null;

                    try {
                        tinkoffData = await getTinkoffData(filteredData.ОГРН);
                    } catch (error) {
                        app.locals.sendLog(`Ошибка при получении данных для ОГРН ${filteredData.ОГРН} от Тинькофф: ${error.message}\n`);
                        errorCount++;
                    }

                    try {
                        checkoData = await extractCheckoData(filteredData.ОГРН);
                    } catch (error) {
                        app.locals.sendLog(`Ошибка при извлечении контактов для ОГРН ${filteredData.ОГРН} от Чеко: ${error.message}\n`);
                        errorCount++;
                    }

                    if (tinkoffData || checkoData) {
                        allData.push({ ...filteredData, ...tinkoffData, ...checkoData });
                    }

                    processedItems++;
                    const currentTime = new Date();
                    const timeSpent = (currentTime - startTime) / 1000;
                    const speed = processedItems / timeSpent;
                    const progress = (processedItems / totalItems) * 100;
                    const remainingItems = totalItems - processedItems;
                    const remainingTime = remainingItems / speed;

                    app.locals.sendLog(`Прогресс: ${progress.toFixed(2)}%\n`);
                    app.locals.sendLog(`Скорость: ${speed.toFixed(2)} элементов/сек\n`);
                    app.locals.sendLog(`Оставшееся время: ${remainingTime.toFixed(2)} секунд\n`);
                    app.locals.sendLog(`Текущий элемент: ${processedItems}\n`);
                }

                if (!responseData_2.ul.hasMore) break;
                page += 1;
            } else {
                app.locals.sendLog('Нет данных для этой страницы.\n');
                break;
            }
        } catch (error) {
            app.locals.sendLog(`Ошибка на странице ${page}: ${error.message}\n`);
            errorCount++;
            break;
        }
    }

    const endTime = new Date();
    const timeSpent = (endTime - startTime) / 1000;
    const companyCount = allData.length;

    app.locals.sendLog(`Сбор данных завершен.\n`);
    app.locals.sendLog(`Время сбора: ${timeSpent} секунд.\n`);
    app.locals.sendLog(`Количество организаций: ${companyCount}\n`);
    app.locals.sendLog(`Количество ошибок: ${errorCount}\n`);

    return { success: true, organizations: allData };
}

app.post('/fetch-organizations', async (req, res) => {
    const { vid, region, money, rowCount } = req.body;
    const result = await fetchOrganizations(vid, region, money, rowCount);
    res.json(result);
});

app.post('/download-excel', (req, res) => {
    const organizations = req.body.organizations;

    const modifiedOrganizations = organizations.map(org => ({
        ...org,
        'Телефоны': org['Телефоны'] ? org['Телефоны'].join(', ') : '',
        'Электронная почта': org['Электронная почта'] ? org['Электронная почта'].join(', ') : ''
    }));

    const workbook = xlsx.utils.book_new();

    const worksheet = xlsx.utils.json_to_sheet(modifiedOrganizations);

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Organizations');

    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="organizations.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(fileBuffer);
});

app.post('/download-elma', (req, res) => {
    const organizations = req.body.organizations;
    const elmaResponsible = req.body.elmaResponsible;

    const zip = archiver('zip', {
        zlib: { level: 9 }
    });

    res.setHeader('Content-Disposition', 'attachment; filename="organizations_elma.zip"');
    res.setHeader('Content-Type', 'application/zip');

    zip.pipe(res);

    let fileCount = 0;
    const chunkSize = 50;

    for (let i = 0; i < organizations.length; i += chunkSize) {
        const chunk = organizations.slice(i, i + chunkSize);
        const workbook = xlsx.utils.book_new();

        const worksheet = xlsx.utils.aoa_to_sheet([
            [{ v: 'Реквизиты', s: { font: { bold: true }, alignment: { horizontal: 'center' } } }, '', '', '', '', '', '', '', '', '', '', '', '', { v: 'Юридический адрес', s: { font: { bold: true }, alignment: { horizontal: 'center' } } }, '', '', '', '', ''],
            ['Наименование', 'ИНН', 'Годовой доход', 'День компании', 'Региональная группа', 'Ответственный', 'Сайт', 'Email', 'Телефоны', 'ОПФ', 'Штат', 'ОГРН', 'КПП', 'Страна', 'Регион', 'Город', 'Улица', 'Дом'],
            ...chunk.map(org => [
                org['Краткое наименование'] || org['Полное наименование'] || '',
                org['ИНН'] || '',
                org['Выручка'] || '',
                org['Дата регистрации'] || '',
                org['Регион'] || '',
                elmaResponsible,
                org['Веб-сайт'] || '',
                org['Электронная почта'] ? org['Электронная почта'].join(', ') : '',
                org['Телефоны'] ? org['Телефоны'].join(', ') : '',
                org['Организационно-правовая форма'] || '',
                org['Среднесписочная численность работников'] || '',
                org['ОГРН'] || '',
                org['КПП'] || '',
                'Россия',
                org['Регион'] || '',
                org['Город'] || '',
                org['Улица'] || '',
                org['Дом'] || ''
            ])
        ]);

        worksheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
            { s: { r: 0, c: 13 }, e: { r: 0, c: 17 } }
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, 'Organizations');

        const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        zip.append(fileBuffer, { name: `organizations_elma_${fileCount + 1}.xlsx` });
        fileCount++;
    }

    zip.finalize();
});

app.post('/get-row-count', async (req, res) => {
    const { vid, region, money } = req.body;
    let rowCount = 0;

    try {
        const data_1 = new URLSearchParams({
            mode: 'search-ul-ext',
            okvedUlExt: vid.join(','),
            regionUlExt: region.join(','),
            statusUlExt: '10',
            revenueUlExt: `${money};10000001`,
            mspUl1: '1',
            mspUl2: '1',
            mspUl3: '1',
            page: '1',
            pageSize: '100',
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const response_1 = await axios.post(searchUrl, data_1.toString(), { headers });
        const responseData_1 = response_1.data;
        app.locals.sendLog(`Подсчет количества строк.\n`);

        const requestId = responseData_1.id;

        const data_2 = new URLSearchParams({
            id: requestId,
            method: 'get-response'
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const response_2 = await axios.post(searchUrl, data_2.toString(), { headers });
        const responseData_2 = response_2.data;
        app.locals.sendLog(`Строки подсчитаны.\n`);

        if (responseData_2.ul && responseData_2.ul.rowCount) {
            rowCount = responseData_2.ul.rowCount;
        } else {
            throw new Error('Нет ни одной строки для выбранных настроек.');
        }

        res.json({ rowCount });
    } catch (error) {
        console.error('Ошибка при получении количества строк:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/check-resources', async (req, res) => {
    const resources = [
        { url: 'https://pb.nalog.ru', name: 'ЕГРЮЛ' },
        { url: 'https://www.tbank.ru/business/contractor/', name: 'Т-Банк.Бизнесс' },
        { url: 'https://checko.ru', name: 'Чекко' }
    ];

    const results = await Promise.all(resources.map(async (resource) => {
        try {
            const response = await axios.get(resource.url);
            return { name: resource.name, status: response.status };
        } catch (error) {
            return { name: resource.name, status: error.response ? error.response.status : 500 };
        }
    }));

    res.json(results);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
