// script.js

// ゲームのルールに関する設定をここにまとめる
const gameSettings = {
    // 40枚モードの設定
    mode40: {
        pickCount: 19,
        targetDeckSize: 40,
        rerollCounts: {
            "エルフ": 3,
            "ロイヤル": 3,
            "ウィッチ": 7, // 例としてウィッチだけ変更
            "ドラゴン": 3,
            "ナイトメア": 3,
            "ビショップ": 3,
            "ネメシス": 3
        }
    },
    // 30枚モードの設定
    mode30: {
        pickCount: 14,
        targetDeckSize: 30,
        rerollCounts: {
            "エルフ": 2,
            "ロイヤル": 2,
            "ウィッチ": 5, // 例としてウィッチだけ変更
            "ドラゴン": 2,
            "ナイトメア": 2,
            "ビショップ": 2,
            "ネメシス": 2
        }
    }
};

window.onload = function () {
    // cardData と neutralCards は card-data.js に分離されている前提

    // 全クラスのカードにニュートラルカードを追加（初回のみ実行）
    for (const className in cardData) {
        cardData[className].cards = [...cardData[className].classCards, ...neutralCards];
    }

    const state = {
        currentMode: 'mode40', // ★ 追加: 現在のモードを管理
        currentClass: null,
        deck: {},
        pickCount: 0,
        rerollCount: 0,
        cardsInDeckCount: 0,
        pickProbability: []
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
        // ★ 追加: 新しいUI要素
        mode40Button: document.getElementById('mode-40-button'),
        mode30Button: document.getElementById('mode-30-button'),
        currentModeDisplay: document.getElementById('current-mode-display'),
        refreshClassesButton: document.getElementById('refresh-classes-button'),
        modeSelection: document.getElementById('mode-selection'),
        qrCodeContainer: document.getElementById('qrcode-container'),
        generateQrButton: document.getElementById('generate-qr-button'),
        qrCodeDisplay: document.getElementById('qrcode-display')
    };

    let qrcode = null;
    let manaCurveChart = null;

    // --- ここから関数の定義 ---

    function selectClass(className, guaranteedCards) {
        state.currentClass = className;
        state.cardsInDeckCount = 0;
        state.deck = {};

        // ★ 修正点: 選択されたクラスに基づいて確率テーブルを生成
        generatePickProbabilityTable(className);
        
        console.log(`--- ${className} のピック確率テーブル ---`);
        console.table(state.pickProbability);

        const currentModeSettings = gameSettings[state.currentMode];
        state.rerollCount = currentModeSettings.rerollCounts[className];
        elements.rerollCount.textContent = state.rerollCount;
                
        elements.modeSelection.style.display = 'none';

        addCardToDeck(guaranteedCards[0]);
        addCardToDeck(guaranteedCards[1]);
                
        elements.classSelection.style.display = 'none';
        elements.pickPhase.style.display = 'block';
                
        state.pickCount = 0;
        elements.pickCountDisplay.textContent = `${state.pickCount}/${currentModeSettings.pickCount}`;
                
        pickNext();
    }

    // ★ 修正: モード切替に対応
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
        // ★ 修正点: stateに保存された確率テーブルを参照
        const pickInfo = state.pickProbability[pickIndex];
                
        const choices = [];
        const allCardsForPick = [];
        for (let i = 0; i < 4; i++) {
            let selectedCard = null;
            let attempts = 0;
            while (!selectedCard && attempts < 50) {
                const group = weightedRandom(pickInfo.groups);
                const potentialCard = getRandomCard(pickInfo.rarity, group, allCardsForPick);
                if (potentialCard) selectedCard = potentialCard;
                attempts++;
            }
            if (!selectedCard) {
                attempts = 0;
                while (!selectedCard && attempts < 50) {
                    const group = weightedRandom(pickInfo.groups);
                    const potentialCard = getRandomCard(pickInfo.rarity, group);
                    if (potentialCard) selectedCard = potentialCard;
                    attempts++;
                }
            }
            if (selectedCard) {
                allCardsForPick.push(selectedCard);
            } else {
                allCardsForPick.push(null);
            }
         }
        choices.push([allCardsForPick[0], allCardsForPick[1]]);
        choices.push([allCardsForPick[2], allCardsForPick[3]]);
        return choices;
    }

    // ★ 修正: 3枚制限を実装済みのものを採用
    function getRandomCard(rarity, group, excludeCards = []) {
        const cardPool = cardData[state.currentClass].cards.filter(c => {
            if (state.currentMode === 'mode40' && state.deck[c.name] && state.deck[c.name].count >= 3) {
                return false;
            }
            let rarityMatch = false;
            if (rarity === "ゴールド/レジェンド") {
                rarityMatch = c.rarity === "ゴールド" || c.rarity === "レジェンド";
            } else {
                rarityMatch = c.rarity === rarity;
            }
            const groupMatch = c.group === group;
            const exclusionMatch = !excludeCards.some(ec => ec && ec.name === c.name);
            const isClassCard = cardData[state.currentClass].classCards.some(cc => cc.name === c.name);
            const isNeutralCard = neutralCards.some(nc => nc.name === c.name);
            return rarityMatch && groupMatch && exclusionMatch && (isClassCard || isNeutralCard);
        });
        if (cardPool.length === 0) return null;
        return cardPool[Math.floor(Math.random() * cardPool.length)];
    }

    // --- ここから下の関数は、ほぼ変更なし、または以前の修正を統合 ---


    /**
    * 指定されたクラスとレアリティのカードをグループ毎に枚数を数える
    */
    function getCardCountsByGroup(className, rarity) {
        const counts = { normal: 0, new: 0, normal_n: 0, new_n: 0 };
        const isGoldLegend = rarity === "ゴールド/レジェンド";

        // クラスカードを数える
        cardData[className].classCards.forEach(card => {
            const rarityMatch = isGoldLegend ? (card.rarity === "ゴールド" || card.rarity === "レジェンド") : (card.rarity === rarity);
            if (rarityMatch) {
                if (card.group === 'new') counts.new++;
                if (card.group === 'normal') counts.normal++;
            }
        });

        // ニュートラルカードを数える
        neutralCards.forEach(card => {
            const rarityMatch = isGoldLegend ? (card.rarity === "ゴールド" || card.rarity === "レジェンド") : (card.rarity === rarity);
            if (rarityMatch) {
                if (card.group === 'new-n') counts.new_n++;
                if (card.group === 'normal-n') counts.normal_n++;
            }
        });
        return counts;
    }

    /**
     * カード枚数とルールに基づき、提示確率のオブジェクトを計算する
     */
    function calculateProbabilities(counts, targetNeutralRate = 0.15) {
        const probs = { normal: 0, new: 0, "normal-n": 0, "new-n": 0 };
                
        const W_NEW = 1.2; // "new"カードの重み

        // クラスカードの合計重みを計算
        const totalClassWeight = counts.normal + (counts.new * W_NEW);
        // ニュートラルカードの合計重みを計算
        const totalNeutralWeight = counts.normal_n + (counts.new_n * W_NEW);

        const targetClassRate = 1 - targetNeutralRate;

        // 各グループの確率を計算
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

    /**
     * 19回分のピック確率テーブルを生成し、stateに保存する
     */
    function generatePickProbabilityTable(className) {
        const originalPickRarities = [
            "ブロンズ", "シルバー", "ブロンズ", "シルバー", "ブロンズ", "ゴールド", "ブロンズ", 
            "シルバー", "ブロンズ", "シルバー", "ブロンズ", "シルバー", "ブロンズ",
            "ゴールド/レジェンド", "ブロンズ", "シルバー", "ブロンズ", "ゴールド", "ゴールド/レジェンド"
        ];

        state.pickProbability = originalPickRarities.map(rarity => {
            const counts = getCardCountsByGroup(className, rarity);
            const groups = calculateProbabilities(counts);
            return { rarity, groups };
        });
    }

    function initializeSimulator() {
        renderClassSelection();
        updateDeckCardCountDisplay();
        elements.mode40Button.style.backgroundColor = '#2563eb'; // 初期選択モードを強調
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
        for (const className in cardData) {
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
                if (card) {
                    cardDiv.innerHTML = `<p class="card-name">${card.name}</p>`;
                } else {
                    cardDiv.innerHTML = `<p class="card-name">カードなし</p>`;
                }
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

    elements.rerollButton.onclick = () => {
        if (state.rerollCount > 0) {
            state.rerollCount--;
            elements.rerollCount.textContent = state.rerollCount;
            addLog(`>> 再抽選を実行しました。残り${state.rerollCount}回。`);
            const rerollChoices = [];
            const allCards = cardData[state.currentClass].cards;
            for (let i = 0; i < 2; i++) {
                const card1 = allCards[Math.floor(Math.random() * allCards.length)];
                let card2 = null;
                let attempts = 0;
                do {
                    card2 = allCards[Math.floor(Math.random() * allCards.length)];
                    attempts++;
                } while (card1 && card2 && card1.name === card2.name && attempts < 10);
                rerollChoices.push([card1, card2]);
            }
            renderChoices(rerollChoices);
        } else {
            addLog(`>> 再抽選回数がありません。`);
        }
    };

    function updateDeckDisplay() {
        elements.currentDeck.innerHTML = '';

        const deckAsArray = Object.values(state.deck);

        deckAsArray.sort((a, b) => {
            if (a.cost !== b.cost) return a.cost - b.cost;
            const parseId = (id) => {
                if (!id || id.length !== 8) return { classId: 9, typeId: 9, packId: 999, rarityId: 9, number: 99 };
                return {
                    packId: parseInt(id.substring(0, 3)), classId: parseInt(id.substring(3, 4)),
                    rarityId: parseInt(id.substring(4, 5)), typeId: parseInt(id.substring(5, 6)),
                    number: parseInt(id.substring(6, 8))
                };
            };
            const idA = parseId(a.id); const idB = parseId(b.id);
            if (idA.classId !== idB.classId) return idA.classId - idB.classId;
            if (idA.typeId !== idB.typeId) return idA.typeId - idB.typeId;
            if (idA.packId !== idB.packId) return idA.packId - idB.packId;
            if (idA.rarityId !== idB.rarityId) return idA.rarityId - idB.rarityId;
            return idA.number - idB.number;
        });

        deckAsArray.forEach(card => {
            const li = document.createElement('li');
            li.classList.add('deck-list-item');

            const rarityClass = {
                "ブロンズ": "rarity-bronze",
                "シルバー": "rarity-silver",
                "ゴールド": "rarity-gold",
                "レジェンド": "rarity-legend"
            }[card.rarity] || "";

            li.innerHTML = `
            <div>
                <span class="deck-list-cost">${card.cost}</span>
                <span class="${rarityClass}">${card.name}</span>
            </div>
            <span>x${card.count}</span>
        `;
            elements.currentDeck.appendChild(li);
        });

        updateDeckCardCountDisplay();
        renderManaCurveChart(); // マナカーブも更新
    }

    function updateDeckCardCountDisplay() {
        elements.deckCardCount.textContent = state.cardsInDeckCount;
    }
    function endSimulation() {
        elements.pickPhase.style.display = 'none';
        elements.statusMessage.textContent = "デッキが完成しました！";
        addLog(">> デッキ完成！");
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
            if (randomNum <= 0) {
                return group;
            }
        }
        return Object.keys(weights)[0];
    }

    function convertIdToHash(id) {
        const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
        if (id === 0) {
            return ALPHABET[0].repeat(4);
        }

        let num = id;
        let hash = '';

        while (num > 0) {
            const remainder = num % 64;
            hash = ALPHABET[remainder] + hash;
            num = Math.floor(num / 64);
        }

        // 4文字になるように先頭を0で埋める
        while (hash.length < 4) {
            hash = ALPHABET[0] + hash;
        }

        return hash;
    }

    function sortDeckForQrCode(deck) {
        const sortedCards = [];

        // デッキオブジェクトをカードオブジェクトの配列に変換
        for (const cardName in deck) {
            const cardInfo = deck[cardName];
            for (let i = 0; i < cardInfo.count; i++) {
                sortedCards.push(cardInfo);
            }
        }

        // カードをルールに従ってソート
        sortedCards.sort((a, b) => {
            // 1. コストで比較
            if (a.cost !== b.cost) {
                return a.cost - b.cost;
            }

            // IDから各種情報をパース
            const parseId = (id) => {
                if (!id || id.length !== 8) return { classId: 9, typeId: 9, packId: 999, rarityId: 9, number: 99 };
                return {
                    packId: parseInt(id.substring(0, 3)),
                    classId: parseInt(id.substring(3, 4)),
                    rarityId: parseInt(id.substring(4, 5)),
                    typeId: parseInt(id.substring(5, 6)),
                    number: parseInt(id.substring(6, 8))
                };
            };

            const idA = parseId(a.id);
            const idB = parseId(b.id);

            // 2. クラスで比較 (ニュートラル:0, エルフ:1, ...)
            if (idA.classId !== idB.classId) {
                return idA.classId - idB.classId;
            }

            // 3. カードの種類で比較 (フォロワー:1, アミュレット:2, スペル:3)
            if (idA.typeId !== idB.typeId) {
                return idA.typeId - idB.typeId;
            }

            // 4. カードパックで比較
            if (idA.packId !== idB.packId) {
                return idA.packId - idB.packId;
            }

            // 5. レアリティで比較
            if (idA.rarityId !== idB.rarityId) {
                return idA.rarityId - idB.rarityId;
            }

            // 6. カード番号で比較
            return idA.number - idB.number;
        });

        // ソートされたカードのID配列を返す
        return sortedCards.map(card => card.id);
    }

    function renderManaCurveChart() {
        const manaCounts = {};
        for (let i = 0; i <= 10; i++) {
            manaCounts[i] = 0;
        }

        for (const cardName in state.deck) {
            const card = state.deck[cardName];
            if (card.cost >= 10) {
                manaCounts[10] += card.count;
            } else {
                manaCounts[card.cost] = (manaCounts[card.cost] || 0) + card.count;
            }
        }

        const ctx = document.getElementById('mana-curve-chart').getContext('2d');
        const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
        const data = Object.values(manaCounts).slice(1);

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
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    elements.generateQrButton.onclick = () => {
        // ★★★ ここからが追加・修正箇所 ★★★
        // 最初に、30枚モードではないかチェック
        if (state.currentMode === 'mode30') {
            addLog(">> 30枚モードではQRコードを生成できません。");
            return; // 30枚モードの場合は、ここで処理を終了
        }
        // ★★★ ここまで ★★★

        // --- 以下は40枚モードの時だけ実行される ---
        const currentModeSettings = gameSettings[state.currentMode];
        if (state.cardsInDeckCount !== currentModeSettings.targetDeckSize) {
            addLog(`>> デッキが${currentModeSettings.targetDeckSize}枚ではありません。QRコードを生成できません。`);
            return;
        }

        const sortedIds = sortDeckForQrCode(state.deck);
        const hashes = sortedIds.map(id => convertIdToHash(parseInt(id, 10)));
        const hashString = hashes.join('.');
        const classMap = { "エルフ": 1, "ロイヤル": 2, "ウィッチ": 3, "ドラゴン": 4, "ナイトメア": 5, "ビショップ": 6, "ネメシス": 7 };
        const classNumber = classMap[state.currentClass] || 0;
        const deckUrl = `https://shadowverse-wb.com/ja/deck/detail/?hash=2.${classNumber}.${hashString}`;
        elements.qrCodeDisplay.style.display = 'block';
        elements.qrCodeDisplay.innerHTML = '';
        if (qrcode) {
            qrcode.makeCode(deckUrl);
        } else {
            qrcode = new QRCode(elements.qrCodeDisplay, { text: deckUrl, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.L });
        }
        addLog(`>> QRコードを生成しました。`);
        const logP = document.createElement('p');
        const logA = document.createElement('a');
        logA.href = deckUrl;
        logA.textContent = deckUrl;
        logA.target = "_blank";
        logA.rel = "noopener noreferrer";
        logP.appendChild(logA);
        elements.log.prepend(logP);
    };

    // ★★★ ここから、新機能のイベントハンドラ ★★★

    // モード切替ボタンの処理
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

    // 提示カード更新ボタンの処理
    elements.refreshClassesButton.onclick = () => {
        renderClassSelection();
        addLog(">> 提示カードを更新しました。");
    };

    // --- 初期化処理 ---
    initializeSimulator();
};




