/**
 * API Server pour le DamageService
 * 
 * Serveur Express optimisé pour un usage intensif :
 * - Cache LRU pour les résultats de calculs
 * - Connexion MongoDB persistante
 * - Endpoints batch pour calculs multiples
 * - Compression des réponses
 * 
 * @author Pokemon Battle ML Project
 * @version 2.0.0
 */

const express = require("express");
const compression = require("compression");
const { DamageService } = require("./DamageService");

// Configuration
const PORT = process.env.PORT || 3000;
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE) || 10000;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS) || 3600000; // 1 heure

// ============================================================================
// CACHE LRU SIMPLE
// ============================================================================

class LRUCache {
    constructor(maxSize = 1000, ttlMs = 3600000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0 };
    }

    generateKey(obj) {
        return JSON.stringify(obj);
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return undefined;
        }

        // Vérifier TTL
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return undefined;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);
        this.stats.hits++;
        return item.value;
    }

    set(key, value) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttlMs
        });
    }

    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0 };
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + "%" : "0%"
        };
    }
}

// ============================================================================
// INITIALISATION
// ============================================================================

const app = express();
const service = new DamageService();
const resultsCache = new LRUCache(CACHE_MAX_SIZE, CACHE_TTL_MS);

// Middleware
app.use(compression()); // Compression gzip
app.use(express.json({ limit: "10mb" })); // Pour les gros batch

// Logger simple
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (duration > 100) { // Log only slow requests
            console.log(`[${req.method}] ${req.path} - ${duration}ms`);
        }
    });
    next();
});

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /health - Health check
 */
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        connected: service.connected,
        cache: resultsCache.getStats(),
        serviceCache: service.getCacheStats()
    });
});

/**
 * GET /stats - Statistiques détaillées
 */
app.get("/stats", (req, res) => {
    res.json({
        resultsCache: resultsCache.getStats(),
        serviceCache: service.getCacheStats(),
        uptime: process.uptime()
    });
});

/**
 * POST /clear-cache - Vider les caches
 */
app.post("/clear-cache", (req, res) => {
    resultsCache.clear();
    service.clearCache();
    res.json({ message: "Caches cleared" });
});

/**
 * GET /pokemon/:name - Récupérer les données d'un Pokémon
 */
app.get("/pokemon/:name", async (req, res) => {
    try {
        const data = await service.getPokemonData(req.params.name);
        if (!data) {
            return res.status(404).json({ error: "Pokemon not found" });
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /pokemon/:name/moves - Récupérer les moves d'un Pokémon
 */
app.get("/pokemon/:name/moves", async (req, res) => {
    try {
        const includeStatus = req.query.includeStatus === "true";
        const moves = await service.getUsableMoves(req.params.name, { includeStatus });
        res.json(moves);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /calculate - Calculer les dégâts d'une attaque
 * Body: { attacker, defender, moveName, attackerOptions?, defenderOptions?, field? }
 */
app.post("/calculate", async (req, res) => {
    try {
        const { attacker, defender, moveName, attackerOptions, defenderOptions, field } = req.body;

        if (!attacker || !defender || !moveName) {
            return res.status(400).json({ 
                error: "Missing required fields: attacker, defender, moveName" 
            });
        }

        // Check cache
        const cacheKey = resultsCache.generateKey({ 
            type: "calculate", attacker, defender, moveName, 
            attackerOptions, defenderOptions, field 
        });
        
        let result = resultsCache.get(cacheKey);
        if (!result) {
            result = await service.calculateDamage({
                attacker, defender, moveName,
                attackerOptions, defenderOptions, field
            });
            // Remove rawResult before caching (too large)
            delete result.rawResult;
            resultsCache.set(cacheKey, result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /best-move - Trouver le meilleur move
 * Body: { attacker, defender, options? }
 */
app.post("/best-move", async (req, res) => {
    try {
        const { attacker, defender, options } = req.body;

        if (!attacker || !defender) {
            return res.status(400).json({ 
                error: "Missing required fields: attacker, defender" 
            });
        }

        // Check cache
        const cacheKey = resultsCache.generateKey({ 
            type: "bestMove", attacker, defender, options 
        });
        
        let result = resultsCache.get(cacheKey);
        if (!result) {
            result = await service.findBestMove(attacker, defender, options || {});
            if (result.result) delete result.result.rawResult;
            resultsCache.set(cacheKey, result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /simulate-1v1 - Simuler un combat 1v1
 * Body: { pokemon1, pokemon2, options? }
 */
app.post("/simulate-1v1", async (req, res) => {
    try {
        const { pokemon1, pokemon2, options } = req.body;

        if (!pokemon1 || !pokemon2) {
            return res.status(400).json({ 
                error: "Missing required fields: pokemon1, pokemon2" 
            });
        }

        // Check cache
        const cacheKey = resultsCache.generateKey({ 
            type: "simulate1v1", pokemon1, pokemon2, options 
        });
        
        let result = resultsCache.get(cacheKey);
        if (!result) {
            result = await service.simulate1v1(pokemon1, pokemon2, options || {});
            resultsCache.set(cacheKey, result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /batch/simulate-1v1 - Batch de simulations 1v1
 * Body: { matchups: [{ pokemon1, pokemon2, options? }, ...] }
 */
app.post("/batch/simulate-1v1", async (req, res) => {
    try {
        const { matchups } = req.body;

        if (!Array.isArray(matchups)) {
            return res.status(400).json({ 
                error: "matchups must be an array" 
            });
        }

        const results = [];
        const startTime = Date.now();

        for (const matchup of matchups) {
            const { pokemon1, pokemon2, options } = matchup;
            
            if (!pokemon1 || !pokemon2) {
                results.push({ error: "Missing pokemon1 or pokemon2", matchup });
                continue;
            }

            // Check cache
            const cacheKey = resultsCache.generateKey({ 
                type: "simulate1v1", pokemon1, pokemon2, options 
            });
            
            let result = resultsCache.get(cacheKey);
            if (!result) {
                try {
                    result = await service.simulate1v1(pokemon1, pokemon2, options || {});
                    resultsCache.set(cacheKey, result);
                } catch (error) {
                    result = { error: error.message, pokemon1, pokemon2 };
                }
            }

            results.push(result);
        }

        const duration = Date.now() - startTime;

        res.json({
            count: results.length,
            duration: `${duration}ms`,
            avgTime: `${(duration / results.length).toFixed(2)}ms`,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /batch/calculate - Batch de calculs de dégâts
 * Body: { calculations: [{ attacker, defender, moveName, ... }, ...] }
 */
app.post("/batch/calculate", async (req, res) => {
    try {
        const { calculations } = req.body;

        if (!Array.isArray(calculations)) {
            return res.status(400).json({ 
                error: "calculations must be an array" 
            });
        }

        const results = [];
        const startTime = Date.now();

        for (const calc of calculations) {
            const { attacker, defender, moveName, attackerOptions, defenderOptions, field } = calc;
            
            if (!attacker || !defender || !moveName) {
                results.push({ error: "Missing required fields", calc });
                continue;
            }

            // Check cache
            const cacheKey = resultsCache.generateKey({ 
                type: "calculate", attacker, defender, moveName, 
                attackerOptions, defenderOptions, field 
            });
            
            let result = resultsCache.get(cacheKey);
            if (!result) {
                try {
                    result = await service.calculateDamage({
                        attacker, defender, moveName,
                        attackerOptions, defenderOptions, field
                    });
                    delete result.rawResult;
                    resultsCache.set(cacheKey, result);
                } catch (error) {
                    result = { error: error.message, attacker, defender, moveName };
                }
            }

            results.push(result);
        }

        const duration = Date.now() - startTime;

        res.json({
            count: results.length,
            duration: `${duration}ms`,
            avgTime: `${(duration / results.length).toFixed(2)}ms`,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /matchup-matrix - Générer une matrice de matchups pour les top N Pokémon
 * Query: ?limit=20 (default 20)
 */
app.get("/matchup-matrix", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        // Récupérer les top Pokémon par usage
        const topPokemon = await service.db.collection("pokemon")
            .find({ "usage.percent": { $gt: 0 } })
            .sort({ "usage.percent": -1 })
            .limit(limit)
            .project({ name: 1 })
            .toArray();

        const names = topPokemon.map(p => p.name);
        const matrix = {};
        const startTime = Date.now();
        let calculated = 0;

        for (const p1 of names) {
            matrix[p1] = {};
            for (const p2 of names) {
                if (p1 === p2) {
                    matrix[p1][p2] = { winner: "draw", reason: "Same Pokemon" };
                    continue;
                }

                const cacheKey = resultsCache.generateKey({ 
                    type: "simulate1v1", pokemon1: p1, pokemon2: p2 
                });
                
                let result = resultsCache.get(cacheKey);
                if (!result) {
                    result = await service.simulate1v1(p1, p2);
                    resultsCache.set(cacheKey, result);
                    calculated++;
                }

                matrix[p1][p2] = {
                    winner: result.winner,
                    winnerIs: result.winner === p1 ? "p1" : "p2"
                };
            }
        }

        const duration = Date.now() - startTime;

        res.json({
            pokemon: names,
            size: `${limit}x${limit}`,
            totalMatchups: limit * limit,
            newCalculations: calculated,
            duration: `${duration}ms`,
            matrix
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// DÉMARRAGE DU SERVEUR
// ============================================================================

async function startServer() {
    console.log("🚀 Démarrage du serveur DamageCalc API...\n");

    try {
        // Connexion à MongoDB
        console.log("📡 Connexion à MongoDB...");
        await service.connect();
        console.log("✅ MongoDB connecté\n");

        // Pré-charger les top Pokémon en cache
        console.log("📦 Préchargement des données...");
        const topPokemon = await service.db.collection("pokemon")
            .find({ "usage.percent": { $gt: 0 } })
            .sort({ "usage.percent": -1 })
            .limit(50)
            .toArray();
        
        for (const p of topPokemon) {
            service.pokemonCache.set(p.name, p);
        }
        console.log(`✅ ${topPokemon.length} Pokémon préchargés\n`);

        // Démarrer le serveur
        app.listen(PORT, () => {
            console.log("=".repeat(50));
            console.log(`🎮 DamageCalc API Server`);
            console.log(`📍 http://localhost:${PORT}`);
            console.log(`📊 Cache max: ${CACHE_MAX_SIZE} entrées`);
            console.log("=".repeat(50));
            console.log("\nEndpoints disponibles:");
            console.log("  GET  /health              - Status du serveur");
            console.log("  GET  /stats               - Statistiques");
            console.log("  GET  /pokemon/:name       - Données d'un Pokémon");
            console.log("  GET  /pokemon/:name/moves - Moves d'un Pokémon");
            console.log("  POST /calculate           - Calcul de dégâts");
            console.log("  POST /best-move           - Meilleur move");
            console.log("  POST /simulate-1v1        - Simulation 1v1");
            console.log("  POST /batch/simulate-1v1  - Batch simulations");
            console.log("  POST /batch/calculate     - Batch calculs");
            console.log("  GET  /matchup-matrix      - Matrice de matchups");
            console.log("\n🎯 Prêt pour les requêtes!");
        });

    } catch (error) {
        console.error("❌ Erreur au démarrage:", error);
        process.exit(1);
    }
}

// Gestion propre de l'arrêt
process.on("SIGINT", async () => {
    console.log("\n\n🛑 Arrêt du serveur...");
    await service.disconnect();
    console.log("📡 MongoDB déconnecté");
    console.log("👋 Au revoir!");
    process.exit(0);
});

startServer();
