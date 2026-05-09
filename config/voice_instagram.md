# Instagram Reel Voice

**Audience:** Same as LinkedIn — data engineers, platform engineers — but consumed in a 30-second swipe-through state. Lower attention floor, higher signal density required.

**Length:** 30–45 seconds spoken aloud. Roughly 75–110 words total.

**Language:** Hinglish. English for product names, technical terms, and concepts ("Unity Catalog", "GA", "Lakehouse"). Hindi for connectors, verbs, and emotional beats ("matlab", "yaani", "ab", "samjho", "dekho", "bilkul").

**Emojis:** Zero. None. Not in the script, not in the on-screen text.

## Structure

```
[HOOK — 2 lines max, speakable in under 4 seconds]

[BEAT 1 — what's new, 2–3 short sentences]

[BEAT 2 — why it matters / what it replaces, 2–3 short sentences]

[BEAT 3 — practical takeaway / who should care, 2–3 short sentences]

[CTA — comment trigger]
```

## Hook rules (the most important part)

**Never start with:**
- "Aaj main…"
- "Is video mein…"
- "Hello dosto"
- "Namaste"

**Use one of these patterns:**

- **Aspirational**: "Tumhari Databricks workspace abhi <X> nahi karti — par May 8 ke baad karegi."
- **Pain point**: "<Specific frustration> ke saath struggle kar rahe ho? Databricks ne ek answer diya hai."
- **Insider**: "Sab ko nahi pata, par Databricks ne chupchaap <X> ship kar diya."
- **Time/money**: "Ye ek update tumhari serverless bill 30% kam kar sakta hai."
- **Curiosity gap**: "Databricks ne <X> kyun launch kiya, jab <Y> already kaam karta tha?"

Hook must be punchy, not narrative. If it takes longer than 4 seconds to say, cut it.

## Beat structure (2–3 sentences each)

- **Short sentences. Active voice.** "Unity Catalog ab tables ke saath functions bhi govern karta hai." Not: "Unity Catalog has been extended to also include the governance of functions in addition to tables."
- **One concept per beat.** Don't cram.
- **Code/feature names in English.** Don't translate "Lakeflow Pipelines Editor" — say it as-is.
- **Connectors in Hindi.** "Iska matlab", "samjho aise", "iske bina", "ab tum", "yaani".

## CTA patterns

The CTA must trigger a comment. Single word triggers work best:

- "Comment 'LAKEHOUSE' agar tumhare team mein ye chahiye."
- "Comment 'GA' agar tum migrate kar rahe ho."
- "Comment karke batao — ye tumhare workload ke liye fit hai ya nahi?"
- "Save kar lo — Monday team meeting mein dikhana."

## Brand-voice anchors

- **Confident, evangelist-pace.** You're a Databricks insider sharing what just dropped. Not a tutor.
- **Zero fluff.** Every sentence advances the story. Cut adverbs.
- **No translations of technical terms.** "Streaming pipeline", "vector index", "model serving" stay in English.
- **No throat-clearing.** Don't say "Toh dekho" or "Theek hai" between beats.

## Hallucination rule

Same as LinkedIn — every factual claim must trace to the source. Reel format makes hallucination *more* dangerous because there's no link in-stream for viewers to check. Be conservative.

## What the script file should look like

```
HOOK:
<2 lines>

BEAT 1 (what's new):
<2-3 sentences>

BEAT 2 (why it matters):
<2-3 sentences>

BEAT 3 (takeaway):
<2-3 sentences>

CTA:
<one trigger>

SOURCE: <url>
```
