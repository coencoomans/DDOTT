/*
 * Onderzoekersportaal D-DOTT
 * Werkt op elke portaalpagina. De pagina geeft via <body data-categorie="..."> aan
 * welke soort documenten getoond worden ('document' of 'data-overzicht').
 */
(function () {
  'use strict';

  var cfg = window.DDOTT_PORTAAL || {};
  var categorie = document.body.getAttribute('data-categorie') || 'document';
  var $ = function (id) { return document.getElementById(id); };

  var laden = $('portaal-laden');
  var loginSectie = $('portaal-login');
  var inhoudSectie = $('portaal-inhoud');
  var uploadSectie = $('upload-sectie');

  function melding(el, tekst, soort) {
    if (!el) return;
    el.textContent = tekst || '';
    el.className = 'portaal-melding' + (soort ? ' portaal-melding-' + soort : '');
  }

  // Geeft een begrijpelijke melding bij een mislukte login, met de echte oorzaak erbij.
  function loginFout(err, standaardTekst) {
    var m = (err && err.message) || '';
    console.error('Supabase login fout:', err);
    if (/invalid login credentials/i.test(m)) return standaardTekst;
    if (/email not confirmed/i.test(m)) return 'Dit account is nog niet bevestigd. (Beheerder: zet in Supabase "Auto Confirm" aan of bevestig de gebruiker.)';
    if (/invalid api key|no api key|secret api key|apikey/i.test(m)) return 'De website kan geen verbinding maken met Supabase: de sleutel in js/portal-config.js klopt niet. (Melding: ' + m + ')';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Geen verbinding met Supabase. Controleer de Project URL in js/portal-config.js, en of het project niet gepauzeerd is. (Melding: ' + m + ')';
    if (/logins are disabled|provider is not enabled/i.test(m)) return 'Inloggen met e-mail staat uit in Supabase (Authentication → Providers → Email).';
    return 'Inloggen mislukt. Technische melding: ' + (m || 'onbekend') + ' (gebruikt adres: ' + supabaseAdres + ')';
  }

  function toon(el, zichtbaar) { if (el) el.hidden = !zichtbaar; }

  // --- Controle: is het portaal ingesteld? ---------------------------------
  if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.indexOf('JOUW-') !== -1) {
    toon(laden, false);
    toon($('portaal-config-fout'), true);
    return;
  }

  // Alleen het basisadres gebruiken (https://xxxx.supabase.co), ook als er per ongeluk
  // een pad (/rest/v1/ e.d.), spatie of slash achter de URL staat.
  var supabaseAdres;
  try { supabaseAdres = new URL(String(cfg.supabaseUrl).trim()).origin; }
  catch (e) { supabaseAdres = String(cfg.supabaseUrl).trim(); }
  var supabaseSleutel = String(cfg.supabaseKey).trim();

  var sb = window.supabase.createClient(supabaseAdres, supabaseSleutel);
  var isBeheerder = false;
  var huidigeGebruiker = null;

  // --- Weergave bijwerken na in- of uitloggen ------------------------------
  async function werkWeergaveBij(sessie) {
    toon(laden, false);

    if (!sessie) {
      huidigeGebruiker = null;
      isBeheerder = false;
      toon(inhoudSectie, false);
      toon(loginSectie, true);
      return;
    }

    huidigeGebruiker = sessie.user;
    var email = (sessie.user.email || '').toLowerCase();
    var isOnderzoeker = email === String(cfg.onderzoekerEmail).toLowerCase();

    isBeheerder = false;
    if (!isOnderzoeker) {
      var res = await sb.rpc('is_admin');
      isBeheerder = !res.error && res.data === true;
    }

    $('portaal-status-tekst').textContent = isOnderzoeker
      ? 'U bent ingelogd als onderzoeker.'
      : (isBeheerder ? 'Ingelogd als beheerder (' + email + ').' : 'Ingelogd als ' + email + '.');

    toon(loginSectie, false);
    toon(inhoudSectie, true);
    toon(uploadSectie, isBeheerder);
    document.body.classList.toggle('is-beheerder', isBeheerder);

    await laadDocumenten();
  }

  // Supabase raadt aan om binnen deze callback geen andere Supabase-aanroepen
  // direct te 'awaiten'; daarom via setTimeout.
  sb.auth.onAuthStateChange(function (_event, sessie) {
    setTimeout(function () { werkWeergaveBij(sessie); }, 0);
  });

  // --- Inloggen met toegangscode (onderzoekers) ----------------------------
  $('code-formulier').addEventListener('submit', async function (e) {
    e.preventDefault();
    var veld = $('toegangscode');
    var knop = this.querySelector('button');
    melding($('code-melding'), '');
    knop.disabled = true;

    var res = await sb.auth.signInWithPassword({
      email: cfg.onderzoekerEmail,
      password: veld.value.trim()
    });

    knop.disabled = false;
    if (res.error) {
      melding($('code-melding'), loginFout(res.error, 'Deze code is niet juist. Controleer de code en probeer het opnieuw.'), 'fout');
    } else {
      veld.value = '';
    }
  });

  // --- Inloggen als beheerder ---------------------------------------------
  $('beheerder-formulier').addEventListener('submit', async function (e) {
    e.preventDefault();
    var knop = this.querySelector('button');
    melding($('beheerder-melding'), '');
    knop.disabled = true;

    var res = await sb.auth.signInWithPassword({
      email: $('beheerder-email').value.trim(),
      password: $('beheerder-wachtwoord').value
    });

    knop.disabled = false;
    if (res.error) {
      melding($('beheerder-melding'), loginFout(res.error, 'Inloggen mislukt. Controleer e-mailadres en wachtwoord.'), 'fout');
    } else {
      $('beheerder-wachtwoord').value = '';
    }
  });

  // --- Uitloggen -----------------------------------------------------------
  $('uitlog-knop').addEventListener('click', function () {
    sb.auth.signOut();
  });

  // --- Documenten ophalen en tonen ----------------------------------------
  function datumTekst(iso) {
    try {
      return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function cel(tekst, label) {
    var td = document.createElement('td');
    td.textContent = tekst || '';
    if (label) td.setAttribute('data-label', label);
    return td;
  }

  async function laadDocumenten() {
    var lijst = $('documenten-lijst');
    var leeg = $('geen-documenten');
    melding($('lijst-melding'), '');

    var res = await sb.from('documenten')
      .select('*')
      .eq('categorie', categorie)
      .order('titel', { ascending: true });

    lijst.innerHTML = '';

    if (res.error) {
      melding($('lijst-melding'), 'De documenten konden niet worden geladen. Probeer het later opnieuw.', 'fout');
      return;
    }

    var docs = res.data || [];
    toon(leeg, docs.length === 0);
    toon($('documenten-tabel'), docs.length > 0);

    docs.forEach(function (doc) {
      var tr = document.createElement('tr');

      var titelCel = cel('', 'Titel');
      var titel = document.createElement('strong');
      titel.textContent = doc.titel;
      titelCel.appendChild(titel);
      if (doc.preregistratie_url && /^https?:\/\//i.test(doc.preregistratie_url)) {
        var link = document.createElement('a');
        link.href = doc.preregistratie_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'portaal-prereg-link';
        var site = '';
        try { site = new URL(doc.preregistratie_url).hostname.replace(/^www\./, ''); } catch (e) {}
        link.textContent = 'Preregistratie' + (site ? ' (' + site + ')' : '') + ' ↗';
        titelCel.appendChild(document.createElement('br'));
        titelCel.appendChild(link);
      }
      tr.appendChild(titelCel);

      tr.appendChild(cel(doc.auteurs, 'Auteurs'));
      tr.appendChild(cel(doc.beschrijving, 'Beschrijving'));
      tr.appendChild(cel(datumTekst(doc.geupload_op), 'Datum'));

      var actieCel = cel('', '');
      actieCel.className = 'portaal-acties';

      var download = document.createElement('button');
      download.type = 'button';
      download.className = 'portaal-knop';
      download.textContent = 'Download';
      download.title = doc.bestandsnaam;
      download.addEventListener('click', function () { downloadDocument(doc, download); });
      actieCel.appendChild(download);

      if (isBeheerder) {
        var verwijder = document.createElement('button');
        verwijder.type = 'button';
        verwijder.className = 'portaal-knop portaal-knop-gevaar';
        verwijder.textContent = 'Verwijderen';
        verwijder.addEventListener('click', function () { verwijderDocument(doc); });
        actieCel.appendChild(verwijder);
      }

      tr.appendChild(actieCel);
      lijst.appendChild(tr);
    });
  }

  // --- Downloaden (tijdelijke link, 60 seconden geldig) --------------------
  async function downloadDocument(doc, knop) {
    knop.disabled = true;
    var res = await sb.storage.from(cfg.bucket)
      .createSignedUrl(doc.bestandspad, 60, { download: doc.bestandsnaam });
    knop.disabled = false;

    if (res.error || !res.data) {
      melding($('lijst-melding'), 'Het bestand kon niet worden gedownload. Probeer het opnieuw.', 'fout');
      return;
    }
    window.location.href = res.data.signedUrl;
  }

  // --- Verwijderen (alleen beheerders) ------------------------------------
  async function verwijderDocument(doc) {
    if (!window.confirm('Weet u zeker dat u "' + doc.titel + '" wilt verwijderen?')) return;

    var res = await sb.from('documenten').delete().eq('id', doc.id);
    if (res.error) {
      melding($('lijst-melding'), 'Verwijderen mislukt: ' + res.error.message, 'fout');
      return;
    }
    await sb.storage.from(cfg.bucket).remove([doc.bestandspad]);
    await laadDocumenten();
    melding($('lijst-melding'), '"' + doc.titel + '" is verwijderd.', 'succes');
  }

  // --- Uploaden (alleen beheerders) ---------------------------------------
  function veiligeBestandsnaam(naam) {
    return naam.normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'bestand';
  }

  function uniekeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  $('upload-formulier').addEventListener('submit', async function (e) {
    e.preventDefault();
    var formulier = this;
    var knop = formulier.querySelector('button[type=submit]');
    var uploadMelding = $('upload-melding');
    var bestand = $('upload-bestand').files[0];
    var maxMB = cfg.maxBestandMB || 50;

    melding(uploadMelding, '');
    if (!bestand) { melding(uploadMelding, 'Kies eerst een bestand.', 'fout'); return; }
    if (bestand.size > maxMB * 1024 * 1024) {
      melding(uploadMelding, 'Dit bestand is te groot (maximaal ' + maxMB + ' MB).', 'fout');
      return;
    }

    knop.disabled = true;
    knop.textContent = 'Bezig met uploaden…';

    var pad = categorie + '/' + uniekeId() + '/' + veiligeBestandsnaam(bestand.name);

    var up = await sb.storage.from(cfg.bucket).upload(pad, bestand, {
      contentType: bestand.type || 'application/octet-stream',
      upsert: false
    });

    if (up.error) {
      knop.disabled = false;
      knop.textContent = 'Uploaden';
      melding(uploadMelding, 'Uploaden mislukt: ' + up.error.message, 'fout');
      return;
    }

    var ins = await sb.from('documenten').insert({
      categorie: categorie,
      titel: $('upload-titel').value.trim(),
      auteurs: $('upload-auteurs').value.trim(),
      beschrijving: $('upload-beschrijving').value.trim(),
      bestandspad: pad,
      bestandsnaam: bestand.name,
      preregistratie_url: $('upload-link').value.trim() || null
    });

    knop.disabled = false;
    knop.textContent = 'Uploaden';

    if (ins.error) {
      await sb.storage.from(cfg.bucket).remove([pad]); // opruimen
      melding(uploadMelding, 'Opslaan mislukt: ' + ins.error.message, 'fout');
      return;
    }

    formulier.reset();
    melding(uploadMelding, 'Het document is toegevoegd.', 'succes');
    await laadDocumenten();
  });
})();
