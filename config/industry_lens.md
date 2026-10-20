# Industry Lens — Insurance (real situations only)

Every LinkedIn post and carousel opens on a **real, documented situation** in the insurance world and maps today's Databricks feature onto it. This file holds: the per-run procedure, the research rules, the verified situation bank, the feature→workflow mapping, background on how insurance operations work, and the `carousel.json` schema. (Reels do NOT use this file.)

## Per-run procedure

1. **Classify the feature** with the mapping table below. Note the insurance workflows it genuinely touches.
2. **Pick a situation type** that differs from yesterday's — check the last five runs' `sources.md`: `catastrophe` · `regulatory deadline` · `fraud` · `market event` · `public case study`.
3. **Pick a situation** from the verified bank (rotate region; never the same event within 30 days) **or research a new one** (rules below). The situation must create the workload the feature serves — if the link is forced, pick a different situation or a smaller true mapping.
4. **Write the seven beats** (voice_linkedin.md): situation → workload → the catch/before → feature → after → beyond + caveats → question.
5. **Produce three files:** `linkedin.md` (caption), `carousel.json` (13 slides, schema at the end), `sources.md` (Primary / Supporting / Honesty notes / Re-verify before publishing).

## Research rules (for any number that appears anywhere)

- **No number without a link.** Every figure in the caption, on a slide, or in the honesty note has a URL in `sources.md`.
- **Prefer official bodies:** state insurance regulators (FLOIR, TDI), IRDAI, EIOPA/EBA, NAIC, industry associations (GDV, ICA, III), catastrophe pools (TCIP). News is fine when it reports the official figure — attribute to the body, link the article.
- **Running totals carry an "as of" date.** Catastrophe counts rise for a year; say "as of November 2022".
- **Estimates are labelled.** Modeled industry losses (Karen Clark & Co., Moody's RMS, PERILS) and modeled fraud costs are "estimates", never "claims".
- **Conflicting sources:** use the official one, mention the conflict in the honesty note.
- **Never attribute a workflow or constraint to a named company.** Describe how insurers generally operate; the honesty note says so.
- **Named organisations** only when they are public institutions or the source names them. **Never the author's employer.**
- **Re-verify on publish day:** feature status (GA / preview) and the headline figure.

## Verified situation bank (checked 2026-10-15 — re-open the link before using)

| # | Situation | When / where | Figures (as of) | Sources | Type · region | Features it naturally fits |
|---|---|---|---|---|---|---|
| 1 | **Hurricane Ian** | 28 Sep 2022, Florida | ~449,000 claims within two weeks (11 Oct 2022); 640,496 claims, $10.27B insured losses, Lee County 229,259 (FLOIR, late Nov 2022) | [Insurance Journal](https://www.insurancejournal.com/news/southeast/2022/10/11/689201.htm) · [FLOIR via Reinsurance News](https://www.reinsurancene.ws/hurricane-ian-claims-data-shows-cost-to-insurers-of-almost-10-3bn-floir/) | catastrophe · US | serverless/compute, private networking, streaming FNOL, claims-triage ML, cost spikes |
| 2 | **Hurricane Milton** | Oct 2024, Florida | ~230,000 claims within two weeks (22 Oct 2024); 385,146 claims, ~$5.6B est. insured losses (FLOIR, as of 9 Dec 2025) | [FLOIR Milton page](https://floir.gov/home/hurricane-milton) · [Claims Journal](https://www.claimsjournal.com/news/national/2024/10/22/326992.htm) | catastrophe · US | Lakeflow Connect FNOL ingestion, dashboards/Genie, model serving at surge |
| 3 | **Winter Storm Uri** | Feb 2021, Texas | 456,531 claims / $8.2B expected (TDI, 31 Mar 2021) → 510,772 claims / ~$11.2B ultimate incl. $822M IBNR reserve (TDI, 31 Mar 2022) | [TDI report](https://www.tdi.texas.gov/reports/documents/feb2021-tx-winter-weather-summary-mar2022.pdf) · [Insurance Journal](https://www.insurancejournal.com/news/southcentral/2021/09/24/633569.htm) | catastrophe · US | reserving / loss development (Delta time travel, performance), batch SLAs, IBNR modelling |
| 4 | **Ahr Valley floods ("Bernd")** | Jul 2021, Germany | GDV early estimate €4.5–5.5bn; ~40,000 vehicles damaged; ~€8.75bn settled per GDV's five-year retrospective | [GDV five years on](https://www.gdv.de/gdv-en/media/five-years-after-the-ahr-valley-floods-insurers-warn-against-a-false-sense-of-security-203598) · [Reinsurance News](https://www.reinsurancene.ws/insured-losses-from-germany-floods-rise-to-an-estimated-e4-5-5-5bn-says-gdv/) | catastrophe · Europe | Delta Sharing with reinsurers, geospatial, cat-exposure roll-ups |
| 5 | **Kahramanmaraş earthquakes** | 6 Feb 2023, Türkiye | TCIP settled ~600,000 claims within four months; PERILS insured property loss TRY 116.9bn (~$6.2bn) | [TCIP in 2023](https://yillik.kizilayakademi.org.tr/en/compulsory-earthquake-insurance-tcip-in-2023/) · [PERILS via Insurance Business](https://www.insurancebusinessmag.com/asia/news/catastrophe/insured-losses-from-turkeys-2023-earthquake-estimated-at-try-116-9-billion-500211.aspx) | catastrophe · Middle East | document/photo AI at intake, payments at scale, agents over claim files |
| 6 | **Black Summer bushfires** | 2019–20, Australia | 38,416 claims, A$2.33bn (ICA, Aug 2020); "nearly 39,000 claims, >A$2.3bn" once contained | [ICA catastrophe report](https://insurancecouncil.com.au/wp-content/uploads/2021/09/ICA008_CatastropheReport_6.5_FA1_online.pdf) · [insuranceNEWS](https://www.insurancenews.com.au/local/black-summer-more-than-70-of-claims-paid-despite-covid) | catastrophe · APAC | property exposure analytics, geospatial, underinsurance analysis, dashboards |
| 7 | **Cyclone Michaung / Chennai floods** | Dec 2023, Tamil Nadu, India | early insured-loss estimate ₹1,500–2,000 crore vs ~₹12,000 crore economic loss; claims running 30–35% below the 2015 Chennai floods (~₹4,800 crore insurer hit) — early/partial figures, say so | [Asia Insurance Post](https://asiainsurancepost.com/archives/46274) · [Northlines](https://thenorthlines.com/insurance-claims-drop-30-35-during-chennai-floods-compared-to-2015/) | catastrophe · India | motor-claims surge, mobile FNOL ingestion, dashboards; compare-to-2015 analytics |
| 8 | **IFRS 17 go-live** | annual periods from 1 Jan 2023, global | WTW 2021 survey of 312 insurers: $15–20bn industry implementation cost; $175–200m each for the 24 largest multinationals; 10,000–15,000 FTEs | [Insurance Journal](https://www.insurancejournal.com/news/international/2021/06/08/617807.htm) · [The Actuary](https://www.theactuary.com/news/2021/06/07/ifrs-17-cost-insurers-20bn) | regulatory · global | Unity Catalog lineage, Delta time travel, Workflows for close, Lakehouse Federation to finance systems |
| 9 | **DORA applies** | 17 Jan 2025, EU | insurers, reinsurers, intermediaries in scope; register of information on all ICT third-party arrangements (Art. 28(3)) at entity/sub-consolidated/consolidated level | [EIOPA](https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en) · [EBA](https://eba.europa.eu/activities/direct-supervision-and-oversight/digital-operational-resilience-act/preparation-dora-application) | regulatory · Europe | system tables, audit logs, governance/tags, security & compliance features, vendor dependency reporting |
| 10 | **NAIC AI Model Bulletin** | adopted 4 Dec 2023, US | ~25 states + DC adopted as of the Aug 2026 NAIC map; CA/CO/NY/TX run their own AI frameworks | [Quarles](https://www.quarles.com/newsroom/publications/nearly-half-of-states-have-now-adopted-naic-model-bulletin-on-insurers-use-of-ai) · [InsureAI Wire tracker](https://insureaiwire.com/states/) | regulatory · US | MLflow model governance, evaluation, lineage, AI Gateway, explainability |
| 11 | **Cost of insurance fraud (US)** | 2022 study, US | $308.6bn per year (modeled); life $74.7bn, Medicare/Medicaid $68.7bn, P&C $45bn; ~$932 per person | [Coalition Against Insurance Fraud](https://insurancefraud.org/) · [Reinsurance News](https://www.reinsurancene.ws/insurance-fraud-costs-308-6bn-annually-coalition-reports/) · [III](https://www.iii.org/fact-statistic/facts-and-statistics-insurance-fraud) | fraud · US | fraud scoring (Model Serving, Feature Store), vector search over claim notes, agents, graph features |
| 12 | **IRDAI Information & Cyber Security Guidelines** | issued 24 Apr 2023, India | CISO + Information Security Risk Management Committee; annual audit report to IRDAI within 90 days of FY end; CERT-In 6-hour incident reporting | [Cyril Amarchand primer](https://corporate.cyrilamarchandblogs.com/2024/01/primer-on-irdai-information-and-cyber-security-guidelines-2023/) · [Chambers](https://chambers.com/articles/irdais-information-and-cyber-security-guidelines) | regulatory · India | private networking, encryption, audit logs, compliance profiles, access controls |

**Gaps to fill as they come up** (research at draft time, then add here with links): a UK/Lloyd's situation (e.g., Lloyd's Blueprint Two), Japan typhoon (Hagibis 2019, GIAJ figures), a public Databricks insurance customer story, a telematics/UBI market figure, a health-insurance claims-adjudication figure, an Indian motor-fraud or IIB figure.

## Mapping table — feature category → insurance workflows → the "before"

| Feature category (from the source) | Workflows to choose from | What exists today |
|---|---|---|
| Serverless compute, networking, private connectivity | claims surge after a catastrophe; nightly actuarial batch; models that must reach a database behind the firewall | per-system private endpoints/proxies; weeks-long network tickets; shifting IP ranges to allowlist |
| Unity Catalog — governance, lineage, filters, ABAC, tags | regulator asks "where did this number come from" (IFRS 17, Solvency II, NAIC); PII/PHI in health claims; DORA register | lineage rebuilt by hand for audits; table copies per team; masking in views nobody maintains |
| Delta Lake performance — Photon, liquid clustering, predictive optimization | loss triangles over a decade of policies; renewal batch pricing; claims history lookups | all-night quarter-end jobs; partition schemes for one query pattern |
| Lakeflow Connect, CDC, ingestion | Guidewire / SQL Server / Oracle / mainframe → lakehouse; broker bordereaux; near-real-time FNOL | nightly extracts missing the morning dashboard; hand-built CDC |
| Lakeflow Pipelines, streaming | telematics events; FNOL streams; catastrophe alerts; fraud scoring at intake | stitched micro-batches; late data breaking aggregates |
| Delta Sharing, Clean Rooms, Marketplace | ceding data to reinsurers; MGAs and brokers; third-party data (weather, property, vehicle); fraud consortia | emailed CSV bordereaux; SFTP drops outside governance |
| MLflow, Model Serving, Feature Store, model governance | fraud score at FNOL; severity models; pricing GLMs; lapse propensity; NAIC AI bulletin compliance | unreproducible notebooks; regulators asking for version history and explainability |
| AI agents, Agent Bricks, Mosaic AI, vector search | commercial submission intake from ACORD PDFs and SOVs; claim-note summarisation; policy-wording Q&A; subrogation hidden in notes | underwriters re-keying PDFs; adjusters reading hundreds of pages |
| Lakebase / operational serving | agent portals; claims status apps; quote-time lookups | separate OLTP databases synced by batch |
| Databricks SQL, AI/BI, Genie | loss ratio and combined ratio dashboards; claims leakage; actuaries self-serving | extract-to-Excel culture; one BI team as bottleneck |
| Workflows, Jobs, Apps | month-end close; regulatory submissions; renewal cycles | brittle schedulers; manual reruns |
| Cost, FinOps, system tables | chargeback by line of business; catastrophe-season compute spikes; DORA ICT reporting | nobody knows which line the bill belongs to |
| Developer tooling — DABs, Git, CI/CD | actuarial teams moving from SAS/Excel to notebooks; CI/CD for pricing models | models promoted by copy-paste |
| Security & compliance — encryption, compliance profiles, audit logs | health claims PHI; card data in billing; IRDAI/DORA evidence | separate hardened environments; audit evidence assembled by hand |

## How insurance operations generally work (background for honest, generic descriptions)

| Stage | What happens | Data | Common systems |
|---|---|---|---|
| Distribution & quoting | agents/brokers/direct quote and bind | quote logs, rating factors, third-party enrichment | portals, rating engines |
| Underwriting | assess and price risk | submissions (emails, PDFs, spreadsheets), ACORD forms, Statements of Values, exposure data | underwriting workbenches |
| Policy administration | system of record: issue, endorse, renew | policy, coverage, premium; nightly extracts | Guidewire PolicyCenter, Duck Creek, Majesco, Sapiens, mainframe |
| Claims | FNOL → triage → adjuster → reserve → pay → recover | claim notes, photos, estimates, reserves, fraud referrals (SIU), subrogation | Guidewire ClaimCenter, call-centre platforms |
| Actuarial & reserving | estimate ultimate losses, price products | loss triangles, IBNR, pricing models | SAS, R, Excel, notebooks |
| Reinsurance | cede part of the risk | treaties, cessions, bordereaux, cat-model outputs, PML | spreadsheets, cat models (Moody's RMS, Verisk) |
| Finance & regulatory | close, report | IFRS 17 cohorts/CSM, Solvency II, NAIC statutory, IRDAI returns, lineage | GL, reporting warehouses |
| Telematics & IoT | usage-based insurance, sensors | high-frequency driving events, alerts | streaming platforms |

**Glossary for inline definitions:** FNOL — first notice of loss, the moment a claim is reported · SIU — special investigations unit, the fraud team · IBNR — incurred but not reported · Loss triangle — how a year's claims develop over later years · Bordereau(x) — periodic premium/claims report to a reinsurer · Cession — the share of risk passed to a reinsurer · PML — probable maximum loss · SOV — statement of values · ACORD forms — standard insurance application forms · UBI — usage-based insurance · Combined ratio — losses plus expenses as a share of premium · CSM — contractual service margin (IFRS 17) · MGA — managing general agent · Subrogation — recovering a paid claim from the responsible third party.

## `carousel.json` schema (13 slides, Style 25 "Front Page")

Fixed slide types in fixed order. Keep text short: headline ≤ 9 words, bullet ≤ 12 words, note ≤ 20 words. No emojis on slides. Exact figures on slides, rounded in the caption.

```json
{
  "issue": "lens-2026-10-15",
  "date_label": "15 OCT 2026",
  "topic_tag": "PRIVATE NETWORK GATEWAY",
  "slides": [
    { "n": 1,  "type": "cover",          "kicker": "PRIVATE NETWORK GATEWAY", "stat": "449,000", "headline": "insurance claims in two weeks.", "deck": "What Hurricane Ian did to claims teams — and the Databricks feature that would have changed one part of it." },
    { "n": 2,  "type": "bullets",        "kicker": "02 · WHAT HAPPENED", "headline": "28 September 2022. Hurricane Ian hits Florida.", "bullets": [ { "text": "~449,000 claims within two weeks", "source": "Insurance Journal, 11 Oct 2022" }, { "text": "640,496 claims · $10.27B insured losses by late November", "source": "Florida OIR" }, { "text": "Lee County alone: 229,259 claims" } ], "note": "These are the state regulator's numbers, not estimates." },
    { "n": 3,  "type": "bullets",        "kicker": "03 · THE WORKLOAD", "headline": "…", "bullets": [ { "text": "…" } ], "note": "…" },
    { "n": 4,  "type": "flow",           "kicker": "04 · THE CATCH", "headline": "…", "steps": [ "…", "…", "…" ], "note": "…" },
    { "n": 5,  "type": "bullets",        "kicker": "05 · BEFORE", "headline": "…", "bullets": [ { "text": "…" } ] },
    { "n": 6,  "type": "feature",        "kicker": "06 · THE FEATURE", "headline": "<feature name>", "status": "PUBLIC PREVIEW ON AZURE · PRIVATE PREVIEW ON AWS", "body": "…", "note": "Databricks blog · October 2026" },
    { "n": 7,  "type": "numbered",       "kicker": "07 · HOW IT WORKS", "headline": "Three steps.", "steps": [ "…", "…", "…" ], "note": "…" },
    { "n": 8,  "type": "cards",          "kicker": "08 · …", "headline": "…", "cards": [ { "title": "…", "body": "…" }, { "title": "…", "body": "…" } ], "note": "…" },
    { "n": 9,  "type": "bullets",        "kicker": "09 · AFTER", "headline": "…", "bullets": [ { "text": "…" } ], "note": "…" },
    { "n": 10, "type": "compare",        "kicker": "10 · SIDE BY SIDE", "headline": "Before vs After", "rows": [ [ "before…", "after…" ] ] },
    { "n": 11, "type": "bullets_caveat", "kicker": "11 · BEYOND CLAIMS", "headline": "…", "bullets": [ { "text": "…" } ], "caveat": "…" },
    { "n": 12, "type": "takeaway",       "kicker": "12 · TAKEAWAY", "headline": "…", "body": "<the question>", "ctas": [ "SAVE THIS", "SHARE WITH YOUR NETWORK OR SECURITY LEAD", "FOLLOW FOR THE DAILY INSURANCE LENS" ] },
    { "n": 13, "type": "sources",        "kicker": "13 · SOURCES", "headline": "Where this came from.", "sources": [ { "title": "…", "meta": "Publisher · date" } ], "honesty_note": "…" }
  ]
}
```

Slide types and what the renderer expects: `cover` (stat, headline, deck) · `bullets` (bullets[], optional note; each bullet may carry a small `source` label) · `flow` (3 bordered steps joined by ↓) · `feature` (headline, status line, bordered body card, note) · `numbered` (3 big numerals + text) · `cards` (2 side-by-side cards + note) · `compare` (two columns, 4 rows) · `bullets_caveat` (bullets + bordered CAVEAT box) · `takeaway` (headline, body, 3 CTA pills) · `sources` (numbered list + bordered HONESTY NOTE box). Slide 1 stat must be a real figure from the situation; if the situation has no single headline number, use a short dated fact ("17 JAN 2025") in the stat slot.
