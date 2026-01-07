"""
Test complet du client DamageCalc avec auto-start du serveur
"""
from damage_calc_client import DamageCalcClient
import time

print("=" * 60)
print("  TEST CLIENT DAMAGECALC (avec auto-start)")
print("=" * 60)
print()

# Le client démarre automatiquement le serveur si nécessaire
client = DamageCalcClient(auto_start=True)

print()
print("--- Tests de base ---")
print()

# Test 1: Health
try:
    health = client.health()
    print(f"✅ Health: {health['status']}")
except Exception as e:
    print(f"❌ Health échoué: {e}")
    exit(1)

# Test 2: Stats
stats = client.stats()
print(f"✅ Stats: {stats['resultsCache']['size']} entrées en cache")

# Test 3: Pokemon data
pokemon = client.get_pokemon("Great Tusk")
print(f"✅ Pokemon: {pokemon['name']} - Types: {pokemon['types']}")

# Test 4: Moves
moves = client.get_moves("Great Tusk")
print(f"✅ Moves: {len(moves)} moves disponibles")

print()
print("--- Tests de calculs ---")
print()

# Test 5: Calcul de dégâts simple
result = client.calculate_damage(
    attacker="Great Tusk",
    defender="Kingambit",
    move_name="Close Combat"
)
print(f"✅ Damage: {result['damage']['min']}-{result['damage']['max']} "
      f"({result['percent']['min']}%-{result['percent']['max']}%)")

# Test 6: Best move
best = client.find_best_move("Great Tusk", "Gholdengo")
print(f"✅ Best move vs Gholdengo: {best['move']['name']} "
      f"({best['result']['percent']['max']}% max)")

# Test 7: Simulation 1v1
sim = client.simulate_1v1("Great Tusk", "Kingambit")
print(f"✅ 1v1: {sim['winner']} gagne ({sim['reason']})")

print()
print("--- Tests batch ---")
print()

# Test 8: Batch simulations
matchups = [
    {"pokemon1": "Great Tusk", "pokemon2": "Gholdengo"},
    {"pokemon1": "Kingambit", "pokemon2": "Great Tusk"},
    {"pokemon1": "Dragapult", "pokemon2": "Kyurem"},
    {"pokemon1": "Iron Valiant", "pokemon2": "Kingambit"},
    {"pokemon1": "Raging Bolt", "pokemon2": "Great Tusk"},
]

start_time = time.time()
batch_results = client.batch_simulate_1v1(matchups)
batch_time = time.time() - start_time

print(f"✅ Batch 1v1: {batch_results['count']} résultats en {batch_time:.3f}s")
for res in batch_results['results']:
    p1 = res['pokemon1']['name'] if isinstance(res['pokemon1'], dict) else res['pokemon1']
    p2 = res['pokemon2']['name'] if isinstance(res['pokemon2'], dict) else res['pokemon2']
    winner = res['winner']
    print(f"   {p1} vs {p2}: {winner}")

print()
print("--- Statistiques finales ---")
print()

final_stats = client.stats()
cache = final_stats['resultsCache']
print(f"   Cache size:    {cache['size']}")
print(f"   Cache hits:    {cache['hits']}")
print(f"   Cache misses:  {cache['misses']}")
print(f"   Hit rate:      {cache['hitRate']}")

print()
print("=" * 60)
print("  ✅ TOUS LES TESTS RÉUSSIS")
print("=" * 60)
