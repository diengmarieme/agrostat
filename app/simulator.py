"""
simulator.py - Simulation des capteurs agricoles
Insère des mesures toutes les SIMULATION_INTERVAL secondes
"""

import random
import time
from datetime import datetime
from app.database import get_mongo, mysql_query
from app.config import COLLECTION_MESURES, SIMULATION_INTERVAL

PLAGES = {
    "temperature": {"min": 15.0, "max": 40.0, "unite": "°C"},
    "humidite":    {"min": 20.0, "max": 100.0, "unite": "%"},
    "ph_sol":      {"min": 5.0,  "max": 9.0,   "unite": "pH"},
}


def simuler_mesures():
    print("[SIMULATOR] Démarrage de la simulation...")
    while True:
        try:
            capteurs = mysql_query(
                "SELECT c.capteur_id, c.type, p.nom as parcelle, p.user_id "
                "FROM capteurs c JOIN parcelles p ON c.parcelle_id = p.id "
                "WHERE c.actif = 1",
                fetchall=True
            )
            if not capteurs:
                time.sleep(5)
                continue

            db = get_mongo()
            ts = datetime.utcnow()
            mesures = []
            for cap in capteurs:
                plage = PLAGES.get(cap['type'])
                if not plage:
                    continue
                val = round(random.uniform(plage['min'], plage['max']), 2)
                mesures.append({
                    "capteur_id": cap['capteur_id'],
                    "type": cap['type'],
                    "parcelle": cap['parcelle'],
                    "user_id": cap['user_id'],
                    "valeur": val,
                    "unite": plage['unite'],
                    "timestamp": ts
                })

            if mesures:
                db[COLLECTION_MESURES].insert_many(mesures)
                print(f"[SIMULATOR] {len(mesures)} mesures insérées à {ts.strftime('%H:%M:%S')}")

        except Exception as e:
            print(f"[SIMULATOR] Erreur: {e}")

        time.sleep(SIMULATION_INTERVAL)
