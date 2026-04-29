# Math Time 🚀

A grade-school math practice web app. Add, subtract, multiply, and divide your way to the top — levels get harder as you keep a streak going, and missed questions come back at the end of the session for another try.

No build step, no dependencies. Just three files: `index.html`, `style.css`, `app.js`.

## Run it

The app is a static site, so any local HTTP server works. Pick one:

**Python** (bundled with macOS):
```sh
python3 -m http.server 8000
```

**Node** (no install needed):
```sh
npx serve .
```

Then open http://localhost:8000 (or whichever port the server prints).

You can also just open `index.html` directly in a browser — `localStorage` works from `file://`, so stats will still persist.

## Play

- 20 problems per session.
- 3 in a row → level up. 2 misses in a row → level down.
- Miss a question twice and it's queued up for another try at the end.
- Progress (best accuracy, best speed, last session) is saved locally.
- **Settings** lets you choose the starting level (1–10) and which operations to practice (+, −, ×, ÷). Choices persist between sessions.
- **Print worksheet** has the same level + operation picker plus a problem count, so you can hand a kid a paper sheet of exactly the kind of problems they want to practice.
