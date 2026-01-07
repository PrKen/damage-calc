# DamageCalc API - Pokemon Battle ML Project

**Status**: ✅ Phase 2 terminée - API fonctionnelle avec auto-start

API HTTP pour calculs de dégâts Pokémon utilisant `@smogon/calc`, optimisée pour ML.

## 🎯 Quickstart

```python
from damage_calc_client import DamageCalcClient

# Le serveur démarre automatiquement !
client = DamageCalcClient(auto_start=True)

# Calcul simple
result = client.calculate_damage("Great Tusk", "Kingambit", "Close Combat")
print(f"{result['damage']['min']}-{result['damage']['max']} dégâts")

# Batch processing
matchups = [
    {"pokemon1": "Great Tusk", "pokemon2": "Gholdengo"},
    {"pokemon1": "Kingambit", "pokemon2": "Great Tusk"},
]
results = client.batch_simulate_1v1(matchups)
```

## 📊 Architecture

```
MongoDB (pokemon_db)
       ↓
DamageService.js (cache Pokemon/moves + @smogon/calc)
       ↓
Express API (cache LRU 10K entrées)
       ↓
Python Client (auto-start + session persistante)
       ↓
ML Pipeline
```

### Composants

- **DamageService.js**: Service avec intégration MongoDB
- **api-server.js**: Serveur Express avec cache LRU 
- **damage_calc_client.py**: Client Python avec auto-démarrage

## 🚀 Démarrage

### Option 1: Auto-start (recommandé)

```python
from damage_calc_client import DamageCalcClient
client = DamageCalcClient(auto_start=True)  # Démarre le serveur automatiquement
```

### Option 2: Manuel

```bash
cd app/tools/damage-calc
node api-server.js  # Serveur sur http://localhost:3000
```

Puis :
```python
client = DamageCalcClient(auto_start=False)
```

## 📡 Endpoints API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/health` | Status du serveur |
| GET | `/stats` | Statistiques cache |
| GET | `/pokemon/:name` | Données Pokémon |
| GET | `/pokemon/:name/moves` | Moves disponibles |
| POST | `/calculate` | Calcul dégâts |
| POST | `/best-move` | Meilleur move |
| POST | `/simulate-1v1` | Simulation 1v1 |
| POST | `/batch/simulate-1v1` | Batch simulations |
| POST | `/batch/calculate` | Batch calculs |
| GET | `/matchup-matrix` | Matrice matchups |

## 💡 Exemples Python

### Calcul simple

```python
result = client.calculate_damage(
    attacker="Great Tusk",
    defender="Kingambit",
    move_name="Close Combat"
)
# {'damage': {'min': 676, 'max': 796}, 'percent': {'min': '198.2', 'max': '233.4'}, ...}
```

### Meilleur move

```python
best = client.find_best_move("Great Tusk", "Gholdengo")
# {'move': {'name': 'Knock Off', ...}, 'result': {...}, 'avgDamage': 244}
```

### Simulation 1v1

```python
sim = client.simulate_1v1("Great Tusk", "Kingambit")
# {'winner': 'Great Tusk', 'reason': 'Great Tusk OHKO avec Close Combat', ...}
```

### Batch processing (optimal)

```python
matchups = [
    {"pokemon1": "Great Tusk", "pokemon2": "Gholdengo"},
    {"pokemon1": "Kingambit", "pokemon2": "Great Tusk"},
    {"pokemon1": "Dragapult", "pokemon2": "Kyurem"},
]

results = client.batch_simulate_1v1(matchups)
# {'count': 3, 'duration': '45ms', 'avgTime': '15.00ms', 'results': [...]}

for res in results['results']:
    p1 = res['pokemon1']['name']
    p2 = res['pokemon2']['name']
    print(f"{p1} vs {p2}: {res['winner']}")
```

## ⚡ Performance

### Benchmarks

- **Calcul simple**: ~10ms
- **Batch de 5 simulations**: ~50ms  
- **Batch de 100 simulations**: ~800ms

### Cache hit rates

- **Premier run**: 0% (cold cache)
- **Après warm-up**: >90% hit rate
- **Génération 10K matchups**: ~15s (avec cache), ~100s (sans cache)

### Optimisations

**Cache LRU (api-server.js)**
- Capacité: 10,000 entrées
- TTL: 1 heure
- Préchargement: Top 50 Pokémon

**Cache MongoDB (DamageService.js)**
- Pokemon data: illimité
- Moves: illimité
- Type chart: préchargé

**Client Python**
- Session persistante HTTP
- Retry automatique (3x)
- Connection pooling (10)

## ✅ Tests

```bash
cd app/tools/damage-calc
python test_client.py
```

**Tests inclus:**
- ✅ Health check & Stats
- ✅ Pokemon data & Moves
- ✅ Calcul dégâts
- ✅ Best move
- ✅ Simulation 1v1
- ✅ Batch processing
- ✅ Cache statistics

**Résultat attendu:**
```
============================================================
  ✅ TOUS LES TESTS RÉUSSIS
============================================================
```

## 🔧 Configuration

### Port personnalisé

```python
client = DamageCalcClient(
    base_url="http://localhost:8080",
    auto_start=True
)
```

### Timeout

```python
client = DamageCalcClient(timeout=60)  # 60 secondes
```

### Désactiver auto-start

```python
client = DamageCalcClient(auto_start=False)
```

## 📦 Dépendances

**Node.js** (package.json)
```json
{
  "@smogon/calc": "^0.10.0",
  "express": "^4.21.2",
  "compression": "^1.7.5",
  "mongodb": "^6.12.0"
}
```

**Python** (requirements.txt)
```
requests>=2.31.0
```

## 🗄️ Base de données

**MongoDB**: `mongodb://localhost:27017/pokemon_db`

Collections utilisées:
- `pokemon` (1425 Pokémon)
- `moves` (952 moves)
- `items` (537 items)
- `usage_stats` (96 Pokémon avec données d'usage)

## 🐛 Troubleshooting

### Le serveur ne démarre pas

```bash
# Vérifier Node.js
node --version

# Vérifier MongoDB
mongosh

# Vérifier le port 3000
netstat -an | findstr :3000
```

### Timeout errors

```python
# Augmenter le timeout
client = DamageCalcClient(timeout=120)
```

### Cache hit rate faible

- Le cache utilise des clés strictes (même ordre de paramètres)
- TTL de 1 heure
- Redémarrer le serveur vide le cache

## 📈 Prochaines étapes

✅ **Phase 2 terminée**
- API fonctionnelle
- Client Python avec auto-start
- Tests complets

🔄 **Phase 3 en cours**
- Génération training set ML
- Features engineering
- Export CSV

⏳ **Phase 4 à venir**
- Architecture réseau neuronal
- Entraînement modèle
- Évaluation performances

## 📝 Licence

MIT - Pokemon Battle ML Project

---

**Auteur**: PrKen  
**Version**: 1.1.0  
**Date**: Janvier 2026
