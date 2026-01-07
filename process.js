const { MongoClient } = require("mongodb");
const { calculate, Generations, Pokemon, Move } = require("@smogon/calc");

const uri = "mongodb://localhost:27017";
const dbName = "pokemon_db";

// Vérifier l'efficacité d'un move sur le défenseur
async function checkTypeEffectiveness(moveType, defenderTypes) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    const typechart = db.collection("typechart");

    let multiplier = 1.0;
    for (const defenderType of defenderTypes) {
        const typeData = await typechart.findOne({ type: defenderType });
        if (typeData && typeData.effectiveness[moveType] !== undefined) {
            multiplier *= typeData.effectiveness[moveType];
        }
    }

    await client.close();
    return multiplier;
}

// Vérifier si un move est effectif (évite les erreurs avant l'exécution)
async function isMoveEffective(moveType, defenderTypes) {
    const effectiveness = await checkTypeEffectiveness(moveType, defenderTypes);
    return effectiveness > 0;
}

// Récupérer les sets des Pokémon
async function getBestSet(pokemonName, defenderTypes) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("pokemon");
    const movesCollection = db.collection("moves");

    const pokemonData = await collection.findOne({ name: { $regex: new RegExp(`^${pokemonName}$`, "i") } });

    if (!pokemonData) {
        console.error(`Aucun set trouvé pour ${pokemonName}`);
        await client.close();
        return null;
    }

    const bestSetIndex = Object.keys(pokemonData.usage.evSpreads)[0];
    const bestSet = pokemonData.usage.evSpreads[bestSetIndex];
    const bestItemIndex = Object.keys(pokemonData.usage.items)[0];
    const bestItem = pokemonData.usage.items[bestItemIndex]?.name || "None";

    let bestMoves = Object.values(pokemonData.usage.moves || {}).map(m => m.name).slice(0, 4);

    // Vérifier et filtrer les moves inefficaces
    const filteredMoves = [];
    for (const moveName of bestMoves) {
        const moveData = await movesCollection.findOne({ name: moveName });
        if (moveData && moveData.category !== "Status") {
            const moveEffective = await isMoveEffective(moveData.type, defenderTypes);
            if (moveEffective) {
                filteredMoves.push(moveName);
            }
        }
    }

    await client.close();
    return {
        name: pokemonData.name,
        item: bestItem,
        nature: bestSet.nature,
        evs: bestSet.ev,
        moves: filteredMoves.length > 0 ? filteredMoves : ["Aucun move utilisable"],
        types: pokemonData.types,
        ability: Object.values(pokemonData.abilities)[0] || "None",
        hp: bestSet.ev.hp || 100
    };
}

// Trouver automatiquement le meilleur move
async function findBestMove(attackerData, defenderData) {
    const gen = Generations.get(9);
    let bestMove = null;
    let bestMultiplier = 0;

    for (const moveName of attackerData.moves) {
        const move = new Move(gen, moveName);
        const effectiveness = await checkTypeEffectiveness(move.type, defenderData.types);

        if (effectiveness > bestMultiplier) {
            bestMultiplier = effectiveness;
            bestMove = move;
        }
    }

    return bestMove;
}

// Calcul des dégâts en mode CLI avec API
async function calculateDamage(attackerName, defenderName) {
    const gen = Generations.get(9);

    // Récupération des données
    const defenderData = await getBestSet(defenderName, []);
    if (!defenderData) return;
    const attackerData = await getBestSet(attackerName, defenderData.types);
    if (!attackerData) return;

    // Vérification des moves disponibles
    if (attackerData.moves.length === 0 || attackerData.moves[0] === "Aucun move utilisable") {
        console.error(`\n${attackerData.name} n'a aucun move efficace contre ${defenderData.name} !`);
        return;
    }

    // Sélection automatique du meilleur move
    const bestMove = await findBestMove(attackerData, defenderData);
    if (!bestMove) {
        console.error(`\nAucun move efficace trouvé pour ${attackerData.name} contre ${defenderData.name}.`);
        return;
    }

    // Création des objets Pokémon
    const attacker = new Pokemon(gen, attackerData.name, { item: attackerData.item, evs: attackerData.evs });
    const defender = new Pokemon(gen, defenderData.name, { item: defenderData.item, evs: defenderData.evs });

    // Calcul des dégâts
    const result = calculate(gen, attacker, defender, bestMove);

    console.log(`\nRésultats du calcul pour ${attackerData.name} vs ${defenderData.name}`);
    console.log(` Meilleur move : ${bestMove.name}`);
    console.log(` Dégâts possibles : ${result.range().join(" - ")} HP`);
    console.log(` Dégâts en pourcentage : ${result.range().map(dmg => (dmg / defenderData.hp * 100).toFixed(2) + "%").join(" - ")}`);
}

// **Exécution en mode CLI**
if (process.argv.length < 4) {
    console.error("Usage: node script.js <Attaquant> <Défenseur>");
    process.exit(1);
}

const attackerName = process.argv[2];
const defenderName = process.argv[3];

calculateDamage(attackerName, defenderName);
