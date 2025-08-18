//main.js
document.addEventListener('DOMContentLoaded', async function () {
    // Elementos do DOM
    const selects = Array.from(document.querySelectorAll('[id^="nivel"]')).sort((a, b) =>
        parseInt(a.id.replace('nivel', '')) - parseInt(b.id.replace('nivel', ''))
    );
    const searchInput = document.getElementById('searchInput');
    const musicList = document.getElementById('musicList');
    const pdfViewer = document.getElementById('pdfViewer');
    const noPdfMessage = document.querySelector('.no-pdf');
    const pdfActions = document.querySelector('.pdf-actions');
    const downloadBtn = document.getElementById('downloadPdf');
    const printBtn = document.getElementById('printBtn'); // THIS LINE IS CRUCIAL
    const loadingIndicator = document.getElementById('loadingIndicator');
    const audioPlayer = document.getElementById('audioPlayer');
    const fileTypeElement = document.getElementById('fileType');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');

    // MUDANÇA AQUI: Ajuste na declaração dos selects de exibição/layout
    const displayOptionsCommon = document.getElementById('displayOptionsCommon');
    const layoutOptions = document.getElementById('layoutOptions'); // Novo select de layout (CORRIGIDO)
    // ... rest of your main3.js code

    // Estado da aplicação
    let allMusicasLoadedFromScripts = [];
    let currentMediaUrl = ''; 
    const loadedScripts = new Set();
    let lastActiveLevelIndex = -1;
    let searchTimeout;

    // Chaves para o localStorage
    const STORAGE_KEY_LEVEL_SELECTIONS = 'nivelSelections';
    const STORAGE_KEY_SEARCH_TERM = 'searchTerm';
    const STORAGE_KEY_LAST_MEDIA = 'lastMedia';
    // MUDANÇA AQUI: Nova chave para controlar o modo de exibição ativo
    const STORAGE_KEY_ACTIVE_DISPLAY_MODE = 'activeDisplayMode'; // 'common' ou 'detailed' // Considerar mudar para 'layoutMode' ou similar

    // --- FUNÇÕES PRINCIPAIS ---

    async function init() {
        try {
            showLoading(true);
            setupInitialSelects();
            setupEventListeners();

            await scanAndLoadAllMusicScripts();

            if (window.nivel1) {
                populateSelect(selects[0], window.nivel1);
                await restoreAppState(); 
            }

            searchInput.disabled = false;
            if (!searchInput.value.trim() && selects.every(s => s.value === '')) {
                showInfoMessage('Selecione uma categoria ou digite para pesquisar em todas as partituras.');
            }

        } catch (error) {
            console.error('Erro na inicialização:', error);
            showErrorMessage('Erro ao iniciar o sistema. Tente novamente mais tarde.');
        } finally {
            showLoading(false);
        }
    }

    function setupInitialSelects() {
        selects.forEach((select, index) => {
            select.disabled = index > 0;
            select.innerHTML = '<option value="">Selecione...</option>';
        });
        // Defina o valor padrão para o select comum
        // CORRIGIDO: Agora setupInitialSelects define o valor padrão para o layoutOptions
        layoutOptions.value = localStorage.getItem('layoutOption') || 'list'; // Assume 'list' é o padrão
        
        // As opções de displayCommon devem estar sempre habilitadas, a menos que você tenha uma lógica específica
        displayOptionsCommon.disabled = false;
        displayOptionsCommon.value = localStorage.getItem('displayOption') || 'name,composer,id,level,instrument,nota';
    }

    function setupEventListeners() {
        selects.forEach((select, index) => {
            select.addEventListener('change', async () => {
                searchInput.value = ''; 
                saveLevelSelections();
                await handleLevelSelectChange(index);
            });
        });

        searchInput.addEventListener('input', () => {
            saveSearchTerm();
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterAndRenderMusicList();
            }, 300); 
        });

        resetFiltersBtn.addEventListener('click', resetAllFiltersAndViewer);

        downloadBtn.addEventListener('click', downloadFile);
        printBtn.addEventListener('click', printFile);

        // MUDANÇA AQUI: Evento para o select de opções COMUNS
        displayOptionsCommon.addEventListener('change', () => {
            // Salva a opção de exibição comum
            localStorage.setItem('displayOption', displayOptionsCommon.value); // Use 'displayOption' como chave
            filterAndRenderMusicList(); 
        });

        // MUDANÇA AQUI: Evento para o select de LAYOUT (CORRIGIDO)
        layoutOptions.addEventListener('change', () => {
            localStorage.setItem('layoutOption', layoutOptions.value); // Salva a opção de layout
            filterAndRenderMusicList(); 
        });
    }

    function populateSelect(selectElement, data) {
        selectElement.innerHTML = '<option value="">Selecione...</option>';
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                selectElement.add(new Option(item.nome || `Item ${index}`, index));
            });
        }
        selectElement.disabled = false;
    }

    // --- LÓGICA DE FILTRAGEM E EXIBIÇÃO ---

    async function handleLevelSelectChange(currentSelectIndex, isRestoring = false) {
        if (!isRestoring) {
            showLoading(true);
        }

        const selectedValue = selects[currentSelectIndex].value;

        for (let i = currentSelectIndex + 1; i < selects.length; i++) {
            selects[i].innerHTML = '<option value="">Selecione...</option>';
            selects[i].disabled = true;
        }

        musicList.innerHTML = '';
        if (!isRestoring) {
            await hideMediaViewer();
        }

        if (selectedValue === '') {
            lastActiveLevelIndex = currentSelectIndex - 1;
            filterAndRenderMusicList();
            if (!isRestoring) {
                showLoading(false);
            }
            return;
        }

        lastActiveLevelIndex = currentSelectIndex;

        const currentLevelData = window[`nivel${currentSelectIndex + 1}`];
        const selectedItem = currentLevelData ? currentLevelData[parseInt(selectedValue)] : null;

        if (!selectedItem) {
            showErrorMessage('Item de nível não encontrado ou dados de nível ausentes.');
            if (!isRestoring) {
                showLoading(false);
            }
            return;
        }

        if (selectedItem.arquivo) {
            try {
                await loadScript(selectedItem.arquivo);
                if (window[`nivel${currentSelectIndex + 2}`]) {
                    populateSelect(selects[currentSelectIndex + 1], window[`nivel${currentSelectIndex + 2}`]);
                    if (isRestoring && currentSelectIndex + 1 < selects.length) {
                        const savedSelections = JSON.parse(localStorage.getItem(STORAGE_KEY_LEVEL_SELECTIONS));
                        if (savedSelections && savedSelections[currentSelectIndex + 1] !== undefined) {
                            selects[currentSelectIndex + 1].value = savedSelections[currentSelectIndex + 1];
                            await handleLevelSelectChange(currentSelectIndex + 1, true); 
                        }
                    }
                }
            } catch (error) {
                console.error(`Erro ao carregar script para ${selectedItem.nome}:`, error);
                showErrorMessage(`Erro ao carregar dados para "${selectedItem.nome}".`);
            }
        } else {
            console.log(`Nível ${currentSelectIndex + 1} selecionado sem arquivo associado.`);
        }

        filterAndRenderMusicList();
        if (!isRestoring) {
            showLoading(false);
        }
    }

// ... (seu código anterior) ...

function filterAndRenderMusicList() {
        let musicsToFilter = [...allMusicasLoadedFromScripts]; 
        let currentFilterTerm = '';

        if (lastActiveLevelIndex !== -1 && selects[lastActiveLevelIndex].value !== '') {
            const currentLevelData = window[`nivel${lastActiveLevelIndex + 1}`];
            const selectedItem = currentLevelData ? currentLevelData[parseInt(selects[lastActiveLevelIndex].value)] : null;

            if (selectedItem && selectedItem.nome) {
                const levelNameLower = selectedItem.nome.toLowerCase();
                currentFilterTerm = selectedItem.nome;

                // Crie uma regex para corresponder ao INÍCIO da string (para nota e id)
                // Escapa caracteres especiais do termo para não quebrar a regex
                const escapedLevelNameLower = levelNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const startsWithRegex = new RegExp(`^${escapedLevelNameLower}`);

                musicsToFilter = allMusicasLoadedFromScripts.filter(m => {
                    const matchesComposer = m.composer && m.composer.toLowerCase().includes(levelNameLower);
                    const matchesLevelProperty = m.level && m.level.toLowerCase().includes(levelNameLower);
                    const matchesName = m.name && m.name.toLowerCase().includes(levelNameLower);
                    const matchesReference = m.reference && m.reference.toLowerCase().includes(levelNameLower);
                    const matchesInstrument = m.instrument && m.instrument.toLowerCase().includes(levelNameLower);
                    const matchesBook = m.book && m.book.toLowerCase().includes(levelNameLower);
                    
                    // MODIFICAÇÃO AQUI: Para `nota` e `id` no filtro de nível
                    // Usar regex para "começa com"
                    const matchesNota = m.nota && startsWithRegex.test(m.nota.toLowerCase());
                    const matchesId = m.id && startsWithRegex.test(m.id.toLowerCase());

                    const matchesAnyFileVersionPath = m.versions.some(v => v.file.toLowerCase().includes(levelNameLower));

                    return matchesComposer || matchesLevelProperty || matchesName || matchesReference ||
                        matchesInstrument || matchesBook || matchesNota || matchesId ||
                        matchesAnyFileVersionPath;
                });
            }
        }

        const searchTerm = searchInput.value.toLowerCase().trim();
        let finalFilteredMusicas = musicsToFilter; 

        if (searchTerm) {
            currentFilterTerm = searchTerm;
            
            // MODIFICAÇÃO CRUCIAL AQUI: Para ID e NOTA
            // Crie uma regex para corresponder ao INÍCIO da string
            // Escapa caracteres especiais do termo para não quebrar a regex
            const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const startsWithRegexForSearch = new RegExp(`^${escapedSearchTerm}`);

            finalFilteredMusicas = musicsToFilter.filter(m =>
                (m.name && m.name.toLowerCase().includes(searchTerm)) ||
                (m.composer && m.composer.toLowerCase().includes(searchTerm)) ||
                (m.level && m.level.toLowerCase().includes(searchTerm)) ||
                
                // Use a regex para "começa com" para ID e NOTA
                (m.id && startsWithRegexForSearch.test(m.id.toLowerCase())) ||
                (m.nota && startsWithRegexForSearch.test(m.nota.toLowerCase())) ||

                (m.reference && m.reference.toLowerCase().includes(searchTerm)) ||
                (m.instrument && m.instrument.toLowerCase().includes(searchTerm)) ||
                (m.book && m.book.toLowerCase().includes(searchTerm))
            );
        }

        if (finalFilteredMusicas.length === 0) {
            const msg = currentFilterTerm
                ? `Nenhuma partitura encontrada para "${currentFilterTerm}".`
                : 'Nenhuma partitura disponível para este critério.';
            showInfoMessage(msg);
        } else {
            renderMusicListHtml(finalFilteredMusicas);
            musicList.scrollTop = 0; 
        }
    }

// ... (o restante do seu código) ...

    function renderMusicListHtml(musicasToRender) {
        if (!musicList) return;

        // MUDANÇA AQUI: Agora usa layoutOptions para determinar a classe e o formato
        const selectedLayout = layoutOptions.value; // 'list' ou 'gallery'
        const selectedDisplayFields = displayOptionsCommon.value.split(','); // Campos a serem exibidos

        // Adiciona ou remove a classe 'list-view' (ou 'gallery-view') com base na opção de layout
        if (selectedLayout === 'list') {
            musicList.classList.add('list-view'); // Mantém a classe 'list-view' para o layout de lista detalhada
            musicList.classList.remove('gallery-view'); // Remove se existir
        } else if (selectedLayout === 'gallery') {
            musicList.classList.add('gallery-view'); // Adiciona classe para layout de galeria (ou o que for seu "detailed")
            musicList.classList.remove('list-view'); // Remove se existir
        }
        // Se você não tem um layout de galeria ainda, remova a condição else if e apenas adicione/remova 'list-view'

        let htmlContent = '';

        musicasToRender.forEach(music => {
            let musicInfoHtml = '';
            let versionsHtml = '';

            // Se o layout for 'list' (que é a sua lista detalhada atual), renderiza tudo em uma linha
            if (selectedLayout === 'list') { // Este é o modo de "Lista" (o que você chamava de detalhado)
                const selectedDisplayFields = displayOptionsCommon.value.split(','); // Obtenha os campos selecionados
                let parts = [];

                // Renderiza apenas os campos selecionados para o layout 'list'
                if (selectedDisplayFields.includes('id') && music.id) parts.push(`ID: ${music.id}`);
                if (selectedDisplayFields.includes('name') && music.name) parts.push(`<strong>${music.name}</strong>`);
                if (selectedDisplayFields.includes('composer') && music.composer) parts.push(music.composer);
                if (selectedDisplayFields.includes('instrument') && music.instrument) parts.push(music.instrument);
                if (selectedDisplayFields.includes('level') && music.level) parts.push(`Nível: ${music.level}`);
                if (selectedDisplayFields.includes('nota') && music.nota) parts.push(`Nota: ${music.nota}`);
                if (selectedDisplayFields.includes('reference') && music.reference) parts.push(`Ref: ${music.reference}`);

                musicInfoHtml = `<div class="list-detailed-line">${parts.join(' - ')}</div>`;

            } else { // Para o layout 'gallery'
                // Este bloco permanece como está, pois já está lendo selectedDisplayFields
                const selectedDisplayFields = displayOptionsCommon.value.split(','); 

                if (selectedDisplayFields.includes('name') && music.name) { // Adicionado music.name para evitar "undefined"
                    musicInfoHtml += `<strong>${music.name || 'Sem nome'}</strong>`;
                }
                if (selectedDisplayFields.includes('composer') && music.composer) {
                    musicInfoHtml += `<div class="composer">${music.composer}</div>`;
                }
                if (selectedDisplayFields.includes('id') && music.id) {
                    musicInfoHtml += `<div class="music-id">ID: ${music.id}</div>`;
                }
                if (selectedDisplayFields.includes('level') && music.level) {
                    musicInfoHtml += `<div class="level">Nível: ${music.level}</div>`;
                }
                if (selectedDisplayFields.includes('instrument') && music.instrument) {
                    musicInfoHtml += `<div class="instrument">Instrumento: ${music.instrument}</div>`;
                }
                if (selectedDisplayFields.includes('nota') && music.nota) {
                    musicInfoHtml += `<div class="nota">Nota/Score: ${music.nota}</div>`;
                }
                if (selectedDisplayFields.includes('reference') && music.reference) {
                    musicInfoHtml += `<div class="reference">Referência: ${music.reference}</div>`;
                }
            }
            
            // Renderiza as versões para ambos os layouts
            versionsHtml = `<div class="formats">${
                music.versions.map(v =>
                    `<span class="file-badge ${v.type}"
                        data-file="${v.file}"
                        data-type="${v.type}"
                        data-music-id="${music.id}">
                        ${v.type.toUpperCase()}
                    </span>`
                ).join(' ')
            }</div>`;


            htmlContent += `
                <div class="music-item" data-music-id="${music.id}">
                    <div class="music-info">
                        ${musicInfoHtml}
                    </div>
                    ${versionsHtml}
                </div>`;
        });

        musicList.innerHTML = htmlContent;

        // Adiciona event listeners para os badges APÓS a lista ser renderizada
        document.querySelectorAll('.file-badge').forEach(badge => {
            badge.addEventListener('click', function() {
                const file = this.dataset.file;
                const type = this.dataset.type;
                showMedia(file, type);
            });
        });
    }

    // --- FUNÇÕES DE PERSISTÊNCIA ---

    function saveLevelSelections() {
        const selections = selects.map(select => select.value);
        localStorage.setItem(STORAGE_KEY_LEVEL_SELECTIONS, JSON.stringify(selections));
    }

    function saveSearchTerm() {
        localStorage.setItem(STORAGE_KEY_SEARCH_TERM, searchInput.value.trim());
    }

    function saveLastMedia(url, type) {
        localStorage.setItem(STORAGE_KEY_LAST_MEDIA, JSON.stringify({ file: url, type: type }));
    }

    // MUDANÇA AQUI: Ajuste na função restoreAppState para lidar com os dois selects
async function restoreAppState() {
    const savedSelections = JSON.parse(localStorage.getItem(STORAGE_KEY_LEVEL_SELECTIONS));
    const savedSearchTerm = localStorage.getItem(STORAGE_KEY_SEARCH_TERM);
    const lastMedia = JSON.parse(localStorage.getItem(STORAGE_KEY_LAST_MEDIA));
    
    displayOptionsCommon.value = localStorage.getItem('displayOption') || 'name,composer,id,level,instrument,nota';
    layoutOptions.value = localStorage.getItem('layoutOption') || 'list';

    if (savedSearchTerm) {
        searchInput.value = savedSearchTerm;
    }

    if (savedSelections && Array.isArray(savedSelections)) {
        if (savedSelections[0] !== undefined && selects[0]) {
            selects[0].value = savedSelections[0];
            if (savedSelections[0] !== '') {
                await handleLevelSelectChange(0, true);
            } else {
                filterAndRenderMusicList();
            }
        }
    }

    if (lastMedia && lastMedia.file && lastMedia.type) {
        setTimeout(() => {
            showMedia(lastMedia.file, lastMedia.type);
        }, 100);
    }

    // ✅ Adicione este trecho no final:
    if (
        (!savedSelections || savedSelections.every(v => v === '')) &&
        (!savedSearchTerm || savedSearchTerm.trim() === '')
    ) {
        filterAndRenderMusicList(); // Força renderização com as opções restauradas
    }
}


    // --- NOVA FUNÇÃO: RESETAR TUDO ---
    async function resetAllFiltersAndViewer() {
        showLoading(true);

        selects.forEach((select, index) => {
            select.value = ''; 
            if (index > 0) { 
                select.disabled = true;
                select.innerHTML = '<option value="">Selecione...</option>';
            }
        });
        lastActiveLevelIndex = -1; 

        searchInput.value = '';

        await hideMediaViewer();

        // MUDANÇA AQUI: Resetar ambos os selects de exibição para seus padrões
        displayOptionsCommon.value = "name,composer,id,level,instrument,nota"; 
        layoutOptions.value = "list"; // Resetar para o layout de lista padrão
        displayOptionsCommon.disabled = false; // Garante que o select comum esteja habilitado
        
        localStorage.removeItem(STORAGE_KEY_LEVEL_SELECTIONS);
        localStorage.removeItem(STORAGE_KEY_SEARCH_TERM);
        localStorage.removeItem(STORAGE_KEY_LAST_MEDIA);
        localStorage.removeItem('displayOption'); // Remover a chave antiga se ainda estiver lá
        localStorage.removeItem('layoutOption'); // Limpa a chave de layout

        filterAndRenderMusicList();
        showInfoMessage('Filtros resetados. Selecione uma categoria ou digite para pesquisar em todas as partituras.');

        showLoading(false);
    }

    // --- FUNÇÕES DE UTILITÁRIAS ---
    async function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (loadedScripts.has(src)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loadedScripts.add(src);
                resolve();
            };
            script.onerror = (e) => {
                console.error(`Falha ao carregar script: ${src}`, e);
                reject(e);
            };
            document.head.appendChild(script);
        });
    }

    async function scanAndLoadAllMusicScripts() {
        try {
            let rawMusicas = [];
            const musicScriptSources = [
                'js/todaspartituraspdf.js',
                'js/todaspartiturasmp3.js',
                'js/todaspartiturasmid.js',
                'js/todaspartiturasabc.js',
                'js/todaspartiturasxml.js',
                'js/todaspartiturasbb.js',
                'js/todaspartiturasgtp.js'
            ];

            for (const src of musicScriptSources) {
                try {
                    await loadScript(src);
                    if (window.musicas && Array.isArray(window.musicas)) {
                        rawMusicas.push(...window.musicas);
                        window.musicas = undefined; 
                    }
                } catch (error) {
                    console.warn(`Erro ao carregar script musical: ${src}. Pode não ter definido window.musicas ou o script não existe.`, error);
                }
            }
            allMusicasLoadedFromScripts = agruparMusicas(rawMusicas);
            console.log("Todas as músicas carregadas e agrupadas para o pool global. Total de músicas agrupadas:", allMusicasLoadedFromScripts.length);

        } catch (error) {
            console.error('Erro fatal ao escanear e carregar todos os scripts de música:', error);
            throw error;
        }
    }

    function agruparMusicas(musicasArray) {
        const musicasAgrupadas = {};
        musicasArray.forEach(musica => {
            const fileName = musica.file.split('/').pop();
            const idMatch = fileName.match(/^(\d+)/);
            const id = idMatch ? idMatch[1] : `ID_GEN_${musica.name || ''}_${musica.composer || ''}_${musica.file.split('/').pop().split('.')[0]}`.replace(/[^a-zA-Z0-9_]/g, '');

            if (!musicasAgrupadas[id]) {
                musicasAgrupadas[id] = {
                    id: id,
                    name: musica.name || 'Sem nome',
                    composer: musica.composer || 'Desconhecido',
                    level: musica.level || 'Não especificado',
                    reference: musica.reference || '',
                    instrument: musica.instrument || '',
                    book: musica.book || '',
                    nota: musica.nota || '',
                    versions: []
                };
            }

            const tipo = musica.file.split('.').pop().toLowerCase();
            if (!musicasAgrupadas[id].versions.some(v => v.file === musica.file)) {
                musicasAgrupadas[id].versions.push({
                    type: tipo,
                    file: musica.file
                });
            }
        });
        return Object.values(musicasAgrupadas);
    }

    async function showMedia(url, type) {
        if (!url || !type) return;

        currentMediaUrl = url; 
        fileTypeElement.textContent = `Tipo: ${type.toUpperCase()}`;

        pdfViewer.style.display = 'none';
        audioPlayer.style.display = 'none';
        noPdfMessage.style.display = 'none'; 
        pdfActions.style.display = 'none';

        document.querySelectorAll('.file-badge').forEach(badge => {
            badge.classList.remove('active');
        });

        if (type === 'pdf') {
            pdfViewer.src = url;
            pdfViewer.style.display = 'block';
            pdfActions.style.display = 'flex'; 
            downloadBtn.textContent = `Baixar PDF`;
            printBtn.textContent = `Imprimir PDF`;
            printBtn.style.display = 'inline-block';
        } else if (type === 'mp3') {
            audioPlayer.src = url;
            audioPlayer.load();
            audioPlayer.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar MP3`;
            printBtn.style.display = 'none';
            noPdfMessage.style.display = 'none';
        } else if (type === 'mid') {
            noPdfMessage.innerHTML = `Nenhum visualizador disponível para MID. Clique em "Baixar" para abrir.`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar MID`;
            printBtn.style.display = 'none';

        } else if (type === 'xml') {
            noPdfMessage.innerHTML = `Nenhum visualizador disponível para xml. Clique em "Baixar" para abrir.`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar xml`;
            printBtn.style.display = 'none';
        

            } else if (type === 'bb') {
            noPdfMessage.innerHTML = `Nenhum visualizador disponível para bb. Clique em "Baixar" para abrir.`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar bb`;
            printBtn.style.display = 'none';

            } else if (type === 'gtp') {
            noPdfMessage.innerHTML = `Nenhum visualizador disponível para gtp. Clique em "Baixar" para abrir.`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar gtp`;
            printBtn.style.display = 'none';
        } else if (type === 'abc') {
            noPdfMessage.innerHTML = `Nenhum visualizador direto para ABC. Clique em "Visualizar" ou "Baixar".`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar ABC`;
            printBtn.textContent = `Visualizar ABC`;
            printBtn.style.display = 'inline-block';
        } else {
            console.warn('Tipo de arquivo não suportado para visualização direta:', type);
            noPdfMessage.innerHTML = `Visualização direta de ${type.toUpperCase()} não suportada. Baixe o arquivo.`;
            noPdfMessage.style.display = 'block';
            pdfActions.style.display = 'flex';
            downloadBtn.textContent = `Baixar ${type.toUpperCase()}`;
            printBtn.style.display = 'none';
        }

        const activeBadge = document.querySelector(`.file-badge[data-file="${url}"][data-type="${type}"]`);
        if (activeBadge) {
            activeBadge.classList.add('active');
        }

        saveLastMedia(url, type);
    }

    async function hideMediaViewer() {
        pdfViewer.style.display = 'none';
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = '';
            audioPlayer.style.display = 'none';
        }
        noPdfMessage.style.display = 'block';
        pdfActions.style.display = 'none';
        currentMediaUrl = ''; 
        fileTypeElement.textContent = 'Tipo: N/A';

        document.querySelectorAll('.file-badge').forEach(badge => {
            badge.classList.remove('active');
        });
        localStorage.removeItem(STORAGE_KEY_LAST_MEDIA);
    }

function forceDownload(url, filename) {
    fetch(url)
        .then(res => res.blob())
        .then(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename || 'arquivo';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        });
}


function downloadFile() {
    if (!currentMediaUrl) return;

    const filename = currentMediaUrl.split('/').pop() || 'arquivo';

    // Tenta forçar o download via fetch
    fetch(currentMediaUrl)
        .then(response => {
            if (!response.ok) throw new Error('Fetch falhou');
            return response.blob();
        })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        })
        .catch(error => {
            console.warn('Fetch falhou, usando fallback simples:', error);
            // Fallback se fetch falhar (abrirá em nova aba se não suportar)
            const a = document.createElement('a');
            a.href = currentMediaUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
}



    function printFile() {
        if (!currentMediaUrl) return;
        const fileExtension = currentMediaUrl.split('.').pop().toLowerCase();

        if (fileExtension === 'pdf') {
            const printWindow = window.open(currentMediaUrl, '_blank');
            if (printWindow) {
                printWindow.onload = function() {
                    try {
                        printWindow.print();
                    } catch (e) {
                        console.error('Erro ao tentar imprimir:', e);
                        alert('Não foi possível iniciar a impressão. Verifique as configurações do navegador ou tente baixar o arquivo.');
                    }
                };
            }
        } else if (fileExtension === 'abc') {
            window.open(currentMediaUrl, '_blank');
        }
    }

    function showErrorMessage(message) {
        if (!musicList) return;
        musicList.innerHTML = `<div class="error-message">${message}</div>`;
        musicList.scrollTop = 0;
    }

    function showInfoMessage(message) {
        if (!musicList) return;
        musicList.innerHTML = `<div class="info-message">${message}</div>`;
        musicList.scrollTop = 0;
    }

    function showLoading(show) {
        if (!loadingIndicator) return;
        loadingIndicator.style.display = show ? 'flex' : 'none';
    }

    // --- FUNÇÕES DE DEBUG ---
    window.verificarEstrutura = function() {
        console.group('Verificação de Estrutura');
        console.log('lastActiveLevelIndex:', lastActiveLevelIndex);
        console.log('allMusicasLoadedFromScripts (Todas as músicas do pool principal):', allMusicasLoadedFromScripts.length, allMusicasLoadedFromScripts);
        console.log('Termo de busca:', searchInput.value.trim());

        if (lastActiveLevelIndex !== -1) {
            const currentSelect = selects[lastActiveLevelIndex];
            if (currentSelect && currentSelect.value !== '') {
                const currentLevelData = window[`nivel${lastActiveLevelIndex + 1}`];
                const selectedItem = currentLevelData ? currentLevelData[parseInt(currentSelect.value)] : null;
                console.log('Item de nível selecionado atualmente:', selectedItem);
            } else {
                console.log('Nível ativo, mas select vazio.');
            }
        } else {
            console.log('Nenhum nível está ativamente selecionado.');
        }

        console.log('Scripts carregados:', Array.from(loadedScripts));
        console.groupEnd();
    };

    window.debugApp = function() {
        console.group('Estado da Aplicação Completo');
        console.log('lastActiveLevelIndex:', lastActiveLevelIndex);
        console.log('Total músicas carregadas (allMusicasLoadedFromScripts):', allMusicasLoadedFromScripts.length);
        console.log('Mídia atual:', currentMediaUrl); 
        console.log('Scripts carregados:', Array.from(loadedScripts));
        console.log('LocalStorage - Seleções:', localStorage.getItem(STORAGE_KEY_LEVEL_SELECTIONS));
        console.log('LocalStorage - Termo Busca:', localStorage.getItem(STORAGE_KEY_SEARCH_TERM));
        console.log('LocalStorage - Última Mídia:', localStorage.getItem(STORAGE_KEY_LAST_MEDIA));
        // CORRIGIDO: Referência à nova chave de layout
        console.log('LocalStorage - Opção de Layout Ativa:', localStorage.getItem('layoutOption')); 
        console.groupEnd();
    };

    // Inicializa a aplicação quando o DOM estiver pronto
    init();
});
