// =====================================================================
//  QS - Cours de bourse et metriques de valorisation
//
//  Les depots SEC ne contiennent aucun prix : c'est la seule donnee du
//  site qui vienne d'ailleurs. Le worker la normalise, quel que soit le
//  fournisseur, en {devise, points:[{t, cloture}]}.
//
//  Le cours retenu pour les ratios est le cours BRUT, celui qui cotait ce
//  jour-la -- surtout pas le cours ajuste des splits.
//
//  La raison : EDGAR conserve les chiffres TELS QUE PUBLIES a l'epoque.
//  L'EPS d'Apple pour 2011 y vaut 27,68 dollars, sa valeur pre-split. Le
//  diviser par un cours ajuste (environ 11 dollars) donnait un PER de 0,4
//  au lieu de 14. Prix et resultat doivent etre du meme millesime.
//
//  Le cours ajuste reste disponible sous la cle `ajuste` : c'est celui
//  qu'il faut pour tracer une performance boursiere, pas un ratio.
//
//  Ce que le prix debloque : capitalisation, PER, P/FCF, rendement du
//  FCF, EV/EBIT -- soit tout le pilier Value, jusqu'ici hors de portee.
// =====================================================================

import { workerUrl } from "./qs-settings.js";
import { decoderCle } from "./qs-chart-edgar.js";

const cache = new Map();

/**
 * Historique de cours d'un symbole.
 * @returns {{devise, fournisseur, points:[{t, cloture}]}}
 */
export async function coursHistorique(ticker, { plage = "20y", pas = "1mo" } = {}) {
  // le quotidien n'est pas servi sur 20 ans : on borne pour ne pas se faire
  // renvoyer une reponse vide
  if (pas === "1d" && parseInt(plage, 10) > 10) plage = "10y";
  const cle = `${ticker}|${plage}|${pas}`;
  if (cache.has(cle)) return cache.get(cle);
  const base = workerUrl();
  if (!base) throw new Error("No relay configured.");

  const promesse = (async () => {
    const r = await fetch(`${base}/prix/${encodeURIComponent(ticker)}?range=${plage}&interval=${pas}`);
    if (!r.ok) throw new Error(`Price unavailable for ${ticker} (${r.status})`);
    const d = await r.json();
    if (d.erreur) throw new Error(d.erreur);
    if (!d.points || !d.points.length) throw new Error(`No price history for ${ticker}`);
    return d;
  })();

  cache.set(cle, promesse);
  try { return await promesse; } catch (e) { cache.delete(cle); throw e; }
}

/** Cle de periode d'une date ISO, alignee sur les series comptables. */
function clePeriode(iso, trimestriel) {
  const d = new Date(`${iso}T00:00:00Z`);
  const an = d.getUTCFullYear();
  return trimestriel ? `${an}Q${Math.floor(d.getUTCMonth() / 3) + 1}` : String(an);
}

/**
 * Cours ramene aux memes cles de periode que les series comptables.
 * On retient la DERNIERE cotation de chaque periode : un ratio de
 * valorisation se lit a la cloture, pas en moyenne.
 */
export function serieCours(historique, mode) {
  const trimestriel = mode !== "annuel";
  const serie = {};
  for (const p of historique.points) {
    serie[clePeriode(p.t, trimestriel)] = p.cloture;
  }
  return serie;
}

/** Cours au pas natif du fournisseur, clefs = dates ISO. */
export function serieCoursDatee(historique) {
  const serie = {};
  for (const p of historique.points) serie[p.t] = p.cloture;
  return serie;
}

/**
 * Derniere valeur comptable connue a une date donnee.
 *
 * Le cours bouge tous les jours, le denominateur d'un ratio ne change qu'au
 * rythme des publications : un PER quotidien, c'est le cours du jour divise
 * par le dernier BPA TTM publie. La serie comptable devient donc un escalier.
 *
 * On date une periode a sa CLOTURE. Le marche ne connait le chiffre qu'a la
 * publication, quelques semaines plus tard : sur ces quelques semaines, le
 * ratio affiche utilise un resultat que personne n'avait encore.
 */
function escalier(serieComptable) {
  const bornes = Object.keys(serieComptable).map((cle) => {
    const m = cle.match(/^(\d{4})Q([1-4])$/);
    const fin = m
      ? Date.UTC(Number(m[1]), Number(m[2]) * 3, 0)          // fin du trimestre
      : Date.UTC(Number(cle), 11, 31);                        // fin de l'annee
    return { fin, valeur: serieComptable[cle] };
  }).sort((a, b) => a.fin - b.fin);

  return (dateIso) => {
    const t = new Date(`${dateIso}T00:00:00Z`).getTime();
    let valeur = null;
    for (const b of bornes) {
      if (b.fin > t) break;
      valeur = b.valeur;
    }
    return valeur;
  };
}

// ---------------------------------------------------------------------
// Splits : ramener les donnees comptables sur la base d'aujourd'hui
// ---------------------------------------------------------------------
/**
 * Facteur de split cumule a appliquer a chaque periode.
 *
 * Yahoo renvoie un cours DEJA retraite des splits, alors qu'EDGAR conserve
 * les chiffres tels que publies a l'epoque. Diviser l'un par l'autre donnait
 * un PER de 0,4 pour Apple en 2011 au lieu de 14.
 *
 * Un split se repere sans ambiguite dans le nombre d'actions : il saute d'un
 * coup (x7,07 chez Apple en 2012, x3,81 en 2018) alors qu'une emission
 * ordinaire fait quelques pourcents. On remonte donc la serie a l'envers en
 * accumulant ces sauts : chaque periode recoit le produit des splits
 * intervenus APRES elle.
 *
 * @returns {Object} {periode: facteur}, 1 pour les periodes recentes
 */
const RATIOS_USUELS = [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30, 50];

/**
 * Un split est toujours un rapport simple (2:1, 4:1, 7:1...). Le ratio brut
 * observe dans le nombre d'actions melange le split et les rachats de la
 * periode : chez Apple on lit 7,07 pour un 7:1 et 3,81 pour un 4:1. On se
 * cale donc sur le rapport usuel le plus proche, a 15 % pres.
 */
function arrondirSplit(ratio) {
  let meilleur = ratio, ecart = Infinity;
  for (const r of RATIOS_USUELS) {
    const e = Math.abs(ratio - r) / r;
    if (e < ecart && e <= 0.15) { ecart = e; meilleur = r; }
  }
  return meilleur;
}

export function facteursSplit(serieActions, seuil = 1.5) {
  const cles = Object.keys(serieActions).sort();
  const facteurs = {};
  let cumul = 1;
  for (let i = cles.length - 1; i >= 0; i--) {
    facteurs[cles[i]] = cumul;
    if (i > 0) {
      const ratio = serieActions[cles[i]] / serieActions[cles[i - 1]];
      // seuls les bonds francs sont des splits ; une croissance normale du
      // nombre d'actions ne depasse pas quelques pourcents par periode
      if (ratio >= seuil) cumul *= arrondirSplit(ratio);
    }
  }
  return facteurs;
}

const appliquer = (serie, facteurs, sens) => {
  const out = {};
  for (const k of Object.keys(serie)) {
    const f = facteurs[k] || 1;
    out[k] = sens === "multiplier" ? serie[k] * f : serie[k] / f;
  }
  return out;
};

// ---------------------------------------------------------------------
// Metriques de valorisation
// ---------------------------------------------------------------------
/**
 * Definitions des metriques qui ont besoin du cours.
 *   besoins : series comptables necessaires, dans le mode courant
 *   calc    : (cours, series) -> {periode: valeur}
 */
export const METRIQUES_VALO = {
  prix: {
    nom: "Share price", cat: "Valuation", unite: "money", graph: "line",
    formule: "Closing price at the end of each period, as quoted at the time",
    besoins: [],
    calc: (cours) => ({ ...cours }),
  },
  market_cap: {
    nom: "Market capitalisation", cat: "Valuation", unite: "money", graph: "line",
    formule: "Share price x shares outstanding at the period end",
    note: "Shares OUTSTANDING at the date, not the weighted average diluted count. A market "
      + "capitalisation is read at an instant; a weighted average spans the period and lags "
      + "buybacks by a few percent. Falls back to the diluted count where the outstanding "
      + "figure is missing.",
    besoins: ["actions_circulation", "shares_diluted"],
    calc: (cours, s) => croiser(cours, s.actions, (p, n) => p * n),
  },
  per: {
    nom: "P/E ratio", cat: "Valuation", unite: "ratio", graph: "line",
    formule: "Share price / diluted EPS",
    note: "Negative or near-zero earnings make the ratio meaningless: those periods are dropped.",
    besoins: ["eps_diluted"],
    calc: (cours, s) => croiser(cours, s.eps_diluted, (p, e) => (e > 0 ? p / e : null)),
  },
  p_fcf: {
    nom: "P/FCF ratio", cat: "Valuation", unite: "ratio", graph: "line",
    formule: "Market capitalisation / free cash flow",
    note: "Undefined on a negative free cash flow.",
    besoins: ["actions_circulation", "shares_diluted", "fcf"],
    calc: (cours, s) => croiser3(cours, s.actions, s.fcf,
      (p, n, f) => (f > 0 ? (p * n) / f : null)),
  },
  fcf_yield: {
    nom: "FCF yield (%)", cat: "Valuation", unite: "pct", graph: "line",
    formule: "Free cash flow / market capitalisation x 100",
    besoins: ["actions_circulation", "shares_diluted", "fcf"],
    calc: (cours, s) => croiser3(cours, s.actions, s.fcf,
      (p, n, f) => (p * n ? (f / (p * n)) * 100 : null)),
  },
  ev_ebit: {
    nom: "EV / EBIT", cat: "Valuation", unite: "ratio", graph: "line",
    formule: "(Market cap + interest-bearing debt - cash and short-term investments) / operating income",
    note: "Debt and cash use the same definitions as ROIC: the full interest-bearing debt, "
      + "including finance leases and commercial paper, and cash extended to short-term "
      + "investments. Undefined on a negative operating income.",
    besoins: ["shares_diluted", "operating_income", "lt_debt", "dette_ct_totale",
      "dette_lt_courante", "emprunts_ct", "billets_tresorerie", "effets_payer",
      "loyer_fin_ct", "loyer_fin_lt", "cash", "placements_ct", "actions_circulation"],
    calc: (cours, s) => {
      const out = {};
      const v = (serie, k) => {
        const x = serie ? serie[k] : null;
        return x == null || !isFinite(x) ? 0 : x;
      };
      for (const k of Object.keys(cours)) {
        const n = s.actions[k], ebit = s.operating_income[k];
        if (!n || !ebit || ebit <= 0) continue;
        // meme garde-fou anti-double-compte que le ROIC : l'agregat de dette
        // courante contient deja ses composants
        let courante = s.dette_ct_totale && s.dette_ct_totale[k] != null
          ? s.dette_ct_totale[k]
          : v(s.dette_lt_courante, k)
            + (s.emprunts_ct && s.emprunts_ct[k] != null ? s.emprunts_ct[k]
              : v(s.billets_tresorerie, k) + v(s.effets_payer, k));
        const dette = v(s.lt_debt, k) + courante + v(s.loyer_fin_ct, k) + v(s.loyer_fin_lt, k);
        const liquide = v(s.cash, k) + v(s.placements_ct, k);
        const ev = cours[k] * n + dette - liquide;
        if (ev > 0) out[k] = ev / ebit;
      }
      return out;
    },
  },
};

function croiser(a, b, f) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (b[k] === undefined || b[k] === null) continue;
    const v = f(a[k], b[k]);
    if (v !== null && isFinite(v)) out[k] = v;
  }
  return out;
}

function croiser3(a, b, c, f) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (b[k] == null || c[k] == null) continue;
    const v = f(a[k], b[k], c[k]);
    if (v !== null && isFinite(v)) out[k] = v;
  }
  return out;
}

/** Une metrique a-t-elle besoin du cours ? */
export const besoinDeCours = (cle) => cle in METRIQUES_VALO;

/**
 * Serie d'une metrique de valorisation.
 * @param construire  (cleMetrique) => serie, pour les composants comptables
 */
/**
 * Un ratio de valorisation ne vaut que si le cours et les comptes sont
 * libelles dans la MEME monnaie.
 *
 * Ce n'est pas le cas des deposants etrangers cotes aux Etats-Unis : ASML
 * cote en dollars et publie en euros, Novo Nordisk en dollars et couronnes
 * danoises, TSMC en dollars et dollars taiwanais. Un PER calcule dessus
 * etait faux du taux de change -- d'un facteur 6,5 chez Novo, 32 chez TSMC --
 * et faux une seconde fois du ratio de l'ADR, un certificat TSMC representant
 * cinq actions ordinaires.
 *
 * Convertir demanderait une serie de taux de change historiques et le ratio
 * d'ADR de chaque societe, dont je ne dispose pas. On refuse donc de
 * calculer plutot que d'afficher un nombre faux.
 */
function devisesCompatibles(deviseCours, devisesComptes) {
  const comptes = [...(devisesComptes || [])].filter(Boolean);
  if (!deviseCours || !comptes.length) return true;   // rien a comparer
  return comptes.every((d) => d === deviseCours);
}

export async function serieValo(cleMetrique, ticker, mode, construire,
  { pas = "1mo", devisesComptes = null } = {}) {
  const def = METRIQUES_VALO[cleMetrique];
  if (!def) return { serie: {}, devise: null };

  // « periode » n'est pas un pas de cotation : c'est une consigne de CLEFS.
  // On interroge toujours le fournisseur avec un pas reel, sinon l'appel part
  // avec interval=periode et echoue.
  const dateNatifDemande = pas !== "periode";
  const hist = await coursHistorique(ticker, { pas: dateNatifDemande ? pas : "1mo" });
  // Au pas natif (quotidien, hebdo, mensuel) les cles sont des DATES et les
  // series comptables sont echantillonnees en escalier. Sinon on reste sur
  // les cles de periode comptable.
  const dateNatif = dateNatifDemande;
  const cours = dateNatif ? serieCoursDatee(hist) : serieCours(hist, mode);
  const s = {};
  for (const b of def.besoins) s[b] = construire(b);

  // Le cours est deja sur la base d'aujourd'hui : on y ramene les series
  // par action avant tout rapprochement.
  //
  // Quand la metrique n'a pas besoin du nombre d'actions -- le cours seul,
  // le PER -- on le construit quand meme, uniquement pour en deduire les
  // facteurs de split. Cette construction-la est SILENCIEUSE : ses tags et
  // ses alertes n'ont rien a faire dans l'audit d'une metrique qui ne s'en
  // sert pas. Sans quoi « Share price » signalait des incoherences portant
  // en realite sur une serie d'actions.
  //  Les facteurs de split se lisent dans les SAUTS du nombre d'actions. Il
  //  faut donc la serie la mieux fournie : un saut situe entre deux points
  //  manquants est un saut invisible.
  //
  //  Alphabet en donne l'exemple. Sa moyenne diluee ne compte que quatre
  //  exercices, tous posterieurs au fractionnement par vingt de juillet
  //  2022 : aucun saut a voir, donc aucun retraitement. Les cours de Yahoo
  //  etant deja ajustes du split et les nombres d'actions restant tels que
  //  publies, la capitalisation d'avant 2022 sortait vingt fois trop
  //  petite, et le rendement du FCF affichait 66 % pour 2014 au lieu de
  //  2,5 %. Le nombre d'actions en circulation, lui, couvre douze
  //  exercices et laisse le saut parfaitement lisible.
  //  Un nombre d'actions ne s'evapore pas. Coca-Cola en publie de
  //  pratiquement nuls sur cinq trimestres de 2017 et 2018 -- valeur
  //  aberrante ou changement d'echelle dans le depot. La capitalisation
  //  tombait alors a zero et le rendement du FCF affichait 1 140 334 %.
  //
  //  Le seuil est volontairement tres bas -- un millieme du maximum de la
  //  serie -- pour ne jamais mordre sur un fractionnement, qui divise par
  //  vingt au plus, ni sur les rachats les plus agressifs, qui reduisent le
  //  nombre d'actions d'un facteur sept sur vingt ans. Mille fois moins,
  //  ce n'est plus la meme grandeur.
  const nettoyer = (serie) => {
    const vals = Object.values(serie || {}).filter((v) => v > 0 && isFinite(v));
    if (!vals.length) return serie;
    const plancher = Math.max(...vals) / 1000;
    const r = {};
    for (const [k, v] of Object.entries(serie)) if (v >= plancher && isFinite(v)) r[k] = v;
    return r;
  };

  if (s.shares_diluted) s.shares_diluted = nettoyer(s.shares_diluted);
  if (s.actions_circulation) s.actions_circulation = nettoyer(s.actions_circulation);

  const dilueBrut = nettoyer(s.shares_diluted || construire("shares_diluted", true));
  const circBrut = nettoyer(s.actions_circulation || construire("actions_circulation", true));
  const nb = (o) => Object.keys(o || {}).length;
  const actionsBrutes = nb(circBrut) > nb(dilueBrut) ? circBrut : dilueBrut;
  const facteurs = facteursSplit(actionsBrutes);
  if (s.shares_diluted) s.shares_diluted = appliquer(s.shares_diluted, facteurs, "multiplier");
  if (s.actions_circulation) s.actions_circulation = appliquer(s.actions_circulation, facteurs, "multiplier");
  if (s.eps_diluted) s.eps_diluted = appliquer(s.eps_diluted, facteurs, "diviser");

  /**
   * Nombre d'actions retenu pour la capitalisation : celles en CIRCULATION a
   * la date. On retombe sur la moyenne ponderee diluee quand la donnee
   * manque, ou quand elle s'en ecarte de plus d'un quart -- signe que le tag
   * ne couvre qu'une classe d'actions chez un emetteur multi-classes, auquel
   * cas il sous-estime gravement la capitalisation.
   */
  if (def.besoins.includes("actions_circulation")) {
    const circ = s.actions_circulation || {};
    const dil = s.shares_diluted || {};
    s.actions = {};
    for (const k of new Set([...Object.keys(circ), ...Object.keys(dil)])) {
      const c = circ[k], d = dil[k];
      if (c != null && isFinite(c) && (d == null || (c / d > 0.75 && c / d < 1.25))) s.actions[k] = c;
      else if (d != null && isFinite(d)) s.actions[k] = d;
    }
  }

  if (dateNatif) {
    // chaque serie comptable devient une fonction du temps, evaluee aux dates
    // de cotation
    const marches = {};
    for (const b of def.besoins) marches[b] = escalier(s[b]);
    for (const b of def.besoins) {
      const projetee = {};
      for (const d of Object.keys(cours)) {
        const v = marches[b](d);
        if (v !== null) projetee[d] = v;
      }
      s[b] = projetee;
    }
  }

  // Les postes de bilan et les flux ne tombent pas toujours sur la meme
  // periode que la derniere cotation : on ne garde que les periodes ou tout
  // est present, plutot que de rapprocher des dates qui ne se correspondent pas.
  // Le controle se fait APRES construction des composants : c'est a ce
  // moment que la devise des comptes est connue.
  if (!devisesCompatibles(hist.devise, devisesComptes)) {
    return {
      serie: {}, devise: hist.devise, fournisseur: hist.fournisseur,
      erreur: `share price is quoted in ${hist.devise} while the accounts are reported in `
        + `${[...devisesComptes].join(", ")}. Converting would need an exchange-rate history and `
        + "the ADR ratio, so the ratio is not computed rather than shown wrong.",
    };
  }

  const serie = def.calc(cours, s);
  void decoderCle;
  return { serie, devise: hist.devise, fournisseur: hist.fournisseur };
}
