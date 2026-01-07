"""
Client Python pour l'API DamageCalc

Wrapper Python pour appeler le serveur Node.js DamageCalc.
Optimisé pour un usage intensif avec :
- Session persistante (réutilise les connexions)
- Retry automatique
- Batch processing
- Gestion des erreurs
- Lancement automatique du serveur

@author Pokemon Battle ML Project
@version 1.1.0
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import List, Dict, Optional, Any
import time
import subprocess
import os
import sys
import atexit
import signal
from pathlib import Path


# Chemin vers le dossier damage-calc
DAMAGE_CALC_DIR = Path(__file__).parent.absolute()
API_SERVER_PATH = DAMAGE_CALC_DIR / "api-server.js"


class ServerManager:
    """Gère le cycle de vie du serveur Node.js"""
    
    _instance = None
    _server_process = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def start_server(self, port: int = 3000, timeout: int = 30) -> bool:
        """
        Lance le serveur Node.js si nécessaire.
        
        Args:
            port: Port du serveur
            timeout: Temps max d'attente pour le démarrage
            
        Returns:
            True si le serveur est prêt
        """
        # Vérifier si le serveur tourne déjà
        if self._is_server_running(port):
            return True
        
        # Vérifier que le fichier existe
        if not API_SERVER_PATH.exists():
            raise FileNotFoundError(f"api-server.js non trouvé: {API_SERVER_PATH}")
        
        print(f"🚀 Démarrage du serveur DamageCalc sur le port {port}...")
        
        # Lancer le serveur en subprocess
        env = os.environ.copy()
        env["PORT"] = str(port)
        
        # Utiliser CREATE_NEW_PROCESS_GROUP sur Windows pour éviter les signaux
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        
        self._server_process = subprocess.Popen(
            ["node", "api-server.js"],
            cwd=str(DAMAGE_CALC_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=creationflags
        )
        
        # Enregistrer le cleanup
        atexit.register(self.stop_server)
        
        # Attendre que le serveur soit prêt
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self._is_server_running(port):
                print(f"✅ Serveur DamageCalc prêt sur http://localhost:{port}")
                return True
            time.sleep(0.5)
            
            # Vérifier si le process est mort
            if self._server_process.poll() is not None:
                # Lire la sortie pour debug
                output, _ = self._server_process.communicate()
                raise RuntimeError(f"Le serveur a crashé: {output.decode()}")
        
        raise TimeoutError(f"Le serveur n'a pas démarré en {timeout}s")
    
    def stop_server(self):
        """Arrête le serveur Node.js"""
        if self._server_process is not None:
            print("🛑 Arrêt du serveur DamageCalc...")
            if sys.platform == "win32":
                self._server_process.terminate()
            else:
                self._server_process.send_signal(signal.SIGTERM)
            self._server_process.wait(timeout=5)
            self._server_process = None
    
    def _is_server_running(self, port: int) -> bool:
        """Vérifie si le serveur répond"""
        try:
            r = requests.get(f"http://localhost:{port}/health", timeout=2)
            return r.status_code == 200
        except:
            return False


class DamageCalcClient:
    """Client Python pour l'API DamageCalc"""
    
    def __init__(
        self, 
        base_url: str = "http://localhost:3000", 
        timeout: int = 30,
        auto_start: bool = True
    ):
        """
        Initialise le client.
        
        Args:
            base_url: URL du serveur API
            timeout: Timeout par défaut pour les requêtes
            auto_start: Lance automatiquement le serveur s'il n'est pas accessible
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._server_manager = ServerManager()
        
        # Extraire le port de l'URL
        port = 3000
        if ":" in base_url.split("//")[-1]:
            port = int(base_url.split(":")[-1].rstrip("/"))
        self._port = port
        
        # Auto-start du serveur si demandé
        if auto_start:
            self._server_manager.start_server(port=port)
        
        # Session persistante avec retry
        self.session = requests.Session()
        
        # Configuration des retries
        retry_strategy = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504]
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=10
        )
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Headers par défaut
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })
    
    def _get(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """Requête GET"""
        url = f"{self.base_url}{endpoint}"
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()
    
    def _post(self, endpoint: str, data: Dict) -> Dict:
        """Requête POST"""
        url = f"{self.base_url}{endpoint}"
        response = self.session.post(url, json=data, timeout=self.timeout)
        response.raise_for_status()
        return response.json()
    
    # =========================================================================
    # MÉTHODES UTILITAIRES
    # =========================================================================
    
    def health(self) -> Dict:
        """Vérifie le status du serveur"""
        return self._get("/health")
    
    def stats(self) -> Dict:
        """Récupère les statistiques du serveur"""
        return self._get("/stats")
    
    def clear_cache(self) -> Dict:
        """Vide les caches du serveur"""
        return self._post("/clear-cache", {})
    
    def is_server_running(self) -> bool:
        """Vérifie si le serveur est accessible"""
        try:
            self.health()
            return True
        except:
            return False
    
    # =========================================================================
    # DONNÉES POKÉMON
    # =========================================================================
    
    def get_pokemon(self, name: str) -> Dict:
        """
        Récupère les données d'un Pokémon.
        
        Args:
            name: Nom du Pokémon
            
        Returns:
            Données complètes du Pokémon
        """
        return self._get(f"/pokemon/{name}")
    
    def get_moves(self, name: str, include_status: bool = False) -> List[Dict]:
        """
        Récupère les moves d'un Pokémon.
        
        Args:
            name: Nom du Pokémon
            include_status: Inclure les moves de status
            
        Returns:
            Liste des moves avec leurs données
        """
        params = {"includeStatus": "true"} if include_status else {}
        return self._get(f"/pokemon/{name}/moves", params)
    
    # =========================================================================
    # CALCULS
    # =========================================================================
    
    def calculate_damage(
        self,
        attacker: str,
        defender: str,
        move_name: str,
        attacker_options: Optional[Dict] = None,
        defender_options: Optional[Dict] = None,
        field: Optional[Dict] = None
    ) -> Dict:
        """
        Calcule les dégâts d'une attaque.
        
        Args:
            attacker: Nom de l'attaquant
            defender: Nom du défenseur
            move_name: Nom de l'attaque
            attacker_options: Options pour l'attaquant (EVs, nature, item...)
            defender_options: Options pour le défenseur
            field: Conditions de terrain
            
        Returns:
            Résultat du calcul avec min/max damage, %, OHKO...
        """
        data = {
            "attacker": attacker,
            "defender": defender,
            "moveName": move_name
        }
        if attacker_options:
            data["attackerOptions"] = attacker_options
        if defender_options:
            data["defenderOptions"] = defender_options
        if field:
            data["field"] = field
            
        return self._post("/calculate", data)
    
    def find_best_move(
        self,
        attacker: str,
        defender: str,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Trouve le meilleur move d'un attaquant contre un défenseur.
        
        Args:
            attacker: Nom de l'attaquant
            defender: Nom du défenseur
            options: Options supplémentaires
            
        Returns:
            Meilleur move et son résultat
        """
        data = {
            "attacker": attacker,
            "defender": defender
        }
        if options:
            data["options"] = options
            
        return self._post("/best-move", data)
    
    def simulate_1v1(
        self,
        pokemon1: str,
        pokemon2: str,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Simule un combat 1v1.
        
        Args:
            pokemon1: Nom du premier Pokémon
            pokemon2: Nom du second Pokémon
            options: Options de simulation
            
        Returns:
            Résultat avec gagnant, dégâts, raison...
        """
        data = {
            "pokemon1": pokemon1,
            "pokemon2": pokemon2
        }
        if options:
            data["options"] = options
            
        return self._post("/simulate-1v1", data)
    
    # =========================================================================
    # BATCH PROCESSING
    # =========================================================================
    
    def batch_simulate_1v1(
        self,
        matchups: List[Dict[str, str]]
    ) -> Dict:
        """
        Simule plusieurs combats 1v1 en batch.
        
        Args:
            matchups: Liste de {"pokemon1": ..., "pokemon2": ...}
            
        Returns:
            Résultats avec stats de performance
        """
        return self._post("/batch/simulate-1v1", {"matchups": matchups})
    
    def batch_calculate(
        self,
        calculations: List[Dict]
    ) -> Dict:
        """
        Effectue plusieurs calculs de dégâts en batch.
        
        Args:
            calculations: Liste de calculs
            
        Returns:
            Résultats avec stats de performance
        """
        return self._post("/batch/calculate", {"calculations": calculations})
    
    def get_matchup_matrix(self, limit: int = 20) -> Dict:
        """
        Génère une matrice de matchups pour les top N Pokémon.
        
        Args:
            limit: Nombre de Pokémon à inclure
            
        Returns:
            Matrice de matchups
        """
        return self._get("/matchup-matrix", {"limit": limit})
    
    # =========================================================================
    # HELPERS POUR ML
    # =========================================================================
    
    def generate_training_data(
        self,
        pokemon_list: List[str],
        progress_callback: Optional[callable] = None
    ) -> List[Dict]:
        """
        Génère des données d'entraînement pour tous les matchups.
        
        Args:
            pokemon_list: Liste des noms de Pokémon
            progress_callback: Callback appelé avec (current, total)
            
        Returns:
            Liste de résultats de simulation
        """
        # Générer toutes les paires
        matchups = []
        for i, p1 in enumerate(pokemon_list):
            for p2 in pokemon_list[i+1:]:  # Éviter les doublons et self-matchups
                matchups.append({"pokemon1": p1, "pokemon2": p2})
        
        total = len(matchups)
        results = []
        batch_size = 100
        
        for i in range(0, total, batch_size):
            batch = matchups[i:i+batch_size]
            batch_results = self.batch_simulate_1v1(batch)
            results.extend(batch_results["results"])
            
            if progress_callback:
                progress_callback(min(i + batch_size, total), total)
        
        return results
    
    def get_pokemon_features(self, name: str) -> Dict:
        """
        Récupère les features d'un Pokémon pour le ML.
        
        Args:
            name: Nom du Pokémon
            
        Returns:
            Features formatées pour le ML
        """
        data = self.get_pokemon(name)
        
        # Extraire les features utiles
        base_stats = data.get("baseStats", {})
        usage = data.get("usage", {})
        best_ev = usage.get("evSpreads", {}).get("1", {})
        
        return {
            "name": name,
            "types": data.get("types", []),
            "hp": base_stats.get("hp", 0),
            "atk": base_stats.get("atk", 0),
            "def": base_stats.get("def", 0),
            "spa": base_stats.get("spa", 0),
            "spd": base_stats.get("spd", 0),
            "spe": base_stats.get("spe", 0),
            "bst": base_stats.get("total", 0),
            "usage_percent": usage.get("percent", 0),
            "nature": best_ev.get("nature"),
            "ev_spread": best_ev.get("ev", {}),
            "primary_ability": list(data.get("abilities", {}).values())[0] if data.get("abilities") else None,
            "tier": data.get("tier")
        }


# Singleton pour import facile
_default_client = None

def get_client(base_url: str = "http://localhost:3000") -> DamageCalcClient:
    """Retourne le client par défaut (singleton)"""
    global _default_client
    if _default_client is None:
        _default_client = DamageCalcClient(base_url)
    return _default_client


# ============================================================================
# TESTS
# ============================================================================

if __name__ == "__main__":
    print("=== TEST DamageCalcClient ===\n")
    
    client = DamageCalcClient()
    
    # Test connexion
    print("📡 Test connexion...")
    if not client.is_server_running():
        print("❌ Serveur non accessible!")
        print("   Lancez: cd app/tools/damage-calc && node api-server.js")
        exit(1)
    print("✅ Serveur connecté\n")
    
    # Test health
    print("--- Health Check ---")
    health = client.health()
    print(f"Status: {health['status']}")
    print(f"Cache: {health['cache']}")
    print()
    
    # Test Pokemon
    print("--- Get Pokemon ---")
    pokemon = client.get_pokemon("Great Tusk")
    print(f"Name: {pokemon['name']}")
    print(f"Types: {pokemon['types']}")
    print(f"Usage: {pokemon['usage']['percent']}%")
    print()
    
    # Test moves
    print("--- Get Moves ---")
    moves = client.get_moves("Great Tusk")
    print(f"Moves: {[m['name'] for m in moves]}")
    print()
    
    # Test damage calc
    print("--- Calculate Damage ---")
    result = client.calculate_damage("Great Tusk", "Kingambit", "Close Combat")
    print(f"{result['attacker']} → {result['defender']}")
    print(f"Move: {result['move']}")
    print(f"Damage: {result['damage']['min']} - {result['damage']['max']}")
    print(f"Percent: {result['percent']['min']}% - {result['percent']['max']}%")
    print(f"OHKO: {result['isOHKO']}")
    print()
    
    # Test best move
    print("--- Find Best Move ---")
    best = client.find_best_move("Dragapult", "Dragonite")
    print(f"Best move: {best['move']['name'] if best.get('move') else 'None'}")
    print()
    
    # Test 1v1
    print("--- Simulate 1v1 ---")
    battle = client.simulate_1v1("Great Tusk", "Kingambit")
    print(f"{battle['pokemon1']['name']} vs {battle['pokemon2']['name']}")
    print(f"Winner: {battle['winner']}")
    print(f"Reason: {battle['reason']}")
    print()
    
    # Test batch
    print("--- Batch Simulate ---")
    matchups = [
        {"pokemon1": "Great Tusk", "pokemon2": "Gholdengo"},
        {"pokemon1": "Kingambit", "pokemon2": "Great Tusk"},
        {"pokemon1": "Dragapult", "pokemon2": "Kyurem"},
    ]
    batch_results = client.batch_simulate_1v1(matchups)
    print(f"Batch: {batch_results['count']} matchups in {batch_results['duration']}")
    for r in batch_results["results"]:
        print(f"  {r['pokemon1']['name']} vs {r['pokemon2']['name']} → {r['winner']}")
    print()
    
    # Test features
    print("--- Pokemon Features ---")
    features = client.get_pokemon_features("Great Tusk")
    print(f"Features: {features}")
    print()
    
    # Stats finales
    print("--- Final Stats ---")
    stats = client.stats()
    print(f"Results Cache: {stats['resultsCache']}")
    print()
    
    print("=== TOUS LES TESTS RÉUSSIS ===")
