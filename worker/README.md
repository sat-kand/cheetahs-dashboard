# PlayHQ proxy worker

Why this exists: the dashboard (`index.html`) is a static page with no server,
so it can't hold the PlayHQ API key - anything in its JS is visible to anyone
who views the page source. This small Cloudflare Worker holds the key instead,
and only forwards the exact PlayHQ endpoints the dashboard needs (see the
`ALLOWED` list in `index.js`).

## One-time setup (you'll need to do this in your own accounts - I can't reach
either of them from here)

1. **Cloudflare account + account ID.** If you don't already have a free
   Cloudflare account, create one at cloudflare.com. Your Account ID is shown
   on the right-hand side of the Cloudflare dashboard's "Workers & Pages"
   overview page.

2. **Cloudflare API token.** In the Cloudflare dashboard: My Profile → API
   Tokens → Create Token → use the "Edit Cloudflare Workers" template. Copy
   the token (you only see it once).

3. **Add these secrets to the GitHub repo** (Settings → Secrets and
   variables → Actions → New repository secret):
   - `CLOUDFLARE_API_TOKEN` - the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` - the account ID from step 1
   - `PLAYHQ_API_KEY` - the `x-api-key` PlayHQ issued you. Don't paste the
     actual value into any file in this repo, a commit message, or an issue -
     only into this one GitHub secret field.
   - `PLAYHQ_TENANT` - `ca`

4. **Deploy.** Push a change under `worker/` (or run the "Deploy PlayHQ proxy
   worker" workflow manually from the Actions tab) - this builds and deploys
   the worker, then sets the two PlayHQ secrets on it.

5. **Get the worker's URL.** After the first deploy, find it in the
   Cloudflare dashboard under Workers & Pages → `cheetahs-playhq-proxy` -
   it'll look like `https://cheetahs-playhq-proxy.<your-subdomain>.workers.dev`.
   That URL is what `index.html` needs to call instead of
   `grassrootsapiproxy.cricket.com.au` / `api.playhq.com` directly.

6. **Check the allowed origin.** `index.js` only answers browser requests
   from `https://sat-kand.github.io` (see `ALLOWED_ORIGINS`). If the
   dashboard ever moves to a different URL (custom domain, etc.), add it
   there too.

## Adding a new endpoint later

If a future dashboard feature needs another PlayHQ endpoint, add its path
pattern to the `ALLOWED` list in `index.js` - don't widen the match beyond
the exact shapes you need, since anything allowed here is reachable by
anyone who finds the worker's URL (using our PlayHQ credentials, not theirs).
