# Researcher portal – setup guide

One-time setup, about 30 minutes. After this the portal runs by itself.

**How it works:**
- **Researchers** open *Onderzoekersportaal* in the menu and type one shared code. Their browser remembers it.
- **Admins** click *Inloggen als beheerder*, log in with their own email and password, and get an upload form and delete buttons.
- Files and the document list are stored in **Supabase** (EU), not in the public GitHub repo. Without logging in there is nothing to see or download.

New files in the website:

| File | What it is |
|---|---|
| `portal-documenten.html` | Documents page |
| `portal-data.html` | Data overview page (same system, separate list) |
| `css/portal.css` | Styling for the portal |
| `js/portal.js` | Login, table, upload, download, delete |
| `js/portal-config.js` | **The only file you fill in** (step 4) |
| `supabase/setup.sql` | Database setup, run once (step 2) |
| `.github/workflows/supabase-wakker-houden.yml` | Keeps the free Supabase project from pausing |

---

## Step 1 – Create a Supabase project

1. Go to <https://supabase.com> and sign up (free; GitHub login or email).
2. Click **New project**.
   - Name: `ddott-portaal`
   - Database password: generate one and save it somewhere safe (you will rarely need it).
   - **Region: choose a European region (e.g. Frankfurt or another EU location).**
   - Plan: Free.
3. Wait a minute or two until the project is ready.

## Step 2 – Create the database and file storage

1. In the left menu, open **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from the website folder, copy **everything**, paste it in, and click **Run**.
3. You should see "Success". (The commented-out lines at the bottom are for step 3.)

## Step 3 – Create the accounts

### 3a. Turn off public sign-up
**Authentication** → **Sign In / Providers** (may be called *Providers* or *Settings*) → turn **off** "Allow new users to sign up" → Save.
Now only accounts that you create yourself exist.

### 3b. The shared researcher account (= the code)
**Authentication** → **Users** → **Add user** → **Create new user**
- Email: `onderzoeker@ddott.nl` (this mailbox does not need to exist)
- Password: **the access code you want to give researchers**, e.g. `DDOTT-rTMS-2026` (min. 6 characters; choose something not easily guessed)
- ✅ Tick **Auto Confirm User**

### 3c. Admin accounts
Same as above for each admin: their real email address, a password they choose, ✅ Auto Confirm User.

Then make them an admin: **SQL Editor** → new query → run (with their email):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'naam@amsterdamumc.nl';
```

## Step 4 – Connect the website

1. In Supabase, open **Project Settings** → **API Keys** (or **API**).
2. Copy:
   - the **Project URL** (looks like `https://abcdefghijkl.supabase.co`; sometimes shown under *Data API* or on the project's home page)
   - the **publishable key** (starts with `sb_publishable_…`) – or, if that's what you see, the **anon public** key.
   - ⚠️ **Never** use the *secret* / *service_role* key.
3. Open `js/portal-config.js` and fill in both values between the quotes.

The publishable key is meant to be public; the security comes from the rules in `setup.sql`.

## Step 5 – Put it on GitHub

Upload all files to your repository as usual (including the hidden `.github` folder – easiest with GitHub Desktop, or drag the folder into "Add file → Upload files").

Wait ~1 minute, then test on ddott.nl:
1. Menu → Onderzoekersportaal → Documenten → enter the code → you see "Er zijn nog geen bestanden geüpload."
2. Click *Uitloggen*, open *Inloggen als beheerder*, log in → the upload form appears. Upload a test PDF, download it, delete it.
3. Open the page in a private/incognito window: you should only see the code box.

Finally, check the keep-awake job: GitHub repo → **Actions** tab → *Supabase wakker houden* → **Run workflow**. It should go green.

---

## Day-to-day management

**Give a new researcher access:** just send them the code.

**Change the code** (e.g. once a year or when someone leaves) – SQL Editor:
```sql
update auth.users
set encrypted_password = extensions.crypt('NIEUWE-CODE', extensions.gen_salt('bf'))
where email = 'onderzoeker@ddott.nl';

-- also log out everyone currently logged in with the old code:
delete from auth.sessions
where user_id = (select id from auth.users where email = 'onderzoeker@ddott.nl');
```

**Admin forgot their password:** use the same `update auth.users …` query with their email.

**Add / remove admins:** see the bottom of `supabase/setup.sql`.

**Change texts on the pages:** edit `portal-documenten.html` / `portal-data.html` like any other page.

## Good to know

- **Free plan limits:** 1 GB file storage, max 50 MB per file. Plenty for analysis plans and data overviews.
- **Pausing:** free Supabase projects pause after a week without activity. The keep-awake job prevents this. GitHub switches scheduled jobs off in public repos after **60 days without any change to the repo**; GitHub emails you first, and one click on "Enable workflow" in the Actions tab turns it back on. If the portal ever shows "kon niet worden geladen", log in at supabase.com and click **Resume project**.
- **Security level:** suitable for low-sensitivity documents. Someone who has the code and is technically skilled could in theory change the shared code (you would notice because the code stops working; reset it with the query above). Admin rights cannot be obtained with the code.
- **Never upload participant-level data** to the portal.
