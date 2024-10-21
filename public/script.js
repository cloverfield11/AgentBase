document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = $('#statusIndicator');
    const statusModal = $('#statusModal');
    const statusList = $('#statusList');
    const fetchDataBtn = $('#fetchDataBtn');
    const checkingResources = $('#checkingResources');
    const resourceError = $('#resourceError');

    async function checkResources() {
        statusIndicator.css('background-color', 'orange');
        statusList.empty();
        fetchDataBtn.hide();
        checkingResources.show();

        try {
            const response = await fetch('/check-resources');
            const results = await response.json();

            let allAvailable = true;

            results.forEach(result => {
                if (result.status === 200) {
                    statusList.append(`<li class="list-group-item list-group-item-success">${result.name}: Доступен</li>`);
                } else {
                    allAvailable = false;
                    statusList.append(`<li class="list-group-item list-group-item-danger">${result.name}: Недоступен</li>`);
                }
            });

            // Искусственная задержка в 2 секунды
            setTimeout(() => {
                if (allAvailable) {
                    statusIndicator.css('background-color', 'green');
                    fetchDataBtn.show();
                } else {
                    statusIndicator.css('background-color', 'red');
                    resourceError.show();
                }
                checkingResources.hide();
            }, 2000);
        } catch (error) {
            setTimeout(() => {
                statusIndicator.css('background-color', 'red');
                statusList.append(`<li class="list-group-item list-group-item-danger">Ошибка при проверке ресурсов</li>`);
                resourceError.show();
                checkingResources.hide();
            }, 2000);
        }
    }

    statusIndicator.on('click', () => {
        statusModal.modal('show');
    });

    checkResources();

    const vidSelect = $('#vid').selectize({
        create: false,
        sortField: 'text',
        placeholder: 'Выберите один/несколько вид(ов) деятельности',
        plugins: ['remove_button'],
        delimiter: ',',
        persist: false,
        maxItems: null
    });
    const regionSelect = $('#region').selectize({
        create: false,
        sortField: 'text',
        placeholder: 'Выберите один/несколько регион(ов)',
        plugins: ['remove_button'],
        delimiter: ',',
        persist: false,
        maxItems: null
    });
    const moneySelect = $('#money').selectize({
        create: false,
        delimiter: ',',
        persist: false,
        maxItems: 1
    });
    const loading = $('#loading');
    const log = $('#log');
    const logContent = $('#logContent');
    const downloadOptions = $('#downloadOptions');
    const downloadJsonBtn = $('#downloadJsonBtn');
    const downloadExcelBtn = $('#downloadExcelBtn');
    const downloadElmaBtn = $('#downloadElmaBtn');
    const progressBar = $('#progressBar');
    const progressText = $('#progressText');
    const speedText = $('#speedText');
    const remainingTimeText = $('#remainingTimeText');
    const currentElementText = $('#currentElementText'); // Добавьте элемент для текущего элемента
    const errorCountText = $('#errorCountText'); // Добавьте элемент для количества ошибок
    const progressContainer = $('#progressContainer');
    const spinnerContainer = $('.spinner-container');

    const eventSource = new EventSource('/logs');

    eventSource.onmessage = function (event) {
        log.show();
        logContent.append(event.data + '\n');
        log[0].scrollTop = log[0].scrollHeight;

        const progressMatch = event.data.match(/Прогресс: (\d+\.\d+)%/);
        const speedMatch = event.data.match(/Скорость: (\d+\.\d+) элементов\/сек/);
        const remainingTimeMatch = event.data.match(/Оставшееся время: (\d+\.\d+) секунд/);
        const currentElementMatch = event.data.match(/Текущий элемент: (\d+)/);
        const dataReceivedMatch = event.data.match(/Данные для страницы 1 успешно получены\./);

        if (dataReceivedMatch) {
            spinnerContainer.hide();
            progressContainer.show();
        }

        if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            progressBar.css('width', `${progress}%`);
            progressText.text(`Прогресс: ${progress}%`);
        }

        if (speedMatch) {
            const speed = parseFloat(speedMatch[1]);
            speedText.text(`Скорость: ${speed} элементов/сек`);
        }

        if (remainingTimeMatch) {
            const remainingTime = parseFloat(remainingTimeMatch[1]);
            remainingTimeText.text(`Оставшееся время: ${remainingTime} секунд`);
        }

        if (currentElementMatch) {
            const currentElement = parseInt(currentElementMatch[1]);
            currentElementText.text(`Текущий элемент: ${currentElement}`);
        }
    };

    fetch('vid.json')
        .then(response => response.json())
        .then(data => {
            Object.keys(data).forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${data[key]}`;
                vidSelect[0].selectize.addOption({ value: key, text: `${data[key]}` });
            });
        });

    fetch('region.json')
        .then(response => response.json())
        .then(data => {
            Object.keys(data).forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = data[key];
                regionSelect[0].selectize.addOption({ value: key, text: data[key] });
            });
        });

    fetch('money.json')
        .then(response => response.json())
        .then(data => {
            Object.keys(data).forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${data[key]}`;
                moneySelect[0].selectize.addOption({ value: key, text: `${data[key]}` });
            });

            const firstOptionValue = Object.keys(data)[0];
            moneySelect[0].selectize.setValue(firstOptionValue);
        });

    fetch('fio.json')
        .then(response => response.json())
        .then(data => {
            const fioSelect = $('#fioSelect');
            Object.keys(data).forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = data[key];
                fioSelect.append(option);
            });
        });

    fetchDataBtn.on('click', async () => {
        const vid = vidSelect[0].selectize.getValue();
        const region = regionSelect[0].selectize.getValue();
        const money = moneySelect[0].selectize.getValue();

        if (!vid.length || !region.length) {
            alert('Пожалуйста, выберите вид деятельности и регион.');
            return;
        }

        fetchDataBtn.prop('disabled', true);
        $('#dataForm').hide();
        loading.show();
        log.hide();
        logContent.text('');
        downloadOptions.hide();

        try {
            const response = await fetch('/get-row-count', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ vid, region, money })
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            const rowCount = data.rowCount;

            loading.hide();
            $('#rowCountModal').modal('show');
            $('#rowCount').text(rowCount);

            $('#startFetchData').on('click', async () => {
                $('#rowCountModal').modal('hide');
                loading.show();

                try {
                    const response = await fetch('/fetch-organizations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ vid, region, money, rowCount })
                    });

                    const data = await response.json();
                    logContent.text(data.log);

                    if (data.success) {
                        loading.hide();
                        log.show();
                        downloadOptions.show();

                        downloadJsonBtn.on('click', () => {
                            const blob = new Blob([JSON.stringify(data.organizations, null, 4)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'DB.json';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        });

                        downloadExcelBtn.on('click', async () => {
                            const response = await fetch('/download-excel', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ organizations: data.organizations })
                            });

                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'Organizations.xlsx';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        });

                        downloadElmaBtn.on('click', () => {
                            $('#elmaModal').modal('show');
                        });

                        $('#submitElma').on('click', async () => {
                            const elmaResponsible = $('#fioSelect').val();
                            const excludeNoPhones = $('#excludeNoPhones').is(':checked');
                            const excludeNoEmails = $('#excludeNoEmails').is(':checked');
                            const excludeNoWebsite = $('#excludeNoWebsite').is(':checked');

                            if (!elmaResponsible) {
                                alert('Пожалуйста, выберите ФИО ответственного.');
                                return;
                            }

                            const filteredOrganizations = data.organizations.filter(org => {
                                return (!excludeNoPhones || org['Телефоны']?.length > 0) &&
                                    (!excludeNoEmails || org['Электронная почта']?.length > 0) &&
                                    (!excludeNoWebsite || org['Веб-сайт']);
                            });

                            const response = await fetch('/download-elma', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ organizations: filteredOrganizations, elmaResponsible })
                            });

                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'ELMA_export.zip';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            $('#elmaModal').modal('hide');
                        });
                    }
                } catch (error) {
                    logContent.text(`Ошибка: ${error.message}`);
                } finally {
                    fetchDataBtn.prop('disabled', false);
                }
            });
        } catch (error) {
            logContent.text(`Ошибка: ${error.message}`);
        } finally {
            fetchDataBtn.prop('disabled', false);
        }
    });
});
