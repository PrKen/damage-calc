/**
 * Test du DamageService - Script non-interactif
 */

const { DamageService } = require("./DamageService");

async function runTests() {
    console.log("=== TEST DAMAGE SERVICE ===\n");
    
    const service = new DamageService();
    
    try {
        // Connexion
        console.log("📡 Connexion à MongoDB...");
        await service.connect();
        console.log("✅ Connecté!\n");

        // Test 1: Charger un Pokémon
        console.log("--- Test 1: Charger un Pokémon ---");
        const greatTusk = await service.getPokemonData("Great Tusk");
        console.log(`Nom: ${greatTusk.name}`);
        console.log(`Types: ${greatTusk.types.join(", ")}`);
        console.log(`Usage: ${greatTusk.usage.percent}%`);
        console.log("✅ Test 1 réussi!\n");

        // Test 2: Créer un Pokemon pour le calc
        console.log("--- Test 2: Créer un Pokemon ---");
        const pokemon = await service.createPokemon("Great Tusk");
        console.log(`Pokemon créé: ${pokemon.name}`);
        console.log(`Stats: HP=${pokemon.maxHP()}, ATK=${pokemon.stats.atk}, SPE=${pokemon.stats.spe}`);
        console.log("✅ Test 2 réussi!\n");

        // Test 3: Récupérer les moves
        console.log("--- Test 3: Moves utilisables ---");
        const moves = await service.getUsableMoves("Great Tusk");
        console.log(`Moves offensifs: ${moves.map(m => m.name).join(", ")}`);
        console.log("✅ Test 3 réussi!\n");

        // Test 4: Calcul de dégâts simple
        console.log("--- Test 4: Calcul de dégâts ---");
        const dmgResult = await service.calculateDamage({
            attacker: "Great Tusk",
            defender: "Kingambit",
            moveName: "Close Combat"
        });
        console.log(`${dmgResult.attacker} → ${dmgResult.defender}`);
        console.log(`Move: ${dmgResult.move}`);
        console.log(`Dégâts: ${dmgResult.damage.min} - ${dmgResult.damage.max} (${dmgResult.percent.min}% - ${dmgResult.percent.max}%)`);
        console.log(`OHKO: ${dmgResult.isOHKO ? "Oui" : "Non"}`);
        console.log("✅ Test 4 réussi!\n");

        // Test 5: Trouver le meilleur move
        console.log("--- Test 5: Meilleur move ---");
        const bestMove = await service.findBestMove("Dragapult", "Dragonite");
        console.log(`Dragapult vs Dragonite`);
        console.log(`Meilleur move: ${bestMove.move?.name || "Aucun"}`);
        if (bestMove.result) {
            console.log(`Dégâts: ${bestMove.result.percent.min}% - ${bestMove.result.percent.max}%`);
        }
        console.log("✅ Test 5 réussi!\n");

        // Test 6: Simulation 1v1
        console.log("--- Test 6: Simulation 1v1 ---");
        const battle = await service.simulate1v1("Great Tusk", "Kingambit");
        console.log(`${battle.pokemon1.name} vs ${battle.pokemon2.name}`);
        console.log(`Premier attaquant: ${battle.firstAttacker}`);
        console.log(`${battle.pokemon1.name}: ${battle.pokemon1.bestMove} (${battle.pokemon1.damagePercent.max}%)`);
        console.log(`${battle.pokemon2.name}: ${battle.pokemon2.bestMove} (${battle.pokemon2.damagePercent.max}%)`);
        console.log(`🏆 Gagnant: ${battle.winner}`);
        console.log(`Raison: ${battle.reason}`);
        console.log("✅ Test 6 réussi!\n");

        // Test 7: Plusieurs matchups
        console.log("--- Test 7: Matchups multiples ---");
        const matchups = [
            ["Great Tusk", "Gholdengo"],
            ["Kingambit", "Great Tusk"],
            ["Dragapult", "Kyurem"],
            ["Raging Bolt", "Gliscor"]
        ];

        for (const [p1, p2] of matchups) {
            const result = await service.simulate1v1(p1, p2);
            console.log(`${p1} vs ${p2} → 🏆 ${result.winner}`);
        }
        console.log("✅ Test 7 réussi!\n");

        // Afficher stats du cache
        console.log("--- Stats du cache ---");
        const stats = service.getCacheStats();
        console.log(`Pokemon en cache: ${stats.pokemon}`);
        console.log(`Moves en cache: ${stats.moves}`);
        console.log(`Types en cache: ${stats.typechart}`);

    } catch (error) {
        console.error("❌ Erreur:", error.message);
        console.error(error.stack);
    } finally {
        await service.disconnect();
        console.log("\n📡 Déconnecté de MongoDB");
        console.log("\n=== TESTS TERMINÉS ===");
    }
}

runTests();
