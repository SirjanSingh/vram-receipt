# Contributing

Ideas, fixes and new features are welcome. This is a fan project, so keep it fun and keep it honest.

## Got an idea?

Open an issue and describe it in a few lines: what you'd add, and why it makes the page or the
receipt better. A rough sketch or a screenshot helps. Big changes are easier to land if we agree on
the idea in an issue first.

Good places to start:

- **Data:** a missing card, a wrong launch date, or a launch price with a better source.
- **Tiers:** a better name or line for a tier.
- **The cluster:** new ways to show it, as long as every number on screen comes from real entries.
- **The command:** a GPU or operating system it detects badly. Paste the output of
  `npx vram-receipt --json` and leave out anything private.

## House rules

1. **No invented numbers.** Every figure on the page comes from the dataset, the cluster or a cited
   source. A launch price must come from an Nvidia page (see `data/SOURCES.md`). If no primary
   source states a price, leave the cell blank.
2. **Privacy stays opt-in.** The command never sends anything unless the user says yes or passes
   `--join`. Any new field that gets sent must be listed in `PRIVACY.md` and shown before asking.
3. **It stays a fan project.** No Nvidia logos, no likeness of Jensen Huang, and keep the
   "not affiliated" notice.
4. **Keep it light.** Short copy, sparing animation, works on a phone.

## Running it locally

Requires Node 18 or newer.

```sh
npm install
npm test             # unit tests
npm run build        # builds the data and the command
npm run dev:web      # the web page, with live reload
node packages/cli/dist/cli.js --no-join   # run the command without joining
```

The dataset lives in `data/`. After editing a CSV, `npm run data:build` regenerates the bundled
data, and `npm test` checks it.

## Pull requests

- One change per pull request, with a short description of what changed and how you checked it.
- Run `npm test` and `npx tsc --noEmit` before opening it.
- For a page change, include a screenshot at desktop width and at phone width.

## Licence

By contributing you agree that code is released under MIT and data under CC BY-SA 4.0, the same as
the rest of the repo.
