// script.js

// ゲームのルールに関する設定をここにまとめる
const gameSettings = {
    mode40: {
        pickCount: 19,
        targetDeckSize: 40,
        rerollCounts: { "エルフ": 3, "ロイヤル": 3, "ウィッチ": 7, "ドラゴン": 3, "ナイトメア": 3, "ビショップ": 3, "ネメシス": 3 }
    },
    mode30: {
        pickCount: 14,
        targetDeckSize: 30,
        rerollCounts: { "エルフ": 2, "ロイヤル": 2, "ウィッチ": 5, "ドラゴン": 2, "ナイトメア": 2, "ビショップ": 2, "ネメシス": 2 }
    },
    userSettings: {
        neutralCardRate: 0.15,
        W_NEW: 1.2
    }
};

window.onload = function () {
    for (const className in cardData) {
        cardData[className].cards = [...cardData[className].classCards, ...neutralCards];
    }

    const state = {
        currentMode: 'mode40',
        currentClass: null,
        deck: {},
        pickCount: 0,
        rerollCount: 0,
        cardsInDeckCount: 0,
        classProbabilities: { pick: {}, reroll: {} },
        guaranteedCards: [],
        isPickleMode: false,
        pickleDate: ''
    };

    const elements = {
        classSelection: document.getElementById('class-selection'),
        pickPhase: document.getElementById('pick-phase'),
        classButtons: document.getElementById('class-buttons'),
        cardChoicesContainer: document.getElementById('card-choices-container'),
        rerollButton: document.getElementById('reroll-button'),
        rerollCount: document.getElementById('reroll-count'),
        pickCountDisplay: document.getElementById('pick-count'),
        currentDeck: document.getElementById('current-deck'),
        log: document.getElementById('log'),
        statusMessage: document.getElementById('status-message'),
        deckCardCount: document.getElementById('deck-card-count'),
        mode40Button: document.getElementById('mode-40-button'),
        mode30Button: document.getElementById('mode-30-button'),
        currentModeDisplay: document.getElementById('current-mode-display'),
        refreshClassesButton: document.getElementById('refresh-classes-button'),
        modeSelection: document.getElementById('mode-selection'),
        qrCodeContainer: document.getElementById('qrcode-container'),
        generateQrButton: document.getElementById('generate-qr-button'),
        qrCodeDisplay: document.getElementById('qrcode-display'),
        settingsContainer: document.getElementById('settings-container'),
        neutralRateInput: document.getElementById('neutral-rate-input'),
        wnewInput: document.getElementById('wnew-input'),
        applySettingsButton: document.getElementById('apply-settings-button'),
        currentNeutralRate: document.getElementById('current-neutral-rate'),
        currentWnew: document.getElementById('current-wnew'),
        startPickleButton: document.getElementById('start-pickle-button'),
        pickleDateInput: document.getElementById('pickle-date'),
        shareResultButton: document.getElementById('share-result-button'),
        gameModeContainer: document.getElementById('game-mode-container'),
        refreshClassesButton: document.getElementById('refresh-classes-button')
    };

        // --- 2Pickle関連の関数 ---

    function getYYYYMMDD(date) {
        const y = date.getFullYear();
        const m = ("00" + (date.getMonth() + 1)).slice(-2);
        const d = ("00" + date.getDate()).slice(-2);
        return `${y}${m}${d}`;
    }

    function generateSeedFromDate(dateString) {
        const dateNum = parseInt(dateString, 10);
        const seedNum = (dateNum * 997) % 1000000;
        let seed = seedNum.toString(36);
        while (seed.length < 6) {
            seed = 'a' + seed;
        }
        return seed.slice(0, 6);
    }

    function startPickleMode(date) {
        state.isPickleMode = true;
        state.pickleDate = getYYYYMMDD(date);
        const seed = generateSeedFromDate(state.pickleDate);
        
        // シード値で乱数生成器を初期化
        Math.seedrandom(seed);

        state.currentMode = 'mode30';
        addLog(`>> 2Pickleを開始します: ${state.pickleDate}`);

        // UIを更新
        elements.gameModeContainer.style.display = 'none';
        elements.settingsContainer.style.display = 'none';
        elements.refreshClassesButton.style.display = 'none';
        elements.classSelection.style.display = 'block';

        renderClassSelection(); // シード値に基づいたクラスが提示される
    }

    let qrcode = null;
    let manaCurveChart = null;

    function selectClass(className, guaranteedCards) {
        state.currentClass = className;
        state.cardsInDeckCount = 0;
        state.deck = {};
        // ▼▼▼ 追加 ▼▼▼
        state.guaranteedCards = guaranteedCards; // 初期カードをstateに保存

        generateProbabilityTables(className);

        const currentModeSettings = gameSettings[state.currentMode];
        state.rerollCount = currentModeSettings.rerollCounts[className];
        elements.rerollCount.textContent = state.rerollCount;

        elements.modeSelection.style.display = 'none';

        addCardToDeck(guaranteedCards[0]);
        addCardToDeck(guaranteedCards[1]);

        elements.classSelection.style.display = 'none';
        elements.pickPhase.style.display = 'block';
        elements.settingsContainer.style.display = 'none';

        state.pickCount = 0;
        elements.pickCountDisplay.textContent = `${state.pickCount}/${currentModeSettings.pickCount}`;

        pickNext();

        // 2Pickleモードの場合、シェアボタンを表示する準備
        if (state.isPickleMode) {
            elements.shareResultButton.style.display = 'none'; // ピック中は非表示
        }
    }

    // (pickNextからsortDeckForQrCodeの直前までは変更なし)

    function pickNext() {
        const currentModeSettings = gameSettings[state.currentMode];
        if (state.pickCount >= currentModeSettings.pickCount) {
            endSimulation();
            return;
        }

        state.pickCount++;
        elements.pickCountDisplay.textContent = `${state.pickCount}/${currentModeSettings.pickCount}`;

        const choices = getChoicesForPick(state.pickCount - 1);
        renderChoices(choices);
    }

    function getChoicesForPick(pickIndex) {
        const pickInfo = state.classProbabilities.pick[pickIndex];
        const uniqueCards = [];
        let attempts = 0;

        while (uniqueCards.length < 4 && attempts < 100) {
            const group = weightedRandom(pickInfo.groups);
            const potentialCard = getRandomCard({
                rarity: pickInfo.rarity,
                group: group,
                exclude: uniqueCards
            });

            if (potentialCard) {
                uniqueCards.push(potentialCard);
            }
            attempts++;
        }

        while (uniqueCards.length < 4) {
            const group = weightedRandom(pickInfo.groups);
            const fillCard = getRandomCard({ rarity: pickInfo.rarity, group: group, });
            uniqueCards.push(fillCard || { name: "（候補なし）", id: "", cost: 0 });
        }

        return [[uniqueCards[0], uniqueCards[1]], [uniqueCards[2], uniqueCards[3]]];
    }

    function getRandomCard(filters) {
        const cardPool = cardData[state.currentClass].cards.filter(c => {
            if (state.currentMode === 'mode40' && state.deck[c.name] && state.deck[c.name].count >= 3) { return false; }
            if (filters.rarity) {
                if (filters.rarity === "ゴールド/レジェンド") {
                    if (c.rarity !== "ゴールド" && c.rarity !== "レジェンド") return false;
                } else {
                    if (c.rarity !== filters.rarity) return false;
                }
            }
            if (filters.group && c.group !== filters.group) { return false; }
            if (filters.exclude && filters.exclude.some(ec => ec && ec.name === c.name)) { return false; }
            return true;
        });

        if (cardPool.length === 0) return null;
        return cardPool[Math.floor(Math.random() * cardPool.length)];
    }

    function getCardCountsByGroup(className, rarity) {
        const counts = { normal: 0, new: 0, normal_n: 0, new_n: 0 };
        const isGoldLegend = rarity === "ゴールド/レジェンド";
        const cardSource = cardData[className].cards;

        cardSource.forEach(card => {
            let rarityMatch = !rarity;
            if (rarity) {
                rarityMatch = isGoldLegend ? (card.rarity === "ゴールド" || card.rarity === "レジェンド") : (card.rarity === rarity);
            }

            if (rarityMatch) {
                if (card.group === 'new') counts.new++;
                else if (card.group === 'normal') counts.normal++;
                else if (card.group === 'new-n') counts.new_n++;
                else if (card.group === 'normal-n') counts.normal_n++;
            }
        });
        return counts;
    }

    function calculateProbabilities(counts, targetNeutralRate) {
        const probs = { normal: 0, new: 0, "normal-n": 0, "new-n": 0 };
        const W_NEW = gameSettings.userSettings.W_NEW;
        const totalClassWeight = counts.normal + (counts.new * W_NEW);
        const totalNeutralWeight = counts.normal_n + (counts.new_n * W_NEW);
        const targetClassRate = 1 - targetNeutralRate;

        if (totalClassWeight > 0) {
            probs.normal = targetClassRate * counts.normal / totalClassWeight;
            probs.new = targetClassRate * (counts.new * W_NEW) / totalClassWeight;
        }
        if (totalNeutralWeight > 0) {
            probs['normal-n'] = targetNeutralRate * counts.normal_n / totalNeutralWeight;
            probs['new-n'] = targetNeutralRate * (counts.new_n * W_NEW) / totalNeutralWeight;
        }
        return probs;
    }

    function generateProbabilityTables(className) {
        const pickRarities = [
            "ブロンズ", "シルバー", "ブロンズ", "シルバー", "ブロンズ", "ゴールド", "ブロンズ",
            "シルバー", "ブロンズ", "シルバー", "ブロンズ", "シルバー", "ブロンズ",
            "ゴールド/レジェンド", "ブロンズ", "シルバー", "ブロンズ", "シルバー", "ゴールド/レジェンド"
        ];
        state.classProbabilities.pick = pickRarities.map(rarity => {
            const counts = getCardCountsByGroup(className, rarity);
            const groups = calculateProbabilities(counts, gameSettings.userSettings.neutralCardRate);
            return { rarity, groups };
        });

        const rerollCounts = getCardCountsByGroup(className, null);
        state.classProbabilities.reroll = calculateProbabilities(rerollCounts, gameSettings.userSettings.neutralCardRate);
    }

    function initializeSimulator() {
        elements.currentNeutralRate.textContent = gameSettings.userSettings.neutralCardRate;
        elements.currentWnew.textContent = gameSettings.userSettings.W_NEW;

        renderClassSelection();
        updateDeckCardCountDisplay();
        elements.mode40Button.style.backgroundColor = '#2563eb';
    }

    function getGuaranteedCards(className) {
        const classCards = cardData[className].classCards;
        const legendCards = classCards.filter(c => c.rarity === "レジェンド");
        const goldCards = classCards.filter(c => c.rarity === "ゴールド");
        const allHighRarityCards = [...legendCards, ...goldCards];
        const card1 = legendCards[Math.floor(Math.random() * legendCards.length)];
        let card2 = null;
        let attempts = 0;
        do {
            card2 = allHighRarityCards[Math.floor(Math.random() * allHighRarityCards.length)];
            attempts++;
        } while (card1 && card2 && card1.name === card2.name && attempts < 10);
        return [card1, card2];
    }

    function renderClassSelection() {
        elements.classButtons.innerHTML = '';
        const allClasses = Object.keys(cardData);
        let presentedClasses = [];

        if (state.isPickleMode) {
            // ▼▼▼ ここから変更 ▼▼▼
            // シード値に基づいて1クラスを固定で選出
            const classIndex = Math.floor(Math.random() * allClasses.length);
            presentedClasses = [allClasses[classIndex]];
            // ▲▲▲ ここまで変更 ▲▲▲
        } else {
            // フリーモードでは全クラスを表示
            presentedClasses = allClasses;
        }

        for (const className of presentedClasses) {
            if (!cardData[className].classCards) continue;
            const guaranteedCards = getGuaranteedCards(className);
            const button = document.createElement('div');
            button.classList.add('class-select-button');
            button.innerHTML = `<h3>${className}</h3><p class="card-name">${guaranteedCards[0].name}</p><p class="card-name">${guaranteedCards[1].name}</p>`;
            button.onclick = () => selectClass(className, guaranteedCards);
            elements.classButtons.appendChild(button);
        }
    }

    function renderChoices(choices) {
        elements.cardChoicesContainer.innerHTML = '';
        choices.forEach(pair => {
            const cardGroupDiv = document.createElement('div');
            cardGroupDiv.classList.add('card-group');
            cardGroupDiv.onclick = () => selectCards(pair);
            pair.forEach(card => {
                const cardDiv = document.createElement('div');
                cardDiv.classList.add('card-pair');
                cardDiv.innerHTML = `<p class="card-name">${card ? card.name : 'カードなし'}</p>`;
                cardGroupDiv.appendChild(cardDiv);
            });
            elements.cardChoicesContainer.appendChild(cardGroupDiv);
        });
    }

    function selectCards(cards) {
        cards.forEach(card => { if (card) addCardToDeck(card); });
        pickNext();
    }

    function addCardToDeck(card) {
        if (state.deck[card.name]) {
            state.deck[card.name].count++;
        } else {
            state.deck[card.name] = { ...card, count: 1 };
        }
        state.cardsInDeckCount++;
        addLog(`>> ${card.name} を選択しました。`);
        updateDeckDisplay();
    }

    elements.startPickleButton.onclick = () => {
        const selectedDate = elements.pickleDateInput.value ? new Date(elements.pickleDateInput.value) : new Date();
        startPickleMode(selectedDate);
    };

    elements.rerollButton.onclick = () => {
        if (state.rerollCount <= 0) {
            addLog(`>> 再抽選回数がありません。`);
            return;
        }

        state.rerollCount--;
        elements.rerollCount.textContent = state.rerollCount;
        addLog(`>> 再抽選を実行しました。残り${state.rerollCount}回。`);

        const rerollChoices = [];
        let attempts = 0;
        while (rerollChoices.length < 4 && attempts < 100) {
            const group = weightedRandom(state.classProbabilities.reroll);
            const potentialCard = getRandomCard({ group: group, exclude: rerollChoices });
            if (potentialCard) {
                rerollChoices.push(potentialCard);
            }
            attempts++;
        }

        while (rerollChoices.length < 4) {
            rerollChoices.push({ name: "（候補なし）", id: "", cost: 0 });
        }

        renderChoices([[rerollChoices[0], rerollChoices[1]], [rerollChoices[2], rerollChoices[3]]]);
    };

    function sortDeck(deckObject) {
        const deckAsArray = Object.values(deckObject);
        const parseId = (id) => {
            if (!id || id.length !== 8) return { packId: 999, classId: 9, rarityId: 9, typeId: 9, number: 99 };
            return {
                packId: parseInt(id.substring(0, 3)), classId: parseInt(id.substring(3, 4)),
                rarityId: parseInt(id.substring(4, 5)), typeId: parseInt(id.substring(5, 6)),
                number: parseInt(id.substring(6, 8))
            };
        };

        deckAsArray.sort((a, b) => {
            if (a.cost !== b.cost) return a.cost - b.cost;
            const idA = parseId(a.id); const idB = parseId(b.id);
            if (idA.classId !== idB.classId) return idA.classId - idB.classId;
            if (idA.typeId !== idB.typeId) return idA.typeId - idB.typeId;
            if (idA.packId !== idB.packId) return idA.packId - idB.packId;
            if (idA.rarityId !== idB.rarityId) return idA.rarityId - idB.rarityId;
            return idA.number - idB.number;
        });
        return deckAsArray;
    }

    function updateDeckDisplay() {
        elements.currentDeck.innerHTML = '';
        const sortedDeck = sortDeck(state.deck);

        sortedDeck.forEach(card => {
            const li = document.createElement('li');
            li.classList.add('deck-list-item');
            const rarityClass = {
                "ブロンズ": "rarity-bronze", "シルバー": "rarity-silver",
                "ゴールド": "rarity-gold", "レジェンド": "rarity-legend"
            }[card.rarity] || "";

            li.innerHTML = `
            <div>
                <span class="deck-list-cost">${card.cost}</span>
                <span class="${rarityClass}">${card.name}</span>
            </div>
            <span>x${card.count}</span>`;
            elements.currentDeck.appendChild(li);
        });

        updateDeckCardCountDisplay();
        renderManaCurveChart();
    }

    function updateDeckCardCountDisplay() {
        elements.deckCardCount.textContent = state.cardsInDeckCount;
    }
    function endSimulation() {
        elements.pickPhase.style.display = 'none';
        elements.statusMessage.textContent = "デッキが完成しました！";
        addLog(">> デッキ完成！");

        if (state.isPickleMode) {
            elements.shareResultButton.style.display = 'block';
        }
    }

    function addLog(message) {
        const p = document.createElement('p');
        p.textContent = message;
        elements.log.prepend(p);
    }

    function weightedRandom(weights) {
        const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
        let randomNum = Math.random() * totalWeight;
        for (const group in weights) {
            randomNum -= weights[group];
            if (randomNum <= 0) return group;
        }
        return Object.keys(weights)[0];
    }

    function convertIdToHash(id) {
        const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
        if (id === 0) return ALPHABET[0].repeat(4);
        let num = id;
        let hash = '';
        while (num > 0) {
            hash = ALPHABET[num % 64] + hash;
            num = Math.floor(num / 64);
        }
        return hash.padStart(4, ALPHABET[0]);
    }

    function sortDeckForQrCode(deck) {
        const sortedCards = [];
        // 整列はしないように変更
        const deckAsArray = Object.values(deck);

        deckAsArray.forEach(cardInfo => {
            for (let i = 0; i < cardInfo.count; i++) {
                sortedCards.push(cardInfo);
            }
        });
        return sortedCards.map(card => card.id);
    }


    function renderManaCurveChart() {
        const manaCounts = Array(11).fill(0);

        for (const cardName in state.deck) {
            const card = state.deck[cardName];
            const cost = Math.min(card.cost, 10);
            manaCounts[cost] += card.count;
        }

        const ctx = document.getElementById('mana-curve-chart').getContext('2d');
        const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
        const data = manaCounts.slice(1);

        if (manaCurveChart) {
            manaCurveChart.data.labels = labels;
            manaCurveChart.data.datasets[0].data = data;
            manaCurveChart.update();
        } else {
            manaCurveChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '枚数',
                        data: data,
                        backgroundColor: '#3b82f6',
                    }]
                },
                options: {
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    // ▼▼▼ ここから変更 ▼▼▼
    elements.generateQrButton.onclick = () => {
        let deckUrl = '';
        // classMapを関数の最初に定義して、両方のモードで使えるようにします
        const classMap = { "エルフ": 1, "ロイヤル": 2, "ウィッチ": 3, "ドラゴン": 4, "ナイトメア": 5, "ビショップ": 6, "ネメシス": 7 };
        const classNumber = classMap[state.currentClass] || 0;

        if (state.currentMode === 'mode40') {
            if (state.cardsInDeckCount !== gameSettings.mode40.targetDeckSize) {
                addLog(`>> デッキが40枚ではありません。QRコードを生成できません。`);
                return;
            }

            const sortedIds = sortDeckForQrCode(state.deck);
            const hashes = sortedIds.map(id => convertIdToHash(parseInt(id, 10)));
            const hashString = hashes.join('.');
            deckUrl = `https://shadowverse-wb.com/web/Deck/share?hash=2.${classNumber}.${hashString}lang=ja`;

            elements.qrCodeDisplay.style.display = 'block';
            elements.qrCodeDisplay.innerHTML = '';
            if (qrcode) {
                qrcode.makeCode(deckUrl);
            } else {
                qrcode = new QRCode(elements.qrCodeDisplay, { text: deckUrl, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.L });
            }
            addLog(`>> QRコードを生成しました。`);

        } else if (state.currentMode === 'mode30') {
            if (state.cardsInDeckCount !== gameSettings.mode30.targetDeckSize) {
                addLog(`>> デッキが30枚ではありません。リンクを生成できません。`);
                return;
            }

            const deckIds = sortDeckForQrCode(state.deck);
            const mainHashes = deckIds.map(id => convertIdToHash(parseInt(id, 10))).join('.');
            const initialHashes = state.guaranteedCards.map(card => convertIdToHash(parseInt(card.id, 10))).join('.');

            // ▼▼▼ この行を修正しました ▼▼▼
            deckUrl = `https://shadowverse-wb.com/web/Deck/share?hash=6.${classNumber}.${mainHashes}|${initialHashes}&lang=ja`;

            elements.qrCodeDisplay.style.display = 'none';
            addLog(`>> デッキリンクを生成しました。`);
        }

        // 共通のログ出力処理
        const logP = document.createElement('p');
        const logA = document.createElement('a');
        logA.href = deckUrl;
        logA.textContent = deckUrl;
        logA.target = "_blank";
        logA.rel = "noopener noreferrer";
        logP.appendChild(logA);
        elements.log.prepend(logP);
    };

    elements.shareResultButton.onclick = () => {
        const deckUrl = generateDeckLink(); // デッキリンク生成部分を関数化
        const date = `${state.pickleDate.slice(0, 4)}/${state.pickleDate.slice(4, 6)}/${state.pickleDate.slice(6, 8)}`;
        const shareText = `#2Pickle ${date}\nクラス: ${state.currentClass}\n\n2Pickleをプレイ: https://hakkasoru.github.io/.github.io/\n${deckUrl}`;

        navigator.clipboard.writeText(shareText).then(() => {
            addLog(">> 結果をクリップボードにコピーしました！");
        }).catch(err => {
            addLog(">> クリップボードへのコピーに失敗しました。");
        });
    };

    function generateDeckLink() {
        let deckUrl = '';
        const classMap = { "エルフ": 1, "ロイヤル": 2, "ウィッチ": 3, "ドラゴン": 4, "ナイトメア": 5, "ビショップ": 6, "ネメシス": 7 };
        const classNumber = classMap[state.currentClass] || 0;
    
        if (state.currentMode === 'mode40') {
            if (state.cardsInDeckCount !== gameSettings.mode40.targetDeckSize) {
                addLog(`>> デッキが40枚ではありません。リンクを生成できません。`);
                return null; // 失敗時はnullを返す
            }
            const sortedIds = sortDeckForQrCode(state.deck);
            const hashes = sortedIds.map(id => convertIdToHash(parseInt(id, 10)));
            const hashString = hashes.join('.');
            deckUrl = `https://shadowverse-wb.com/web/Deck/share?hash=2.${classNumber}.${hashString}&lang=ja`;
    
        } else if (state.currentMode === 'mode30') {
            if (state.cardsInDeckCount !== gameSettings.mode30.targetDeckSize) {
                addLog(`>> デッキが30枚ではありません。リンクを生成できません。`);
                return null; // 失敗時はnullを返す
            }
            const deckIds = sortDeckForQrCode(state.deck);
            const mainHashes = deckIds.map(id => convertIdToHash(parseInt(id, 10))).join('.');
            const initialHashes = state.guaranteedCards.map(card => convertIdToHash(parseInt(card.id, 10))).join('.');
            deckUrl = `https://shadowverse-wb.com/web/Deck/share?hash=6.${classNumber}.${mainHashes}|${initialHashes}&lang=ja`;
        }
        return deckUrl;
    }

    elements.generateQrButton.onclick = () => {
        const deckUrl = generateDeckLink();
        if (!deckUrl) return; // URLが生成されなかった場合はここで処理を終了
    
        // モードに応じてQRコード表示を制御
        if (state.currentMode === 'mode40') {
            elements.qrCodeDisplay.style.display = 'block';
            elements.qrCodeDisplay.innerHTML = '';
            if (qrcode) {
                qrcode.makeCode(deckUrl);
            } else {
                qrcode = new QRCode(elements.qrCodeDisplay, { text: deckUrl, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.L });
            }
            addLog(`>> QRコードを生成しました。`);
        } else {
            elements.qrCodeDisplay.style.display = 'none';
            addLog(`>> デッキリンクを生成しました。`);
        }
    
        // 共通のログ出力処理
        const logP = document.createElement('p');
        const logA = document.createElement('a');
        logA.href = deckUrl;
        logA.textContent = deckUrl;
        logA.target = "_blank";
        logA.rel = "noopener noreferrer";
        logP.appendChild(logA);
        elements.log.prepend(logP);
    };
    
    elements.mode40Button.onclick = () => {
        state.currentMode = 'mode40';
        elements.currentModeDisplay.textContent = '40枚';
        elements.mode40Button.style.backgroundColor = '#2563eb';
        elements.mode30Button.style.backgroundColor = '#3b82f6';
        addLog(">> 40枚モードに切り替えました。");
    };

    elements.mode30Button.onclick = () => {
        state.currentMode = 'mode30';
        elements.currentModeDisplay.textContent = '30枚';
        elements.mode30Button.style.backgroundColor = '#2563eb';
        elements.mode40Button.style.backgroundColor = '#3b82f6';
        addLog(">> 30枚モードに切り替えました。");
    };

    elements.refreshClassesButton.onclick = () => {
        renderClassSelection();
        addLog(">> 提示カードを更新しました。");
    };

    elements.applySettingsButton.onclick = () => {
        const newNeutralRate = parseFloat(elements.neutralRateInput.value);
        const newWNew = parseFloat(elements.wnewInput.value);

        if (!isNaN(newNeutralRate) && newNeutralRate >= 0 && newNeutralRate <= 1) {
            gameSettings.userSettings.neutralCardRate = newNeutralRate;
        }
        if (!isNaN(newWNew) && newWNew >= 0 && newWNew <= 10) {
            gameSettings.userSettings.W_NEW = newWNew;
        }

        elements.currentNeutralRate.textContent = gameSettings.userSettings.neutralCardRate;
        elements.currentWnew.textContent = gameSettings.userSettings.W_NEW;

        renderClassSelection();
        addLog(">> 設定を反映し、提示カードを更新しました。");
    };

    initializeSimulator();

};





