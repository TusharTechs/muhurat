# Demo video

`npm run video` makes the whole demo video, about 2:58 at 1080p30 with sound, in one command:

- **The film:** the problem with cited evidence, the insight, the reveal, how it works, and why Arkiv. It is rendered frame by frame from `web/film/`.
- **The real app:** driven through a live bell with on-screen captions and a visible cursor.
- **An original soundtrack, synthesised in code:** a tanpura-style drone, a clock that ticks down to the bell, a stamp, chimes, and a temple bell at the exact second the paper opens.

## Make it with live on-chain footage (do this for the submission)

The app scenes should show the real Tiramisu chain. Use two terminals in the project folder, with `PRIVATE_KEY` in `.env`.

Terminal 1:

```sh
npm run schedule -- --in 4 --leak
npm run centres
```

Terminal 2, straight after `schedule` finishes:

```sh
npx playwright install chromium
npm run video -- --live --repo github.com/YOUR-NAME/muhurat
```

`npx playwright install chromium` is needed once. The film renders first, about 5 minutes. The script then waits for the bell, records the tour from 34 seconds before it, and writes `muhurat-demo.mp4`. Without `--live`, the app scenes run against the local replay (`scripts/mock`) and carry a "local replay" badge.

## Timeline

| Time | Scene |
| --- | --- |
| 0:00 | 22.7 lakh students sat NEET-UG (3 May 2026) |
| 0:07 | 12 May: cancelled, leaked on Telegram (stamp) |
| 0:15 | 21 June: all of them sat it again (2,270 dots, twice) |
| 0:23 | India switched off Telegram; Section 69A; NTA on edited "evidence" |
| 0:33 | 41 leaks · 15 states · 1.4 crore applicants; Maharashtra TET |
| 0:41 | The insight: every leak needs a paper that exists before the exam (custody chain) |
| 0:53 | Even encrypted papers need a key holder (reform committee) |
| 1:00 | "What if the paper did not exist until the bell?" Seal, bell: **Muhurat** |
| 1:08 | How it works: seal → Arkiv entity → drand round → every centre at the same second |
| 1:28 | Why only Arkiv: $creator · readonly + 0x…dEaD · block order |
| 1:38 | Now, live: home, sealed banks, "Try to open" refused, leak checker, control room |
| 2:16 | **The bell** in the real app: opened paper, per-centre booklet, leak court, state at the bell, judges' page |
| 2:45 | CROPS, in one exam · "Arkiv knows when data should die. Muhurat teaches it when data should be born." |

## Optional voiceover

The video works silent apart from its soundtrack: every point is on screen. If you add your voice, read this over it. Times match the timeline above.

- **0:00** "On the third of May, twenty-two lakh students sat NEET."
- **0:07** "Nine days later it was cancelled. The paper had leaked on Telegram."
- **0:15** "Every one of them sat it again."
- **0:23** "Then India switched off Telegram for the whole country. And the exam agency said edited messages were used to fake leak evidence."
- **0:33** "It keeps happening: forty-one leaks, fifteen states, one point four crore applicants."
- **0:41** "Every leak needs one thing: a paper that exists before the exam. In a press, a trunk, a strong room."
- **0:53** "Even an encrypted paper needs someone holding the key."
- **1:00** "So what if the paper did not exist until the bell? This is Muhurat."
- **1:08** "Setters seal their questions in the browser with drand timelock encryption. The sealed bank goes on Arkiv: readonly, owned by nobody. The key for that drand round does not exist yet, not with the board, not with us. At the bell, drand publishes it to the whole world at once, and every centre opens the same paper at the same second. Nobody chose it."
- **1:28** "It only works on Arkiv: creator checks, frozen payloads owned by nobody, and block order that turns a leak claim into evidence."
- **1:38** "Here it is, live. The paper is sealed. Try to open it: refused. A leak for sale? Fake, it cannot exist yet. Centres hold leases that lapse if they go silent."
- **2:16** "The bell. Opened in the browser. Each centre prints its own order. The leak court tests every claim filed before the bell."
- **2:45** "Arkiv knows when data should die. Muhurat teaches it when data should be born."

To mix a recording (`voice.m4a`) over the soundtrack:

```sh
ffmpeg -i muhurat-demo.mp4 -i voice.m4a -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy muhurat-demo-voice.mp4
```
