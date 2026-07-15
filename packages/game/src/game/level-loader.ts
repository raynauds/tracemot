// Chargement runtime des grilles d'un mode : lit le JSON prégénéré
// (public/levels/<modeId>.json) produit hors-ligne par le studio. Le cache
// mémorise la PROMESSE (et non le résultat) pour dédupliquer deux ouvertures
// simultanées ; un échec est purgé pour autoriser une nouvelle tentative.

import type { ModeId, ModeLevels } from "@tracemot/core";

const cache = new Map<ModeId, Promise<ModeLevels>>();

export async function loadModeLevels(modeId: ModeId): Promise<ModeLevels> {
  let pending = cache.get(modeId);
  if (!pending) {
    pending = fetchModeLevels(modeId);
    // Un échec ne doit pas empoisonner le cache : on retente au prochain appel.
    pending.catch(() => cache.delete(modeId));
    cache.set(modeId, pending);
  }
  return pending;
}

async function fetchModeLevels(modeId: ModeId): Promise<ModeLevels> {
  const url = `levels/${modeId}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Tracemot : niveaux du mode « ${modeId} » introuvables (${url} : ` +
        `${res.status})`,
    );
  }
  const data = (await res.json()) as ModeLevels;
  if (!data || data.modeId !== modeId || !data.levels) {
    throw new Error(`Tracemot : ${url} invalide (modeId ou levels manquant)`);
  }
  return data;
}
