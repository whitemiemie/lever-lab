# Lever Lab

An interactive operant conditioning experiment for phones, made for the PSY 111 Creative Exhibition (2026).
Visitors scan a QR code or tap an NFC tag. First-timers can take the guided tour; returning visitors can skip straight in. Either way they are guided by an on-screen lab partner the whole way:

- **Guided tour** (7 short cards): who B. F. Skinner was, what operant conditioning means, a look at the lever and the feeder
  (try the click), meet Biscuit the rat, why shaping is needed, and the mission.
- **1 · Shape**: teach Biscuit to press the lever by feeding closer and closer moves (turn → walk over → rear up → press).
  The guide shouts NOW the first time, explains mistakes (late feeds, superstitions, old steps), offers "Show me" when you're stuck,
  and a demo if the rat gets full.
- **2 · Schedules**: five trained rats run CRF, FR 5, VR 5, FI 10 s and VI 10 s side by side on one race chart, then a quick quiz.
- **3 · Extinction**: guess what happens when the feeder breaks, watch the burst and the fade, then come back the next day for
  spontaneous recovery.
- **Lab report**: what you did, mapped to the textbook terms, with your records and everyday examples.

The 1 · 2 · 3 buttons at the top jump between parts at any time; each part keeps its own state.

## Run it

It is a static site with no build step. Serve the folder and open `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Direct links: `#tour`, `#shape`, `#schedules`, `#extinction`, `#report`; `#about` and `#help` open the sheets.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page structure and all visitor text, including About & sources |
| `css/style.css` | The look: record paper, steel chamber, brass feeder |
| `js/rat.js` | The rat's behaviour model and the schedule sessions (no page code; runs in Node too) |
| `js/app.js` | Drawing (rat, chamber, cumulative recorder), sound, the three parts and the report |
| `fonts/` | IBM Plex Sans and Mono (SIL OFL 1.1, licence in `fonts/OFL.txt`) |
| `tools/tune.js` | Simulates sharp, typical and random visitors to tune how long shaping takes: `node tools/tune.js` |

## How the rat works (short version)

Each habit has a weight; the rat picks its next move in proportion. Feeding strengthens whatever it was doing about
0.3 s before the tap, and unrewarded moves drift back toward their starting weight. It is full after 30 pellets.
In parts 2 and 3 the press rate follows the schedule and the time since the last pellet, after Ferster and Skinner (1957).
With these settings a sharp player shapes the rat in about a minute, a typical visitor in about a minute and a half,
and random tapping usually fills the rat up first.

## Credits and notices

- Created by Miu from [Lobomiao](https://whitemiemie.github.io/), as part of a group booth on operant conditioning for the PSY 111 Creative Exhibition (2026).
- **AI use:** built with the help of an AI assistant (Claude, by Anthropic), which helped write the code, draft the wording and suggest sources.
  Every reference was checked against its publisher record (DOI); explanations were checked against the course's definitions (Ciccarelli & White, 2025).
- All text is original and every borrowed idea is cited in the About sheet. All artwork is drawn by the page's own code; sounds are synthesised in the browser. No outside images or recordings.
- Fonts: IBM Plex Sans and IBM Plex Mono © IBM Corp., SIL Open Font License 1.1 (`fonts/OFL.txt`).
- The play-the-experiment format was inspired by the Nobel Prize educational game *Pavlov's Dog* (Nobel Media, 2001). Lever Lab shares no code, art or text with it.
- Not affiliated with or endorsed by Nobel Prize Outreach, the B. F. Skinner Foundation, Harvard University or IBM.
- No animals were used. No cookies, analytics or tracking; the page only remembers on your own device whether you've visited before.
- © 2026 Lobomiao. Free to play and share by link for learning; please credit "Lever Lab" if you reuse its text or pictures.

## References

- Breland, K., & Breland, M. (1961). The misbehavior of organisms. *American Psychologist, 16*(11), 681–684. https://doi.org/10.1037/h0040090
- Ciccarelli, S. K., & White, J. N. (2025). *Psychology* (7th ed.). Pearson.
- Ferster, C. B., & Skinner, B. F. (1957). *Schedules of reinforcement*. Appleton-Century-Crofts.
- Lattal, K. A. (2004). Steps and pips in the history of the cumulative recorder. *Journal of the Experimental Analysis of Behavior, 82*(3), 329–355. https://doi.org/10.1901/jeab.2004.82-329
- Lerman, D. C., & Iwata, B. A. (1995). Prevalence of the extinction burst and its attenuation during treatment. *Journal of Applied Behavior Analysis, 28*(1), 93–94. https://doi.org/10.1901/jaba.1995.28-93
- Peterson, G. B. (2004). A day of great illumination: B. F. Skinner's discovery of shaping. *Journal of the Experimental Analysis of Behavior, 82*(3), 317–328. https://doi.org/10.1901/jeab.2004.82-317
- Skinner, B. F. (1938). *The behavior of organisms: An experimental analysis*. Appleton-Century.
- Skinner, B. F. (1948). "Superstition" in the pigeon. *Journal of Experimental Psychology, 38*(2), 168–172. https://doi.org/10.1037/h0055873
- Staddon, J. E. R., & Simmelhag, V. L. (1971). The "superstition" experiment: A reexamination of its implications for the principles of adaptive behavior. *Psychological Review, 78*(1), 3–43. https://doi.org/10.1037/h0030305
- Thorndike, E. L. (1898). Animal intelligence: An experimental study of the associative processes in animals. *Psychological Review: Monograph Supplements, 2*(4), i–109. https://doi.org/10.1037/h0092987

## Cite

Lobomiao. (2026). *Lever Lab: An operant conditioning experiment* [Interactive web exhibit]. https://whitemiemie.github.io/lever-lab/
