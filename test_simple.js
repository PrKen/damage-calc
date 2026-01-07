/**
 * Test simple de @smogon/calc sans CLI interactif
 * Vérifie que le package fonctionne correctement
 */

const { calculate, Generations, Pokemon, Move, Field } = require("@smogon/calc");

console.log("=== TEST @smogon/calc ===\n");

// Obtenir la génération 9
const gen = Generations.get(9);
console.log("✅ Génération 9 chargée");

// Test 1: Calcul basique
console.log("\n--- Test 1: Calcul basique ---");
try {
    const attacker = new Pokemon(gen, "Great Tusk", {
        nature: "Jolly",
        evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
        item: "Booster Energy"
    });
    
    const defender = new Pokemon(gen, "Kingambit", {
        nature: "Adamant",
        evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
        item: "Leftovers"
    });
    
    const move = new Move(gen, "Close Combat");
    
    const result = calculate(gen, attacker, defender, move);
    
    console.log(`${attacker.name} vs ${defender.name}`);
    console.log(`Move: ${move.name}`);
    console.log(`Damage range: ${result.range()[0]} - ${result.range()[1]}`);
    console.log(`Damage %: ${result.damage}`);
    console.log(`Description: ${result.desc()}`);
    console.log("✅ Test 1 réussi!");
} catch (error) {
    console.log("❌ Test 1 échoué:", error.message);
}

// Test 2: Avec Field (conditions de terrain)
console.log("\n--- Test 2: Avec Field ---");
try {
    const attacker = new Pokemon(gen, "Raging Bolt", {
        nature: "Modest",
        evs: { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 },
        item: "Leftovers"
    });
    
    const defender = new Pokemon(gen, "Great Tusk", {
        nature: "Jolly",
        evs: { hp: 252, atk: 4, def: 0, spa: 0, spd: 0, spe: 252 },
        item: "Heavy-Duty Boots"
    });
    
    const move = new Move(gen, "Thunderbolt");
    
    // Avec Electric Terrain
    const field = new Field({ terrain: "Electric" });
    
    const result = calculate(gen, attacker, defender, move, field);
    
    console.log(`${attacker.name} vs ${defender.name} (Electric Terrain)`);
    console.log(`Move: ${move.name}`);
    console.log(`Damage range: ${result.range()[0]} - ${result.range()[1]}`);
    console.log(`Description: ${result.desc()}`);
    console.log("✅ Test 2 réussi!");
} catch (error) {
    console.log("❌ Test 2 échoué:", error.message);
}

// Test 3: Récupérer tous les rolls de dégâts
console.log("\n--- Test 3: Tous les rolls ---");
try {
    const attacker = new Pokemon(gen, "Dragapult", {
        nature: "Timid",
        evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
        item: "Choice Specs"
    });
    
    const defender = new Pokemon(gen, "Dragonite", {
        nature: "Adamant",
        evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
        item: "Heavy-Duty Boots",
        ability: "Multiscale"  // Important pour le calcul!
    });
    
    const move = new Move(gen, "Draco Meteor");
    
    const result = calculate(gen, attacker, defender, move);
    
    console.log(`${attacker.name} vs ${defender.name} (Multiscale)`);
    console.log(`Move: ${move.name}`);
    
    // Récupérer les infos détaillées
    const damageRolls = result.damage;
    console.log(`Rolls: ${Array.isArray(damageRolls) ? damageRolls.join(", ") : damageRolls}`);
    console.log(`Min damage: ${result.range()[0]}`);
    console.log(`Max damage: ${result.range()[1]}`);
    console.log(`Defender HP: ${defender.maxHP()}`);
    console.log(`KO chance: ${result.kpiDesc || "N/A"}`);
    console.log("✅ Test 3 réussi!");
} catch (error) {
    console.log("❌ Test 3 échoué:", error.message);
}

// Test 4: Immunité (Ground vs Flying)
console.log("\n--- Test 4: Immunité ---");
try {
    const attacker = new Pokemon(gen, "Great Tusk");
    const defender = new Pokemon(gen, "Dragonite");  // Flying type
    const move = new Move(gen, "Earthquake");
    
    const result = calculate(gen, attacker, defender, move);
    
    console.log(`${attacker.name} vs ${defender.name}`);
    console.log(`Move: ${move.name} (Ground vs Flying)`);
    console.log(`Damage: ${result.range()[0]} - ${result.range()[1]}`);
    console.log(`Immunité détectée: ${result.range()[0] === 0 ? "Oui ✅" : "Non"}`);
    console.log("✅ Test 4 réussi!");
} catch (error) {
    console.log("❌ Test 4 échoué:", error.message);
}

console.log("\n=== TOUS LES TESTS TERMINÉS ===");
