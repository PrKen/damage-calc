/**
 * DamageService - Service de calcul de dégâts Pokémon
 * 
 * Wrapper autour de @smogon/calc avec intégration MongoDB
 * Utilisable de manière programmatique (sans CLI)
 * 
 * @author Pokemon Battle ML Project
 * @version 1.0.0
 */

const { MongoClient } = require("mongodb");
const { calculate, Generations, Pokemon, Move, Field } = require("@smogon/calc");

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "pokemon_db";

/**
 * Service de calcul de dégâts avec intégration MongoDB
 */
class DamageService {
    constructor(options = {}) {
        this.uri = options.uri || MONGODB_URI;
        this.dbName = options.dbName || DB_NAME;
        this.gen = Generations.get(options.generation || 9);
        this.client = null;
        this.db = null;
        this.connected = false;
        
        // Cache pour éviter les requêtes répétées
        this.pokemonCache = new Map();
        this.movesCache = new Map();
        this.typechartCache = null;
    }

    // ========================================================================
    // CONNEXION MONGODB
    // ========================================================================

    /**
     * Connecte à MongoDB
     */
    async connect() {
        if (this.connected) return;
        
        this.client = new MongoClient(this.uri);
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        this.connected = true;
        
        // Précharger le typechart
        await this.loadTypechart();
    }

    /**
     * Ferme la connexion MongoDB
     */
    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            this.client = null;
            this.db = null;
        }
    }

    /**
     * Charge le typechart en cache
     */
    async loadTypechart() {
        if (this.typechartCache) return this.typechartCache;
        
        const typechartDocs = await this.db.collection("typechart").find({}).toArray();
        this.typechartCache = new Map();
        
        for (const doc of typechartDocs) {
            this.typechartCache.set(doc.type, doc.effectiveness);
        }
        
        return this.typechartCache;
    }

    // ========================================================================
    // CHARGEMENT DES DONNÉES
    // ========================================================================

    /**
     * Récupère les données d'un Pokémon depuis MongoDB
     * @param {string} name - Nom du Pokémon
     * @returns {Object} - Données du Pokémon
     */
    async getPokemonData(name) {
        // Vérifier le cache
        if (this.pokemonCache.has(name)) {
            return this.pokemonCache.get(name);
        }

        const pokemon = await this.db.collection("pokemon").findOne({
            name: { $regex: new RegExp(`^${name}$`, "i") }
        });

        if (pokemon) {
            this.pokemonCache.set(name, pokemon);
        }

        return pokemon;
    }

    /**
     * Récupère les données d'un move depuis MongoDB
     * @param {string} name - Nom du move
     * @returns {Object} - Données du move
     */
    async getMoveData(name) {
        if (this.movesCache.has(name)) {
            return this.movesCache.get(name);
        }

        const move = await this.db.collection("moves").findOne({
            name: { $regex: new RegExp(`^${name}$`, "i") }
        });

        if (move) {
            this.movesCache.set(name, move);
        }

        return move;
    }

    /**
     * Crée un objet Pokemon pour @smogon/calc depuis les données MongoDB
     * @param {string} name - Nom du Pokémon
     * @param {Object} options - Options supplémentaires (setIndex, overrides)
     * @returns {Pokemon} - Objet Pokemon pour le calcul
     */
    async createPokemon(name, options = {}) {
        const data = await this.getPokemonData(name);
        if (!data) {
            throw new Error(`Pokémon "${name}" non trouvé dans la base de données`);
        }

        const setIndex = options.setIndex || "1";
        const evSpread = data.usage?.evSpreads?.[setIndex];
        const bestItem = data.usage?.items?.["1"]?.name;
        const primaryAbility = Object.values(data.abilities || {})[0];

        const pokemonOptions = {
            level: options.level || 100,
            nature: evSpread?.nature || options.nature || "Hardy",
            evs: evSpread?.ev || options.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            ivs: options.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            item: options.item || bestItem || undefined,
            ability: options.ability || primaryAbility || undefined,
            ...options.overrides
        };

        return new Pokemon(this.gen, name, pokemonOptions);
    }

    /**
     * Récupère les moves utilisables d'un Pokémon (non-Status par défaut)
     * @param {string} name - Nom du Pokémon
     * @param {Object} options - Options de filtrage
     * @returns {Array} - Liste des moves
     */
    async getUsableMoves(name, options = {}) {
        const data = await this.getPokemonData(name);
        if (!data?.usage?.moves) return [];

        const moves = Object.values(data.usage.moves);
        const filteredMoves = [];

        for (const moveData of moves) {
            const moveInfo = await this.getMoveData(moveData.name);
            
            // Filtrer les Status par défaut
            if (!options.includeStatus && moveInfo?.category === "Status") {
                continue;
            }

            filteredMoves.push({
                name: moveData.name,
                type: moveInfo?.type || moveData.type,
                category: moveInfo?.category,
                basePower: moveInfo?.basePower || 0,
                priority: moveInfo?.priority || 0,
                percent: moveData.percent
            });
        }

        return filteredMoves;
    }

    // ========================================================================
    // CALCUL DE DÉGÂTS
    // ========================================================================

    /**
     * Calcule l'efficacité d'un type contre un défenseur
     * @param {string} moveType - Type de l'attaque
     * @param {Array} defenderTypes - Types du défenseur
     * @returns {number} - Multiplicateur d'efficacité
     */
    getTypeEffectiveness(moveType, defenderTypes) {
        if (!this.typechartCache) {
            console.warn("Typechart non chargé, efficacité = 1");
            return 1;
        }

        let multiplier = 1;
        const effectiveness = this.typechartCache.get(moveType);
        
        if (effectiveness) {
            for (const defType of defenderTypes) {
                multiplier *= effectiveness[defType] || 1;
            }
        }

        return multiplier;
    }

    /**
     * Calcule les dégâts d'une attaque
     * @param {Object} params - Paramètres du calcul
     * @returns {Object} - Résultat du calcul
     */
    async calculateDamage(params) {
        const { attacker, defender, moveName, field = {} } = params;

        // Créer les objets Pokemon
        const attackerPokemon = typeof attacker === "string" 
            ? await this.createPokemon(attacker, params.attackerOptions || {})
            : attacker;
        
        const defenderPokemon = typeof defender === "string"
            ? await this.createPokemon(defender, params.defenderOptions || {})
            : defender;

        // Créer le move
        const move = new Move(this.gen, moveName);

        // Créer le field
        const battleField = Object.keys(field).length > 0 ? new Field(field) : undefined;

        // Calculer
        const result = calculate(this.gen, attackerPokemon, defenderPokemon, move, battleField);

        // Extraire les informations utiles
        const damageRange = result.range();
        const defenderMaxHP = defenderPokemon.maxHP();

        return {
            attacker: attackerPokemon.name,
            defender: defenderPokemon.name,
            move: moveName,
            damage: {
                min: damageRange[0],
                max: damageRange[1],
                rolls: Array.isArray(result.damage) ? result.damage : [result.damage]
            },
            percent: {
                min: (damageRange[0] / defenderMaxHP * 100).toFixed(1),
                max: (damageRange[1] / defenderMaxHP * 100).toFixed(1)
            },
            defenderHP: defenderMaxHP,
            description: result.desc(),
            isOHKO: damageRange[0] >= defenderMaxHP,
            is2HKO: damageRange[0] * 2 >= defenderMaxHP,
            rawResult: result
        };
    }

    /**
     * Trouve le meilleur move d'un attaquant contre un défenseur
     * @param {string} attackerName - Nom de l'attaquant
     * @param {string} defenderName - Nom du défenseur
     * @param {Object} options - Options
     * @returns {Object} - Meilleur move et son résultat
     */
    async findBestMove(attackerName, defenderName, options = {}) {
        const moves = await this.getUsableMoves(attackerName);
        const defenderData = await this.getPokemonData(defenderName);
        
        if (!moves.length) {
            return { move: null, reason: "Aucun move offensif disponible" };
        }

        let bestResult = null;
        let bestMove = null;
        let bestDamage = 0;

        for (const moveData of moves) {
            // Vérifier l'immunité avant de calculer
            const effectiveness = this.getTypeEffectiveness(moveData.type, defenderData.types);
            if (effectiveness === 0) continue;

            try {
                const result = await this.calculateDamage({
                    attacker: attackerName,
                    defender: defenderName,
                    moveName: moveData.name,
                    attackerOptions: options.attackerOptions,
                    defenderOptions: options.defenderOptions,
                    field: options.field
                });

                // Comparer par dégâts maximum
                const avgDamage = (result.damage.min + result.damage.max) / 2;
                if (avgDamage > bestDamage) {
                    bestDamage = avgDamage;
                    bestResult = result;
                    bestMove = moveData;
                }
            } catch (error) {
                // Move peut ne pas exister dans le calc, ignorer
                continue;
            }
        }

        return {
            move: bestMove,
            result: bestResult,
            avgDamage: bestDamage
        };
    }

    /**
     * Simule un combat 1v1 simplifié
     * @param {string} pokemon1 - Nom du premier Pokémon
     * @param {string} pokemon2 - Nom du second Pokémon
     * @param {Object} options - Options de simulation
     * @returns {Object} - Résultat de la simulation
     */
    async simulate1v1(pokemon1, pokemon2, options = {}) {
        const [data1, data2] = await Promise.all([
            this.getPokemonData(pokemon1),
            this.getPokemonData(pokemon2)
        ]);

        if (!data1 || !data2) {
            throw new Error("Un des Pokémon n'existe pas dans la base");
        }

        // Trouver le meilleur move pour chaque Pokémon
        const [best1, best2] = await Promise.all([
            this.findBestMove(pokemon1, pokemon2, options),
            this.findBestMove(pokemon2, pokemon1, options)
        ]);

        // Calculer la vitesse pour déterminer qui attaque en premier
        const poke1 = await this.createPokemon(pokemon1);
        const poke2 = await this.createPokemon(pokemon2);
        
        const speed1 = poke1.stats.spe;
        const speed2 = poke2.stats.spe;

        // Vérifier la priorité
        const priority1 = best1.move?.priority || 0;
        const priority2 = best2.move?.priority || 0;

        let firstAttacker, secondAttacker;
        let first, second;

        if (priority1 > priority2) {
            firstAttacker = pokemon1; first = best1;
            secondAttacker = pokemon2; second = best2;
        } else if (priority2 > priority1) {
            firstAttacker = pokemon2; first = best2;
            secondAttacker = pokemon1; second = best1;
        } else if (speed1 >= speed2) {
            firstAttacker = pokemon1; first = best1;
            secondAttacker = pokemon2; second = best2;
        } else {
            firstAttacker = pokemon2; first = best2;
            secondAttacker = pokemon1; second = best1;
        }

        // Simuler le combat
        const result = {
            pokemon1: {
                name: pokemon1,
                speed: speed1,
                bestMove: best1.move?.name,
                damageDealt: best1.result?.damage || { min: 0, max: 0 },
                damagePercent: best1.result?.percent || { min: "0", max: "0" },
                isOHKO: best1.result?.isOHKO || false
            },
            pokemon2: {
                name: pokemon2,
                speed: speed2,
                bestMove: best2.move?.name,
                damageDealt: best2.result?.damage || { min: 0, max: 0 },
                damagePercent: best2.result?.percent || { min: "0", max: "0" },
                isOHKO: best2.result?.isOHKO || false
            },
            firstAttacker,
            winner: null,
            reason: ""
        };

        // Déterminer le gagnant
        if (first.result?.isOHKO) {
            result.winner = firstAttacker;
            result.reason = `${firstAttacker} OHKO avec ${first.move?.name}`;
        } else if (second.result?.isOHKO) {
            result.winner = secondAttacker;
            result.reason = `${secondAttacker} OHKO avec ${second.move?.name}`;
        } else {
            // Comparer les dégâts moyens en pourcentage
            const dmg1 = parseFloat(best1.result?.percent?.max || "0");
            const dmg2 = parseFloat(best2.result?.percent?.max || "0");
            
            if (dmg1 > dmg2) {
                result.winner = pokemon1;
                result.reason = `${pokemon1} fait plus de dégâts (${dmg1}% vs ${dmg2}%)`;
            } else if (dmg2 > dmg1) {
                result.winner = pokemon2;
                result.reason = `${pokemon2} fait plus de dégâts (${dmg2}% vs ${dmg1}%)`;
            } else {
                result.winner = firstAttacker;
                result.reason = "Égalité, avantage au plus rapide";
            }
        }

        return result;
    }

    // ========================================================================
    // UTILITAIRES
    // ========================================================================

    /**
     * Vide les caches
     */
    clearCache() {
        this.pokemonCache.clear();
        this.movesCache.clear();
    }

    /**
     * Retourne les statistiques du cache
     */
    getCacheStats() {
        return {
            pokemon: this.pokemonCache.size,
            moves: this.movesCache.size,
            typechart: this.typechartCache?.size || 0
        };
    }
}

// Export pour utilisation en module
module.exports = { DamageService };

// Export par défaut d'une instance
module.exports.default = new DamageService();
