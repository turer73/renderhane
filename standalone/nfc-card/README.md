# Portable NFC bank / invoice card

`index.html` is a single-file copy of the `/[locale]/b` page that bank and
invoice NFC tags open. It needs no server, database, build step or library:
the details are in the link's fragment (`#n=…&i=…`), and the page reads them in
the browser.

Tags written by the NFC tool point at `https://www.renderhane.com/tr/b#…` or
`…/en/b#…`. As long as the `renderhane.com` domain is renewed and this file is
served at those two paths, every tag already handed out keeps working, even if
the rest of the site is gone.

## Hosting it on its own

1. Create a folder with the file twice:

   ```
   site/tr/b/index.html
   site/en/b/index.html
   ```

   (The language comes from `/en/` in the path; anything else is Turkish.)

2. Deploy `site/` to any static host (Vercel, Cloudflare Pages, GitHub Pages
   or Netlify; their free tiers are enough).
3. Point `www.renderhane.com` at that host, and redirect `renderhane.com` to
   `www`. Tags use `https://www.`.

Check it by opening
`https://www.renderhane.com/tr/b#n=Test&i=TR330006100519786457841326`.

## Keeping it in sync

The field map in the `business-fields` JSON block must match
`src/lib/nfc/business-card.ts`. `src/lib/nfc/__tests__/standalone-card.test.ts`
fails if they drift apart; update both together.
