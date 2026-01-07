const { MongoClient } = require("mongodb");
const { calculate, Generations, Pokemon, Move } = require("@smogon/calc");
const readline = require("readline");

const uri = "mongodb://localhost:27017";
const dbName = "pokemon_db";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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

// Vérifier si un move est effectif (pas immunisé)
async function isMoveEffective(moveType, defenderTypes) {
  const effectiveness = await checkTypeEffectiveness(moveType, defenderTypes);
  return effectiveness > 0;
}

// Récupérer les sets des Pokémon avec filtrage des moves inefficaces
async function getBestSet(pokemonName, defenderTypes) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection("pokemon");
  const movesCollection = db.collection("moves");

  const pokemonData = await collection.findOne({
    name: { $regex: new RegExp(`^${pokemonName}$`, "i") }
  });

  if (!pokemonData) {
    console.log(`Aucun set trouvé pour ${pokemonName}`);
    return null;
  }

  const bestSetIndex = Object.keys(pokemonData.usage.evSpreads)[0];
  const bestSet = pokemonData.usage.evSpreads[bestSetIndex];

  const bestItemIndex = Object.keys(pokemonData.usage.items)[0];
  const bestItem = pokemonData.usage.items[bestItemIndex]?.name || "None";

  let bestMoves = Object.values(pokemonData.usage.moves || {})
    .map(m => m.name)
    .slice(0, 4);

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

// Trouver le meilleur move automatiquement
async function findBestMove(attackerData, defenderData) {
  const gen = Generations.get(9);
  let bestMove = null;
  let bestMultiplier = 0;
  let bestMoveName = "";

  for (const moveName of attackerData.moves) {
    const move = new Move(gen, moveName);
    const effectiveness = await checkTypeEffectiveness(move.type, defenderData.types);

    if (effectiveness > bestMultiplier) {
      bestMultiplier = effectiveness;
      bestMove = move;
      bestMoveName = moveName;
    }
  }

  return bestMove ? { move: bestMove, name: bestMoveName, multiplier: bestMultiplier } : null;
}

// Calcul des dégâts avec gestion des immunités et sélection automatique
async function calculateDamage(attackerName, defenderName) {
  const gen = Generations.get(9);

  // Récupération des données
  const defenderData = await getBestSet(defenderName, []);
  if (!defenderData) {
    console.log("Impossible de récupérer les sets du défenseur.");
    return;
  }
  const attackerData = await getBestSet(attackerName, defenderData.types);
  if (!attackerData) {
    console.log("Impossible de récupérer les sets de l'attaquant.");
    return;
  }

  console.log("\n=== Pokémon sélectionnés ===");
  console.log(`Attaquant : ${attackerData.name} (${attackerData.ability})`);
  console.log(`Défenseur : ${defenderData.name} (${defenderData.ability})`);

  // Vérification des moves disponibles
  if (attackerData.moves.length === 0 || attackerData.moves[0] === "Aucun move utilisable") {
    console.log(`\n${attackerData.name} n'a aucun move efficace contre ${defenderData.name} !`);
    rl.close();
    return;
  }

  const bestMoveData = await findBestMove(attackerData, defenderData);

  console.log("\nSélectionne un move :");
  attackerData.moves.forEach((move, index) => {
    console.log(`   ${index + 1}. ${move}`);
  });
  console.log("   0. Choisir automatiquement le meilleur move");

  rl.question("\nEntre le numéro du move à utiliser : ", async (answer) => {
    let move;
    if (answer === "0" && bestMoveData) {
      console.log(`\nLe meilleur move est ${bestMoveData.name} !`);
      move = bestMoveData.move;
    } else {
      const moveIndex = parseInt(answer) - 1;
      if (moveIndex < 0 || moveIndex >= attackerData.moves.length) {
        console.log("Sélection invalide.");
        rl.close();
        return;
      }
      move = new Move(gen, attackerData.moves[moveIndex]);
    }

    // Création des objets Pokémon
    const attacker = new Pokemon(gen, attackerData.name, { item: attackerData.item, evs: attackerData.evs });
    const defender = new Pokemon(gen, defenderData.name, { item: defenderData.item, evs: defenderData.evs });

    // Calcul des dégâts
    const result = calculate(gen, attacker, defender, move);

    console.log("\n=== Résultat du combat ===");
    console.log(`${attackerData.name} utilise ${move.name} !`);
    console.log(`Dégâts possibles : ${result.range().join(" - ")} HP`);
    console.log(`Dégâts en pourcentage : ${result.range().map(dmg => (dmg / defenderData.hp * 100).toFixed(2) + "%").join(" - ")}`);
    console.log(`Description : ${result.desc()}`);

    rl.close();
  });
}

// 🚀 **Test**
calculateDamage("Gengar", "Chansey");
