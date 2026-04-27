"""
main.py - Point d'entrée AgroStat
"""
import threading
import time
from app.simulator import simuler_mesures
from app.api import run_api


def attendre_mysql(max_t=20, delai=3):
    from app.database import get_mysql
    for i in range(max_t):
        try:
            conn = get_mysql()
            conn.close()
            print("[MAIN] MySQL connecté.")
            return True
        except Exception:
            print(f"[MAIN] MySQL non disponible, tentative {i+1}/{max_t}...")
            time.sleep(delai)
    return False


def attendre_mongo(max_t=10, delai=3):
    from pymongo import MongoClient
    from app.config import MONGO_URI
    for i in range(max_t):
        try:
            MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000).admin.command("ping")
            print("[MAIN] MongoDB connecté.")
            return True
        except Exception:
            print(f"[MAIN] MongoDB non disponible, tentative {i+1}/{max_t}...")
            time.sleep(delai)
    return False


def main():
    print("=" * 55)
    print("  🌱 AgroStat IoT Platform - Démarrage")
    print("=" * 55)

    if not attendre_mysql():
        print("[MAIN] MySQL inaccessible. Arrêt.")
        return
    if not attendre_mongo():
        print("[MAIN] MongoDB inaccessible. Arrêt.")
        return

    # Lancer simulation en arrière-plan
    t = threading.Thread(target=simuler_mesures, daemon=True)
    t.start()
    print("[MAIN] Simulation démarrée.")

    print("[MAIN] API Flask sur http://0.0.0.0:5000")
    run_api()


if __name__ == "__main__":
    main()
