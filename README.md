# Aman
 
**A phone app that helps a village health worker decide whether a sick child needs care at home, a clinic, or a hospital right now. It works without internet, speaks the family's language, and warns the clinic before the child arrives.**
 
Built at HackPSU 2026 by a two-person team, over one long night.
 
## The problem
 
In rural Pakistan and Ethiopia, the first person to see a sick child is often a community health worker with a paper chart, little time, and no doctor within reach. Pneumonia, diarrhoea and other treatable illnesses are still among the leading causes of death for children under five (WHO). The danger is not only the illness. It is the delay: the wrong call at home, a long trip to the wrong place, or a family that cannot afford to go and waits too long.
 
Families hit the same wall from the other side. When a child is sick they have to choose between a health post, a clinic, a public hospital and a private one, with very different costs, and nobody to help them choose.
 
## What Aman does
 
Three people, one connected system.

Aman is the word for peace in both Amharic and Urdu. While We cannot guarantee peace, we can spend 24 hours coding to strive for better healthcare in marginalized areas.
 
**The health worker** opens Aman on a phone, with or without signal. It asks the questions from the WHO child-illness chart in English, Urdu or Amharic, counts breaths with a tap counter, and returns one of three answers: care at home, visit a clinic soon, or go to a hospital now. It explains why, reads the result aloud where the phone has a voice, and produces a printable card for the family with the warning signs that mean "come back immediately". Cases are saved on the phone and sent to the clinic automatically once there is a connection.
 
**The family** can send a voice note in Urdu, Amharic or English to a Telegram bot. The bot understands it, asks a few tap-button questions for anything missing, and replies with the decision in their language. A second button gives cost and travel advice: the right level of care, what it is likely to cost, the cheapest safe way to get there, and the emergency numbers.
 
**The clinic** sees every case live on a dashboard, most urgent and youngest child first, on a map. Staff can see the reasons, pick the nearest clinic with room and the right language, and mark the case as on the way, arrived or closed.
 
## How the decision is made
 
The decision is never left to an AI.
 
- A rule engine (`packages/protocol`) decides, using thresholds taken from the WHO IMCI/IMNCI chart booklet: breathing-rate cutoffs by age, danger signs, cough duration, chest indrawing, stridor.
- Gemini only listens to a voice note and writes down the facts it heard. The same chart rules then decide.
- Missing answers never produce "care at home". The case becomes at least "visit a clinic soon" and is flagged for review.
- A voice note alone can never reach "care at home", because a breath count needs someone beside the child.
- The server recomputes every decision itself and ignores what the phone sent.
- Money never changes urgency. The cost advice runs after the decision is final, and it never recommends a place that cannot treat the case.
## What we built in one night
 
- An offline-first PWA: the app, the rules and the audio model all run on the phone, and cases queue locally until they can sync.
- A live clinic dashboard with routing by distance, language and capacity, and capacity that is returned when a case closes.
- A Telegram bot with Gemini voice understanding, follow-up questions and cost advice in three languages.
- A cost module with sourced estimates for Punjab and Ethiopia, with tests that check it can never recommend care below the level the case needs.
- An on-device cough audio pipeline (log-mel features, a small model, a saliency view), shown as information only.
- Over 130 automated tests, including a table of clinical cases for the decision engine and a parity test that proves the phone and the training code compute identical audio features.
## Scope
 
- Aman is screening support for a trained health worker. It is not a diagnosis.
- Patients, clinics and map points in the demo are invented. Do not enter real patient information.
- The cough score is experimental and display-only. It never changes a decision. The model was trained on generated sounds, not children, and is a working pipeline for future real data.
- Prices are estimates from public sources, labelled as estimates, and meant to be checked locally before paying.
- The shared clinic PIN is demo access control, not production authentication.
## Run it
 
Prerequisites: Node 20 or later and pnpm 10. Python 3.11 or later is only needed to retrain the audio model.
 
```bash
pnpm install
cp .env.example .env     # add GEMINI_API_KEY, TELEGRAM_BOT_TOKEN and DASHBOARD_PIN
pnpm test                # decision table, audio parity, content, server API
pnpm build               # builds the PWA into apps/web/dist
pnpm seed                # optional: a few demo cases for the dashboard
pnpm start               # http://localhost:3000 serves the API and the built app
```
 
For development, `pnpm dev` runs Vite on port 5173 (proxying `/api`) and the server on port 3000 with reload.
 
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Voice-note understanding. Without it the voice features are off and the rest works. |
| `GEMINI_MODEL` | Gemini model used for voice notes. |
| `TELEGRAM_BOT_TOKEN` | Starts the Telegram bot. Run only one copy of the server with the same token. |
| `DASHBOARD_PIN` | PIN for the clinic dashboard. |
| `PORT`, `DATABASE_PATH` | Server port (default 3000) and SQLite file (default `./data/aman.db`). |
 
Phones need an HTTPS address for the microphone and offline mode. Open the app once online, add it to the home screen, and it then works in airplane mode.
 
## Layout
 
```
apps/web           Vite + React PWA: field flow, clinic dashboard, family voice and cost screens
apps/server        Fastify API, SQLite, live updates, Telegram bot, Gemini extraction
packages/types     Shared types and schemas
packages/protocol  Decision engine, cited protocol.json, demo clinics, clinical case tests
packages/audio     Audio features, experimental score, saliency, clip quality checks
packages/content   Bundled text in English, Urdu and Amharic, caregiver card, cost data
ml/                Training code, metrics and the parity fixture
docs/              SAFETY.md, DEMO.md
```
 
## What comes next
 
- Validate the protocol cutoffs against the national Pakistan and Ethiopia chart booklets with clinicians.
- Train the audio model on real recordings with patient-level splits, and test it on children before it influences anything.
- Move the family channel from Telegram to WhatsApp, and link the Telegram reply straight to the cost screen.
- Replace the demo PIN with real sign-in, and add consent and data protection.
- Replace estimated prices with local fee schedules supplied by clinics.