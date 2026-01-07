"""
Test simple du client DamageCalc
Exécuter après avoir lancé le serveur avec: node api-server.js
"""
import requests

BASE_URL = "http://localhost:3000"

print("=== TEST API DAMAGECALC ===\n")

# Test 1: Health
try:
    r = requests.get(f"{BASE_URL}/health", timeout=5)
    print(f"✅ Health: {r.json()['status']}")
except Exception as e:
    print(f"❌ Serveur non accessible: {e}")
    print("   Lancez d'abord: node app/tools/damage-calc/api-server.js")
    exit(1)

# Test 2: Pokemon
r = requests.get(f"{BASE_URL}/pokemon/Great Tusk")
data = r.json()
print(f"✅ Pokemon: {data['name']} ({data['types']})")

# Test 3: Calculate
r = requests.post(f"{BASE_URL}/calculate", json={
    "attacker": "Great Tusk",
    "defender": "Kingambit", 
    "moveName": "Close Combat"
})
result = r.json()
print(f"✅ Damage: {result['damage']['min']}-{result['damage']['max']} ({result['percent']['min']}%-{result['percent']['max']}%)")

# Test 4: Simulate 1v1
r = requests.post(f"{BASE_URL}/simulate-1v1", json={
    "pokemon1": "Great Tusk",
    "pokemon2": "Kingambit"
})
result = r.json()
print(f"✅ 1v1: {result['winner']} wins ({result['reason']})")

# Test 5: Batch
r = requests.post(f"{BASE_URL}/batch/simulate-1v1", json={
    "matchups": [
        {"pokemon1": "Great Tusk", "pokemon2": "Gholdengo"},
        {"pokemon1": "Kingambit", "pokemon2": "Great Tusk"},
        {"pokemon1": "Dragapult", "pokemon2": "Kyurem"},
    ]
})
result = r.json()
print(f"✅ Batch: {result['count']} matchups in {result['duration']}")

# Test 6: Stats
r = requests.get(f"{BASE_URL}/stats")
stats = r.json()
print(f"✅ Cache hitrate: {stats['resultsCache']['hitRate']}")

print("\n=== TOUS LES TESTS RÉUSSIS ===")
